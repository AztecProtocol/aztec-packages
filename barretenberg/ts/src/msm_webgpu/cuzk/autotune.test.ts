// Per-architecture autotuner unit test. Pure decision logic — no GPUDevice —
// so it runs on Node (jest). Feeds synthetic per-vendor GPU profiles and
// asserts the chosen (TPB, S) differs sensibly across the device matrix and
// never overflows the device's workgroup-storage limit.

import { describe, expect, it } from '@jest/globals';
import {
  classifyArch,
  prefScratchBytes,
  selectWalkerConfig,
  type GpuProfile,
} from './autotune.js';

// Representative profiles for the BrowserStack target matrix. Workgroup-storage
// limits are the WebGPU-reported `maxComputeWorkgroupStorageSize` values.
const APPLE: GpuProfile = {
  vendor: 'apple',
  architecture: 'metal-3',
  maxComputeWorkgroupStorageSize: 32768,
  maxComputeInvocationsPerWorkgroup: 1024,
};
const ADRENO: GpuProfile = {
  vendor: 'qualcomm',
  architecture: 'adreno-7xx',
  maxComputeWorkgroupStorageSize: 32768,
  maxComputeInvocationsPerWorkgroup: 1024,
};
const MALI_BIFROST: GpuProfile = {
  vendor: 'arm',
  architecture: 'mali-bifrost',
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeInvocationsPerWorkgroup: 512,
};
const APPLE_M3: GpuProfile = {
  vendor: 'apple',
  architecture: 'metal-3',
  maxComputeWorkgroupStorageSize: 65536,
  maxComputeInvocationsPerWorkgroup: 1024,
};

describe('classifyArch', () => {
  it('classifies the target GPU families', () => {
    expect(classifyArch(APPLE)).toBe('apple');
    expect(classifyArch(ADRENO)).toBe('adreno');
    expect(classifyArch(MALI_BIFROST)).toBe('mali');
    expect(classifyArch({ maxComputeWorkgroupStorageSize: 16384 })).toBe('generic');
  });
});

describe('prefScratchBytes', () => {
  it('matches the WGSL formula TPB×S×2 planes×16 B', () => {
    expect(prefScratchBytes(64, 8)).toBe(16384); // 16 KB — Mali fit
    expect(prefScratchBytes(128, 8)).toBe(32768); // 32 KB — Apple/Adreno fit
    expect(prefScratchBytes(32, 8)).toBe(8192);
  });
});

describe('selectWalkerConfig', () => {
  it('picks TPB=128 on 32 KB Apple/Adreno', () => {
    for (const p of [APPLE, ADRENO]) {
      const cfg = selectWalkerConfig(p);
      expect(cfg.tpb).toBe(128);
      expect(cfg.s).toBe(8);
      expect(cfg.prefScratchBytes).toBe(32768);
      expect(cfg.prefScratchBytes).toBeLessThanOrEqual(p.maxComputeWorkgroupStorageSize);
      expect(cfg.prefScratchPlacement).toBe('workgroup');
    }
  });

  it('falls back to TPB=64 on 16 KB Mali Bifrost', () => {
    const cfg = selectWalkerConfig(MALI_BIFROST);
    expect(cfg.arch).toBe('mali');
    expect(cfg.tpb).toBe(64);
    expect(cfg.s).toBe(8);
    expect(cfg.prefScratchBytes).toBe(16384);
    expect(cfg.prefScratchBytes).toBeLessThanOrEqual(16384);
  });

  it('caps at TPB=128 even on 64 KB devices (largest ladder rung)', () => {
    const cfg = selectWalkerConfig(APPLE_M3);
    expect(cfg.tpb).toBe(128);
  });

  it('produces a config that differs across the device matrix', () => {
    const tpbs = new Set([APPLE, MALI_BIFROST].map(p => selectWalkerConfig(p).tpb));
    expect(tpbs.size).toBe(2); // Apple→128, Mali→64
  });

  it('never overflows workgroup storage for any plausible limit', () => {
    for (let limit = 8192; limit <= 131072; limit += 4096) {
      const cfg = selectWalkerConfig({ maxComputeWorkgroupStorageSize: limit });
      if (cfg.prefScratchPlacement === 'workgroup') {
        expect(cfg.prefScratchBytes).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('honours an explicit TPB override and validates the fit', () => {
    const forced = selectWalkerConfig(MALI_BIFROST, { tpb: 128 });
    expect(forced.tpb).toBe(128);
    // 32 KB does not fit Mali's 16 KB → reported as a device-placement bust.
    expect(forced.prefScratchPlacement).toBe('device');
  });

  it('respects maxComputeInvocationsPerWorkgroup as a TPB cap', () => {
    const cfg = selectWalkerConfig({
      maxComputeWorkgroupStorageSize: 65536,
      maxComputeInvocationsPerWorkgroup: 64,
    });
    expect(cfg.tpb).toBeLessThanOrEqual(64);
  });

  it('trims S only when no TPB fits even the smallest rung', () => {
    // 4 KB workgroup storage: TPB=32,S=8 needs 8 KB → must trim S.
    const cfg = selectWalkerConfig({ maxComputeWorkgroupStorageSize: 4096 });
    expect(cfg.tpb).toBe(32);
    expect(cfg.s).toBeLessThan(8);
    expect(cfg.prefScratchBytes).toBeLessThanOrEqual(4096);
  });
});
