// Runtime capability gate for the WebGPU BN254 MSM.
//
// Not every GPU should run the WebGPU MSM path. Two failure modes are known
// from multi-device benchmarking and must never reach a user:
//
//   - WRONG: some drivers miscompile the pipeline and return a commitment that
//     disagrees with the (trusted) WASM/native path. Observed on Adreno-740
//     (Galaxy S23): the WebGPU MSM is wrong from n=2^10 up. A wrong commitment
//     silently fails proving — strictly worse than being slow.
//   - SLOWER: some GPUs are architecturally too weak for the pipeline to beat
//     the WASM Pippenger. Observed on the Pixel-10 Imagination/Tensor GPU:
//     WebGPU is ~0.5x of WASM across the whole size range.
//
// This gate runs a one-time, per-adapter probe and caches a verdict. The probe
// asks two questions at a representative size: does WebGPU agree with the
// trusted reference (correctness), and is it at least as fast as WASM
// (throughput). If either fails, the gate routes the device to WASM. The
// verdict only ever DISABLES WebGPU — it can never route to a path that is
// itself unvalidated — so a buggy probe degrades to the (already correct) WASM
// MSM rather than corrupting a proof.
//
// Same default-safe philosophy as `ENABLE_TIMESTAMPS_FLAG` in gpu.ts: a feature
// that is wrong on some hardware is opt-out per device, decided by what the
// hardware actually does, not by a hardcoded allowlist.

/** Why the gate reached its verdict. */
export type GateReason =
  | 'ok' // correct and fast enough — use WebGPU
  | 'incorrect' // WebGPU disagreed with the reference — use WASM
  | 'slower' // WebGPU correct but below the speedup floor — use WASM
  | 'error' // the probe threw (e.g. GPU device lost) — use WASM
  | 'unprobed'; // no probe ran (gate disabled / probe skipped) — caller default

/** Raw measurements a probe feeds the gate. Timings are wall-clock ms. */
export interface ProbeResult {
  /** WebGPU result matched the trusted reference at the probe size. */
  crossCheckOk: boolean;
  /** WebGPU MSM wall-clock at the throughput-probe size, or null if not timed. */
  webgpuMs: number | null;
  /** WASM MSM wall-clock at the same size, or null if not timed. */
  wasmMs: number | null;
}

/** Tunable thresholds. */
export interface GatePolicy {
  /**
   * Minimum wasm/webgpu throughput ratio (speedup) required to keep WebGPU.
   * 1.0 means WebGPU must at least tie WASM at the probe size. A device that
   * loses there (Pixel-10) is routed to WASM.
   */
  minSpeedup: number;
  /**
   * Whether the throughput half of the gate is consulted. When false the gate
   * is correctness-only: any GPU that produces the right answer is kept,
   * regardless of speed. Defaults on.
   */
  throughputProbe: boolean;
}

export const DEFAULT_GATE_POLICY: GatePolicy = {
  minSpeedup: 1.0,
  throughputProbe: true,
};

/** The cached, per-adapter decision. */
export interface GateVerdict {
  /** Whether the WebGPU MSM path should be used on this device. */
  useWebgpu: boolean;
  reason: GateReason;
  /** wasm/webgpu ratio at the probe size when both were timed, else null. */
  speedup: number | null;
  /** Carried through from the probe for telemetry/logging. */
  crossCheckOk?: boolean;
  webgpuMs?: number | null;
  wasmMs?: number | null;
  /** Free-form detail (e.g. the probe error message). */
  detail?: string;
}

/**
 * Pure verdict from a completed probe. No GPU, no caching, no I/O — this is the
 * unit-tested core of the gate.
 *
 * Correctness is absolute: a cross-check mismatch always disables WebGPU. Only
 * if the result is correct do we consult throughput, and only when the probe
 * actually produced two comparable, positive, finite timings — a missing or
 * degenerate timing cannot fault a device that already passed correctness.
 */
export function decideFromProbe(probe: ProbeResult, policy: GatePolicy = DEFAULT_GATE_POLICY): GateVerdict {
  if (!probe.crossCheckOk) {
    return {
      useWebgpu: false,
      reason: 'incorrect',
      speedup: null,
      crossCheckOk: false,
      webgpuMs: probe.webgpuMs,
      wasmMs: probe.wasmMs,
    };
  }

  const speedup = comparableSpeedup(probe.webgpuMs, probe.wasmMs);

  if (policy.throughputProbe && speedup !== null && speedup < policy.minSpeedup) {
    return {
      useWebgpu: false,
      reason: 'slower',
      speedup,
      crossCheckOk: true,
      webgpuMs: probe.webgpuMs,
      wasmMs: probe.wasmMs,
    };
  }

  return {
    useWebgpu: true,
    reason: 'ok',
    speedup,
    crossCheckOk: true,
    webgpuMs: probe.webgpuMs,
    wasmMs: probe.wasmMs,
  };
}

/**
 * wasm/webgpu ratio, or null when the two timings can't be meaningfully
 * compared (either missing, non-finite, or non-positive). A null ratio means
 * "no throughput evidence", which the gate treats as "do not fault on speed".
 */
function comparableSpeedup(webgpuMs: number | null, wasmMs: number | null): number | null {
  if (webgpuMs === null || wasmMs === null) {
    return null;
  }
  if (!Number.isFinite(webgpuMs) || !Number.isFinite(wasmMs)) {
    return null;
  }
  if (webgpuMs <= 0 || wasmMs <= 0) {
    return null;
  }
  return wasmMs / webgpuMs;
}

/**
 * Stable per-device key from a WebGPU adapter's (non-standard but widely
 * available) info. Two devices of the same model share a key, so the probe
 * cost is paid once per GPU class within a session, not once per page load.
 */
export interface AdapterInfoLike {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

export function adapterKeyFromInfo(info: AdapterInfoLike | null | undefined): string {
  const i = info ?? {};
  const parts = [i.vendor, i.architecture, i.device, i.description].map(p => (p && p.length > 0 ? p : '?'));
  // Collapse to a single token; if every field is unknown we still get a
  // stable (if coarse) key so the probe is memoized rather than re-run.
  return parts.join('|');
}

/** A probe bound to one adapter: produces a {@link ProbeResult} when run. */
export interface GateProbe {
  adapterKey: string;
  run: () => Promise<ProbeResult>;
}

// Per-adapter verdict cache. A device's capability does not change within a
// process, so one probe per adapter key is enough.
const verdictCache = new Map<string, GateVerdict>();

/**
 * Resolve (and memoize) the gate verdict for a device. Runs `probe.run()` at
 * most once per `probe.adapterKey`. Any throw from the probe — including a lost
 * GPU device, the exact Adreno-740 failure mode at large n — is caught and
 * turned into a safe `error` verdict that disables WebGPU rather than
 * propagating.
 */
export async function resolveGate(probe: GateProbe, policy: GatePolicy = DEFAULT_GATE_POLICY): Promise<GateVerdict> {
  const cached = verdictCache.get(probe.adapterKey);
  if (cached !== undefined) {
    return cached;
  }

  let verdict: GateVerdict;
  try {
    verdict = decideFromProbe(await probe.run(), policy);
  } catch (err) {
    verdict = {
      useWebgpu: false,
      reason: 'error',
      speedup: null,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  verdictCache.set(probe.adapterKey, verdict);
  return verdict;
}

/** Look up a cached verdict without running a probe. */
export function peekGateVerdict(adapterKey: string): GateVerdict | undefined {
  return verdictCache.get(adapterKey);
}

/** Affine commitment — the shape both backends already return. */
export interface MsmPoint {
  x: bigint;
  y: bigint;
}

/** One backend's timed MSM result over the probe inputs. */
export interface TimedMsm {
  point: MsmPoint;
  /** Wall-clock for the MSM (exclude one-time setup / input upload). */
  ms: number;
}

/**
 * The two backend runs the probe needs. Both MUST be evaluated over the SAME
 * points and scalars at the SAME (representative) size, so the cross-check is a
 * genuine apples-to-apples comparison and the timings are comparable. WASM is
 * the trusted oracle here: it is exactly the path the gate would fall back to,
 * so "WebGPU agrees with WASM" is the right correctness question, and "WebGPU
 * is at least as fast as WASM" is the right throughput question.
 */
export interface ProbeIO {
  /** Run the WebGPU MSM once; return its commitment and wall-clock ms. */
  webgpu: () => Promise<TimedMsm>;
  /** Run the trusted WASM MSM once over the same inputs; commitment + ms. */
  wasm: () => Promise<TimedMsm>;
  /** Affine-point equality. Defaults to exact bigint coordinate equality. */
  equal?: (a: MsmPoint, b: MsmPoint) => boolean;
}

const exactPointEqual = (a: MsmPoint, b: MsmPoint): boolean => a.x === b.x && a.y === b.y;

/**
 * Assemble a {@link GateProbe} from a device's WebGPU + WASM MSM runners. The
 * GPU/WASM specifics stay at the call site (where live MsmV2 / WASM handles
 * already exist); this only orchestrates the two runs into a {@link
 * ProbeResult}. A throw from either runner — e.g. a lost GPU device at the
 * probe size — propagates to {@link resolveGate}, which turns it into a safe
 * WASM-only verdict.
 */
export function makeGateProbe(adapterKey: string, io: ProbeIO): GateProbe {
  const equal = io.equal ?? exactPointEqual;
  return {
    adapterKey,
    run: async (): Promise<ProbeResult> => {
      const gpu = await io.webgpu();
      const wasm = await io.wasm();
      return {
        crossCheckOk: equal(gpu.point, wasm.point),
        webgpuMs: gpu.ms,
        wasmMs: wasm.ms,
      };
    },
  };
}

/** Test seam: clear the per-adapter verdict cache. */
export function _resetGateCacheForTest(): void {
  verdictCache.clear();
}
