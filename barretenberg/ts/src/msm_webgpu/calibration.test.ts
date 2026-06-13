// Unit tests for the calibration's pure helpers (the GPU/CPU timing paths need a
// device + wasm and are exercised by the dev harness `?autorun=msm-calibrate`).
import { describe, expect, test } from '@jest/globals';
import {
  adapterKey,
  fitAffine,
  makeDenseScalars,
  serializeMsmModel,
  vendorPriorMontmul,
  type MsmCalibration,
} from './calibration.js';

describe('fitAffine', () => {
  test('recovers a known line', () => {
    const fit = fitAffine([
      { x: 1, y: 5 },
      { x: 2, y: 7 },
      { x: 4, y: 11 },
    ]); // y = 2x + 3
    expect(fit.a).toBeCloseTo(2, 9);
    expect(fit.b).toBeCloseTo(3, 9);
  });

  test('single sample → flat line at its y', () => {
    const fit = fitAffine([{ x: 9, y: 42 }]);
    expect(fit.a).toBe(0);
    expect(fit.b).toBe(42);
  });

  test('empty → zero', () => {
    expect(fitAffine([])).toEqual({ a: 0, b: 0 });
  });

  test('least-squares through noisy points', () => {
    // y = 3x + 1 with small symmetric noise → slope/intercept recovered closely.
    const fit = fitAffine([
      { x: 0, y: 1.1 },
      { x: 10, y: 30.9 },
      { x: 20, y: 61.1 },
      { x: 30, y: 90.9 },
    ]);
    expect(fit.a).toBeCloseTo(3, 1);
    expect(fit.b).toBeCloseTo(1, 0);
  });
});

describe('makeDenseScalars', () => {
  test('shape and density', () => {
    const n = 64;
    const s = makeDenseScalars(n, 1);
    expect(s.length).toBe(n * 32);
    for (let i = 0; i < n; i++) {
      // every scalar non-zero (low bit forced) and < modulus (top byte 0)
      let nonzero = false;
      for (let b = 0; b < 32; b++) nonzero ||= s[i * 32 + b] !== 0;
      expect(nonzero).toBe(true);
      expect(s[i * 32 + 31]).toBe(0);
    }
  });

  test('deterministic by seed', () => {
    expect(makeDenseScalars(16, 7)).toEqual(makeDenseScalars(16, 7));
    expect(makeDenseScalars(16, 7)).not.toEqual(makeDenseScalars(16, 8));
  });
});

describe('vendorPriorMontmul', () => {
  test('Apple → karat', () => {
    expect(
      vendorPriorMontmul({ vendor: 'apple', architecture: 'metal-3', device: '', description: '' } as GPUAdapterInfo),
    ).toBe('karat');
  });
  test('Adreno / Mali → cios_unrolled', () => {
    expect(
      vendorPriorMontmul({
        vendor: 'qualcomm',
        architecture: 'adreno-830',
        device: '',
        description: '',
      } as GPUAdapterInfo),
    ).toBe('cios_unrolled');
    expect(
      vendorPriorMontmul({ vendor: 'arm', architecture: 'mali-g715', device: '', description: '' } as GPUAdapterInfo),
    ).toBe('cios_unrolled');
  });
  test('unknown → karat (safe high-register default)', () => {
    expect(vendorPriorMontmul(undefined)).toBe('karat');
    expect(
      vendorPriorMontmul({ vendor: 'mysteryco', architecture: '', device: '', description: '' } as GPUAdapterInfo),
    ).toBe('karat');
  });
});

describe('serializeMsmModel', () => {
  const cal: MsmCalibration = {
    adapterKey: 'apple/metal-3/M4',
    montmul: 'karat',
    limbRadix: 13,
    cpu: { aPerNnz: 1.0e-3, bFixed: 0.3 },
    gpu: { aPerPoint: 3.5e-4, bFloor: 8.0, bUnion: 2.0 },
    trusted: true,
    elapsedMs: 800,
    measureMs: 800,
    compileMs: 500,
    raw: { cpuSamples: [], gpuSamples: [], montmulAb: [], unionSample: null, notes: [] },
  };

  test('packs 5 little-endian f64 in the order the C++ hook reads', () => {
    const bytes = serializeMsmModel(cal);
    expect(bytes.length).toBe(40);
    const dv = new DataView(bytes.buffer);
    expect(dv.getFloat64(0, true)).toBeCloseTo(1.0e-3, 12);
    expect(dv.getFloat64(8, true)).toBeCloseTo(0.3, 12);
    expect(dv.getFloat64(16, true)).toBeCloseTo(3.5e-4, 12);
    expect(dv.getFloat64(24, true)).toBeCloseTo(8.0, 12);
    expect(dv.getFloat64(32, true)).toBeCloseTo(2.0, 12);
  });

  test('null union floor serializes to a negative sentinel (unmeasured)', () => {
    const bytes = serializeMsmModel({ ...cal, gpu: { ...cal.gpu, bUnion: null } });
    expect(new DataView(bytes.buffer).getFloat64(32, true)).toBeLessThan(0);
  });
});

describe('adapterKey', () => {
  test('formats vendor/arch/device', () => {
    expect(
      adapterKey({ vendor: 'apple', architecture: 'metal-3', device: 'M4', description: '' } as GPUAdapterInfo),
    ).toBe('apple/metal-3/M4');
    expect(adapterKey(undefined)).toBe('unknown/unknown/unknown');
  });
});
