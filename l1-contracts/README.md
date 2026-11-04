# L1 Contracts

The Ethereum (L1) Solidity contracts of the Aztec rollup: the rollup itself, its message bridges, staking, governance and the deploy scripts.

## Prerequisites

- Foundry v1.4.1, the version CI uses (`build-images/src/Dockerfile`). Install it with `foundryup --install v1.4.1`.
- Node.js and yarn, for solhint.
- A noir-projects build. Run `./bootstrap.sh` in `noir-projects/` first: the build copies the rollup verifier from `noir-projects/fnd/noir-protocol-circuits/target/keys/rollup_root_verifier.sol`.

## Structure

- `src/core`: the `Rollup`, its message bridges (`Inbox`, `Outbox`, `FeeJuicePortal`), slashing, the escape hatch and the reward booster. The `Rollup` stores the rollup state. It accepts checkpoint proposals signed by the committee, and epoch proofs checked by the Honk verifier.
- `src/governance`: `Governance`, the governance proposer, `Registry`, the Governance Staking Escrow (GSE), `RewardDistributor` and `CoinIssuer`.
- `src/periphery`: contracts outside the core protocol: upgrade and slash payloads, `FlushRewarder`, `DateGatedRelayer`.
- `src/shared`: BN254, signature and time libraries that the other folders share.
- `src/mock`: test-only contracts: `MockVerifier`, `TestERC20`, the staking and fee asset handlers, `MultiAdder`, and coverage mocks.
- `script/`: Foundry deploy and governance scripts.
- `test/`: Foundry tests. Checkpoint fixtures are in `test/fixtures/` (see [`test/fixtures/README.md`](test/fixtures/README.md)).
- `l1-artifacts/`: the TypeScript package of ABIs and bytecode (see [`l1-artifacts/README.md`](l1-artifacts/README.md)).

## Build

```bash
./bootstrap.sh
```

This regenerates `src/core/libraries/ConstantsGen.sol`, fetches solc 0.8.30 and the libraries in `lib/`, builds the contracts, copies the verifier from noir-projects into `generated/HonkVerifier.sol`, and builds `l1-artifacts/`. It exits with an error if the noir-projects verifier does not exist.

A plain `forge build` of the whole project fails until `generated/HonkVerifier.sol` exists, because `DeployRollupLib.sol` imports it.

## Test

```bash
forge test
```

CI runs `./bootstrap.sh test`, which runs, in parallel:

- `solhint --config ./.solhint.json "src/**/*.sol"`
- `forge fmt --check`
- `scripts/check_contract_sizes.sh`
- a check that `generated/HonkVerifier.sol` matches the noir-projects verifier
- `forge test`
- the `MerkleCheck` tests with `--ffi`
- `scripts/test_rollup_upgrade.sh`

CI uses the repo default EVM version, `prague`. Some measurement READMEs need a newer Foundry for `--evm-version amsterdam`; CI does not run those variants.

The mainnet fork tests skip, or use a committed fixture, unless an RPC URL is set:

| Test | Environment variable |
|---|---|
| `test/fork/FlushGasFloorMainnetFork.t.sol` | `MAINNET_FORK_RPC` |
| `test/fork/MainnetV6PopGasLimit.t.sol` | `MAINNET_FORK_RPC_URL` |
| `test/fork/MainnetReductionCalculator.t.sol` | `MAINNET_ATP_FIXTURE_RPC_URL` (when set, the test rewrites `test/fixtures/mainnet_atp_reduction_calculator.json`) |

Coverage: run `./bootstrap.sh coverage -h` for the options.

## Formatting and style

Format with `forge fmt`. Lint with `yarn lint` (solhint 5.1.0, rules in `.solhint.json`). CI runs both checks. Solhint enforces most naming rules and the order of contract members.

Also follow these rules:

- Prefix function arguments with `_`: `function transfer(address _to, uint256 _amount);`.
- Prefix `internal` and `private` function names with `_`, except in libraries.
- Do not prefix storage variables with `_`.
- Write `constant` and `immutable` names in `CAPITAL_CASE`.
- Always give the size of an integer: `uint256`, not `uint`.
- Use named imports: `import {IERC20} from "./IERC20.sol";`, not `import "./IERC20.sol";`.
- Name the interface when you override: `override(IRollup)`.
- Use custom errors from `Errors.sol` with `require(cond, Errors.X())`. Do not use string reasons.
- Write NatSpec for every function. Use `@notice` for what a user must know and `@dev` for implementation detail.

## Gas reports

None of these reports is checked in CI. Regenerate the one you affect and commit it with your change.

| Command | Writes | Covers |
|---|---|---|
| `./bootstrap.sh gas_report` | `gas_report.json` | `RollupTest`, except `testInvalidBlobHash` and `testInvalidBlobProof` |
| `./bootstrap.sh gas_benchmark` | `gas_benchmark.md`, `gas_benchmark_results.json` | happy-path gas with and without validators, from `test/benchmark/happy.t.sol` |
| `./bootstrap.sh partial_epoch_proof_gas_report` | `partial_epoch_proof_gas_report.md`, `partial_epoch_proof_gas_report.json` | epoch proof submission for 1 to 32 checkpoints, from the `PartialEpochProof*GasReportTest` contracts in `test/benchmark/happy.t.sol` |

Pass `check` (for example `./bootstrap.sh gas_report check`) to print the diff against the committed file and fail if it changed.

The gas benchmark numbers over time are at https://aztecprotocol.github.io/benchmark-page-data/dev/l1-gas-bench/.

The gas report leaves out `testInvalidBlobHash` and `testInvalidBlobProof` because of [this Foundry issue](https://github.com/foundry-rs/foundry/issues/10074). So it reports no gas for blob validation (currently 50k gas per blob, and production uses 3 blobs per propose).

To run a gas report directly with `forge`, set `FORGE_GAS_REPORT=true` instead of passing `--gas-report`. The `./bootstrap.sh` commands do this for you.

## Test trees (optional)

Some tests use the [Branching Tree Technique](https://www.youtube.com/watch?v=0-EmbNVgFA4): a `.tree` file describes the cases, and [Bulloak](https://github.com/alexfertel/bulloak) generates or checks the Solidity test file. For examples, see `test/governance/registry/*.tree`. CI does not run bulloak.

```bash
cargo install bulloak
bulloak scaffold -w **/*.tree   # generate test files
bulloak check **/*.tree         # check the tests match the trees
```

The [Ascii Tree Generator](https://marketplace.visualstudio.com/items?itemName=aprilandjan.ascii-tree-generator) VS Code extension helps you draw the trees.

## Slither (optional)

Slither does not run in CI. To run it locally:

```bash
pip3 install slither-analyzer==0.10.0 slitherin==0.5.0
yarn slither   # writes slither_output.md
```

The `naming-convention` detector is off, because solhint enforces the naming rules.

## Other docs in this directory

- [`script/deploy/V6_UPGRADE_RUNBOOK.md`](script/deploy/V6_UPGRADE_RUNBOOK.md): deploy the v6 rollup and take it through governance.
- [`src/periphery/V6UpgradePayload.md`](src/periphery/V6UpgradePayload.md): what the v6 upgrade payload does and does not do.
- [`test/shared/bn254-pop-gas/README.md`](test/shared/bn254-pop-gas/README.md): BLS proof-of-possession gas measurements.
- [`test/staking/flush-gas-floor/README.md`](test/staking/flush-gas-floor/README.md): the entry-queue flush gas floor.

## Consuming these contracts

Sample repos that consume these contracts:

- [foundry](https://github.com/just-mitch/hello_aztec_foundry)
- [hardhat](https://github.com/just-mitch/hardhat-aztec-example)
