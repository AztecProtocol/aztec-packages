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

// Staged-dispatch tuning. Windows TDR resets the GPU when a command buffer
// occupies an engine for ~2s without a preemption point (observed on Intel
// Xe/gen-12lp: DXGI_ERROR_DEVICE_HUNG inside the old single 16384-workgroup
// dispatch, before any MSM work ran). Decompression is therefore submitted
// in chunks: each chunk is its own queue.submit, awaited before sizing the
// next, targeting TARGET_CHUNK_MS per dispatch — fast GPUs converge to a few
// large submits, slow iGPUs stay ~8x under the watchdog limit. The first
// chunk is small so even a very slow driver's first dispatch is safe.
const FIRST_CHUNK_POINTS = 2048;
const TARGET_CHUNK_MS = 250;
const MAX_CHUNK_GROWTH = 4;
const MAX_GROUPS_PER_DISPATCH = 65535; // WebGPU per-dimension dispatch cap

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
    // One small uniform per chunk (input_size = points in that chunk).
    // Padded to 16 bytes — some WebGPU backends reject uniform buffers
    // smaller than the natural std140 alignment block.
    const chunkUniforms: GPUBuffer[] = [];
    const makeChunkUniform = (count: number): GPUBuffer => {
      const bytes = new Uint8Array(16);
      new DataView(bytes.buffer).setUint32(0, count, true);
      const buf = create_and_write_ub(device, bytes);
      chunkUniforms.push(buf);
      return buf;
    };

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

    const stagingBuf = device.createBuffer({
      size: outputBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const totalGroups = Math.ceil(numPoints / WORKGROUP_SIZE);
    onProgress?.(
      `[srs/gpu] dispatch ${totalGroups} workgroups × ${WORKGROUP_SIZE} threads, ` +
        `staged in watchdog-safe chunks (first ${FIRST_CHUNK_POINTS} points, target ${TARGET_CHUNK_MS} ms)`,
    );

    device.pushErrorScope('validation');
    // Each chunk binds the SAME shader at a byte offset into the in/out
    // buffers, so thread id 0 maps to the chunk base and the WGSL needs no
    // changes. Chunk sizes are multiples of WORKGROUP_SIZE, which keeps the
    // storage offsets (x32 / x64 bytes) above the 256-byte alignment floor.
    let base = 0;
    let chunkPoints = Math.min(FIRST_CHUNK_POINTS, numPoints);
    let submits = 0;
    let nextMilestone = 0.25;
    while (base < numPoints) {
      const count = Math.min(chunkPoints, numPoints - base);
      const numGroups = Math.ceil(count / WORKGROUP_SIZE);
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: inBuf, offset: base * 32, size: count * 32 } },
          { binding: 1, resource: { buffer: outBuf, offset: base * 64, size: count * 64 } },
          { binding: 2, resource: { buffer: makeChunkUniform(count) } },
        ],
      });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(numGroups);
      pass.end();
      device.queue.submit([encoder.finish()]);
      const t0 = performance.now();
      await device.queue.onSubmittedWorkDone();
      const dtMs = performance.now() - t0;
      base += count;
      submits++;
      if (base < numPoints && base / numPoints >= nextMilestone) {
        onProgress?.(`[srs/gpu] decompress ${Math.round((base / numPoints) * 100)}% (${submits} submits)`);
        nextMilestone += 0.25;
      }
      const scale = Math.max(0.25, Math.min(MAX_CHUNK_GROWTH, TARGET_CHUNK_MS / Math.max(dtMs, 1)));
      const want = Math.round((chunkPoints * scale) / WORKGROUP_SIZE) * WORKGROUP_SIZE;
      chunkPoints = Math.max(WORKGROUP_SIZE, Math.min(want, MAX_GROUPS_PER_DISPATCH * WORKGROUP_SIZE));
    }
    onProgress?.(`[srs/gpu] decompress dispatched as ${submits} staged submits`);

    {
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(outBuf, 0, stagingBuf, 0, outputBytes);
      device.queue.submit([encoder.finish()]);
    }
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
    for (const u of chunkUniforms) u.destroy();
    stagingBuf.destroy();

    return result;
  } finally {
    device.destroy();
  }
}
