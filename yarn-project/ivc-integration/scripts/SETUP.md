# Multi-device WebGPU bench — one-command setup

Drive the WebGPU bench across **all four devices from this box** with a single command:

```bash
node scripts/bench.mjs devices          # discover + identify every device
node scripts/bench.mjs probe            # capability probe (diag) on every device
node scripts/bench.mjs probe --mode gpu-smoke   # GPU device-loss / TDR ladder (phones)
node scripts/bench.mjs chonk            # chonk e2e off-vs-on, every device
node scripts/bench.mjs msm --logn 16    # MSM-isolation GPU↔WASM cross-check
```

Every device just opens an `?autorun=` URL and POSTs its result to the dev server's
`/results` JSONL sink; `bench.mjs` tails that sink and attributes each row back to the
device via its `target=` tag. The Mac is launched over CDP; the phones over the Mac's
adb server. Both channels are reached from this box over SSH tunnels the Mac opens.

## Topology

```
 this box (no GPU)                         Mac (real GPU; phones on USB)
 ─────────────────                         ───────────────────────────────
 chonk page  :8080  ── ssh -L 8080 ──────► (Mac:8080 → box:8080)   Chrome :9222 ─ ssh -R 9222 ─► box
 MSM page    :5173  ── ssh -L 5173 ──────► (Mac:5173 → box:5173)   adb srv :5037 ─ ssh -R 5037 ─► box
 bench.mjs ──CDP(9222)──► Mac Chrome                                  │ USB
           ──adb(5037)──► phones ── adb reverse 8080/5173 ──► Mac ──► box   ├─ S23  S26U  Pixel10
```

- `-L 8080 / -L 5173`: the phones and the Mac's Chrome load the pages *from this box*.
- `-R 9222`: this box drives the Mac's Chrome over CDP (existing chonk setup).
- `-R 5037`: this box runs `adb` against the phones via the Mac's adb server (new).

## One-time setup on the Mac

1. **Debug Chrome** (for CDP — the occlusion flags are required or macOS throttles it):

   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-cdp-bench" \
     --disable-background-timer-throttling --disable-renderer-backgrounding \
     --disable-backgrounding-occluded-windows \
     --disable-features=CalculateNativeWinOcclusion > /tmp/chrome-cdp.log 2>&1 &
   ```

2. **All tunnels in one SSH invocation** (replace `<box>` with this box's SSH host):

   ```bash
   ssh -N <box> \
     -L 8080:localhost:8080 \
     -L 5173:localhost:5173 \
     -R 9222:localhost:9222 \
     -R 5037:localhost:5037
   ```

   (Drop `-L 5173` if you never run the MSM bench. The `-L` forwards drop when a dev
   server restarts — re-run this, or re-add the port in the VS Code **Ports** panel.)

3. **adb + the phones** (one-time per phone):
   - `brew install android-platform-tools` (gives `adb`); run `adb start-server` once.
   - On each phone: Settings → About → tap *Build number* ×7 to unlock Developer options,
     then enable **USB debugging**. Plug in over USB, run `adb devices` on the Mac, and
     **accept the "Allow USB debugging?"** prompt (until you do, the device shows as
     `unauthorized`).
   - Chrome must be installed (the autorun opens `com.android.chrome`). Android Chrome 121+
     ships WebGPU; if `probe` reports no WebGPU, enable `chrome://flags/#enable-unsafe-webgpu`.

## On this box

1. **Start the dev server(s)** (leave running — keeps SRS/GPU pool warm across runs):

   ```bash
   # chonk page (port 8080) — required for `probe` and `chonk`
   (cd yarn-project/ivc-integration && yarn webpack && yarn serve:chonk-webgpu)

   # MSM page (port 5173) — required for `msm`; needs the threaded WASM built:
   #   (cd barretenberg/cpp/build-wasm-threads && ninja barretenberg.wasm.gz)
   (cd barretenberg/ts && yarn dev:msm-webgpu)
   ```

2. **Confirm the channel**, then run:

   ```bash
   node scripts/bench.mjs devices     # should list mac ✅ + all attached phones ✅
   node scripts/bench.mjs probe       # capability matrix across every device
   node scripts/bench.mjs chonk       # the real e2e comparison
   ```

Reports are written to `/tmp/zac-webgpu/bench-<name>-<stamp>.md` and every device row is
appended to `/tmp/zac-webgpu/bench-history.jsonl`.

## Device registry

`devices.json` maps friendly ids (`mac`, `s23`, `s26u`, `pixel10`) to a driver and match
rule. Phones are matched to a live serial by a regex over their model/market name, so
serials are never hard-coded. After `bench.mjs devices`, fix any `match`/`label` that
didn't resolve. Per-device knobs:

- `threads` — feeds the autorun `?threads=` override. Phones **must not** run the 16-thread
  WASM default (pthread startup races crash them with `null function`); 4–6 is safe.
- `caps.webgpuMsm` — `ok | unknown | device-lost`. GPU-bearing runs **skip** a
  `device-lost` device (the S23's Adreno 740 loses the device on the first MSM dispatch)
  unless you pass `--force`.

## Gotchas

- **Keep phones awake and unlocked during a run.** A locked/sleeping screen renders
  nothing and throttles WebGPU. `bench.mjs` wakes the screen and sets `stayon usb`, but a
  PIN lock it can't bypass — disable the lock or keep the phone unlocked.
- **`127.0.0.1`, never `localhost`** — SSH/adb forwards bind IPv4; `localhost` can resolve
  to IPv6 first and fail. The URLs and adb wrapper already use `127.0.0.1`.
- **adb client/server version skew** — if `bench.mjs devices` errors talking to the server,
  match platform-tools versions on the Mac and this box (`adb version`).
- **`am start` chooser** — if a phone pops a "choose a browser" dialog instead of opening
  Chrome, set Chrome as the default browser on that phone once.
- **MSM runs serialize** across devices (the MSM page's `/progress` rows don't yet carry
  `target`); chonk/probe run in parallel. Override with `--serial` / `--parallel`.
- **Watchdogs**: a device that never loads trips `no-progress` (~150s); a hung prove trips
  `stall` (~240s idle); the whole run is bounded by a per-bench `deadline`. Tune with
  `--first-progress`, `--stall`, `--timeout` (all seconds).
