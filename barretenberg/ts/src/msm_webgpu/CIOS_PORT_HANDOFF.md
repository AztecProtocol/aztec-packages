# Handoff: porting `wt-cios15n` field-arithmetic + profiling onto the arena branch

**Target:** `~/localclaudebox/wt-memory`, branch `msm-arena-rewrite`.
**Source:** `~/localclaudebox/wt-cios15n`, branch `cios15-native-adreno`, HEAD `e6f230ea69`.
**Scope decisions (from the operator):** continue on `msm-arena-rewrite`; ADD new
variants (keep existing intact); montmul + inverse first, profiling last.

This is a **port, not a `git merge`** — lift the field WGSL + small `shader_manager`
wiring; the field/montgomery code is geometry-agnostic so the 6-colour arena,
`reduce_sched`, and one-program invariants are untouched.

---

## STATUS

| Deliverable | Status |
|---|---|
| **1. Montmul — `f8_native`** | **DONE + validated**, committed |
| **2. Inverse — `pk14_native`** | **DONE + validated**, committed |
| **3a. Profiling harness (micro / iso / trace + SRS proxy)** | **DONE + M2-validated** (drives end-to-end; counters need the phone) |
| **3b. `PROFILING_RUNBOOK.md`** | **DONE** — `src/msm_webgpu/PROFILING_RUNBOOK.md` |
| **3c. On-phone measurement (default vs cios_native vs pk14)** | **PENDING — needs an Adreno/Mali device** (the runbook is the turnkey recipe) |

All M2 validation is **correctness only** (byte-identical cross_ok vs the WASM
oracle) plus harness-drives-end-to-end. The montmul/inverse speedups are
**Adreno/Mali-only and still UNMEASURED** — running the runbook's measurement plan
on a device is the only remaining step.

### "13 vs 15" reconciliation (don't re-confuse this)
The branch explored native 17×15 (`cios15native`), measured it a wash, and DELETED
it (`9f4a139533`). The shipped winner is a packed 8×u32 CIOS body on the **13-bit
(20×13)** pipeline + a **14-bit** safegcd inverse. "13-bit faster for non-Macs" is
correct; the `wordSize`/15-bit plumbing is a reverted dead end — do NOT port it.

---

## What landed (deliverables 1 + 2) — opt-in, defaults unchanged

**Montmul: `?montmul=cios_native`** (new `MontMulVariant`). Adds the packed-native
`montgomery_product_f8` (`wgsl/montgomery/mont_pro_product_f8_native.template.wgsl`,
615 lines, BN254 20×13 hardcoded, no mustache deps) — no `x20/r/s` BigInt temps.
- `field8.template.wgsl` wraps `montgomery_product_f8` in `{{#f8_native}}{{>
  montgomery_product_f8_native}}{{/}}{{^f8_native}}…wrapper…{{/}}`.
- `f8_native` flag = `this.montmul === 'cios_native'`, set in the walker + both
  combine gens; the partial is added to all 11 field8+inverse gens (empty unless
  cios_native ⇒ byte-identical no-op elsewhere).
- Adreno 830 stream_walker 3.8× (382→99 ms) via spill elimination; Apple-neutral.

**Inverse: `?pk14=1`** (a separate boolean flag `pk14Inverse`, NOT a global
`invVariant` change — the `loop|pk` variant is threaded through ~10 gens and
widening it would sprawl). `by_inverse_loop_pk14_native.template.wgsl`:
`fr_inv_by_loop_pk(a8: array<u32,8>) -> array<u32,8>` — packed f8 in/out,
register-resident, BATCH=28 (2×14-bit), single-dispatch, **e0=R² seed ⇒ output
already in f8 Montgomery form** (no closing montmul). Only dep is
`montgomery_product_f8` (composes with `cios_native`).
- The pk14 I/O convention differs from the target's existing BigInt→BigInt inverse,
  so the walker gen takes a `pk14` param → pk14 funcs + `inv_fn='fr_inv_by_loop_pk'`
  + `inv_f8=true`; the walker template wraps the inverse call in `{{#inv_f8}} inv =
  inv_fn(acc) {{/}}{{^inv_f8}} unpack→inv→pack {{/}}`. **Walker-only** (the win is
  the hot S=8 batched inversion); other kernels keep `invVariant`.

**Validated** byte-identical: cios_native logN 10/14/17 × A/E/D; pk14 logN 10/14/17
× A/E; both together; defaults + `?inv=loop` unregressed.

### Two lessons worth keeping
1. **Render-confirm a variant actually injects, not just cross_ok.** The target's
   `ShaderManager` never stored `this.montmul` (ctor param unassigned), so
   `cios_native` silently rendered the wrapper — and STILL passed cross_ok because
   wrapper == native output. Caught only by grepping the rendered WGSL
   (`working_x=423` for the native body vs `0` for the wrapper). Fixed.
2. **Attribute MSM perf with `profile=false` wall-around-submit, never the
   `profile=true` per-dispatch timestamp SUM** — it scales with dispatch count and
   fabricates cross-algorithm "wins" (this killed a reported Thread-2 1.7-1.8×).
   This directly shapes how deliverable 3 must measure.

---

## deliverable 3 — DONE (harness + runbook); on-phone measurement pending

**The harness below is now ported + M2-validated, and the runbook is written
(`src/msm_webgpu/PROFILING_RUNBOOK.md`).** The only remaining step is running the
runbook's measurement plan on an Adreno/Mali device. What landed this pass:

- `serveSrsProxy()` in `dev/msm-webgpu/vite.config.ts` + `srs.ts` same-origin-first
  fetch (offline phone gets byte-identical SRS through the adb tunnel).
- `dev/msm-webgpu/microbench.ts` + `wgsl/cuzk/microbench.template.wgsl` +
  `ShaderManager.gen_microbench_shader(op, chain_k, nthreads, pk14)` →
  `?autorun=micro&op=mul|inv&montmul=&pk14=1&chain_k=&threads=&reps=`.
- `MsmV2.profileKernel()` re-pointed at the arena pipelines (`size1`,
  `stream_walker`, `combine_batched`, `pt_combine`, `reduce`) → `?iso=<kernel>`.
- `?trace=1` + `calibrateClock()` + `window.__lastPassTimes` (run() readback) +
  `pushDebugGroup`/`popDebugGroup` on every compute pass (native GPU-timeline
  labels under the `use_user_defined_labels_in_backend` Dawn flag).
- **M2 drive-through (all green):** default cross_ok unregressed; cios_native+pk14
  cross_ok (profile E); micro mul (karat/cios_native) + inv (loop/pk14) all compile
  + run; all 5 `?iso=` kernels loop; `?trace=1` captures 107 passes/rep + calib;
  shaders.ts regen is purely additive. Counters still need the phone.

The original porting notes are kept below for reference; the runbook supersedes the
methodology section.

### Harness pieces ported from `wt-cios15n` (dev-side, geometry-agnostic)
- `dev/msm-webgpu/microbench.ts` (+93) + `wgsl/cuzk/microbench.template.wgsl` (+58):
  isolated montmul/inverse microbench. `?autorun=micro&op=mul|inv&montmul=&chain_k=
  &threads=&reps=`. Dependent stored chain of K ops in the raw rep; minimal module
  so it builds on Mali. Lets you bench montmul-vs-inverse in isolation under a
  counter capture.
- `dev/msm-webgpu/vite.config.ts` `serveSrsProxy()` (+64): same-origin
  `/g1_compressed.dat` Range-proxy to the CRS CDN — the phone under test has **no
  WAN (USB-only via `adb reverse`)**, so a cold IndexedDB SRS fetch would fail.
  Byte-identical bytes, no timing impact.
- `MsmV2.profileKernel(name, ms)` + the `?iso=<kernel>` URL: loops ONE kernel over
  warmed buffers for ~13 s so a counter capture's average IS that kernel's profile.
  **BLOCKER:** the source's `profileKernel` switch is keyed on the V2 pipeline names
  (`stream_walker`/`combine_batched`/`pt_combine`/`reduce`/`size1`). The arena
  branch's pipelines differ — **re-point the switch at the arena kernels** before
  `?iso=` works.
- `?trace=1` + `calibrateClock()` + per-pass `__lastPassTimes` (written in `run()`
  under `pushDebugGroup`): one MSM/rep with 60 ms idle gaps so per-rep bursts are
  distinct; then `join_passtimes.py` joins the app's pass times to the Perfetto
  counter track (NO driver debug-label mechanism reaches the GPU producer — all
  tested dead; the app's own passTimes ARE the labeled timeline).

### The methodology (capture is process, not code)
- **Tool:** AGI (Android GPU Inspector) `gapit -api perfetto` → system Perfetto
  trace with GPU renderstages + hardware counters. System-wide, non-rooted.
- **Adreno host:** a **debuggable `content_shell`** APK (stock Chrome fails
  `run-as` because `ro.debuggable=0`). Mali counters need no debuggable app.
- **THE flag (cost a full session to find):** Chrome quantizes WebGPU
  `timestamp-query` to 65.5 µs and coalesces pass-begins — a **Dawn toggle, not a
  hardware/root limit**. In `/data/local/tmp/chrome-command-line`:
  `--disable-dawn-features=timestamp_quantization` (with `--enable-perfetto
  --enable-features=EnablePerfettoSystemTracing --enable-webgpu-developer-features
  --enable-unsafe-webgpu`). Verify: <1% of timestamps are multiples of 65536.
- **NOT** Snapdragon Profiler (mono-under-Rosetta crashes; Linux build won't run on
  Mac) and **NOT** `gfxtrace`/`-api vulkan` for labels (kills content_shell in
  4-8 s). Don't re-attempt these.
- **Counters & interpretation.** Adreno 830: `142 % ALU`, `143 % EFU` (≈0 — integer
  montmul is ALU, not EFU/transcendental), `149 % occupancy`, `123 % stalled`.
  Mali-G715: "SFU pipe util" (the multiply peak) + "full-warp occupancy". KEY:
  **high ALU/SFU + low occupancy ⇒ register/occupancy-bound** (the regime this whole
  branch attacks — 64-register montmul throttles resident warps); high stall ⇒
  memory-latency-bound. The walker (bucket-accumulate) is the multiply peak.
- **Canonical scripts:** the `webgpu-gpu-trace` skill
  (`~/.claude/skills/webgpu-gpu-trace/scripts/`: `capture.sh`, `join_passtimes.py`,
  `label_trace.py`, `gpu_profile.cfg`, `build_debuggable_content_shell.sh`). The
  device-level flags/counters carry over unchanged; only `profileKernel`'s switch is
  arena-specific.

### Suggested order for deliverable 3
1. Port `microbench` + `serveSrsProxy` + `?iso=`/`profileKernel` (re-point the switch
   to arena kernels) + `?trace=1`/`calibrateClock`. Bundle-check + a local M2 run to
   confirm the harness drives (counters need the phone).
2. Write `PROFILING_RUNBOOK.md`: the exact capture commands, the flag, the counter
   table, and the read-it like-this interpretation key.
3. On a phone: measure default vs `?montmul=cios_native` vs `?pk14=1` with
   `profile=false`, and read the counters to confirm the spill/occupancy story (and
   find the next target).

### Deeper-context memory notes (read before starting deliverable 3)
`msm-cios15n-port`, `msm-webgpu-mali-per-dispatch-profiling`,
`msm-webgpu-s25-adreno-gpu-profiling`, `msm-webgpu-debuggable-contentshell-agi`,
`msm-webgpu-profile-true-inflates-by-dispatch-count`,
`adreno-walker-spill-was-montmul-bigint-roundtrips`, `s25-adreno-constraints`.

---

## Build / validate cheat-sheet (same as the rest of this tree)
- After editing any `.template.wgsl`: `node src/msm_webgpu/scripts/inline-wgsl.mjs`
  (regenerates `wgsl/_generated/shaders.ts`) — else the runtime uses stale WGSL.
- Bench via `drive-persist.mjs` against the warm profile, e.g.
  `node dev/msm-webgpu/drive-persist.mjs 'http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&logn=17&reps=1&scalar_dist=profile&profile=A&montmul=cios_native'`
  and grep for `WebGPU and WASM MT agree`.
- A vite server for this worktree runs on port **5210**.
