// Isolated montmul / inverse microbench. Mirrors the proven dev/montmul_bench.ts
// device path (bare requestAdapter/requestDevice, layout:'auto', 2 storage
// bindings) but renders the SAME montmul / inverse the MSM pipeline uses,
// selected by wordSize (13 -> 20x13, 15 -> 17x15 native). Each of `nthreads`
// threads chains `chainK` ops on operands held in the num_words x word_size rep;
// timing-only (correctness is already covered by the MSM cross-check + host
// models). Dependent + stored chain => not optimized away.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import type { MontMulVariant } from '../../src/msm_webgpu/cuzk/shader_manager.js';

export interface MicroResult {
  medianMs: number;
  minMs: number;
  walls: number[];
  numGroups: number;
  // Populated only by the primitive-op (subgroup-gate) path:
  sgSupported?: boolean;
  sgMinSize?: number;
  sgMaxSize?: number;
  sgRuntime?: number;
}

// `mul`/`inv` render the real montmul/safegcd via ShaderManager. The four
// PRIMITIVE ops below isolate the cost of one cross-lane subgroup op relative
// to one 32-bit integer multiply-add — the ratio `s` that decides whether a
// thread-cooperative montmul can pay for itself. `bcast`/`shuffle` are the
// exact ops a cooperative CIOS needs: the qi broadcast and the limb-shift
// hand-off. Each kernel runs a dependent, stored chain so the compiler can
// neither constant-fold nor dead-code-eliminate it.
export type MicroOp = 'mul' | 'inv' | 'nop' | 'imad' | 'bcast' | 'shuffle';

const PRIMITIVE_OPS: readonly MicroOp[] = ['nop', 'imad', 'bcast', 'shuffle'];

export function isPrimitiveOp(op: MicroOp): boolean {
  return (PRIMITIVE_OPS as readonly string[]).includes(op);
}

function genPrimitiveKernel(op: MicroOp, chainK: number, unroll: number): string {
  const usesSubgroup = op === 'bcast' || op === 'shuffle';
  const enable = usesSubgroup ? 'enable subgroups;\n\n' : '';
  const sgParams = usesSubgroup
    ? ',\n        @builtin(subgroup_size) sg_size: u32,\n        @builtin(subgroup_invocation_id) sg_id: u32'
    : '';
  let body: string;
  switch (op) {
    case 'nop':
      body = 'acc = acc + 0x9e3779b9u;';
      break;
    case 'imad':
      // Self-dependent multiply: one u32 mul that the compiler cannot fold
      // across unrolled copies (a chain of affine a*c+d would collapse).
      body = 'acc = acc * (acc | 1u) + 0x9e3779b9u;';
      break;
    case 'bcast':
      body = 'acc = subgroupBroadcastFirst(acc) + sg_id + 0x9e3779b9u;';
      break;
    case 'shuffle':
      body = 'acc = subgroupShuffleDown(acc, 1u) + 0x9e3779b9u;';
      break;
    default:
      throw new Error(`genPrimitiveKernel: ${op} is not a primitive op`);
  }
  const sgStore = usesSubgroup ? '  if (tid == 0u) { sgout[0] = sg_size; }\n' : '  if (tid == 0u) { sgout[0] = 0u; }\n';
  // `unroll` copies of the dependent op per loop iteration. Sweeping unroll at
  // fixed chainK isolates the pure per-op cost (loop-counter overhead cancels),
  // which matches the fully-unrolled f8_native montmul better than the looped form.
  const bodyBlock = Array.from({ length: Math.max(1, unroll >>> 0) }, () => `    ${body}`).join('\n');
  return `${enable}@group(0) @binding(0) var<storage, read> inp: array<u32>;
@group(0) @binding(1) var<storage, read_write> outp: array<u32>;
@group(0) @binding(2) var<storage, read_write> sgout: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>${sgParams}) {
  let tid = gid.x;
  var acc: u32 = inp[tid] | 1u;
  for (var i = 0u; i < ${chainK >>> 0}u; i = i + 1u) {
${bodyBlock}
  }
  outp[tid] = acc;
${sgStore}}
`;
}

// Self-contained primitive-op microbench. Independent of ShaderManager /
// montmul: a dependent chain of `chainK` ops over `nthreads` threads, timed
// `reps` times. Requests the `subgroups` feature when available and reports the
// runtime subgroup size; if a subgroup op is requested on a device without the
// feature, returns medianMs=-1 with sgSupported=false (a real gate outcome).
async function runPrimitiveMicrobench(op: MicroOp, nthreads: number, chainK: number, reps: number, unroll: number): Promise<MicroResult> {
  const usesSubgroup = op === 'bcast' || op === 'shuffle';
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('[micro] no WebGPU adapter');
  const sgSupported = adapter.features.has('subgroups');
  const ainfo = adapter.info as unknown as { subgroupMinSize?: number; subgroupMaxSize?: number };
  const sgMinSize = ainfo?.subgroupMinSize;
  const sgMaxSize = ainfo?.subgroupMaxSize;
  if (usesSubgroup && !sgSupported) {
    return { medianMs: -1, minMs: -1, walls: [], numGroups: 0, sgSupported: false, sgMinSize, sgMaxSize, sgRuntime: 0 };
  }
  const requiredFeatures: GPUFeatureName[] = sgSupported ? (['subgroups'] as GPUFeatureName[]) : [];
  const device = await adapter.requestDevice({ requiredFeatures });

  const code = genPrimitiveKernel(op, chainK, unroll);
  const module = device.createShaderModule({ code, label: `micro-${op}-u${unroll}` });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(`[micro] compile: L${errs[0].lineNum}:${errs[0].linePos} ${errs[0].message}`);
  const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });

  const seed = new Uint32Array(nthreads);
  for (let i = 0; i < nthreads; i++) seed[i] = (i * 2654435761) >>> 0;
  const inBuf = device.createBuffer({ size: Math.max(4, seed.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inBuf, 0, seed);
  const outBuf = device.createBuffer({ size: Math.max(4, nthreads * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const sgBuf = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bg = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inBuf } },
      { binding: 1, resource: { buffer: outBuf } },
      { binding: 2, resource: { buffer: sgBuf } },
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
  let sgRuntime = 0;
  const stage = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(sgBuf, 0, stage, 0, 4);
  device.queue.submit([enc.finish()]);
  await stage.mapAsync(GPUMapMode.READ, 0, 4);
  sgRuntime = new Uint32Array(stage.getMappedRange(0, 4).slice(0))[0];
  stage.unmap();
  inBuf.destroy();
  outBuf.destroy();
  sgBuf.destroy();
  stage.destroy();
  const sorted = [...walls].sort((a2, b2) => a2 - b2);
  return { medianMs: sorted[sorted.length >> 1], minMs: sorted[0], walls, numGroups, sgSupported, sgMinSize, sgMaxSize, sgRuntime };
}

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function packLimbs(x: bigint, nw: number, ws: number): number[] {
  const o: number[] = [];
  const m = (1n << BigInt(ws)) - 1n;
  let t = ((x % P) + P) % P;
  for (let i = 0; i < nw; i++) { o.push(Number(t & m) >>> 0); t >>= BigInt(ws); }
  return o;
}

export async function runMicrobench(opts: {
  op: MicroOp;
  wordSize: number;
  montmul: MontMulVariant;
  nthreads: number;
  chainK: number;
  reps: number;
  unroll?: number;
}): Promise<MicroResult> {
  const { op, wordSize, montmul, nthreads, chainK, reps } = opts;

  // Primitive ops (the subgroup gate) take a self-contained path — no
  // ShaderManager, montmul, or wordSize involved.
  if (isPrimitiveOp(op)) return runPrimitiveMicrobench(op, nthreads, chainK, reps, opts.unroll ?? 1);

  const sm = new ShaderManager(4, nthreads, BN254_CURVE_CONFIG, false, montmul, wordSize);
  const nw = sm.num_words;
  const ws = sm.word_size;
  const code = sm.gen_microbench_shader(op as 'mul' | 'inv', chainK, nthreads);

  // Fixed canonical operands (timing is value-independent — montmul & safegcd are
  // fixed-trip). a, b packed into nw x ws-bit limbs.
  const a = (1n << 250n) | 0x9e3779b97f4a7c15n;
  const b = (1n << 248n) | 0x2545f4914f6cdd1dn;
  const al = packLimbs(a, nw, ws);
  const bl = packLimbs(b, nw, ws);
  const inStride = 2 * nw;
  const input = new Uint32Array(nthreads * inStride);
  for (let v = 0; v < nthreads; v++) {
    for (let i = 0; i < nw; i++) { input[v * inStride + i] = al[i]; input[v * inStride + nw + i] = bl[i]; }
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('[micro] no WebGPU adapter');
  const device = await adapter.requestDevice();
  const module = device.createShaderModule({ code, label: `micro-${op}-ws${wordSize}` });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter((m) => m.type === 'error');
  if (errs.length) throw new Error(`[micro] compile: L${errs[0].lineNum}:${errs[0].linePos} ${errs[0].message}`);
  const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });

  const inBuf = device.createBuffer({ size: input.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inBuf, 0, input);
  const outBuf = device.createBuffer({ size: nthreads * nw * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bg = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: inBuf } }, { binding: 1, resource: { buffer: outBuf } }],
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

  dispatch(); await device.queue.onSubmittedWorkDone();
  dispatch(); await device.queue.onSubmittedWorkDone();

  const walls: number[] = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    dispatch();
    await device.queue.onSubmittedWorkDone();
    walls.push(performance.now() - t0);
  }
  inBuf.destroy(); outBuf.destroy();
  const sorted = [...walls].sort((a2, b2) => a2 - b2);
  return { medianMs: sorted[sorted.length >> 1], minMs: sorted[0], walls, numGroups };
}
