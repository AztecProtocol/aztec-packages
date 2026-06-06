# MSM on-device phone-bench tooling

Serial, lock-guarded phone benchmark drivers for the WebGPU MSM. The measurement
methodology + counter interpretation live in `../../../src/msm_webgpu/PROFILING_RUNBOOK.md`.

## Scripts
- **`phone-bench.sh`** — THE canonical phone bench. Runs the whole phone session
  (cross-check + GPU-only timing for one config) under ONE exclusive `flock`, so a
  concurrent caller can never pollute a run.
  ```
  bash phone-bench.sh <port> <montmul> [logn=17] [reps=5] [mode=msm] ...
  ```
  Env knobs: `PROFILE=A..E` (scalar distribution, default A), `PK14=1` (append
  `&pk14=1` — the arena packed-14-bit batch inverse), `MSM_WS=13`, `ADB_SERIAL`
  (which phone). Prints machine-readable:
  ```
  PHONE_BENCH cross_ok=<true|false|timeout> montmul=<v>
  PHONE_BENCH median_ms=<n> min_ms=<n> walls=[...] montmul=<v>
  ```
  `mode=chain` (montmul-chain correctness) and `mode=micro` (isolated
  montmul/inverse, args 8/9 = op + wordsize) run inside the same lock.
- **`warm-profile.sh`** — instant APFS copy-on-write clone of the warm playwright
  profile (SRS already in IndexedDB) for local M-series headless-GPU runs:
  `PROFILE=$(bash warm-profile.sh /tmp/agentX-profile)`.
- **`require-phone-lock.sh`** — guard that refuses phone access not running under the
  flock (set `PHONE_BENCH_LOCKED=1`), so callers can't bypass the wrapper.

## Prereqs
- A vite dev server on `<port>` in this worktree, started with
  `MSM_WEBGPU_RESULTS_FILE=~/localclaudebox/phonetests/fastbench_results_<port>.jsonl`
  (the file `phone-bench.sh` reads results from).
- Phone visible to `adb devices`, Chrome set up for WebGPU. Results JSONL + profiles
  are scratch artifacts under `~/localclaudebox/phonetests/` (outside the repo).

## FAST: the whole montmul × inverse matrix in ONE page load (`mode=matrix`)
The slow way is one page reload per config (each reload re-inits WebGPU, reloads
SRS, and recompiles all ~53 MSM pipelines). `mode=matrix` instead drives the
`?autorun=msm-matrix` page, which loops every config IN-PAGE sharing one point pool
+ the WGSL-keyed pipeline cache — so montmul-independent kernels compile once and
flipping pk14 only recompiles the walker. No WASM, no cross-check, no reloads.
```
# args: <port> <montmul-ignored> <logn> <reps>; CONFIGS/PROFILE via env. mode=matrix is arg 5.
CONFIGS='karat:loop,karat:pk14,cios_unrolled:loop,cios_unrolled:pk14,cios_native:loop,cios_native:pk14' \
  bash phone-bench.sh 5210 x 17 8 matrix
# -> PHONE_BENCH matrix montmul=... inv=... median_ms=... min_ms=... build_ms=... pct=...
```
Order the configs by montmul so pk14 toggles hit the cache. ~105 s for 6 configs at
logn=17 (vs minutes of reloads). Correctness is covered by the M2 byte-identical
oracle — this is pure GPU wall timing.

## Slow path: one config per session (also does the WASM cross-check)
```
bash phone-bench.sh 5210 cios_native 17 5      # cross-check + timing, loop inverse
PK14=1 bash phone-bench.sh 5210 cios_native 17 5   # ... pk14 inverse
```
