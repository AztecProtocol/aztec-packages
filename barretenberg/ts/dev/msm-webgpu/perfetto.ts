// Aligned CPU + GPU Perfetto trace for an MsmV2 run. The builder + span types
// live in bb.js proper (src/msm_webgpu/perfetto_trace.ts) so the chonk-webgpu
// bridge and this dev page share one implementation; this module re-exports
// them and adds the browser-only download helper.

export { buildPerfettoTrace, type TraceInput, type TraceSpan } from '../../src/msm_webgpu/perfetto_trace.js';

/** Trigger a browser download of `json` as `filename`. */
export function downloadTrace(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
