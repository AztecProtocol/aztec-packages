// GPU-free validation of the skip-path WGSL string-surgery (skip_inject.injectSkipPrelude
// / injectCompaction). The injections rewrite an already-valid assembled relation shader,
// so the risks are (a) a missing anchor making `.replace` a silent no-op and (b) emitting
// invalid WGSL. This test asserts every anchor is hit and the structure is sound for all 14
// relations; set SKIP_NAGA_DUMP=<dir> to also dump assembled + injected shaders to disk so
// `naga` can validate the WGSL compiles (the on-device path is exercised on the M4 run).

import { describe, expect, it, beforeAll } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'fs';
import type { RelationDescriptor } from '../../dev/sumcheck-webgpu/harness.js';

const DUMP = process.env.SKIP_NAGA_DUMP;

// The dev harness (descriptors -> harness -> cuzk/gpu.ts) evaluates GPUBufferUsage bitmask
// constants at module top-level; stub them so the chain imports in node. Values are
// irrelevant — this test never creates a real buffer or touches a device.
function stubWebGPU(): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.GPUBufferUsage) {
    g.GPUBufferUsage = {
      MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32,
      UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512,
    };
  }
  if (!g.GPUMapMode) g.GPUMapMode = { READ: 1, WRITE: 2 };
  if (!g.GPUShaderStage) g.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
}

const RELATION_IDS = [
  'arith', 'perm', 'logderiv', 'delta', 'elliptic', 'memory', 'nnf',
  'ecc', 'databus', 'pos2ext', 'pos2init', 'pos2quad', 'pos2quadterm', 'pos2trans',
];

let ALL_RELATIONS: RelationDescriptor[];
let injectSkipPrelude: (code: string, desc: RelationDescriptor) => string;
let injectCompaction: (code: string, desc: RelationDescriptor, hasParams: boolean) => string;

beforeAll(async () => {
  stubWebGPU();
  if (DUMP) mkdirSync(DUMP, { recursive: true });
  ({ injectSkipPrelude, injectCompaction } = await import('../../dev/sumcheck-webgpu/skip_inject.js'));
  ({ ALL_RELATIONS } = await import('../../dev/sumcheck-webgpu/descriptors.js'));
});

describe('skip-path WGSL injection', () => {
  it('exposes all 14 relations', () => {
    expect(ALL_RELATIONS.map(d => d.id).sort()).toEqual([...RELATION_IDS].sort());
  });

  it.each(RELATION_IDS)('%s: assembled shader exposes every injection anchor', id => {
    const desc = ALL_RELATIONS.find(d => d.id === id)!;
    const base = desc.shader(false);
    expect(base).toContain(`fn ${desc.entry}`);
    expect(base).toContain('if (row >= params.n) { return; }');
    expect(base).toContain('fn ld(row: u32, j: u32) -> array<u32, 8> {');
    expect(base).toContain('2u * row + (j & 1u)');
    expect(base).toContain('let base = row * 8u;');
    // Off by default: an un-injected shader carries no skip-path identifiers.
    expect(base).not.toContain('sk_zero8');
    expect(base).not.toContain('sk_active_idx');
    if (DUMP) writeFileSync(`${DUMP}/${id}.base.wgsl`, base);
  });

  it.each(RELATION_IDS)('%s: injectSkipPrelude (Tier 1) keeps the entry + inserts the predicate', id => {
    const desc = ALL_RELATIONS.find(d => d.id === id)!;
    const sk = injectSkipPrelude(desc.shader(false), desc);
    expect(sk).toContain(`fn ${desc.entry}`);
    expect(sk).toContain('let sk_zero8 =');
    expect(sk).toContain('for (var sk_k: u32 = 0u; sk_k < OUT_LEN');
    if (desc.skip.kind === 'eqPair') {
      expect(sk).toContain('fn sk_eq8(');
      const [a, b] = desc.skip.cols;
      expect(sk).toContain(`sk_eq8(ld(row, ${2 * a}u), ld(row, ${2 * b}u))`);
    } else {
      for (const c of desc.skip.cols) expect(sk).toContain(`is_zero_f8(ld(row, ${2 * c}u))`);
    }
    if (DUMP) writeFileSync(`${DUMP}/${id}.sk.wgsl`, sk);
  });

  it.each(RELATION_IDS)('%s: injectCompaction (Tier 2) gathers reads + binds the index list', id => {
    const desc = ALL_RELATIONS.find(d => d.id === id)!;
    const hasParams = !!desc.makeParams;
    const comp = injectCompaction(desc.shader(false), desc, hasParams);
    const idxBinding = hasParams ? 5 : 4;
    expect(comp).toContain(`@group(0) @binding(${idxBinding}) var<storage, read> sk_active_idx`);
    expect(comp).toContain('sk_active: u32');
    expect(comp).toContain('sk_base: u32');
    expect(comp).toContain('if (row >= params.sk_active) { return; }');
    expect(comp).toContain('let g = sk_active_idx[params.sk_base + row];');
    // Anchors must actually be rewritten — a missing anchor would silently leave the dense
    // indexing in place and corrupt the gathered read.
    expect(comp).toContain('2u * g + (j & 1u)');
    expect(comp).toContain('let base = g * 8u;');
    expect(comp).not.toContain('2u * row + (j & 1u)');
    if (DUMP) writeFileSync(`${DUMP}/${id}.comp.wgsl`, comp);
  });
});
