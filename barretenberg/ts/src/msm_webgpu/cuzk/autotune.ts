/// <reference types="@webgpu/types" />

// Per-architecture autotuner for the stream-walker accumulator.
//
// The stream-walker dispatches a fixed set of NUM_THREADS = nwg×256 logical
// threads (set by the planner's partition_thread grain). WALKER_TPB only
// controls how those threads are PACKED into workgroups, and therefore the
// size of the per-workgroup `pref_scratch` shared-memory allocation:
//
//     pref_scratch = TPB × S × 2 planes × 16 B  (one vec4 per plane per slot)
//                  = TPB × S × 32 B
//
// Each walker thread reads/writes only its own [local_id×S, local_id×S+S)
// region (KNOB 1: no cross-thread sharing, no workgroup barrier), so TPB is
// correctness-neutral — varying it cannot change the MSM result, only
// occupancy and the shared-memory footprint. That makes it a safe knob to
// tune against the device's `maxComputeWorkgroupStorageSize`:
//
//   * Apple A/M-series (TBDR) and Qualcomm Adreno expose ~32 KB → TPB=128.
//   * ARM Mali Bifrost caps workgroup storage at 16 KB → TPB=64.
//   * Anything tighter steps down to TPB=32 (and, only if even that does not
//     fit, trims S so the walker still launches).
//
// The selection is a pure function of a {@link GpuProfile}, so it is unit-
// testable on a host with no GPU by feeding synthetic per-vendor profiles.

/** Number of accumulator planes held in `pref_scratch` per slot. */
const PG_PLANES = 2;
/** Bytes per vec4<u32> (one Montgomery half-limb plane). */
const VEC4_BYTES = 16;

/** Candidate threads-per-block, largest first. All divide 256 cleanly so
 *  `ceil(NUM_THREADS / TPB)` packs the logical threads with no remainder. */
const TPB_LADDER = [128, 64, 32] as const;

/** Default batched-inversion slots. Empirically optimal (see design plan §4);
 *  only trimmed when no TPB in the ladder fits the workgroup-storage limit. */
const DEFAULT_S = 8;

export type GpuArch = 'apple' | 'adreno' | 'mali' | 'generic';

/** GPU capabilities the autotuner reads. A subset of `GPUDevice.limits` plus
 *  adapter identity; deliberately a plain object so it can be synthesized in
 *  tests without a real adapter. */
export interface GpuProfile {
  /** `device.limits.maxComputeWorkgroupStorageSize` (bytes). */
  maxComputeWorkgroupStorageSize: number;
  /** `device.limits.maxComputeInvocationsPerWorkgroup` (caps TPB). */
  maxComputeInvocationsPerWorkgroup?: number;
  /** `adapter.info.vendor` (lower-cased), e.g. "apple", "qualcomm", "arm". */
  vendor?: string;
  /** `adapter.info.architecture` (lower-cased), e.g. "metal-3", "adreno-7xx". */
  architecture?: string;
  /** `device.limits.minSubgroupSize` when the `subgroups` feature is present. */
  subgroupMinSize?: number;
  /** `device.limits.maxSubgroupSize` when the `subgroups` feature is present. */
  subgroupMaxSize?: number;
}

/** The chosen stream-walker configuration plus an explanation for logging. */
export interface WalkerConfig {
  /** Walker workgroup size (threads-per-block). */
  tpb: number;
  /** Batched-inversion slots per thread. */
  s: number;
  /** `pref_scratch` shared-memory footprint at (tpb, s), in bytes. */
  prefScratchBytes: number;
  /** Where `pref_scratch` lives. The walker WGSL holds it in `var<workgroup>`;
   *  'device' is only reported when no (tpb, s) fits shared memory, signalling
   *  that a device-storage shader variant would be required (not yet built). */
  prefScratchPlacement: 'workgroup' | 'device';
  /** Classified GPU family. */
  arch: GpuArch;
  /** Human-readable rationale, surfaced in `[autotune]` logs. */
  reason: string;
}

/** Per-(tpb, s) `pref_scratch` footprint in bytes. */
export function prefScratchBytes(tpb: number, s: number): number {
  return tpb * s * PG_PLANES * VEC4_BYTES;
}

/** Classify the GPU family from adapter vendor/architecture strings. */
export function classifyArch(profile: GpuProfile): GpuArch {
  const hay = `${profile.vendor ?? ''} ${profile.architecture ?? ''}`.toLowerCase();
  if (/apple|metal/.test(hay)) return 'apple';
  if (/qualcomm|adreno/.test(hay)) return 'adreno';
  if (/\barm\b|mali|bifrost|valhall|midgard/.test(hay)) return 'mali';
  return 'generic';
}

/**
 * Choose the stream-walker {@link WalkerConfig} for a device.
 *
 * Policy: pick the largest TPB in {@link TPB_LADDER} whose `pref_scratch`
 * footprint fits the workgroup-storage limit and whose value does not exceed
 * `maxComputeInvocationsPerWorkgroup`, keeping S=8. The walker has no
 * cross-thread workgroup barrier, so a larger TPB strictly reduces workgroup-
 * launch count and improves SIMD packing at no synchronization cost — hence
 * "largest that fits". If no TPB fits even the smallest ladder rung, trim S.
 *
 * `opts.tpb` / `opts.s` force a value (used for A/B benchmarking and to honour
 * an explicit {@link MsmConfig} override); the fit is still validated.
 */
export function selectWalkerConfig(
  profile: GpuProfile,
  opts?: { tpb?: number; s?: number },
): WalkerConfig {
  const arch = classifyArch(profile);
  const wgLimit = profile.maxComputeWorkgroupStorageSize;
  const invCap = profile.maxComputeInvocationsPerWorkgroup ?? 256;

  // Explicit override: validate the fit, report device fallback if it busts.
  if (opts?.tpb !== undefined) {
    const s = opts.s ?? DEFAULT_S;
    const bytes = prefScratchBytes(opts.tpb, s);
    const fits = bytes <= wgLimit && opts.tpb <= invCap;
    return {
      tpb: opts.tpb,
      s,
      prefScratchBytes: bytes,
      prefScratchPlacement: fits ? 'workgroup' : 'device',
      arch,
      reason: `override tpb=${opts.tpb} s=${s} (${bytes}B ${fits ? '≤' : '>'} ${wgLimit}B limit)`,
    };
  }

  const s = opts?.s ?? DEFAULT_S;
  for (const tpb of TPB_LADDER) {
    if (tpb > invCap) continue;
    const bytes = prefScratchBytes(tpb, s);
    if (bytes <= wgLimit) {
      return {
        tpb,
        s,
        prefScratchBytes: bytes,
        prefScratchPlacement: 'workgroup',
        arch,
        reason:
          `${arch}: largest TPB whose pref_scratch fits ${wgLimit}B ` +
          `(TPB=${tpb}, S=${s} → ${bytes}B; invCap=${invCap})`,
      };
    }
  }

  // Nothing in the ladder fits at S — trim S against the smallest TPB so the
  // walker still launches. Below this the walker cannot run in workgroup
  // memory and would need a device-storage variant.
  const minTpb = Math.min(...TPB_LADDER.filter(t => t <= invCap));
  for (let trimmedS = s - 1; trimmedS >= 2; trimmedS--) {
    const bytes = prefScratchBytes(minTpb, trimmedS);
    if (bytes <= wgLimit) {
      return {
        tpb: minTpb,
        s: trimmedS,
        prefScratchBytes: bytes,
        prefScratchPlacement: 'workgroup',
        arch,
        reason:
          `${arch}: workgroup storage ${wgLimit}B too small for S=${s}; ` +
          `trimmed to TPB=${minTpb}, S=${trimmedS} → ${bytes}B`,
      };
    }
  }

  const bytes = prefScratchBytes(minTpb, 2);
  return {
    tpb: minTpb,
    s: 2,
    prefScratchBytes: bytes,
    prefScratchPlacement: 'device',
    arch,
    reason:
      `${arch}: workgroup storage ${wgLimit}B cannot hold pref_scratch even ` +
      `at TPB=${minTpb}, S=2 (${bytes}B) — device-storage variant required`,
  };
}

/** Read a {@link GpuProfile} from a live device (+ optional adapter info). */
export function gpuProfileFromDevice(
  device: GPUDevice,
  adapterInfo?: { vendor?: string; architecture?: string },
): GpuProfile {
  const limits = device.limits as unknown as Record<string, number>;
  // Newer WebGPU exposes `GPUDevice.adapterInfo`; fall back to it when the
  // caller did not pass adapter identity explicitly.
  const info = adapterInfo ?? (device as unknown as { adapterInfo?: GPUAdapterInfo }).adapterInfo;
  return {
    maxComputeWorkgroupStorageSize: limits['maxComputeWorkgroupStorageSize'],
    maxComputeInvocationsPerWorkgroup: limits['maxComputeInvocationsPerWorkgroup'],
    vendor: info?.vendor?.toLowerCase(),
    architecture: info?.architecture?.toLowerCase(),
    subgroupMinSize: limits['minSubgroupSize'],
    subgroupMaxSize: limits['maxSubgroupSize'],
  };
}
