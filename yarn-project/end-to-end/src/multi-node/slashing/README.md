# `slashing` (multi-node sub-folder)

Slashing and sentinel tests. They are `multi-node` tests — their subject (duplicate proposals /
attestations, inactivity, the slashing veto flow, sentinel observability) is driven by proposals and
attestations that the in-memory `MockGossipSubNetwork` bus delivers, so they do **not** need real
libp2p. They live here as a sub-folder of the `multi-node` category rather than as their own category.

These tests previously lived in `e2e_p2p/` and were built on `P2PNetworkTest`, which ran real libp2p
even when `mockGossipSubNetwork: true` was set (the flag was inert there because `setup_p2p_test`'s
`createNode(s)` never passed a `p2pServiceFactory`). They now run on genuine mock gossip via
`MultiNodeTestContext` + `ValidatorRegistrationHarness`.

## Harness: `ValidatorRegistrationHarness`

`../validator_registration_harness.ts` is the mock-gossip replacement for the validator-registration
half of `P2PNetworkTest`. It composes a `MultiNodeTestContext`:

- `ValidatorRegistrationHarness.create({ numberOfValidators, ...opts })` registers `numberOfValidators`
  validators (deterministic attester keys starting at index 3, matching the old `P2PNetworkTest`
  convention) by passing them as `initialValidators` to `MultiNodeTestContext.setup`. That deploys the
  L1 contracts with the validators staked at genesis and advances past the validator-set lag, so the
  committee is active when `create` resolves — no MultiAdder/GSE post-deploy staking needed.
- `createValidatorNode(index, opts)` spawns a node on the mock bus signing with the validator at
  `index`. Pass the same `index` to two calls (with different `coinbase`) to model an equivocating
  proposer sharing a key across two nodes. Validators with no spawned node stay registered-but-offline.
- `addressAt(index)` / `privateKeyAt(index)` expose the per-validator key material; `getContracts()`
  returns the rollup / slasher / slashing-proposer L1 contracts (mirrors `P2PNetworkTest.getContracts`).

The generic offense/proposer helpers (`advanceToEpochBeforeProposer`, `awaitCommitteeExists`,
`awaitOffenseDetected`, `awaitCommitteeKicked`, …) still live in `../../e2e_p2p/shared.ts` and are
imported cross-folder; they take `epochCache` / `cheatCodes` / `rollup` / `nodeAdmin`, not a
`P2PNetworkTest`, so they work unchanged against `MultiNodeTestContext`.
