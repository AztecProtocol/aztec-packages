// Helper used by the dev pages to POST progress and final-result
// payloads back to the local dev server's `/progress` and `/results`
// endpoints (see `vite.config.ts`). The BrowserStack runner tails the
// resulting JSONL to apply stall/deadline watchdogs without polling
// `window.__bench` / `window.__sanity` from outside the browser.
//
// The page can run untouched (no harness) — every call is fire-and-forget
// and swallows errors so a missing endpoint never blocks the bench loop.

export interface ResultsClientConfig {
  // Page identifier — e.g. `bench-batch-affine`, `sanity`. Becomes the
  // `page` field on every JSONL row.
  page: string;
  // Optional run id. Defaults to a random hex string per page load.
  runId?: string;
}

function makeRunId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function makeResultsClient(cfg: ResultsClientConfig): {
  postProgress(event: Record<string, unknown>): void;
  postResults(payload: Record<string, unknown>): Promise<void>;
  readonly runId: string;
} {
  const runId = cfg.runId ?? makeRunId();
  const base = `${window.location.origin}`;

  function tryPost(path: string, payload: unknown): Promise<Response> | null {
    try {
      return fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: cfg.page, runId, ...((payload as object) ?? {}) }),
      });
    } catch {
      return null;
    }
  }

  return {
    runId,
    postProgress(event) {
      const p = tryPost("/progress", { event });
      if (p) p.catch(() => {});
    },
    async postResults(payload) {
      console.log(`[results_post] POST /results runId=${runId} bytes≈${JSON.stringify(payload).length}`);
      const p = tryPost("/results", payload);
      if (p) {
        try {
          const r = await p;
          console.log(`[results_post] /results -> HTTP ${r.status}`);
        } catch (e) {
          console.log(`[results_post] /results threw: ${(e as Error).message}`);
        }
      } else {
        console.log(`[results_post] /results: tryPost returned null`);
      }
    },
  };
}
