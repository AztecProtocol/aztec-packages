# TypeScript Documentation Examples

This directory contains TypeScript examples used in the Aztec documentation. Each example is a self-contained project that demonstrates specific Aztec.js functionality.

## Directory Structure

Each example directory contains:
- `index.ts` - The example code with `docs:start:` and `docs:end:` markers for inclusion in documentation
- `config.yaml` - Lists any custom contract artifacts the example needs from `docs/target/`
- `package.json` - Declares dependencies (committed; uses relative `link:` paths for `@aztec/*` packages so the resolved descriptors hash the same on every machine)
- `yarn.lock` - Committed lockfile pinning third-party transitive deps; CI installs with `--immutable`
- `.yarnrc.yml` - Yarn configuration mirroring `yarn-project/.yarnrc.yml` policy (`nodeLinker: node-modules`, `npmMinimalAgeGate: 7d`)

## Validation: Type Checking

The `bootstrap.sh` script validates all examples by:

1. Reading `config.yaml` to determine custom contracts (if any)
2. Running codegen for those contracts (from `docs/target/`)
3. Running `yarn install --immutable` (committed `yarn.lock` must match `package.json`)
4. Verifying every `link:` target exists and has built `.d.ts` output
5. Running `yarn tsc --noEmit` to type-check the example

Run validation for all examples:
```bash
./bootstrap.sh
```

Run validation for specific example(s):
```bash
./bootstrap.sh aztecjs_connection aztecjs_advanced
```

If validation fails with `yarn install --immutable` complaining that the lockfile would be modified, regenerate the committed lockfiles:

```bash
docs/examples/bootstrap.sh refresh-ts-lockfiles
git add docs/examples/ts/*/yarn.lock
```

This typically happens after a `yarn-project` package adds, removes, or version-bumps a transitive dep.

## Execution: Test Runner

The `aztecjs_runner/run.sh` script executes examples against a live local Aztec network to verify they work correctly.

### CI Execution (Docker Compose)

In CI, examples run via `docker-compose.yml` which spins up an Anvil fork, a local Aztec network, and runs the examples automatically. This is triggered by `docs/examples/bootstrap.sh execute` (called from `docs/bootstrap.sh ci`).

```bash
# Run via bootstrap (recommended for CI)
cd docs/examples && ./bootstrap.sh execute

# Or invoke docker-compose directly
cd docs/examples/ts && run_compose_test docs_examples docs-examples .
```

### Local Execution

For local development, start the sandbox manually and run examples directly.

#### Prerequisites

- Local Aztec network running (default: `localhost:8080`)
- Local L1 RPC running for examples that touch Ethereum (default: `localhost:8545`)
- Built yarn-project packages

#### Usage

Run all examples:
```bash
cd aztecjs_runner
./run.sh
```

Run specific example(s):
```bash
./run.sh connection           # aztecjs_connection
./run.sh getting_started      # aztecjs_getting_started
./run.sh advanced authwit     # multiple examples
./run.sh swap                 # example_swap
./run.sh recursive_verification
```

#### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AZTEC_NODE_URL` | URL of the Aztec node to connect to | `http://localhost:8080` |
| `ETHEREUM_HOST` | URL of the L1 RPC used by bridging / swap examples | `http://localhost:8545` |

The `AZTEC_NODE_URL` env var is used by the runner script and the example `index.ts` files. `ETHEREUM_HOST` is used by examples that interact with L1. In Docker Compose, these are set to `http://local-network:8080` and `http://fork:8545`.

### Currently Tested Examples

| Example | Description |
|---------|-------------|
| `aztecjs_connection` | Basic network connection, account setup, token deployment |
| `aztecjs_getting_started` | Complete getting started tutorial flow |
| `aztecjs_advanced` | NO_WAIT transactions, BatchCall, sponsored FPC, events |
| `aztecjs_authwit` | Authentication witnesses for delegated actions |
| `aztecjs_testing` | Test patterns: minting, transfers, revert testing |
| `example_swap` | Cross-chain token swap via L1 uniswap portal (L2→L1→L2) |
| `recursive_verification` | Recursive proof generation and onchain verification flow |

### Examples Not Executed (Type-Checked Only)

These examples require additional infrastructure or custom contracts with verification keys:

| Example | Reason |
|---------|--------|
| `bob_token_contract` | Custom contract requires verification keys |
| `token_bridge` | Requires L1 contracts and bridge infrastructure |

## Adding New Examples

1. Create a new directory with your example name (e.g. `my_example/`)
2. Add `index.ts` with your example code (use `docs:start:` / `docs:end:` markers for documentation includes)
3. Add `config.yaml`. If the example needs custom contracts, list them; otherwise use an empty list:

   ```yaml
   contracts: []
   ```

4. Add `package.json`. Use relative `link:` paths for `@aztec/*` deps so the resolved descriptors are stable across machines:

   ```json
   {
     "name": "@aztec-docs/my-example",
     "private": true,
     "version": "0.0.0",
     "type": "module",
     "packageManager": "yarn@4.13.0",
     "dependencies": {
       "@aztec/aztec.js": "link:../../../../yarn-project/aztec.js",
       "@aztec/accounts": "link:../../../../yarn-project/accounts",
       "@aztec/wallets": "link:../../../../yarn-project/wallets"
     },
     "devDependencies": {
       "tsx": "^4.20.0",
       "typescript": "^5.3.3"
     }
   }
   ```

   The `tsx` and `typescript` versions must match across all examples (`bootstrap.sh` lints this).
5. Copy `.yarnrc.yml` from a sibling example.
6. Generate the lockfile: `cd docs/examples/ts/my_example && yarn install`
7. Commit `package.json`, `yarn.lock`, and `.yarnrc.yml`
8. Run `cd docs/examples/ts && ./bootstrap.sh my_example` to validate
9. If the example can run against a live network, add it to `aztecjs_runner/run.sh`

## File Management

Validation generates `node_modules/`, `tsconfig.json`, `artifacts/`, and `codegenCache.json` per example. These are gitignored and cleaned up automatically; if you need to clean manually:

```bash
# In each example directory
rm -rf node_modules tsconfig.json artifacts codegenCache.json
```

Do **not** delete or empty the committed `package.json`, `yarn.lock`, or `.yarnrc.yml` — they are the source of truth for the validation graph.
