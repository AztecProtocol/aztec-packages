# Headless chonk WebGPU sweep over CDP

Drive the chonk page's **Run all (GPU↔WASM)** paired sweep on a remote machine's real GPU from a
host that has none, by connecting to the remote Chrome over the Chrome DevTools Protocol (CDP). The
proving runs on the remote GPU; the driver (`cdp-paired-sweep.mjs`) navigates, runs the sweep, and
prints the per-example results (prove/verify ms, speedup, GPU↔WASM VK match) as JSON.

This is the setup for the common case: a **dev box / container** (no GPU) driving a **Mac** (real
Metal GPU) that connects into the box via SSH (e.g. VS Code Remote). Because the box runs its own
`sshd` and the Mac connects *in*, the Mac can open a **reverse** tunnel back to the box.

## Topology

```
  Mac (real GPU)                              dev box / container (no GPU)
  ─────────────                               ────────────────────────────
  Chrome --remote-debugging-port=9222         node scripts/serve-chonk-webgpu.mjs   (serves dist/ on :8080)
        │  ▲                                          ▲   │
        │  └──── ssh -R 9222 ───────────────────────────┘   │  cdp-paired-sweep.mjs connects to :9222,
        └─────── ssh -L 8080 (or VS Code forward) ──────────┘  navigates Chrome to 127.0.0.1:8080, runs sweep
```

## One-time setup on the GPU machine (the Mac)

1. **Launch a debug Chrome.** Use a *separate* `--user-data-dir` so it doesn't touch your normal
   browsing AND so `--remote-debugging-port` is actually honored (Chrome only opens the debug port
   for the first process per user-data-dir). The occlusion flags are **required**: without them macOS
   throttles the un-focused window ~5× and the heaviest flow can crash/reload mid-sweep.

   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
     --remote-debugging-port=9222 \
     --user-data-dir="$HOME/chrome-cdp-bench" \
     --disable-background-timer-throttling \
     --disable-renderer-backgrounding \
     --disable-backgrounding-occluded-windows \
     --disable-features=CalculateNativeWinOcclusion \
     > /tmp/chrome-cdp.log 2>&1 &
   ```

2. **Reverse-tunnel the debug port into the box** (so the box can reach the Mac's Chrome):

   ```bash
   ssh -N -R 9222:localhost:9222 <box-ssh-host>
   ```

3. **Make the box's :8080 reachable from the Mac** (so Chrome can load the page). VS Code auto-forwards
   it, but the forward drops whenever the dev server restarts — re-add it via the VS Code **Ports**
   panel, or with an explicit forward tunnel:

   ```bash
   ssh -N -L 8080:localhost:8080 <box-ssh-host>
   ```

## On the box

```bash
# 1. Serve the page (rebuild dist/ first if sources changed: yarn webpack)
node scripts/serve-chonk-webgpu.mjs        # serves dist/ on :8080

# 2. Drive the sweep on the remote GPU
node scripts/cdp-paired-sweep.mjs
```

The driver prints `GPU adapter: …` (confirm it says the real GPU, e.g. `apple / metal-3`, not
`swiftshader` — software WebGPU does not produce verifying proofs), then a JSON array of per-example
results. The page also POSTs the same summary to the server's `/results` JSONL sink.

Env overrides: `CDP_URL` (default `http://localhost:9222`), `PAGE_URL` (default
`http://127.0.0.1:8080/`).

## Gotchas (all encountered + handled in the driver)

- **Use `127.0.0.1`, not `localhost`.** SSH/VS Code forwards bind IPv4 `127.0.0.1`; Chrome often
  resolves `localhost` to `::1` (IPv6) first and fails to connect → blank tab. The driver defaults to
  `127.0.0.1`.
- **`protocolTimeout: 0`.** The sweep runs several minutes; puppeteer's default 180s CDP timeout would
  kill a single long call. The driver polls with short calls instead.
- **Separate Chrome profile** for the debug instance, or quit all Chrome first if you want to debug a
  real profile. The driver only closes stale tabs at the page origin, never other tabs.
- **The :8080 forward drops on server restart.** If the driver's tab is blank, the Mac can't reach the
  box's :8080 — re-add the forward (step 3).
- **Keep the debug Chrome window non-minimized** and keep the occlusion flags, or proves throttle/crash.
