/// <reference types="@webgpu/types" />
// Base-field correctness verification page. Runs, for `n` random BN254
// base-field pairs, the three primitives the MSM relies on — Montgomery
// product, fr_add, fr_sub — on the GPU (u32 / 20×13-bit Karatsuba path,
// the production multiplier), and cross-checks EVERY output against a JS
// BigInt baseline. Auto-runs on load and POSTs `/progress` + `/results`
// so a BrowserStack harness can collect pass/fail per device. The point
// is to localise a mobile-GPU divergence to the field arithmetic itself.
//
// URL params: ?n=1048576 (default ~1M), ?seed=1 (deterministic inputs so
// two devices run identical data), ?wg=64, ?chunk=131072.

import { ShaderManager } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../../src/msm_webgpu/cuzk/curve_config.js';
import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { compute_misc_params } from '../../src/msm_webgpu/cuzk/utils.js';
import { makeResultsClient } from './results_post.js';

const NUM_LIMBS = 20;
const WORD_SIZE = 13;
const MASK = (1n << BigInt(WORD_SIZE)) - 1n;

const $log = document.getElementById('log') as HTMLDivElement;
function log(level: 'info' | 'ok' | 'err' | 'warn', msg: string): void {
  const span = document.createElement('div');
  span.className = level === 'info' ? '' : level;
  span.textContent = msg;
  $log?.appendChild(span);
  console.log(`[field-verify/${level}] ${msg}`);
}

function bigintToLimbsU32(v: bigint): number[] {
  const limbs = new Array<number>(NUM_LIMBS);
  let x = v;
  for (let i = 0; i < NUM_LIMBS; i++) {
    limbs[i] = Number(x & MASK);
    x >>= BigInt(WORD_SIZE);
  }
  return limbs;
}
function limbsU32ToBigint(limbs: ArrayLike<number>, off: number): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE)) | BigInt(limbs[off + i] >>> 0);
  }
  return v;
}

// Deterministic LCG so two devices run byte-identical inputs.
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}
function randomBelow(p: bigint, rng: () => number): bigint {
  const bitlen = p.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  for (;;) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) v = (v << 8n) | BigInt(rng() & 0xff);
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v < p) return v;
  }
}

interface OpStat {
  mismatches: number;
  samples: string[];
}

async function run(): Promise<void> {
  const qp = new URLSearchParams(window.location.search);
  const n = Math.max(1, Math.min(1 << 24, parseInt(qp.get('n') ?? String(1 << 20), 10)));
  const seed = parseInt(qp.get('seed') ?? '1', 10);
  const wg = Math.max(1, Math.min(256, parseInt(qp.get('wg') ?? '64', 10)));
  const chunk = Math.max(1, Math.min(1 << 19, parseInt(qp.get('chunk') ?? String(1 << 17), 10)));
  const client = makeResultsClient({ page: 'field-verify' });
  client.postProgress({ phase: 'boot', n, seed, hasWebGpu: 'gpu' in navigator, userAgent: navigator.userAgent });

  const t0 = performance.now();
  try {
    if (!('gpu' in navigator)) throw new Error('navigator.gpu is undefined — no WebGPU in this browser');

    const p = BN254_CURVE_CONFIG.baseFieldModulus;
    const params = compute_misc_params(p, WORD_SIZE);
    if (params.num_words !== NUM_LIMBS) throw new Error(`expected ${NUM_LIMBS} limbs, got ${params.num_words}`);
    const R = params.r;
    const Rinv = params.rinv;
    if ((R * Rinv) % p !== 1n) throw new Error('R * Rinv mod p != 1');

    const device = await get_device();
    const sm = new ShaderManager(4, chunk, BN254_CURVE_CONFIG, false);
    const code = sm.gen_field_verify_u32_shader(wg);
    const module = device.createShaderModule({ code });
    const ci = await module.getCompilationInfo();
    for (const m of ci.messages) {
      if (m.type === 'error') {
        log('err', `shader ${m.type} (line ${m.lineNum}): ${m.message}`);
      }
    }
    if (ci.messages.some(m => m.type === 'error')) throw new Error('WGSL compile failed');

    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    const pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: 'main' },
    });

    const elemBytes = NUM_LIMBS * 4;
    const bufBytes = chunk * elemBytes;
    const xsBuf = device.createBuffer({ size: bufBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const ysBuf = device.createBuffer({ size: bufBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const mkOut = () =>
      device.createBuffer({ size: bufBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const mulBuf = mkOut();
    const addBuf = mkOut();
    const subBuf = mkOut();
    const uniformBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const staging = device.createBuffer({ size: bufBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const bindGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: xsBuf } },
        { binding: 1, resource: { buffer: ysBuf } },
        { binding: 2, resource: { buffer: mulBuf } },
        { binding: 3, resource: { buffer: addBuf } },
        { binding: 4, resource: { buffer: subBuf } },
        { binding: 5, resource: { buffer: uniformBuf } },
      ],
    });

    const rng = makeRng(seed);
    const stats: Record<'mul' | 'add' | 'sub', OpStat> = {
      mul: { mismatches: 0, samples: [] },
      add: { mismatches: 0, samples: [] },
      sub: { mismatches: 0, samples: [] },
    };

    const readBack = async (src: GPUBuffer, bytes: number): Promise<Uint32Array> => {
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(src, 0, staging, 0, bytes);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await staging.mapAsync(GPUMapMode.READ, 0, bytes);
      const copy = new Uint32Array(staging.getMappedRange(0, bytes).slice(0));
      staging.unmap();
      return copy;
    };

    let done = 0;
    const xsHost = new Uint32Array(chunk * NUM_LIMBS);
    const ysHost = new Uint32Array(chunk * NUM_LIMBS);
    log('info', `verify n=${n.toLocaleString()} seed=${seed} wg=${wg} chunk=${chunk.toLocaleString()}`);

    while (done < n) {
      const cn = Math.min(chunk, n - done);
      // Build inputs (Mont-form), keep references for the JS baseline.
      const aMont: bigint[] = new Array(cn);
      const bMont: bigint[] = new Array(cn);
      for (let i = 0; i < cn; i++) {
        const a = randomBelow(p, rng);
        const b = randomBelow(p, rng);
        const am = (a * R) % p;
        const bm = (b * R) % p;
        aMont[i] = am;
        bMont[i] = bm;
        const al = bigintToLimbsU32(am);
        const bl = bigintToLimbsU32(bm);
        const off = i * NUM_LIMBS;
        for (let j = 0; j < NUM_LIMBS; j++) {
          xsHost[off + j] = al[j];
          ysHost[off + j] = bl[j];
        }
      }
      device.queue.writeBuffer(xsBuf, 0, xsHost.buffer, 0, cn * elemBytes);
      device.queue.writeBuffer(ysBuf, 0, ysHost.buffer, 0, cn * elemBytes);
      device.queue.writeBuffer(uniformBuf, 0, new Uint32Array([cn, 0, 0, 0]));

      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil(cn / wg), 1, 1);
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();

      const cBytes = cn * elemBytes;
      const mulOut = await readBack(mulBuf, cBytes);
      const addOut = await readBack(addBuf, cBytes);
      const subOut = await readBack(subBuf, cBytes);

      for (let i = 0; i < cn; i++) {
        const off = i * NUM_LIMBS;
        const expMul = (aMont[i] * bMont[i] * Rinv) % p;
        const expAdd = (aMont[i] + bMont[i]) % p;
        const expSub = ((aMont[i] - bMont[i]) % p + p) % p;
        const gotMul = limbsU32ToBigint(mulOut, off);
        const gotAdd = limbsU32ToBigint(addOut, off);
        const gotSub = limbsU32ToBigint(subOut, off);
        const check = (name: 'mul' | 'add' | 'sub', exp: bigint, got: bigint) => {
          if (exp !== got) {
            const s = stats[name];
            s.mismatches++;
            if (s.samples.length < 5) {
              s.samples.push(
                `idx=${done + i} aMont=0x${aMont[i].toString(16)} bMont=0x${bMont[i].toString(16)} ` +
                  `expected=0x${exp.toString(16)} got=0x${got.toString(16)}`,
              );
            }
          }
        };
        check('mul', expMul, gotMul);
        check('add', expAdd, gotAdd);
        check('sub', expSub, gotSub);
      }

      done += cn;
      client.postProgress({
        phase: 'chunk',
        done,
        n,
        mulMismatch: stats.mul.mismatches,
        addMismatch: stats.add.mismatches,
        subMismatch: stats.sub.mismatches,
      });
      log(
        'info',
        `chunk -> ${done.toLocaleString()}/${n.toLocaleString()} ` +
          `(mul✗=${stats.mul.mismatches} add✗=${stats.add.mismatches} sub✗=${stats.sub.mismatches})`,
      );
    }

    const allOk = stats.mul.mismatches === 0 && stats.add.mismatches === 0 && stats.sub.mismatches === 0;
    const totalMs = performance.now() - t0;
    log(allOk ? 'ok' : 'err', `DONE in ${(totalMs / 1000).toFixed(1)}s — allOk=${allOk}`);
    for (const op of ['mul', 'add', 'sub'] as const) {
      if (stats[op].mismatches > 0) {
        log('err', `${op}: ${stats[op].mismatches} mismatches / ${n}`);
        for (const s of stats[op].samples) log('err', `  ${s}`);
      } else {
        log('ok', `${op}: all ${n.toLocaleString()} matched`);
      }
    }

    xsBuf.destroy();
    ysBuf.destroy();
    mulBuf.destroy();
    addBuf.destroy();
    subBuf.destroy();
    uniformBuf.destroy();
    staging.destroy();

    await client.postResults({
      state: allOk ? 'done' : 'mismatch',
      params: { n, seed, wg, chunk, path: 'u32-karat', ops: ['montmul', 'fr_add', 'fr_sub'] },
      results: {
        allOk,
        mul: { mismatches: stats.mul.mismatches, samples: stats.mul.samples },
        add: { mismatches: stats.add.mismatches, samples: stats.add.samples },
        sub: { mismatches: stats.sub.mismatches, samples: stats.sub.samples },
        totalMs,
      },
      hasWebGpu: true,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    log('err', `FATAL: ${msg}`);
    await client.postResults({
      state: 'error',
      params: { page: 'field-verify' },
      results: null,
      error: msg,
      hasWebGpu: 'gpu' in navigator,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
  }
}

run();
