// Builds a Chrome "Trace Event Format" JSON that ui.perfetto.dev ingests
// directly, rendering aligned CPU + GPU timelines for MSM work.
//
// Two threads under one process show as two stacked tracks:
//   - "CPU (host)"   — prepare / encode / submit+wait / decode host phases.
//   - "GPU (WebGPU)" — each timestamped compute pass (decompose, xpose_*,
//                      fused, reduce_*, …) or, for the same-N batch path, the
//                      serialized per-MSM GPU bursts.
//
// Both tracks live on ONE clock: the caller supplies every span's start/end in
// the `performance.now()` millisecond domain, having already mapped GPU
// timestamps onto it (anchor each submit's first GPU pass to its submit time).
// The builder rebases to the earliest span and converts ms → µs (the unit the
// trace-event format expects for `ts`/`dur`).

export interface TraceSpan {
  name: string;
  /** Start on the shared CPU clock (performance.now() ms). */
  startMs: number;
  /** End on the shared CPU clock (performance.now() ms). */
  endMs: number;
  /** Optional key/value detail shown in Perfetto's selection panel. */
  args?: Record<string, string | number>;
}

export interface TraceInput {
  cpu: TraceSpan[];
  gpu: TraceSpan[];
}

/** One named track (rendered as a thread row under the process). */
export interface TraceTrack {
  name: string;
  spans: TraceSpan[];
}

interface TraceEvent {
  ph: string;
  name: string;
  pid: number;
  tid: number;
  ts?: number;
  dur?: number;
  args?: Record<string, unknown>;
}

const US_PER_MS = 1000;
const PID = 1;

/** General builder: one thread row per track, all rebased to the earliest span.
 *  Empty tracks are skipped so a single-track (e.g. WASM CPU-only) trace doesn't
 *  show a stray empty row. */
export function buildPerfettoTraceTracks(tracks: TraceTrack[], processName = 'MsmV2'): string {
  const all = tracks.flatMap(t => t.spans);
  // Loop rather than `Math.min(...all.map(…))`: a full-prove trace can carry tens of thousands of
  // spans, and spreading that many into a function call throws "Maximum call stack size exceeded".
  let t0 = all.length ? all[0].startMs : 0;
  for (const s of all) {
    if (s.startMs < t0) t0 = s.startMs;
  }

  const events: TraceEvent[] = [{ ph: 'M', name: 'process_name', pid: PID, tid: 0, args: { name: processName } }];

  let tid = 0;
  for (const track of tracks) {
    if (track.spans.length === 0) continue;
    tid += 1;
    events.push({ ph: 'M', name: 'thread_name', pid: PID, tid, args: { name: track.name } });
    for (const s of track.spans) {
      events.push({
        ph: 'X', // complete (duration) event
        name: s.name,
        pid: PID,
        tid,
        ts: (s.startMs - t0) * US_PER_MS,
        dur: Math.max(0, s.endMs - s.startMs) * US_PER_MS,
        args: s.args,
      });
    }
  }

  // `displayTimeUnit: 'ns'` only affects the UI's default unit; ts/dur stay µs.
  return JSON.stringify({ traceEvents: events, displayTimeUnit: 'ns' });
}

/** Two-track CPU/GPU trace — the WebGPU bridge + dev-page shape. */
export function buildPerfettoTrace(input: TraceInput, processName = 'MsmV2'): string {
  return buildPerfettoTraceTracks(
    [
      { name: 'CPU (host)', spans: input.cpu },
      { name: 'GPU (WebGPU)', spans: input.gpu },
    ],
    processName,
  );
}
