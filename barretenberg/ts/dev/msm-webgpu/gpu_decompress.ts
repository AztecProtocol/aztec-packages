// GPU-side SRS decompression. Replaces the JS bigint sqrt loop in
// `loadSrsPoints` for cold first-loads.
//
// Per-point work is one closed-form sqrt over Fq via `fr_pow`: ~260
// squarings + ~126 mults of 20-limb Montgomery products. At 2^21 points
// this is ~2¹¹ × the JS bigint cost, but in parallel across thousands of
// GPU threads — practical wall-time is in the low seconds on a modern
// dGPU vs. ~30s of single-threaded JS.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { create_and_write_sb, create_and_write_ub, create_sb, get_device } from '../../src/msm_webgpu/cuzk/gpu.js';

const WORKGROUP_SIZE = 64;

// Reverse the 32 BE bytes of each point so that the on-GPU u32[i] read
// at little-endian word index i directly yields the i'th 32-bit chunk
// of the value (low chunk first). Equivalent to "interpret the BE
// integer as an LE byte array and read u32s natively"; lets the shader
// skip a per-word swap.
function packCompressedAsLeU32(compressed: Uint8Array, numPoints: number): Uint8Array {
  const out = new Uint8Array(numPoints * 32);
  for (let p = 0; p < numPoints; p++) {
    for (let k = 0; k < 32; k++) {
      out[p * 32 + k] = compressed[p * 32 + 31 - k];
    }
  }
  return out;
}

export async function gpuDecompressG1(
  compressed: Uint8Array,
  numPoints: number,
  onProgress?: (msg: string) => void,
): Promise<Uint8Array> {
  if (compressed.length < numPoints * 32) {
    throw new Error(`gpuDecompressG1: input too small (${compressed.length} < ${numPoints * 32})`);
  }

  onProgress?.('[srs/gpu] requesting WebGPU device');
  const device = await get_device();
  try {
    onProgress?.('[srs/gpu] generating shader');
    // chunk_size / input_size are irrelevant to this shader; pass any
    // valid values that satisfy the ShaderManager constructor.
    const sm = new ShaderManager(16, numPoints);
    const shaderCode = sm.gen_decompress_g1_bn254_shader(WORKGROUP_SIZE);

    const inputBytes = packCompressedAsLeU32(compressed, numPoints);
    const outputBytes = numPoints * 64;

    onProgress?.(`[srs/gpu] uploading ${(inputBytes.byteLength / 1024 / 1024).toFixed(1)} MB compressed`);
    const inBuf = create_and_write_sb(device, inputBytes);
    const outBuf = create_sb(device, outputBytes);
    // Pad to 16 bytes — some WebGPU backends reject uniform buffers
    // smaller than the natural std140 alignment block.
    const uniformBytes = new Uint8Array(16);
    new DataView(uniformBytes.buffer).setUint32(0, numPoints, true);
    const uniformBuf = create_and_write_ub(device, uniformBytes);

    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: shaderCode });
    const compilationInfo = await module.getCompilationInfo();
    for (const msg of compilationInfo.messages) {
      if (msg.type === 'error' || msg.type === 'warning') {
        onProgress?.(`[srs/gpu] shader ${msg.type} @ ${msg.lineNum}:${msg.linePos}: ${msg.message}`);
      }
    }
    const pipeline = await device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });
    const pipelineErr = await device.popErrorScope();
    if (pipelineErr) {
      throw new Error(`[srs/gpu] pipeline build failed: ${pipelineErr.message}`);
    }

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inBuf } },
        { binding: 1, resource: { buffer: outBuf } },
        { binding: 2, resource: { buffer: uniformBuf } },
      ],
    });

    const numGroups = Math.ceil(numPoints / WORKGROUP_SIZE);
    const maxX = 65535;
    if (numGroups > maxX) {
      throw new Error(
        `gpuDecompressG1: ${numGroups} workgroups exceeds per-dim cap ${maxX}; ` +
          `bump WORKGROUP_SIZE or split into a 2D dispatch`,
      );
    }

    const stagingBuf = device.createBuffer({
      size: outputBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    device.pushErrorScope('validation');
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(numGroups);
    pass.end();
    encoder.copyBufferToBuffer(outBuf, 0, stagingBuf, 0, outputBytes);
    onProgress?.(`[srs/gpu] dispatch ${numGroups} workgroups × ${WORKGROUP_SIZE} threads`);
    device.queue.submit([encoder.finish()]);

    await device.queue.onSubmittedWorkDone();
    const dispatchErr = await device.popErrorScope();
    if (dispatchErr) {
      throw new Error(`[srs/gpu] dispatch failed: ${dispatchErr.message}`);
    }
    await stagingBuf.mapAsync(GPUMapMode.READ);
    const mapped = stagingBuf.getMappedRange();
    // Copy out of the mapped range before unmap (else the underlying
    // ArrayBuffer detaches).
    const result = new Uint8Array(outputBytes);
    result.set(new Uint8Array(mapped));
    stagingBuf.unmap();

    inBuf.destroy();
    outBuf.destroy();
    uniformBuf.destroy();
    stagingBuf.destroy();

    return result;
  } finally {
    device.destroy();
  }
}
