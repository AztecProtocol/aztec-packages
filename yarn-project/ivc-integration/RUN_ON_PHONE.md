# ChonkApi::prove on the S25+ (Adreno) via bb.js

Runs the pinned `ecdsar1+transfer_1_recursions+sponsored_fpc` flow through
bb.js's `AztecClientBackend.prove` on the phone's GPU, via a machine-hosted
page (the WebGPU MSM bridge handles the BN254 batch MSMs).

## Pieces

| file | role |
|---|---|
| `src/serve.ts` | browser entry; `?autorun=chonk-on` / `?autorun=chonk-webgpu` drives the prove, emits `[CHONK-RESULT] {json}`, sets `document.title`, and POSTs the result to `/result` |
| `serve-phone.mjs` | standalone server: `dist/` + `/ivc-inputs/<flow>.msgpack` + COOP/COEP/CORP, logs `/result` beacons (`RESULTS_FILE` to also append a JSONL) |
| `run-on-phone.sh` | turn-key runner: server + `adb reverse` + content_shell launch + wait for result |
| `drive-phone-local.mjs` | headless-Chrome driver to validate the same path on the Mac |

## Build (already done; redo only after a C++/bb.js change)

```bash
# native hook wasm -> bb.js browser inline -> webpack bundle
cd barretenberg/cpp && cmake --build --preset wasm-threads --target barretenberg.wasm && gzip -kf build-wasm-threads/bin/barretenberg.wasm
cd ../ts && ./node_modules/.bin/tsgo -b tsconfig.browser.json \
  && cp ../cpp/build-wasm-threads/bin/barretenberg.wasm.gz dest/browser/barretenberg_wasm/barretenberg-threads.wasm.gz \
  && cp ../cpp/build-wasm-threads/bin/barretenberg.wasm.gz dest/browser/barretenberg_wasm/barretenberg.wasm.gz \
  && ./scripts/browser_postprocess.sh
cd ../../yarn-project/ivc-integration && yarn webpack
```

## Run on the phone

The phone loads `http://localhost:PORT` via `adb reverse` — **localhost is a
secure context, so SharedArrayBuffer / threaded WASM work.** A plain LAN-IP
origin over HTTP is *not* a secure context and would break threads, so the
adb-reverse path (not "open the Mac's IP in phone Chrome") is required unless
you serve HTTPS or whitelist the origin in `chrome://flags`.

**Prereqs (one-time, need physical access to the phone):**
- adb reachable: USB + accept the prompt, or wireless debugging on then
  `adb connect <phone-ip>:<port>` (the port rotates each toggle; read it off
  the phone's Wireless-debugging screen).
- debuggable content_shell installed (webgpu-gpu-trace
  `build_debuggable_content_shell.sh`).

```bash
cd yarn-project/ivc-integration
bash run-on-phone.sh chonk-on            # on-only GPU smoke (fastest "does it prove?")
bash run-on-phone.sh chonk-webgpu        # full off+on, asserts vks_match
# ADB_SERIAL=192.168.1.77:NNNNN bash run-on-phone.sh chonk-on   # explicit wireless serial
```

Result lands in `/tmp/chonk-phone-results-<port>.jsonl`:
`{"title":"CHONK-DONE-OK","prove_ms":…,"verified":true,…}`.

## Validate on the Mac first (no phone)

```bash
PORT=5300 HOST=127.0.0.1 node serve-phone.mjs &      # in one shell
PORT=5300 node drive-phone-local.mjs chonk-webgpu    # in another (holds the mac bench-lock)
```
M4 Pro (Metal-3), 2026-06-13: `chonk-on` verified=true; `chonk-webgpu`
**vks_match=true** with the rebuilt hook WASM (Stage-4 work-sharing exports
present, flags default-off).

## Status

Machine side is built + Mac-validated + committed. The on-device run is gated
only on the S25+'s adb being reachable (it was network-reachable but wireless
debugging was off). Once adb is up, `run-on-phone.sh chonk-on` is one command.
