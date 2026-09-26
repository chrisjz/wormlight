// The plate view's WebGPU renderer: the agar and the dish over the whole canvas, then the worm, read in place
// from the simulation's body buffer, into a 4× multisampled target resolved to the canvas. Like the graph's
// renderer, it can render one frame into a texture of its own and read it back for the visual tests.

import { toHalves } from './half.ts';
import { AGAR_SHADER, wormShader } from './plateShaders.ts';
import { snapshot } from './snapshot.ts';

const SAMPLES = 4;
const FRAME_BYTES = 48;
// Spline sections between neighbouring rods.
const SUB = 8;

export interface PlateFrame {
  // The camera's centre (m, from the dish's centre), the half extent shown (m), metres per device pixel, and
  // the dish's radius (m).
  centre: [number, number];
  half: [number, number];
  pixel: number;
  dish: number;
}

// What the dish holds: the odour field as log₂(C/K), row by row from the grid's lower left, on a square grid
// `extent` metres wide centred on the dish; and the lawn.
export interface PlateScene {
  odour: { level: Float32Array; cells: number; extent: number };
  lawn: { x: number; y: number; radius: number };
}

export class PlateRenderer {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly agar: GPURenderPipeline;
  private readonly worm: GPURenderPipeline;
  private readonly frame: GPUBuffer;
  private readonly radius: GPUBuffer;
  private readonly rods: number;
  private readonly scene: PlateScene;
  private readonly odour: GPUTexture;
  private readonly agarGroup: GPUBindGroup;
  private readonly wormGroup: GPUBindGroup;
  private colour: GPUTexture | null = null;
  private readonly uniforms = new Float32Array(FRAME_BYTES / 4);

  private constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    pipelines: [GPURenderPipeline, GPURenderPipeline],
    body: GPUBuffer,
    radii: Float32Array,
    scene: PlateScene,
  ) {
    this.device = device;
    this.canvas = canvas;
    this.context = context;
    this.format = format;
    [this.agar, this.worm] = pipelines;
    this.rods = radii.length;
    this.scene = scene;
    const { cells, level } = scene.odour;
    this.odour = device.createTexture({
      size: [cells, cells],
      format: 'r16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: this.odour }, toHalves(level), { bytesPerRow: 2 * cells }, [cells, cells]);
    this.frame = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.radius = device.createBuffer({
      size: radii.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.radius, 0, radii);
    this.agarGroup = device.createBindGroup({
      layout: this.agar.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frame } },
        { binding: 1, resource: this.odour.createView() },
        { binding: 2, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      ],
    });
    this.wormGroup = this.bodyGroup(body);
  }

  // Build the renderer for a body of these rods' radii and this length (m), read from `body`, on a dish that
  // holds `scene`. The pipelines are created
  // asynchronously, so one that fails validation rejects here, where the page can explain it.
  static async create(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    body: GPUBuffer,
    radii: Float32Array,
    length: number,
    scene: PlateScene,
  ): Promise<PlateRenderer> {
    const format = navigator.gpu.getPreferredCanvasFormat();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('the canvas has no WebGPU context');
    context.configure({ device, format, alphaMode: 'opaque' });
    const agar = device.createShaderModule({ code: AGAR_SHADER });
    const worm = device.createShaderModule({ code: wormShader(radii.length, SUB, length) });
    const multisample = { count: SAMPLES };
    const pipelines = await Promise.all([
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: agar, entryPoint: 'vs' },
        fragment: { module: agar, entryPoint: 'fs', targets: [{ format }] },
        multisample,
      }),
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: worm, entryPoint: 'vs' },
        fragment: {
          module: worm,
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
        primitive: { topology: 'triangle-strip' },
        multisample,
      }),
    ]);
    return new PlateRenderer(device, canvas, context, format, pipelines, body, radii, scene);
  }

  private bodyGroup(body: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.worm.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frame } },
        { binding: 1, resource: { buffer: body } },
        { binding: 2, resource: { buffer: this.radius } },
      ],
    });
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
    this.colour = this.device.createTexture({
      size: [w, h],
      sampleCount: SAMPLES,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  get size(): [number, number] {
    return [this.canvas.width, this.canvas.height];
  }

  // Draw one frame into `target`, or into the canvas.
  render(frame: PlateFrame, target?: GPUTextureView): void {
    if (!this.colour) return;
    const high = frame.centre.map((v) => Math.fround(v));
    const u = this.uniforms;
    u.set([
      high[0],
      high[1],
      frame.centre[0] - high[0],
      frame.centre[1] - high[1],
      ...frame.half,
      frame.pixel,
      frame.dish,
      this.scene.lawn.x,
      this.scene.lawn.y,
      this.scene.lawn.radius,
      this.scene.odour.extent,
    ]);
    this.device.queue.writeBuffer(this.frame, 0, u);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.colour.createView(),
          resolveTarget: target ?? this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'discard',
        },
      ],
    });
    pass.setPipeline(this.agar);
    pass.setBindGroup(0, this.agarGroup);
    pass.draw(3);
    pass.setPipeline(this.worm);
    pass.setBindGroup(0, this.wormGroup);
    // Two instances, the halo around the body and the body, each a strip of two vertices a section.
    pass.draw(2 * ((this.rods - 1) * SUB + 1), 2);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // Render one frame into a texture of our own and read it back as RGBA pixels.
  snapshot(frame: PlateFrame): Promise<ImageData> {
    return snapshot(this.device, this.format, this.size, (target) => this.render(frame, target));
  }

  destroy(): void {
    this.frame.destroy();
    this.radius.destroy();
    this.odour.destroy();
    this.colour?.destroy();
  }
}
