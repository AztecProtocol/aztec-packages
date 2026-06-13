---
name: webgpu-gpu-trace
description: Benchmark and profile any WebGPU code on a connected Android phone — produce a perfetto GPU trace with each render/compute pass natively named on the GPU timeline (from the device driver's own measurement) plus per-kernel hardware counters (utilization, occupancy, starvation). Turnkey: `scripts/setup.sh` once, then `scripts/profile.sh <port> <url> <out>`. The only code requirement is wrapping passes in pushDebugGroup and auto-running on load. Use when asked to benchmark, profile, trace, or attribute GPU time/counters of WebGPU shaders/kernels on an Android device.
---

# webgpu-gpu-trace — name your WebGPU passes on a real Android GPU timeline

This produces **one perfetto trace** in which the GPU's `compute` (and `vertex`/`fragment`)
render-stage line shows **your pass names** — `stream_walker`, `myReducePass`, whatever you
named them — instead of the generic stage `compute`, **plus** hardware counter tracks
(utilization, starvation, …) on the same clock. The names are **measured by the phone's GPU
driver**, not correlated or guessed by us: the driver records each pass's debug label onto the
exact GPU job it ran, and we promote that label to the slice's display name in place (same
timestamp, same duration, same track).

It works for **any** WebGPU app. The only thing your algorithm must do is label its passes
(one line each). Everything else is host/device tooling that is reusable across algorithms.

## Quickstart (do this — don't hand-roll the steps)

```bash
SK=~/.claude/skills/webgpu-gpu-trace/scripts

# 0. ONE-TIME per machine/phone: provisions + verifies everything (adb, gapit, the
#    debuggable content_shell host, a python venv + perfetto + trace_processor) and
#    runs gapit's GPU-profiling validation. Prints ✅/❌ per item with how to fix.
bash $SK/setup.sh

# 1. Serve YOUR WebGPU page on a localhost dev server, AUTO-RUNNING on load, with every
#    compute/render pass wrapped in pass.pushDebugGroup("name") / pass.popDebugGroup().

# 2. Profile it — ONE command. Captures the phone, names the passes, prints per-kernel
#    GPU time + HW counters, and writes a .perfetto for https://ui.perfetto.dev.
bash $SK/profile.sh <port> "http://localhost:<port>/your-page.html?run=1" myrun
#   → myrun_labeled.perfetto  + a per-kernel table:
#        kernel          gpu_ms  %  | exec_core  gpu_util  sfu_util(int-mul peak)  starvation
#   Re-analyse an existing capture without re-running the phone: REUSE_RAW=1 bash $SK/profile.sh ...
```

**The ONLY requirements on your code:** (1) `pass.pushDebugGroup("name")`/`popDebugGroup()`
around every pass you want named — label BOTH direct and indirect dispatch paths; (2) the page
auto-runs its GPU work on load (ideally loops a few times so per-pass times average). If your URL
has `&` query params, see `redirect_template.html` (am-start mangles `&`).

The rest of this doc is the manual breakdown + the device-specific details, in case you need to
adapt the pipeline.

## How it works (one paragraph, so you can adapt it)

WebGPU `pass.pushDebugGroup(name)` → (with Chromium flag
`--enable-dawn-features=use_user_defined_labels_in_backend`) Dawn emits
`vkCmdBeginDebugUtilsLabelEXT` into the Vulkan command stream → the production GPU driver's
perfetto `gpu.renderstages` producer records that label as the `Labels` field on each GPU
render-stage slice. AGI's **System Profiler** (`gapit trace -api perfetto -uri …`) launches and
tracks the app and reads that producer directly — **no Vulkan-intercepting spy**, so it never
trips the "app unresponsive" watchdog that a gfxtrace capture hits during the long shader
pipeline build. The slice's *name* is still the HW stage (`compute`); `label_trace.py` promotes
each slice's own `Labels` to its name. Net result: a faithful, driver-aligned, kernel-named
GPU timeline.

## Prerequisites

### Host (macOS shown; Linux analogous)
- **adb** — `brew install --cask android-platform-tools` (or the command-line tools below).
- **AGI (Android GPU Inspector)** — provides `gapit`. Download from
  https://github.com/google/agi/releases. On macOS: `/Applications/AGI.app/Contents/MacOS/gapit`.
- **Python 3 + perfetto package** — `python3 -m venv venv && venv/bin/pip install perfetto`.
  Gives `perfetto_trace_pb2` (for `label_trace.py`) and a downloadable `trace_processor_shell`.
- **For the one-time debuggable-host build only:** `brew install --cask android-commandlinetools`
  (aapt2/apksigner/zipalign) and `brew install apktool`. Java is required (works under Java 25).

### Phone
- Android phone with **USB debugging on**, visible to `adb devices`. Note its serial (`SER`).
- A GPU whose driver exposes perfetto render stages. **Mali (e.g. G715) is confirmed.** Validate
  any device first: `gapit validate_gpu_profiling -serial <SER>` should print that the device is
  validated and dump a sample trace containing render stages. If it reports none, this method
  cannot name passes on that device (the driver has no render-stage producer).
- A **debuggable Chromium WebGPU host**. On a non-rooted phone you can't flag Chrome itself, so
  use **`content_shell` repackaged debuggable** (one-time; see step 0). content_shell is ideal: a
  single APK that takes its URL from the launch intent and its flags from
  `/data/local/tmp/content-shell-command-line`.

## The only requirement on YOUR WebGPU code

Wrap every pass you want to see named in a debug group. That's it — standard WebGPU API, works
from JS/TS, wasm, or native Dawn:

```js
const pass = encoder.beginComputePass(desc);
pass.pushDebugGroup("myReducePass");   // <-- this string becomes the slice name
pass.setPipeline(pipe);
pass.setBindGroup(0, bind);
pass.dispatchWorkgroups(x, y, z);      // or dispatchWorkgroupsIndirect(...)
pass.popDebugGroup();
pass.end();
```

Label **every** dispatch path. A common miss: indirect-dispatch passes go through a different
helper than direct ones — make sure both push a group, or the heavy kernels show up as bare
`compute`. Unlabeled passes simply keep the generic stage name (harmless).

Make your page **auto-run** the algorithm on load (and ideally loop it several times) so the
work lands inside the capture window with nothing to click, and so per-pass times average out.

## Steps

Bundled scripts live in `scripts/` next to this file. `cd` into a working dir for your traces (anywhere but `/tmp`).

**0. One-time: debuggable content_shell** (skip if already installed — check with
`adb -s <SER> shell dumpsys package org.chromium.content_shell_apk | grep -i DEBUGGABLE`):
```bash
SER=<serial> bash scripts/build_debuggable_content_shell.sh
```

**1. Validate the device emits render stages:**
```bash
/Applications/AGI.app/Contents/MacOS/gapit validate_gpu_profiling -serial <SER>
```

**2. Serve your WebGPU page** on the host (any HTTP/dev server) and make the page reachable from
the phone. If you serve on `localhost:PORT`, the capture script will `adb reverse` it for you.
If your page URL has multiple `&` query params, copy `scripts/redirect_template.html` into your
web root (e.g. as `agi_go.html`), point it at your real URL, and use that param-less page as the
capture URL.

**3. Capture** (the script sets the Dawn flags, launches+tracks the app, and captures):
```bash
SER=<serial> PORT=<devserver-port> \
URL="http://localhost:<PORT>/agi_go.html" \
OUT=~/webgpu-traces/gpu_raw.perfetto FOR=50 \
bash scripts/capture.sh
```
`FOR` (seconds) must cover **app launch + GPU pipeline build + your run**. gapit injects its own
layer, which can stretch the pipeline build to ~30 s, so don't go below ~45 s. A too-short
window yields an almost-empty trace.

**4. Promote the driver labels to slice names (in place):**
```bash
venv/bin/python scripts/label_trace.py ~/webgpu-traces/gpu_raw.perfetto ~/webgpu-traces/gpu_labeled.perfetto
```
It prints how many slices it renamed and a per-label GPU-time breakdown. **If it reports 0
labeled slices, the capture missed the run (increase `FOR`) or labels weren't emitted** (see
Troubleshooting).

**5. Per-kernel HW COUNTERS.**

> ⚠️ **Counter attribution has TWO mutually-exclusive paths — pick by what step 4 reported, do not guess:**
> - **`label_trace.py` renamed >0 slices** (Mali, and most drivers that relay labels) → the driver
>   recorded REAL per-slice GPU times, so just average counters inside those slices:
>   **use `kernel_counters.py` (below).**
> - **`label_trace.py` reported 0 labels** (Adreno/Qualcomm — driver won't relay labels) → fall back to
>   **`join_passtimes.py`** (Adreno appendix), which aligns the app's own passTimes to the counters.
>
> **NEVER run `join_passtimes.py` when labels exist (e.g. Mali).** It relies on the app's WebGPU
> pass-BEGIN timestamps, which Mali **coalesces** (all passes in a submit share one begin) → the
> windows are garbage and the clock-fit is nonsense — and it can still self-report ~100% burst-overlap
> by aliasing the periodic per-rep bursts, so the bogus result looks "validated." If you have labels,
> you do not need passTimes at all.

```bash
# Native-label devices (label_trace renamed slices): per-kernel counter averages.
venv/bin/python scripts/kernel_counters.py ~/webgpu-traces/gpu_labeled.perfetto
```
It prints, per kernel, the GPU time + the average of every HW counter within that kernel's
labeled render-stage slices (no clock-fit, no app timestamps). Read it like: high multiply-pipe
util (Mali "SFU pipe utilization"; Adreno "% Time ALUs Working") + high starvation/stall + low
occupancy ⇒ the kernel is occupancy/latency-bound (the register-pressure regime), not throughput-bound.

**6. View.** Open `gpu_labeled.perfetto` at https://ui.perfetto.dev — the GPU compute track reads
your pass names, with the counter tracks on the same clock. For ad-hoc CLI queries, the `perfetto`
venv ships a trace processor:
```bash
venv/bin/python -m perfetto.trace_processor gpu_labeled.perfetto   # or download trace_processor_shell
# per-kernel GPU time:
#   SELECT name, count(*) c, round(sum(dur)/1e6,1) ms FROM gpu_slice GROUP BY name ORDER BY ms DESC;
```

## Verifying it's a real measurement (not a correlation)

The rename is a 1:1 promotion of each slice's own driver-attached label — it cannot introduce an
offset, because no slice moves. To prove it: pick any slice's `(ts, dur)` in the raw trace where
`name='compute'` and its `Labels` arg is e.g. `myPass`; the labeled trace has a slice at the
**identical** `ts` and `dur` named `myPass`. The per-label time sums are byte-identical between
the two traces. (Query `Labels` in the raw trace via
`SELECT string_value FROM args WHERE key='Labels'`.)

## Troubleshooting

- **Empty trace / only a handful of `vkQueueSubmit` slices, no `compute`:** the window closed
  before the algorithm ran. The pipeline build under gapit's layer takes ~30 s; raise `FOR` to
  50–70 s. Confirm the app actually loaded the page (a fresh first run also cold-downloads any
  assets — warm it once before capturing).
- **`label_trace.py` finds 0 labels** but the trace has `compute` slices: labels weren't emitted.
  Check (a) the page actually ran with `--enable-dawn-features=use_user_defined_labels_in_backend`
  (it's in `capture.sh`'s flags and should appear in `adb logcat | grep cr_CommandLine`), and
  (b) every pass calls `pushDebugGroup`/`popDebugGroup` — especially indirect-dispatch passes.
- **No render stages at all** (validate step shows none): that GPU/driver has no perfetto
  render-stage producer; this approach won't name passes there. (Counters may still work.)
- **Timestamps look quantized to ~65 µs:** the `--disable-dawn-features=timestamp_quantization`
  flag is missing. It's in `capture.sh`; if you hand-roll the command-line, keep it.
- **Counters empty or wrong:** `counter_ids` in `gpu_profile.cfg` are Mali-G715-specific. List
  yours with `gapit trace -api perfetto -serial <SER> -os android -list-gpu-counters` and edit
  the config, or delete the `gpu.counters` block to keep only the (device-agnostic) render stages.

## Do NOT

- Do **not** build a second "kernel names" track and time-shift it onto the compute track — that
  reintroduces the offset this method exists to avoid. The names belong **on** the existing
  render-stage slices, promoted from each slice's own label.
- Do **not** use the gfxtrace / GraphicsSpy `-api vulkan` path for a heavy WebGPU app: the spy
  blocks on the multi-second pipeline build and the app is killed as "unresponsive." The System
  Profiler `-api perfetto -uri` path reads the driver without intercepting Vulkan and avoids this.

## Adreno (Qualcomm) appendix — validated on Galaxy S25+ / Adreno 830 / Android 16

Everything above works on Adreno **except the labels**. Validated findings:

- **Render stages work** via the *in-process* Adreno driver producer (each GPU-using app process
  registers its own `gpu.renderstages`). Stage names are Adreno's own: `Dispatch` (compute),
  `Render`, `Blit`, `Surface` — not `compute`/`vertex`/`fragment`. **Caveat:** the in-process
  producer's ring buffer fills early — Adreno often stops emitting `Dispatch` slices after a
  warmup burst, so they may not cover your measured run. Don't attribute time via the `Dispatch`
  slices; the passTimes↔counters join below doesn't need them (it uses the counter samples plus
  the app's own passTimes).
- **Counters work** but ids are Adreno-specific. Discover them from the `GpuCounterDescriptor`
  embedded in any `gpu.counters` trace (or a validation trace). Key compute ids on Adreno 830:
  `143` "% Time EFUs Working" (the EFU is Adreno's SFU — transcendentals only), `142` "% Time
  ALUs Working", `21` "% Shaders Busy", `39` "% Time Compute", `149` "% Wave Context Occupancy",
  `123` "% Shaders Stalled". NOTE: integer mul runs in the **ALU** on Adreno, so an integer-heavy
  kernel shows EFU≈idle / ALU≈hot — the Mali "SFU pipe utilization" analog for integer work is
  `% Time ALUs Working`, not the EFU counter.
- **No debug labels reach the perfetto producer** — all of these were tested and do NOT surface:
  `pushDebugGroup` (cmd region labels), `insertDebugMarker` (point labels), WebGPU `label` on
  pipelines/shader modules (object names → `vkSetDebugUtilsObjectNameEXT`), and the gapid
  `VulkanCPUTiming` data source (only emits vkCreateInstance/vkQueueSubmit). `label_trace.py`
  reporting 0 labels on an Adreno trace is therefore expected, not a capture failure.
### Labeling on Adreno — DON'T chase a driver-relay tool; join the app's own timestamps

> **This whole section is the ADRENO path — only when `label_trace.py` reported 0 labels.** On Mali
> (and any driver that relays labels) use `kernel_counters.py` (step 5) instead; `join_passtimes.py`
> is WRONG there because Mali coalesces pass-begins.

When the driver won't relay debug labels into the trace, the label source is the **app**: its
WebGPU timestamp queries (the bench's `passTimes`) give `[kernel, gpu_start, gpu_end]` per pass —
GPU-measured, kernel-named. The standard profiling move is to **join that to the counters**, not
to find a different tool that relays labels through the driver. `scripts/join_passtimes.py` does it:

1. Capture the perfetto trace (render-stages + counters) with the bench running; grab its
   `passTimes` from the results row (same run).
2. The two clocks are the same GPU but different epochs (the WebGPU timestamps are
   BOOTTIME-*magnitude* but offset from perfetto's clock by ~seconds). Fit ONE offset `delta` by
   aligning the per-rep compute bursts (trace=1 mode's 60 ms idle gaps make the bursts distinct).
3. **VALIDATE** `delta`: `% Time Compute` must read ~99% inside the labeled windows and ~7% in the
   gaps, and burst-overlap ~100%. That proves the alignment; it is not a guess.
4. Attribute every counter sample to the kernel whose (shifted) window contains it → per-kernel
   EFU/ALU/occupancy. Optionally emit a perfetto trace with a kernel-name TrackEvent track
   time-aligned to the counter tracks (see the buildtrace snippet in the session notes).

Validated on the S25+: `stream_walker` (50% of GPU time) runs at 44% ALU / 0% EFU / 14% occupancy
/ 26% stall → occupancy-limited, not throughput-limited; EFU is 0% on every kernel (integer
montmul lives in the ALU, not the elementary-function unit).

### Adreno dead ends (do not repeat — each cost hours)
- **gfxtrace** (`-api vulkan`, GraphicsSpy): declares the app unresponsive within ~4–8 s under a
  WebGPU-heavy workload; `-start-defer` / `-disable-coherentmemorytracker` don't save it.
- **`debug.vulkan.profiler` / `debug.graphics.gpu.profiler.perfetto` props**: switch the driver
  into Snapdragon-Profiler collector mode (loads `libVkLayer_ADRENO_qprofiler.so`); the socket
  fails un-rooted AND the normal `gpu.renderstages` producer DISAPPEARS. Keep them empty.
- **Snapdragon Profiler in Docker**: SDP runs (mono + gtk#3 + libc++-22 + gtksourceview-4, GC
  `major=marksweep` to dodge Rosetta's 2^47 reservation), connects to the phone (advertise a
  same-subnet IP so its `-clientIP` list includes a phone-reachable one + publish 6500-6520), but
  mono-under-Rosetta crashes mid-capture. A huge detour to relay labels the app already provides.
- **AGI "developer driver"** (`updatable_driver_prerelease_opt_in_apps`): the installed QC driver
  package is production-only → "No developer driver found". No help.
