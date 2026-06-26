# `automine` e2e test category

Automine tests run a single Aztec node driving the deterministic `AutomineSequencer`: one block per
submitted transaction, synchronous L1 publish, no committee, no prover, and no validator client. The
node opts into this topology through the `AUTOMINE_E2E_OPTS` preset (`fixtures/fixtures.ts`), which the
base context applies by default. This is the fast, deterministic counterpart to the `single-node`
category, whose node runs the production sequencer with interval block production. A test belongs here
when it exercises contract or protocol behavior that does not depend on real block-building or consensus
(token transfers, nested calls, note discovery, tx semantics); it belongs in `single-node` when it
asserts on sequencer, proving, or reorg behavior.

## Base class

All tests use `AutomineTestContext` (`automine_test_context.ts`), which owns:

- The environment: an in-process anvil in automine mode plus the L1 contract deploy, wrapping
  `fixtures/setup.ts:setup()` with `AUTOMINE_E2E_OPTS` and `fundSponsoredFPC` as defaults.
- The common handles: `context`, `wallet`, `aztecNode`, `aztecNodeAdmin`, `cheatCodes`, `sequencer`,
  `accounts`, `defaultAccountAddress`, `logger`.
- `markProvenAndWarp(seconds)`: marks pending checkpoints proven before warping the L2 clock, so a long
  warp does not trip the rollup's pruning window (see the method's doc comment).
- `registerContract(...)`: computes and registers a contract instance without an on-chain deploy.
- `applyManualParentChild()`: deploys a Parent and Child contract for the nested-call tests.

Tests call the static `AutomineTestContext.setup({ numberOfAccounts })` factory (or `new` plus `setup()`
for the harness subclasses), passing `numberOfAccounts` rather than spreading `AUTOMINE_E2E_OPTS`.

## Harnesses

Two domain harnesses extend `AutomineTestContext` and run their domain setup after `super.setup()`:

- `token/token_contract_test.ts` — a `TokenSimulator` plus opt-in base/mint snapshots for the Token
  contract tests.
- `token/blacklist_token_contract_test.ts` — a `TokenSimulator`, the `Role` helper, and the
  role-change-delay warp (via `markProvenAndWarp`) for the TokenBlacklist tests.

## Organizing principle

The top level groups tests by node topology (automine); the second level names the primary behavior
under test rather than the shared setup. Each file has a single top-level `describe` named to match its
path. A `.parallel` suffix marks files with more than one top-level `it`; CI splits each `it` into its
own job.

## Subfolders

| Path | Contents |
|---|---|
| `smoke/` | AutomineSequencer mechanics themselves: sequential and parallel tx landing, time warps, `mineBlock`, and checkpoint revert. |
| `token/` | Token-economics tests on the two token harnesses plus the `TokenSimulator`/`LendingSimulator`-adjacent DeFi tests: token transfers/minting/burning/access-control, the blacklist token suite, AMM, lending, NFT, orderbook, crowdfunding, and escrow. |
| `contracts/` | Contract lifecycle and cross-contract behavior. `deploy/` (class registration, deploy method, legacy deploy, private initialization), `nested/` (importer and the manual private/public nested-call patterns), plus contract updates, storage proofs, static calls, and nested utility calls. |
| `accounts/` | Account and key behavior: account contracts, keys, multiple accounts sharing an encryption key, two-PXE interop, authwit, and scope isolation. |
| `notes/` | Note discovery, events, and offchain effects: note getters, pending note hashes, partial notes, event logs, event-only notes, offchain effects and payments, large public events, custom messages, and the tx-effect oracle. |
| `execution/` | Transaction semantics: ordering, double-spend rejection, phase checks, kernelless simulation, the AVM simulator, the circuit recorder, option params, ABI types, state variables, mempool limits, the card game, and private voting. |
| `lifecycle/` | Chain-tip, pruning, and timing behavior under automine: pruned blocks, the genesis timestamp, expiration timestamps, and PXE behavior. |

The `execution/avm_simulator` file is a genuine outlier: it dumps AVM circuit inputs for the downstream
`avm_check_circuit` CI job, so it has a bespoke CI line and is excluded from the generic `execution/` glob.
