# WebGPU MSM Integration Notes

Session-by-session tracking for picking up Zac's `zw/msm-webgpu-experiments-v2`
branch and driving the WebGPU MSM into shape for upstream barretenberg
integration.

Scoped to **our** work. Zac's reference material in the parent directory
(`MSM_DESIGN_ANALYSIS.md`, `MSM_BBERG_SLIDES.html`, `MSM_WEBGPU_SLIDES.html`,
`WEBGPU_CHONK_STATUS.md`) is load-bearing context but is not something we
maintain. When those drift relative to current code, the drift gets recorded
here, not patched there.

## Files

| File | What it is | Cadence |
|---|---|---|
| [STATUS.md](STATUS.md) | Live snapshot of the branch — what's wired, what's measured, what's known-broken. | Refresh at the start of each session. |
| [FLOW.md](FLOW.md) | End-to-end walkthrough: browser → WASM → bridge → GPU → back. Notation, control protocol, SRS lifecycle, per-MSM pipeline stages, field arithmetic, coordinate forms at each boundary. | Updated when the call path or pipeline structure changes. |
| [ALGORITHM.md](ALGORITHM.md) | Per-kernel reference (the math + file layout of each WGSL pass). Section stubs grown as we read individual shaders. | Append-only sections. |
| [ROADMAP.md](ROADMAP.md) | Incremental milestones with binary acceptance criteria. | Reordered as priorities shift; entries never deleted. |
| [CHANGELOG.md](CHANGELOG.md) | Dated per-session narrative — what we did, what it cost, what it bought. Distinct from `git log` (which is per-commit, perf-tag style). | One entry per working session. |
| [diagrams/](diagrams/) | TikZ sources + rendered SVGs referenced from the markdowns. `diagrams/build.sh` regenerates the SVGs (uses `node-tikzjax` by default — no system LaTeX needed; pass `BUILDER=pdflatex` to use a local install instead). | Edit the `.tex`, run `build.sh`, commit both. |

## Viewing

Plain markdown works in any editor. A polished read with rendered math,
embedded SVG diagrams, tabs, and a per-doc TOC sidebar:

```
./serve.sh         # serves the repo root over HTTP on port 8765
                   # (override with `./serve.sh <port>`)
```

then open the URL it prints. The viewer is a single self-contained file
([index.html](index.html)) — it fetches the markdown over HTTP, runs
KaTeX for `$…$` math, highlight.js for code, and Mermaid for any
` ```mermaid ` fenced blocks. No build step.

## Conventions

- Cite source with `path:line` links so references stay live as the tree moves.
- Quote real numbers from a measured run; don't summarize from memory.
- Mark uncertainties with `(TODO: verify)` rather than confident wording.
- Dates in ISO format (`YYYY-MM-DD`).
- Cross-link freely between docs in this directory; don't duplicate content.
