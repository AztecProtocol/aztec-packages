# MSM on-device GPU-counter profiling runbook (Adreno / Mali)

**Goal:** attribute, on a real Adreno (Pixel/S25) and Mali (Pixel 9a, G715) phone,
*where* the arena MSM spends GPU time and *what bounds it*, so the `cios_native`
montmul and the `pk14` inverse wins can be measured and the next optimization
targeted. This is deliverable 3 of the cios15n port (see `CIOS_PORT_HANDOFF.md`).

Branch: `msm-arena-rewrite`. Worktree dev server: port **5210**
(`yarn dev:msm-webgpu --host 127.0.0.1 --port 5210 --strictPort --no-open`).

The harness here is the *app side*. The *capture side* (gapit / AGI / perfetto /
debuggable content_shell) is the `webgpu-gpu-trace` skill — its scripts carry over
unchanged; only the kernel set and the measurement plan are MSM-specific. This
runbook is the MSM-specific recipe; the skill is the generic capture machinery.

---

## 0. The two rules that shape everything

1. **Attribute MSM perf with `profile=false` wall-around-submit, never the
   `profile=true` per-dispatch timestamp SUM** — that number scales with dispatch
   count and fabricates cross-algorithm "wins" (it killed a reported Thread-2
   1.7–1.8×). For *within-one-kernel* counter attribution use `?iso=` (below); for
   A/B *algorithm* wins use `?autorun=msm-bench&no_wasm=1` wall time. See memory
   `msm-webgpu-profile-true-inflates-by-dispatch-count`.
2. **Render-confirm a variant actually injects, not just cross_ok.** A mis-wired
   variant can render the *default* body and still pass cross_ok (wrapper output ==
   native output). Confirm the variant is live before trusting a measurement: grep
   the rendered WGSL, or check the `?iso=` dispatch-count / counter signature
   changes between default and the variant.

---

## 1. The app-side harness (validated on M2; counters need the phone)

Three GPU-only modes, all reachable on the dev server. None boots WASM; all gate on
SRS only (so they run without COI). Hold the counter capture over the run window.

### a. `?iso=<kernel>` — kernel isolation (the most trustworthy, timestamp-free)
```
http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&no_wasm=1&iso=<kernel>&logn=17&profile=A
```
After one warm-up MSM, `MsmV2.profileKernel()` re-dispatches ONE kernel in a tight
loop for ~13 s over the already-warmed buffers. The counter *average* over that
window IS that kernel's profile — no timestamp reconstruction (the WebGPU
timestamp-query is quantized + coalesced on-device and useless here; counters are
not). Kernels (re-pointed to the arena pipelines):

| `iso=` | arena pipeline | what it is |
|---|---|---|
| `size1` | `size1Pipe` | per-thread single-point bucket placement |
| `stream_walker` | `streamWalkerPipe` | **the bucket-accumulate — the multiply peak** |
| `combine_batched` | `combineBatchedPipe` | cross-bucket batched-inversion combine (cool buckets) |
| `pt_combine` | `ptCombinePipe` | multi-dispatch pair-tree combine (hot buckets) |
| `reduce` | `reduceLevelPipes[0]` | per-window reduction level |

The walker is where `cios_native` / `pk14` change the register/occupancy story —
iso it under default vs `&montmul=cios_native` vs `&pk14=1` and read the counters.

### b. `?autorun=micro` — isolated field op (montmul / inverse), no MSM geometry
```
http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=micro&op=mul&montmul=cios_native&threads=65536&chain_k=64&reps=20
http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=micro&op=inv&pk14=1&threads=65536&chain_k=6&reps=20
```
Each of `threads` threads runs a DEPENDENT, stored chain of `chain_k` ops (so it
can't be DCE'd). `op=mul` chains the BigInt `montgomery_product` (the body selected
by `montmul=karat|cios_unrolled|cios_native` — note all three share the *same*
BigInt body; the f8-native win shows up in the register-pressured walker, not in a
shallow-live-set microbench, so use `?iso=stream_walker` for that). `op=inv` chains
the inverse: `pk14=1` → the packed-14-bit safegcd (`fr_inv_by_loop_pk`, f8 in/out,
the walker's hot path); default → the BigInt safegcd loop. Posts
`median`/`min`/`walls`. Use it to compare karat-vs-cios ALU cost and pk14-vs-loop
inverse cost head-to-head under a counter capture.

### c. `?trace=1` — clean per-dispatch trace (labeled timeline + counters)
```
http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1&autorun=msm-bench&no_wasm=1&trace=1&logn=17&reps=20&profile=A
```
prepare() + warm-up happen ONCE outside the capture, then `reps` single MSMs run
with a **60 ms idle gap** between them so each rep's compute burst is a distinct
plateau in the perfetto trace. The app's own `passTimes` (`window.__lastPassTimes` =
`[kernel, gpu_start_ns, gpu_end_ns]` per pass, Dawn timestamp queries on
CLOCK_MONOTONIC_RAW — the SAME clock as the AGI counters) ARE the labeled timeline.
`calibrateClock()` pins the GPU↔CPU offset. `join_passtimes.py` then attributes
counters per kernel. Requires `profile=1` (auto-on for `autorun=msm-bench`) so the
timestamp queries fire.

> **`?iso=` vs `?trace=1`:** iso is the clean per-kernel counter average (one kernel,
> long steady window — start here). trace gives the whole-MSM per-kernel breakdown in
> one capture but needs the passTimes join. For "which kernel costs what", iso each of
> the five; for "the full timeline in context", trace.

Every compute pass is wrapped in `pushDebugGroup(phase)` / `popDebugGroup`, so with
the `use_user_defined_labels_in_backend` Dawn flag (set by the capture script) the
render-stage slices carry the kernel name *natively* on the GPU timeline — the
passTimes join is then a cross-check, not the only label source.

---

## 2. Device prep

### Common (both GPUs)
- Phone on USB, USB-debugging on, visible to `adb devices`; note the serial `SER`.
- Dev server up on 5210, then `adb -s $SER reverse tcp:5210 tcp:5210` so the phone
  reaches `http://localhost:5210` over USB.
- **No WAN on the phone (USB-only).** A cold IndexedDB SRS cache would fail to fetch
  the CRS CDN. The vite `serve-srs-proxy` plugin (in `dev/msm-webgpu/vite.config.ts`)
  Range-proxies `/g1_compressed.dat` host-side; `srs.ts` now fetches same-origin
  first, so the phone gets byte-identical SRS through the adb tunnel. Nothing to do
  beyond running the dev server — it's automatic. (First on-device run still pays a
  one-time SRS download + GPU-decompress, then IndexedDB-caches it.)
- The `&`-heavy URLs break `am start -d`; point the capture at a param-less redirect
  page (`redirect_template.html` in the skill) that `location.replace`s to the real
  URL, OR use a `go.html` redirect in the web root.

### THE flag (cost a full session to find — do NOT re-derive)
Chrome quantizes WebGPU `timestamp-query` to 65.5 µs (multiples of 65536 ns) AND
coalesces pass-begins, for timing-attack safety. It is a **Dawn toggle, not a
hardware/root limit**. In `/data/local/tmp/content-shell-command-line` (the capture
script writes this):
```
_ --enable-unsafe-webgpu --enable-webgpu-developer-features \
  --disable-dawn-features=timestamp_quantization \
  --enable-dawn-features=use_user_defined_labels_in_backend
```
Verify: <1 % of captured timestamps are multiples of 65536, and walker-submit begins
are distinct. (`timestamp_quantization` off → full-resolution times;
`use_user_defined_labels_in_backend` → `pushDebugGroup` becomes
`vkCmdBeginDebugUtilsLabelEXT` the driver records onto each GPU job.)

### Adreno (Pixel / Galaxy S25+) — needs a debuggable WebGPU host
Stock Chrome / prebuilt content_shell are non-debuggable (`ro.debuggable=0`), so the
AGI GraphicsSpy layer won't inject and `gpu.renderstages` has no source. Repackage
content_shell debuggable (one-time):
`webgpu-gpu-trace/scripts/build_debuggable_content_shell.sh` — pulls the installed
`org.chromium.content_shell_apk` base.apk, adds `android:debuggable="true"`, re-aligns
+ re-signs, reinstalls. Verify `dumpsys package … | grep DEBUGGABLE`. (Memory:
`msm-webgpu-debuggable-contentshell-agi`, `msm-webgpu-s25-adreno-gpu-profiling`.)

### Mali (Pixel 9a, G715) — no debuggable app required
Mali counters via gapit are system-wide; the prod driver's render-stage producer
emits for the launched+tracked app. Stock content_shell is fine.

---

## 3. Capture

Use the skill's `capture.sh` (AGI System Profiler — `gapit trace -api perfetto -uri`
launches+tracks the app and reads the prod driver, so NO Vulkan-intercepting spy and
no "app unresponsive" watchdog):
```
SER=<serial> PORT=5210 FOR=60 \
  URL='http://localhost:5210/dev/msm-webgpu/go.html'   # redirect → the ?iso=/?trace= URL \
  OUT=walker_iso.perfetto \
  bash ~/.claude/skills/webgpu-gpu-trace/scripts/capture.sh
```
- gapit injects its own validation layer → the ~10 s pipeline build stretches to
  ~30 s. **`FOR` must cover launch + build + run** (≥45–60 s; a 22 s window captured
  0 MSMs). Poll the results JSONL for a fresh post to confirm the MSM actually ran
  before trusting the capture.
- Run `gapit validate_gpu_profiling -serial $SER` first; it should print "Device is
  validated" and dump a sample trace with render stages — proves the prod driver
  emits them.
- For `?iso=`, the 13 s loop gives a long steady counter window — `FOR=45` is plenty.
- For `?trace=1`, size `FOR` to cover warm-up + `reps × (MSM + 60 ms)` + calib.

`gpu_profile.cfg` (in the skill) lists two data sources: `gpu.renderstages`
(REQUIRED — carries the labels) + `gpu.counters` (counter_ids are device-specific;
discover with `gapit trace … -list-gpu-counters`).

---

## 4. Counters & interpretation

Integer Montgomery multiply is an **ALU** workload, NOT EFU/SFU-transcendental —
this is the single most-confused point.

**Adreno 830 (S25+)** counter ids (from the GpuCounterDescriptor in the validation
trace):

| id | counter | reading for this MSM |
|---|---|---|
| 142 | % Time ALUs Working | **the multiply peak** (walker peaks ~100 %) |
| 143 | % Time EFUs Working | ≈0 — integer montmul does NOT use the EFU |
| 149 | % Wave Context Occupancy | low (~14 %) on the walker ⇒ register-throttled |
| 123 | % Shaders Stalled | high ⇒ memory-latency-bound (spill traffic) |
| 21 | % Shaders Busy | overall shader-core occupancy |
| 39 | % Time Compute | ~99 % inside a labeled MSM window, ~7 % in the idle gaps (use to validate the trace alignment) |

**Mali-G715 (Pixel 9a):** "SFU pipe utilization" is the multiply peak here (Mali
maps integer mul onto the SFU pipe — opposite naming to Adreno) + "full-warp
occupancy". iso@logn14 measured: walker SFU 68 / full-warp 15; combine 2; pt 0;
reduce 23.

**The read-it-like-this key:**
> **high ALU/SFU + low occupancy ⇒ register/occupancy-bound** — this is the regime
> the whole branch attacks: a 64-register montmul throttles resident warps. A
> spill-eliminating change (cios_native / pk14) should **raise occupancy** and drop
> wall while ALU/SFU stays pegged — that is the win signature.
> **high stall ⇒ memory-latency-bound** (register spill→DRAM round-trips). On Adreno
> the occupancy % is a *static* register-derived figure (≈280/regs); it can stay flat
> while wall drops 3× because the real cost was spill traffic (long-latency syncs) —
> so cross-check stall (123) and the malioc/naga register count, not just occupancy.

---

## 5. Measurement plan (the actual deliverable)

For each GPU, with `profile=false` wall (`?autorun=msm-bench&no_wasm=1`, profile A,
logn=17, reps≥5) AND the iso counters:

1. **Baseline:** default (karat montmul, BigInt loop inverse).
2. **Montmul:** `&montmul=cios_native`. Expect the walker's spill/occupancy to
   improve on Adreno (memory: 382→99 ms / 3.8× via spill elimination); Apple-neutral.
   Confirm via `?iso=stream_walker` counters (occupancy↑, ALU pegged) + wall.
3. **Inverse:** `&pk14=1`. Walker-only register-pressure win. Confirm via
   `?iso=stream_walker` and `?autorun=micro&op=inv&pk14=1` vs default.
4. **Combined:** `&montmul=cios_native&pk14=1`.
5. **Structured distributions:** repeat 1–4 across `&scalar_dist=profile&profile=A..E`
   — production data is structured; the walker_combine + pair-tree must hold up on
   profiles D/E (the "few giant buckets" cases), not just uniform A.

Read the counters to confirm the spill/occupancy story and find the next target
(e.g. if the walker is still occupancy-bound after both wins, the next lever is the
remaining live-set; if combine/pt dominate on profile E, the lever is there).

---

## 6. The trace → per-kernel join (for `?trace=1`)

1. Capture with `?trace=1` (above). The app posts `samples[].passTimes` + `calib`.
2. `join_passtimes.py` (in the skill) aligns the app's passTimes to the perfetto
   counter track via the calib offset and emits a kernel-labeled trace
   (`*_labeled.perfetto`) with the counters on the same clock.
3. Validate the alignment: `% Time Compute` (id 39) should read ~99 % inside the
   labeled windows and ~7 % in the 60 ms gaps; burst overlap ~100 %.
4. `label_trace.py` (in the skill) is the alternative native-label path (repoints
   each compute render-stage slice's stage-spec to its `pushDebugGroup` label) when
   the driver captured the debug-utils labels directly.

---

## 7. Dead ends — do NOT retry (each cost real time)

- **Snapdragon Profiler** to relay labels through the driver: mono-under-Rosetta
  crashes mid-capture; the Linux build won't run on Mac. The app's passTimes already
  provide the labels — the join is the answer.
- **`gfxtrace` / `-api vulkan`** for byte-exact labels: the MSM's ~8–15 s synchronous
  pipeline build issues no/slow Vulkan and the spy declares the app "unresponsive" in
  4–8 s. `-start-defer` / `-disable-coherentmemorytracker` don't save it. Use
  `-api perfetto` (System Profiler) instead.
- **`setprop debug.vulkan.profiler 1` / `debug.graphics.gpu.profiler.perfetto 1`:**
  loads the SDP collector layer whose socket fails un-rooted AND makes the app's
  normal `gpu.renderstages` producer disappear (capture loses all Dispatch slices).
  Keep both props EMPTY.
- **`-api perfetto` WITHOUT `-uri`** → 0 render stages (must launch+track the app).
- No driver debug-label mechanism reaches Adreno's perfetto renderstages producer
  (pushDebugGroup regions, insertDebugMarker, pipeline/module labels, gapid
  VulkanCPUTiming — all tested, all NULL on Adreno). On Adreno the passTimes join is
  the label route; the native `use_user_defined_labels_in_backend` labels land on
  Mali.

Memory notes for deeper context: `msm-webgpu-mali-per-dispatch-profiling`,
`msm-webgpu-s25-adreno-gpu-profiling`, `msm-webgpu-debuggable-contentshell-agi`,
`adreno-walker-spill-was-montmul-bigint-roundtrips`, `s25-adreno-constraints`,
`msm-webgpu-profile-true-inflates-by-dispatch-count`.
