# TypeScript Documentation Examples

This directory contains TypeScript examples used in the Aztec documentation. Each example is a self-contained project that demonstrates specific Aztec.js functionality.

## Directory Structure

Each example directory contains:
- `index.ts` - The example code with `docs:start:` and `docs:end:` markers for inclusion in documentation
- `config.yaml` - Specifies dependencies and any custom contract artifacts needed

Validation and the runner create an empty, gitignored `yarn.lock` in each example before installing, so Yarn treats it as a project of its own instead of part of `docs/`'s.

The bridge tutorials' examples (`token_bridge`, `aave_bridge`) are Hardhat projects in the reader's layout instead: `scripts/index.ts`, `contracts/*.sol`, `hardhat.config.ts` and `remappings.txt`. For them, validation and the runner link `l1-contracts` to the `@aztec-foundation/l1-artifacts` sources the remappings name, run `npx hardhat compile`, and write the Aztec bindings to `contracts/aztec/artifacts/`.

## Validation: Type Checking

The `bootstrap.sh` script validates all examples by:

1. Reading `config.yaml` to determine dependencies and custom contracts
2. Running `aztec codegen` for any custom contracts specified (from `docs/target/`)
3. Installing `@aztec-labs/*` at the pinned `AZTEC_VERSION` and `@aztec-foundation/*` at `BB_VERSION` from npm (`docs/aztec-node.json`)
4. Running `tsc --noEmit` to type-check the example

It needs the pinned CLI and versions, which `docs/examples/bootstrap.sh validate-ts` provisions and exports:
```bash
cd docs/examples && ./bootstrap.sh validate-ts                      # all examples
cd docs/examples && ./bootstrap.sh validate-ts aztecjs_connection aztecjs_advanced
```

## Execution: Test Runner

The `aztecjs_runner/run.sh` script executes examples against a live local Aztec network to verify they work correctly.

### CI Execution (Docker Compose)

In CI, examples run via `docker-compose.yml` which spins up an Anvil fork, a local Aztec network, and runs the examples automatically. Full CI runs `docs/examples/bootstrap.sh execute 1` and `execute 2` at once, one compose project per half; `execute` with no half runs every example. Two `execute` calls started by hand at the same moment on a stale toolchain can break each other, since each reinstalls the shared CLI; `docs/examples/bootstrap.sh test` installs it once before it starts them.

```bash
cd docs/examples && ./bootstrap.sh execute
```

Run the compose file only through `execute`: it exports the pinned `AZTEC_VERSION` and `BB_VERSION`, creates `~/.bb-crs` as your user, and passes your user and group as `DOCS_UID` and `DOCS_GID`, so the runner writes the checkout as you and leaves no root-owned files.

### Local Execution

For local development, start the sandbox manually and run examples directly.

#### Prerequisites

- Local Aztec network running (default: `localhost:8080`)
- Local L1 RPC running for examples that touch Ethereum (default: `localhost:8545`)
- The pinned CLI and versions: in `docs/`, `node scripts/aztec_node.mts provision cli` and `eval "$(node scripts/aztec_node.mts env)"`

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
| `bob_token_contract` | The token contract tutorial's custom contract: deploy, mint, transfer |
| `token_bridge` | The NFT bridge tutorial: L1 portal, L2 bridge, deposit and withdrawal |
| `aave_bridge` | The Aave bridge tutorial: L1 portal and Aave pool, L2 bridge, deposit and claim |
| `aztecjs_kernelless_simulation` | Simulating a transaction without kernel circuits |

## Adding New Examples

1. Create a new directory with your example name
2. Add `index.ts` with your example code
3. Add `config.yaml` specifying dependencies:

```yaml
# For examples using pre-built contracts from @aztec-labs/noir-contracts.js
contracts: []

dependencies:
  - "@aztec-labs/aztec.js"
  - "@aztec-labs/accounts"
  - "@aztec-labs/wallets"
  - "@aztec-labs/noir-contracts.js"
```

4. Run `./bootstrap.sh your_example_name` to validate
5. Add it to one of the halves in `aztecjs_runner/run.sh` (`HALF_1` or `HALF_2`), keeping their measured times close

## File Management

The validation and runner scripts generate temporary files during execution. These are cleaned up automatically, but if you need to manually clean:

```bash
# In each example directory
rm -rf node_modules .yarn artifacts package.json tsconfig.json .yarnrc.yml
rm -f .editorconfig .gitattributes .gitignore README.md codegenCache.json yarn.lock
```
