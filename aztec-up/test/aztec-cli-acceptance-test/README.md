# Aztec CLI Acceptance Test

Tests that the installed Aztec CLI toolchain works end-to-end. Exercises the complete developer onboarding path:

1. `aztec init` - scaffold a new workspace with a Counter contract and test crate
2. `aztec compile` - compile the scaffolded contract
3. `aztec test` - run the TXE tests from the scaffold's test crate
4. `aztec start --local-network` - start a local sandbox (anvil + aztec node)
5. `aztec codegen` - generate TypeScript bindings from the compiled artifact
6. TS end-to-end test - run a `node --test` suite inside the scaffolded workspace that imports the codegen'd `CounterContract`, stands up an in-process wallet + PXE via `@aztec/wallets/embedded`, deploys Counter, calls `increment`, and reads the value back through the `get_counter` utility function

## Running

With an existing local install (fast inner loop):
```bash
SKIP_INSTALL=1 ./run-test.sh
```

With a fresh install from a specific version:
```bash
VERSION=4.3.0 ./run-test.sh
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SKIP_INSTALL` | Set to `1` to skip the installer and use the already-installed toolchain. |
| `VERSION` | Version to install (e.g. `4.3.0` or `v4.3.0`). Required unless `SKIP_INSTALL=1`. |

## Architecture

- **`run-test.sh`** - Bash launcher. Runs the aztec installer (unless skipped), sets up PATH, then `exec node aztec-cli-acceptance-test.ts`.
- **`aztec-cli-acceptance-test.ts`** - Orchestrator. Runs each CLI step against the installed toolchain and, after codegen, copies `counter.test.ts` into the scaffolded workspace and spawns `node --test` on it. Each phase is wrapped in `step(name, fn)` so failures clearly identify which step broke. Always emits a machine-readable result line for CI/Slack integration: `TEST_RESULT=pass version=...` on success, or `TEST_RESULT=fail step=... version=... error="..."` on failure (with a full banner printed above it).
- **`counter.test.ts`** - The `node:test` suite that drives the deployed Counter end-to-end through the codegen'd bindings. Lives here as a template; copied into the workspace at test time so it can statically `import { CounterContract } from './artifacts/Counter.js'` with real codegen types and resolve `@aztec/*` via the workspace's `node_modules` symlink to the install.
