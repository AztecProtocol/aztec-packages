---
name: multi-device-bench
description: Bring up and verify the channel that drives the WebGPU/WASM bench across a Mac (over CDP) and USB-attached Android phones (over adb) from a remote dev box, via SSH tunnels the Mac opens. Use whenever the Mac/phones show as unreachable, the CDP (9222) or adb (5037) channels hang, before running yarn-project/ivc-integration/scripts/bench.mjs, or when re-running the SSH tunnel "doesn't help". Covers the stale reverse-tunnel trap and its fix.
---

# Multi-device bench setup

Drive `yarn-project/ivc-integration/scripts/bench.mjs` across the **Mac + Android phones** from this box.

**Topology** (all tunnels opened FROM the Mac):
- Pages/servers run on the **box**: chonk `:8080`, MSM `:5173`. The Mac and phones load them via `-L 8080 -L 5173` (and phones via `adb reverse`).
- The box drives the **Mac's Chrome** over CDP `:9222` via `-R 9222`.
- The box runs **adb** against the phones via the Mac's adb server `:5037` via `-R 5037`.
- Use `127.0.0.1`, never `localhost` (SSH/adb forwards bind IPv4; `localhost` may resolve to `::1` and miss).

`adb` must be installed **on the box** and passed via `ADB_BIN=/abs/path/to/adb` (the box's adb client talks to the Mac's server over the 5037 tunnel; match major platform-tools versions or the server kills the connection).

## 1. Health check — run this FIRST, every time

```bash
ADB=${ADB_BIN:?set ADB_BIN to the box adb path}
echo -n "8080 chonk server (box): "; timeout 6 curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/ || echo down
echo -n "9222 CDP (Mac Chrome):   "; timeout 6 curl -s http://127.0.0.1:9222/json/version | grep -o '"Browser":"[^"]*"' || echo "DOWN/HANG"
echo    "5037 adb (Mac server):";    timeout 10 "$ADB" -H 127.0.0.1 -P 5037 devices -l || echo "  DOWN/HANG"
echo "listeners:"; ss -tln | grep -E '127.0.0.1:(9222|5037)' || echo "  none (tunnel not up)"
```

Read the result:
- **9222/5037 connection refused / not listening** → tunnel simply not started. Go to §3.
- **9222/5037 HANG (timeout, exit 124)** → stale-tunnel trap. Go to §2 — re-running the Mac tunnel will NOT fix this.
- **All green + phones in `device` state** → go to §4.

## 2. Stale reverse-tunnel trap (the #1 time-sink)

**Symptom:** CDP/adb **hang** (not refused). The Mac tunnel was re-run but nothing improved.

**Cause:** a dead `ssh -N` session still holds `9222`/`5037` on the box. A new `ssh -R 9222 …` **cannot rebind an occupied port**; without `ExitOnForwardFailure` it stays connected but its forwards silently failed, and every connection black-holes into the dead listener. (`@notty` sessions you can see may be red herrings — find the *actual* holder by socket.)

**Find the real holder (by cgroup login-session, which survives PID-namespace limits):**

```bash
# 1. The listener line shows uid + the systemd session in its cgroup:
ss -tlne 'sport = :9222 or sport = :5037' | grep -oE 'session-[0-9]+\.scope'   # e.g. session-177524.scope
# 2. Map each session to the owning sshd pid you can kill (must be YOUR uid):
for p in $(pgrep -u "$USER" sshd); do
  s=$(grep -oE 'session-[0-9]+' /proc/$p/cgroup 2>/dev/null | head -1)
  echo "pid $p -> $s -- $(tr '\0' ' ' </proc/$p/comm 2>/dev/null)"
done
# 3. Kill the pid(s) whose session matches a listener's session, then confirm free:
kill <pid>; sleep 2; ss -tln | grep -E '127.0.0.1:(9222|5037)' || echo "FREE ✅"
```

**Safe to kill:** these are manual `ssh -R` tunnels. A **reverse** forward can only come from `ssh -R` — VS Code port-forwarding cannot create one — so the session holding 9222/5037 is *not* your VS Code/editor connection. Your local Bash/agent shell is unaffected (it doesn't route through these sshd sessions).

**If no killable pid matches** (holder lives outside the box's PID namespace): you cannot clear it from the box. Kill the Mac-side `ssh` client instead (`pkill -f 'ssh.*-R 9222'` on the Mac), or fully disconnect+reconnect the Mac session, then re-tunnel.

## 3. Bring up the channel (on the Mac)

1. **Debuggable Chrome** (occlusion flags required or macOS throttles the headless tab):
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 --user-data-dir="$HOME/chrome-cdp-bench" \
     --disable-background-timer-throttling --disable-renderer-backgrounding \
     --disable-backgrounding-occluded-windows \
     --disable-features=CalculateNativeWinOcclusion >/tmp/chrome-cdp.log 2>&1 &
   ```
2. **adb + phones:** `adb kill-server && adb start-server && adb devices -l`. Every phone must read `device`; tap **Allow USB debugging** on any `unauthorized` one. Per-phone one-time: enable USB debugging (tap Build number ×7 → Developer options); set Chrome as default browser. **Imagination/Tensor GPUs (e.g. Pixel)** also need `chrome://flags/#enable-unsafe-webgpu` Enabled — Adreno does not.
3. **One tunnel**, with `ExitOnForwardFailure` so a stuck port fails loudly instead of silently.
   Pin the `-L` targets to the box's **`127.0.0.1`** (NOT `localhost`) — the box page server binds
   IPv4 only, so a `localhost` target resolves to `::1` and the page hangs (see §3b):
   ```bash
   ssh -N -o ExitOnForwardFailure=yes <box> \
     -L 127.0.0.1:8080:127.0.0.1:8080 -L 127.0.0.1:5173:127.0.0.1:5173 \
     -R 9222:127.0.0.1:9222 -R 5037:127.0.0.1:5037
   ```
   If it exits with "remote port forwarding failed for listen port 9222/5037", the box still holds the port → §2.
   Prefer this manual `-L` over VS Code's Ports panel for 8080/5173 — VS Code's forward is what wedged in §3b.

## 3b. "Devices reachable but page won't load" (IPv4/IPv6 -L trap)

**Symptom:** `bench.mjs devices` is green (CDP + adb up) but no `/progress` or `/results` rows ever appear and the device shows a blank/hung page.

**Cause:** the box page server binds **`127.0.0.1:8080` (IPv4 only)**, but the Mac's 8080 forward — a VS Code Ports forward, or a `-L …:localhost:8080` — targets the box's **`localhost` → `::1`**, where nothing listens. The Mac accepts the connection on its 8080 and the bytes black-hole. A wedged forward (e.g. a VS Code forward whose tunnel died) does the same: it accepts then hangs. `adb reverse` is **IPv4-only**, so phones always hit the Mac's `127.0.0.1:8080` — the `localhost` path that may work in the Mac browser does NOT help phones.

**Diagnose on the Mac** (the reliable test — a CDP `fetch` probe gives false "Failed to fetch" from CORS, so use a real navigation or just curl):
```bash
curl -m5 http://127.0.0.1:8080/                       # timeout/28 + 0 bytes  == wedged forward
lsof -nP -iTCP@127.0.0.1:8080 -sTCP:LISTEN            # who holds it: `ssh` (stale -L) or `Code Helper` (VS Code)
```

**Fix:** free the Mac's IPv4 `127.0.0.1:8080`, then re-establish it cleanly:
- VS Code holder → Ports panel → right-click `8080` → *Stop Forwarding Port* (don't kill the helper PID). `ssh` holder → `kill <pid>`.
- Then `ssh -N -o ExitOnForwardFailure=yes <box> -L 127.0.0.1:8080:127.0.0.1:8080`; confirm `curl -m5 http://127.0.0.1:8080/` returns HTML.
- **Or** sidestep it entirely with a virgin port VS Code won't auto-grab: `-L 127.0.0.1:9080:127.0.0.1:8080`, then run the bench with `PAGE_PORT=9080`. (`PAGE_HOST=localhost` only routes the Mac/CDP path through `::1`; it does NOT fix phones — adb needs the IPv4 forward.)

## 4. Verify + run (on the box)

```bash
export ADB_BIN=/abs/path/to/adb
cd yarn-project/ivc-integration
node scripts/bench.mjs devices     # expect mac ✅ + each phone ✅ with its serial/model
node scripts/bench.mjs probe       # capability matrix (no GPU work; safe everywhere)
node scripts/bench.mjs chonk       # the real e2e off-vs-on comparison
```

Fix any registry mismatch in `scripts/devices.json` (`match` regex over model/market name; per-device `threads` for the WASM `?threads=` override; `caps.webgpuMsm = ok|unknown|device-lost`). GPU-bearing runs skip `device-lost` devices unless `--force`.

## Gotchas

- **Keep phones unlocked + awake.** The harness wakes the screen and sets stay-awake, but can't pass a PIN lock; a sleeping screen throttles WebGPU and can suspend the USB/adb link.
- **USB is flaky** — phones drop off adb between runs; re-run `bench.mjs devices`. Samsung Auto Blocker can re-arm and block USB data.
- **Phones must not run the 16-thread WASM default** (pthread startup races → `RuntimeError: null function`); the registry's `threads: 4–6` feeds `?threads=`.
- **`-L` forwards drop when a box dev server restarts** — re-run the Mac tunnel (or re-add the port in the VS Code Ports panel).
- **The box chonk page server can die mid-session** (it's `node scripts/serve-chonk-webgpu.mjs`, port 8080). Symptom: `bench.mjs` prints `✗ dev server not reachable on 127.0.0.1:8080`. Restart it (detached: `setsid nohup node scripts/serve-chonk-webgpu.mjs &`), then re-confirm `curl 127.0.0.1:8080`.
- **Run long sweeps detached** (`setsid nohup …`) — a plain background job dies when the agent/session is torn down. **Never run two bench drivers against the same device at once** — `launchCdp` closes same-origin pages, so they evict each other. The `/results` JSONL sink (not `bench-history.jsonl`) is authoritative — it has rows even when a driver was killed before writing history.
