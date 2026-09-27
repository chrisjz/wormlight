// The odour field on the GPU (PLAN §5.2): OdourField.step's explicit scheme, one dispatch a sub-step, split
// into sub-steps by the same rule (substeps in src/sim/env/odour.ts), between two r32float textures that take
// turns being read and written. The one read last is the field, which the brain senses and the plate draws;
// cells outside the dish hold OUTSIDE in both. Its sources, per cell (µM/s), are a third texture.

import { DIFFUSION, LOSS, substeps } from '../sim/env/odour.ts';
import { FIELD_SHADER, FIELD_WORKGROUP } from './fieldShader.ts';
import { checkOdour, type OdourGrid } from './loopLayout.ts';

export class GpuField {
  readonly device: GPUDevice;
  readonly cells: number;
  readonly cell: number;
  private readonly pipeline: GPUComputePipeline;
  private readonly params: GPUBuffer;
  private readonly textures: [GPUTexture, GPUTexture];
  private readonly sources: GPUTexture;
  private readonly groups: [GPUBindGroup, GPUBindGroup];
  // Which texture holds the field.
  private at = 0;
  private destroyed = false;

  private constructor(device: GPUDevice, pipeline: GPUComputePipeline, grid: OdourGrid, sources: Float32Array) {
    this.device = device;
    this.pipeline = pipeline;
    this.cells = grid.cells;
    this.cell = grid.cell;
    const { cells } = grid;
    const texture = (usage: number): GPUTexture =>
      device.createTexture({ size: [cells, cells], format: 'r32float', usage: usage | GPUTextureUsage.COPY_DST });
    const both = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC;
    this.textures = [texture(both), texture(both)];
    this.sources = texture(GPUTextureUsage.TEXTURE_BINDING);
    this.params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const group = (from: GPUTexture, to: GPUTexture): GPUBindGroup =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.params } },
          { binding: 1, resource: from.createView() },
          { binding: 2, resource: this.sources.createView() },
          { binding: 3, resource: to.createView() },
        ],
      });
    this.groups = [group(this.textures[0], this.textures[1]), group(this.textures[1], this.textures[0])];
    this.set(grid.values);
    this.setSources(sources);
  }

  // Build a field from a grid as the brain's texture holds it, OUTSIDE beyond the wall, and its sources per cell.
  // Every validation error in setting it up, the shader's included, rejects here.
  static async create(device: GPUDevice, grid: OdourGrid, sources: ArrayLike<number>): Promise<GpuField> {
    checkOdour(grid, device.limits.maxTextureDimension2D);
    if (sources.length !== grid.values.length) throw new Error('the sources are not for this grid');
    device.pushErrorScope('validation');
    let field: GpuField | null = null;
    let failure: unknown = null;
    try {
      const module = device.createShaderModule({ code: FIELD_SHADER });
      const pipeline = await device.createComputePipelineAsync({
        layout: 'auto',
        compute: { module, entryPoint: 'advance' },
      });
      field = new GpuField(device, pipeline, grid, Float32Array.from(sources));
    } catch (e) {
      failure = e;
    }
    const error = await device.popErrorScope();
    if (error || failure !== null || !field) {
      field?.destroy();
      if (error) throw new Error(`the GPU's odour field could not be set up: ${error.message}`);
      throw failure instanceof Error ? failure : new Error(String(failure));
    }
    return field;
  }

  // The texture that holds the field now.
  get current(): GPUTexture {
    return this.textures[this.at];
  }

  // Set the concentrations, OUTSIDE beyond the wall, row j at texture row j.
  set(values: Float32Array): void {
    this.alive();
    if (values.length !== this.cells * this.cells) throw new Error('the concentrations are not for this grid');
    this.device.queue.writeTexture({ texture: this.current }, values, { bytesPerRow: 4 * this.cells }, [
      this.cells,
      this.cells,
    ]);
  }

  // Set every cell's source (µM/s), 0 beyond the wall, from the next sub-step on.
  setSources(sources: ArrayLike<number>): void {
    this.alive();
    if (sources.length !== this.cells * this.cells) throw new Error('the sources are not for this grid');
    this.device.queue.writeTexture(
      { texture: this.sources },
      Float32Array.from(sources),
      { bytesPerRow: 4 * this.cells },
      [this.cells, this.cells],
    );
  }

  // Advance the field by `seconds`, queued behind any earlier work, in the sub-steps OdourField.step takes.
  step(seconds: number): void {
    this.alive();
    if (!(seconds > 0 && Number.isFinite(seconds))) throw new Error(`the field can't advance by ${seconds} s`);
    const { n, dt } = substeps(seconds, this.cell);
    this.device.queue.writeBuffer(this.params, 0, Float32Array.of(dt, DIFFUSION / (this.cell * this.cell), LOSS, 0));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    const groups = Math.ceil(this.cells / FIELD_WORKGROUP);
    for (let k = 0; k < n; k++) {
      pass.setBindGroup(0, this.groups[this.at]);
      pass.dispatchWorkgroups(groups, groups);
      this.at = 1 - this.at;
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  // The field once the queued work is done, OUTSIDE beyond the wall, row j at row j.
  async read(): Promise<Float32Array> {
    this.alive();
    const cells = this.cells;
    // Rows copied out of a texture start on 256-byte boundaries.
    const stride = Math.ceil((4 * cells) / 256) * 256;
    const staging = this.device.createBuffer({
      size: stride * cells,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    try {
      const encoder = this.device.createCommandEncoder();
      encoder.copyTextureToBuffer({ texture: this.current }, { buffer: staging, bytesPerRow: stride }, [cells, cells]);
      this.device.queue.submit([encoder.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const rows = new Float32Array(staging.getMappedRange());
      const out = new Float32Array(cells * cells);
      for (let j = 0; j < cells; j++) out.set(rows.subarray((j * stride) / 4, (j * stride) / 4 + cells), j * cells);
      staging.unmap();
      return out;
    } finally {
      staging.destroy();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const t of [...this.textures, this.sources]) t.destroy();
    this.params.destroy();
  }

  private alive(): void {
    if (this.destroyed) throw new Error("the GPU's odour field has been destroyed");
  }
}
