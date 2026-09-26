// The 3D graph's WebGPU renderer: neurons as sphere impostors, then the shown connections as lines over
// them, into a 4× multisampled target resolved to the canvas. It can also render one frame into a texture
// of its own and read it back, the only readback the software GPUs of CI support (after Universe Atlas).

import { LINK_SHADER, NEURON_SHADER } from './shaders.ts';
import { snapshot } from './snapshot.ts';

export const NEURON_FLOATS = 12; // centre, radius, colour, mark
export const LINK_FLOATS = 12; // a, width, b, dash, colour
const FRAME_BYTES = 3 * 64 + 32;
const SAMPLES = 4;
export const BACKGROUND: GPUColor = { r: 0.027, g: 0.035, b: 0.039, a: 1 };

export interface FrameState {
  view: Float32Array;
  projection: Float32Array;
  viewProjection: Float32Array;
  pixelRatio: number;
  // View-space depths where fog starts and is fullest.
  fog: [number, number];
}

export class GraphRenderer {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  private readonly context: GPUCanvasContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly frame: GPUBuffer;
  private readonly neuronPipeline: GPURenderPipeline;
  private readonly linkPipeline: GPURenderPipeline;
  private neuronBuffer: GPUBuffer | null = null;
  private neuronGroup: GPUBindGroup | null = null;
  private neuronCount = 0;
  private linkBuffer: GPUBuffer | null = null;
  private linkGroup: GPUBindGroup | null = null;
  private linkCount = 0;
  private colour: GPUTexture | null = null;
  private depth: GPUTexture | null = null;

  private readonly uniforms = new Float32Array(FRAME_BYTES / 4);

  private constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    pipelines: [GPURenderPipeline, GPURenderPipeline],
  ) {
    this.device = device;
    this.canvas = canvas;
    this.context = context;
    this.format = format;
    [this.neuronPipeline, this.linkPipeline] = pipelines;
    this.frame = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  // Build the renderer. The pipelines are created asynchronously, so a shader or pipeline that fails
  // validation rejects here, where the page can explain it, rather than leaving a blank canvas.
  static async create(device: GPUDevice, canvas: HTMLCanvasElement): Promise<GraphRenderer> {
    const format = navigator.gpu.getPreferredCanvasFormat();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('the canvas has no WebGPU context');
    context.configure({ device, format, alphaMode: 'opaque' });
    const depthStencil = (write: boolean): GPUDepthStencilState => ({
      format: 'depth24plus',
      depthWriteEnabled: write,
      depthCompare: 'less-equal',
    });
    const neurons = device.createShaderModule({ code: NEURON_SHADER });
    const links = device.createShaderModule({ code: LINK_SHADER });
    const pipelines = await Promise.all([
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: neurons, entryPoint: 'vs' },
        fragment: { module: neurons, entryPoint: 'fs', targets: [{ format }] },
        depthStencil: depthStencil(true),
        multisample: { count: SAMPLES, alphaToCoverageEnabled: true },
      }),
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: links, entryPoint: 'vs' },
        fragment: {
          module: links,
          entryPoint: 'fs',
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              },
            },
          ],
        },
        depthStencil: depthStencil(false),
        multisample: { count: SAMPLES },
      }),
    ]);
    return new GraphRenderer(device, canvas, context, format, pipelines);
  }

  private storage(data: Float32Array, old: GPUBuffer | null): GPUBuffer {
    const size = Math.max(data.byteLength, 64);
    let buffer = old;
    if (!buffer || buffer.size < size) {
      old?.destroy();
      buffer = this.device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  private group(pipeline: GPURenderPipeline, buffer: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frame } },
        { binding: 1, resource: { buffer } },
      ],
    });
  }

  setNeurons(data: Float32Array): void {
    const buffer = this.storage(data, this.neuronBuffer);
    if (buffer !== this.neuronBuffer) this.neuronGroup = this.group(this.neuronPipeline, buffer);
    this.neuronBuffer = buffer;
    this.neuronCount = data.length / NEURON_FLOATS;
  }

  setLinks(data: Float32Array): void {
    const buffer = this.storage(data, this.linkBuffer);
    if (buffer !== this.linkBuffer) this.linkGroup = this.group(this.linkPipeline, buffer);
    this.linkBuffer = buffer;
    this.linkCount = data.length / LINK_FLOATS;
  }

  // Match the drawing buffer to the canvas's displayed size, in device pixels, within the device's limit.
  resize(width: number, height: number): void {
    const limit = this.device.limits.maxTextureDimension2D;
    const w = Math.max(1, Math.min(limit, Math.round(width)));
    const h = Math.max(1, Math.min(limit, Math.round(height)));
    if (this.canvas.width === w && this.canvas.height === h && this.colour) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.colour?.destroy();
    this.depth?.destroy();
    this.colour = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLES,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depth = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLES,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  get size(): [number, number] {
    return [this.canvas.width, this.canvas.height];
  }

  // Draw one frame into `target`, or into the canvas.
  render(state: FrameState, target?: GPUTextureView): void {
    if (!this.colour || !this.depth) return;
    const values = this.uniforms;
    values.set(state.view, 0);
    values.set(state.projection, 16);
    values.set(state.viewProjection, 32);
    values.set([this.canvas.width, this.canvas.height, state.pixelRatio, 0, ...state.fog, 0, 0], 48);
    this.device.queue.writeBuffer(this.frame, 0, values);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.colour.createView(),
          resolveTarget: target ?? this.context.getCurrentTexture().createView(),
          clearValue: BACKGROUND,
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
      },
    });
    if (this.neuronGroup && this.neuronCount > 0) {
      pass.setPipeline(this.neuronPipeline);
      pass.setBindGroup(0, this.neuronGroup);
      pass.draw(6, this.neuronCount);
    }
    if (this.linkGroup && this.linkCount > 0) {
      pass.setPipeline(this.linkPipeline);
      pass.setBindGroup(0, this.linkGroup);
      pass.draw(6, this.linkCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // Render one frame into a texture of our own and read it back as RGBA pixels.
  snapshot(state: FrameState): Promise<ImageData> {
    return snapshot(this.device, this.format, this.size, (target) => this.render(state, target));
  }
}
