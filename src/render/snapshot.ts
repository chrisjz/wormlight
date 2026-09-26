// Render one frame into a texture of its own and read it back as RGBA pixels: the only readback the software
// GPUs of CI support (after Universe Atlas).

export async function snapshot(
  device: GPUDevice,
  format: GPUTextureFormat,
  [w, h]: [number, number],
  render: (target: GPUTextureView) => void,
): Promise<ImageData> {
  const texture = device.createTexture({
    size: [w, h],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const rowBytes = Math.ceil((w * 4) / 256) * 256;
  const buffer = device.createBuffer({ size: rowBytes * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    render(texture.createView());
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow: rowBytes }, [w, h]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8ClampedArray(w * h * 4);
    const red = format === 'bgra8unorm' ? 2 : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = y * rowBytes + x * 4;
        const d = (y * w + x) * 4;
        out[d] = src[s + red];
        out[d + 1] = src[s + 1];
        out[d + 2] = src[s + 2 - red];
        out[d + 3] = 255;
      }
    }
    buffer.unmap();
    return new ImageData(out, w, h);
  } finally {
    buffer.destroy();
    texture.destroy();
  }
}
