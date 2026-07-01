import { afterEach, describe, expect, it } from '@jest/globals';

import {
  DEFAULT_GATE_POLICY,
  adapterKeyFromInfo,
  decideFromProbe,
  makeGateProbe,
  peekGateVerdict,
  resolveGate,
  _resetGateCacheForTest,
  type GateProbe,
  type MsmPoint,
  type ProbeResult,
} from './capability_gate.js';

// Probe measurements lifted from the 2026-06-25 multi-device baseline
// (median of 5 reps at the throughput-probe size). These keep the gate's
// decision pinned to the real hardware behaviour it exists to handle.
const MAC_M4_PRO: ProbeResult = { crossCheckOk: true, webgpuMs: 226, wasmMs: 949 }; // 4.2x — clear win
const S26_ULTRA: ProbeResult = { crossCheckOk: true, webgpuMs: 679, wasmMs: 1132 }; // 1.67x — win
const PIXEL_10: ProbeResult = { crossCheckOk: true, webgpuMs: 3590, wasmMs: 2330 }; // 0.65x — loses
const S23_ADRENO740: ProbeResult = { crossCheckOk: false, webgpuMs: null, wasmMs: null }; // wrong result

afterEach(() => _resetGateCacheForTest());

describe('decideFromProbe', () => {
  it('keeps WebGPU on a correct, faster GPU (Mac M4 Pro)', () => {
    const v = decideFromProbe(MAC_M4_PRO);
    expect(v.useWebgpu).toBe(true);
    expect(v.reason).toBe('ok');
    expect(v.speedup).toBeCloseTo(949 / 226, 3);
  });

  it('keeps WebGPU on a correct, modestly-faster GPU (S26 Ultra)', () => {
    expect(decideFromProbe(S26_ULTRA)).toMatchObject({ useWebgpu: true, reason: 'ok' });
  });

  it('routes a correct-but-slower GPU to WASM (Pixel 10)', () => {
    const v = decideFromProbe(PIXEL_10);
    expect(v.useWebgpu).toBe(false);
    expect(v.reason).toBe('slower');
    expect(v.speedup).toBeLessThan(1.0);
  });

  it('routes a wrong GPU to WASM regardless of speed (S23 / Adreno 740)', () => {
    const v = decideFromProbe(S23_ADRENO740);
    expect(v.useWebgpu).toBe(false);
    expect(v.reason).toBe('incorrect');
  });

  it('correctness beats speed: a wrong GPU is gated off even if it timed fast', () => {
    const wrongButFast: ProbeResult = { crossCheckOk: false, webgpuMs: 10, wasmMs: 1000 };
    expect(decideFromProbe(wrongButFast)).toMatchObject({ useWebgpu: false, reason: 'incorrect' });
  });

  it('keeps a correct GPU when timings are absent (correctness-only evidence)', () => {
    const v = decideFromProbe({ crossCheckOk: true, webgpuMs: null, wasmMs: null });
    expect(v).toMatchObject({ useWebgpu: true, reason: 'ok' });
    expect(v.speedup).toBeNull();
  });

  it('does not fault a correct GPU on a degenerate (zero / non-finite) timing', () => {
    expect(decideFromProbe({ crossCheckOk: true, webgpuMs: 0, wasmMs: 100 })).toMatchObject({ useWebgpu: true });
    expect(decideFromProbe({ crossCheckOk: true, webgpuMs: NaN, wasmMs: 100 })).toMatchObject({ useWebgpu: true });
  });

  it('throughputProbe=false ignores speed entirely (keeps a correct but slow GPU)', () => {
    const v = decideFromProbe(PIXEL_10, { ...DEFAULT_GATE_POLICY, throughputProbe: false });
    expect(v).toMatchObject({ useWebgpu: true, reason: 'ok' });
  });

  it('honours a stricter minSpeedup floor (gate off a marginal win)', () => {
    expect(decideFromProbe(S26_ULTRA, { minSpeedup: 2.0, throughputProbe: true })).toMatchObject({
      useWebgpu: false,
      reason: 'slower',
    });
  });
});

describe('resolveGate', () => {
  function countingProbe(adapterKey: string, result: ProbeResult): GateProbe & { calls: number } {
    const probe = {
      adapterKey,
      calls: 0,
      run: async () => {
        probe.calls++;
        return result;
      },
    };
    return probe;
  }

  it('probes once per adapter and caches the verdict', async () => {
    const probe = countingProbe('apple|metal|m4|', MAC_M4_PRO);
    const first = await resolveGate(probe);
    const second = await resolveGate(probe);
    expect(first).toEqual(second);
    expect(first.useWebgpu).toBe(true);
    expect(probe.calls).toBe(1); // memoized — the GPU probe is not paid twice
  });

  it('probes distinct adapters independently', async () => {
    const mac = countingProbe('apple|metal|m4|', MAC_M4_PRO);
    const pixel = countingProbe('img|tensor|pixel10|', PIXEL_10);
    expect((await resolveGate(mac)).useWebgpu).toBe(true);
    expect((await resolveGate(pixel)).useWebgpu).toBe(false);
    expect(mac.calls).toBe(1);
    expect(pixel.calls).toBe(1);
  });

  it('a thrown probe (e.g. GPU device lost) degrades safely to WASM', async () => {
    const probe: GateProbe = {
      adapterKey: 'adreno|7xx|740|',
      run: async () => {
        throw new Error('Device was lost');
      },
    };
    const v = await resolveGate(probe);
    expect(v.useWebgpu).toBe(false);
    expect(v.reason).toBe('error');
    expect(v.detail).toContain('lost');
  });

  it('peekGateVerdict returns the cached verdict without re-probing', async () => {
    const probe = countingProbe('apple|metal|m4|', MAC_M4_PRO);
    expect(peekGateVerdict('apple|metal|m4|')).toBeUndefined();
    await resolveGate(probe);
    expect(peekGateVerdict('apple|metal|m4|')).toMatchObject({ useWebgpu: true });
    expect(probe.calls).toBe(1);
  });
});

describe('makeGateProbe', () => {
  const P: MsmPoint = { x: 111n, y: 222n };
  const WRONG: MsmPoint = { x: 999n, y: 888n };

  it('reports correct + fast when WebGPU matches WASM and is faster', async () => {
    const probe = makeGateProbe('apple|metal|m4|', {
      webgpu: async () => ({ point: P, ms: 226 }),
      wasm: async () => ({ point: P, ms: 949 }),
    });
    const v = decideFromProbe(await probe.run());
    expect(v).toMatchObject({ useWebgpu: true, reason: 'ok' });
    expect(v.speedup).toBeCloseTo(949 / 226, 3);
  });

  it('reports a cross-check failure when WebGPU disagrees with WASM (S23)', async () => {
    const probe = makeGateProbe('adreno|7xx|740|', {
      webgpu: async () => ({ point: WRONG, ms: 200 }),
      wasm: async () => ({ point: P, ms: 1000 }),
    });
    const result = await probe.run();
    expect(result.crossCheckOk).toBe(false);
    expect(decideFromProbe(result)).toMatchObject({ useWebgpu: false, reason: 'incorrect' });
  });

  it('end-to-end through resolveGate: a slow-but-correct device is gated off (Pixel)', async () => {
    const probe = makeGateProbe('img|tensor|pixel10|', {
      webgpu: async () => ({ point: P, ms: 3590 }),
      wasm: async () => ({ point: P, ms: 2330 }),
    });
    expect(await resolveGate(probe)).toMatchObject({ useWebgpu: false, reason: 'slower' });
  });

  it('honours a custom point-equality predicate', async () => {
    const probe = makeGateProbe('test|key|', {
      webgpu: async () => ({ point: { x: 1n, y: 2n }, ms: 1 }),
      wasm: async () => ({ point: { x: 1n, y: 99n }, ms: 1 }),
      equal: a => a.x === 1n, // x-only equality
    });
    expect((await probe.run()).crossCheckOk).toBe(true);
  });
});

describe('adapterKeyFromInfo', () => {
  it('is stable for the same device info', () => {
    const info = { vendor: 'qualcomm', architecture: 'adreno-7xx', device: '', description: 'Adreno 740' };
    expect(adapterKeyFromInfo(info)).toBe(adapterKeyFromInfo({ ...info }));
  });

  it('distinguishes different GPUs', () => {
    expect(adapterKeyFromInfo({ vendor: 'apple', architecture: 'metal-3' })).not.toBe(
      adapterKeyFromInfo({ vendor: 'qualcomm', architecture: 'adreno-7xx' }),
    );
  });

  it('produces a stable key even when all fields are missing', () => {
    expect(adapterKeyFromInfo(null)).toBe(adapterKeyFromInfo({}));
    expect(adapterKeyFromInfo(undefined)).toBe('?|?|?|?');
  });
});
