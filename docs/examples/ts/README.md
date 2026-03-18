# TypeScript Documentation Examples

This directory contains TypeScript examples used in the Aztec documentation. Each example is a self-contained project that demonstrates specific Aztec.js functionality.

## Directory Structure

Each example directory contains:
- `index.ts` - The example code with `docs:start:` and `docs:end:` markers for inclusion in documentation
- `config.yaml` - Specifies dependencies and any custom contract artifacts needed
- `yarn.lock` - Empty file to prevent yarn from using parent monorepo's yarn.lock

## Validation: Type Checking

The `bootstrap.sh` script validates all examples by:

1. Reading `config.yaml` to determine dependencies and custom contracts
2. Running codegen for any custom contracts specified (from `docs/target/`)
3. Installing linked `@aztec/*` dependencies from `yarn-project/`
4. Running `tsc --noEmit` to type-check the example

Run validation for all examples:
```bash
./bootstrap.sh
```

Run validation for specific example(s):
```bash
./bootstrap.sh aztecjs_connection aztecjs_advanced
```

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

1. Create a new directory with your example name
2. Add `index.ts` with your example code
3. Add `config.yaml` specifying dependencies:

```yaml
# For examples using pre-built contracts from @aztec/noir-contracts.js
contracts: []

dependencies:
  - "@aztec/aztec.js"
  - "@aztec/accounts"
  - "@aztec/wallets"
  - "@aztec/noir-contracts.js"
```

4. Create empty `yarn.lock` file
5. Run `./bootstrap.sh your_example_name` to validate
6. If the example can run against a live network, add it to `aztecjs_runner/run.sh`

## File Management

The validation and runner scripts generate temporary files during execution. These are cleaned up automatically, but if you need to manually clean:

```bash
# In each example directory
rm -rf node_modules .yarn artifacts package.json tsconfig.json .yarnrc.yml
rm -f .editorconfig .gitattributes .gitignore README.md codegenCache.json
> yarn.lock  # Keep empty
```
