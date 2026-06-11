// Isolated montmul / inverse microbench. Mirrors the proven dev/montmul_bench.ts
// device path (bare requestAdapter/requestDevice, layout:'auto', 2 storage
// bindings) but renders the SAME montmul / inverse the MSM pipeline uses,
// selected by `montmul` (karat | cios_unrolled) and `pk14`. Each of
// `nthreads` threads chains `chainK` ops on operands held in the BN254 20×13
// BigInt rep; timing-only (correctness is already covered by the MSM cross-check
// + host models). Dependent + stored chain => not optimized away. The point is to
// attribute field-arithmetic cost (under an external GPU-counter capture)
// independent of the MSM geometry.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import type { MontMulVariant } from '../../src/msm_webgpu/cuzk/shader_manager.js';

export interface MicroResult {
  medianMs: number;
  minMs: number;
  walls: number[];
  numGroups: number;
}

/**
 * Compile-probe: build ONE shader module + compute pipeline in isolation
 * (fresh device, auto layout) and report success or the driver's error.
 * Separates "this kernel is rejected by the driver" from "the full MsmV2
 * pipeline build kills the GPU process" — the mobile failure modes look
 * identical from the app.
 */
export async function runCompileProbe(
  code: string,
  label: string,
  bindingTypes: GPUBufferBindingType[] = [],
): Promise<{ ok: boolean; error: string | null; ms: number }> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('[probe] no WebGPU adapter');
  // Mirror gpu.ts EXACTLY (features + the same four limits): pipeline-create
  // behaviour on the mobile drivers is sensitive to the device's requested
  // envelope (Tint's robustness/zero-init codegen depends on it), so the
  // probe must reproduce the app's device, not an approximation.
  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) requiredFeatures.push('timestamp-query');
  const requiredLimits: Record<string, number> = {};
  const lim = adapter.limits as unknown as Record<string, number>;
  for (const k of [
    'maxComputeWorkgroupStorageSize',
    'maxStorageBuffersPerShaderStage',
    'maxBufferSize',
    'maxStorageBufferBindingSize',
  ]) {
    if (typeof lim[k] === 'number') requiredLimits[k] = lim[k];
  }
  const device = await adapter.requestDevice({ requiredFeatures, requiredLimits });
  const t0 = performance.now();
  try {
    const module = device.createShaderModule({ code, label });
    const info = await module.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === 'error');
    if (errs.length) {
      return { ok: false, error: `WGSL: L${errs[0].lineNum}:${errs[0].linePos} ${errs[0].message}`, ms: performance.now() - t0 };
    }
    // Explicit pipeline layout (the app never uses layout:'auto'): bindings
    // are derived from the WGSL's @group(0) declarations passed by the
    // caller; empty = fall back to auto.
    let layout: GPUPipelineLayout | 'auto' = 'auto';
    if (bindingTypes.length > 0) {
      const bgl = device.createBindGroupLayout({
        entries: bindingTypes.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
      });
      layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    }
    await device.createComputePipelineAsync({ layout, compute: { module, entryPoint: 'main' } });
    return { ok: true, error: null, ms: performance.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e), ms: performance.now() - t0 };
  } finally {
    device.destroy();
  }
}

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function packLimbs(x: bigint, nw: number, ws: number): number[] {
  const o: number[] = [];
  const m = (1n << BigInt(ws)) - 1n;
  let t = ((x % P) + P) % P;
  for (let i = 0; i < nw; i++) {
    o.push(Number(t & m) >>> 0);
    t >>= BigInt(ws);
  }
  return o;
}

export async function runMicrobench(opts: {
  op: 'mul' | 'inv';
  montmul: MontMulVariant;
  pk14: boolean;
  nthreads: number;
  chainK: number;
  reps: number;
}): Promise<MicroResult> {
  const { op, montmul, pk14, nthreads, chainK, reps } = opts;

  // chunk_size=4 is irrelevant to the microbench (no scalar decomposition); it
  // only feeds index_shift, unused here. Arena ShaderManager fixes word_size from
  // the curve config (BN254 = 20×13), so there is no wordSize ctor param.
  const sm = new ShaderManager(4, nthreads, BN254_CURVE_CONFIG, false, montmul);
  const nw = sm.num_words;
  const ws = sm.word_size;
  const code = sm.gen_microbench_shader(op, chainK, nthreads, pk14);

  // Fixed canonical operands (timing is value-independent — montmul & safegcd are
  // fixed-trip). a, b packed into nw x ws-bit limbs.
  const a = (1n << 250n) | 0x9e3779b97f4a7c15n;
  const b = (1n << 248n) | 0x2545f4914f6cdd1dn;
  const al = packLimbs(a, nw, ws);
  const bl = packLimbs(b, nw, ws);
  const inStride = 2 * nw;
  const input = new Uint32Array(nthreads * inStride);
  for (let v = 0; v < nthreads; v++) {
    for (let i = 0; i < nw; i++) {
      input[v * inStride + i] = al[i];
      input[v * inStride + nw + i] = bl[i];
    }
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('[micro] no WebGPU adapter');
  const device = await adapter.requestDevice();
  const module = device.createShaderModule({ code, label: `micro-${op}-${montmul}${pk14 ? '-pk14' : ''}` });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter(m => m.type === 'error');
  if (errs.length) throw new Error(`[micro] compile: L${errs[0].lineNum}:${errs[0].linePos} ${errs[0].message}`);
  const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });

  const inBuf = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inBuf, 0, input);
  const outBuf = device.createBuffer({
    size: nthreads * nw * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const bg = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inBuf } },
      { binding: 1, resource: { buffer: outBuf } },
    ],
  });
  const numGroups = Math.ceil(nthreads / 64);

  const dispatch = (): void => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(numGroups);
    pass.end();
    device.queue.submit([enc.finish()]);
  };

  dispatch();
  await device.queue.onSubmittedWorkDone();
  dispatch();
  await device.queue.onSubmittedWorkDone();

  const walls: number[] = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    dispatch();
    await device.queue.onSubmittedWorkDone();
    walls.push(performance.now() - t0);
  }
  inBuf.destroy();
  outBuf.destroy();
  const sorted = [...walls].sort((a2, b2) => a2 - b2);
  return { medianMs: sorted[sorted.length >> 1], minMs: sorted[0], walls, numGroups };
}
