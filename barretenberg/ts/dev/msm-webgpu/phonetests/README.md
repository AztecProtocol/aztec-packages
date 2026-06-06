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

## Example: montmul × inverse register-pressure matrix (logn=17, profile A)
```
for MM in karat cios_unrolled cios_native; do
  bash phone-bench.sh 5210 $MM 17 5
  PK14=1 bash phone-bench.sh 5210 $MM 17 5
done
```
