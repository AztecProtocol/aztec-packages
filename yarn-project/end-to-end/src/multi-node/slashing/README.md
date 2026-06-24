# `slashing` (multi-node sub-folder)

Pure offense-detection tests: a validator equivocates (duplicate proposals / attestations) and the
slasher records the corresponding `DUPLICATE_PROPOSAL` / `DUPLICATE_ATTESTATION` offense. They are
`multi-node` tests — the equivocation is driven by proposals and attestations that the in-memory
`MockGossipSubNetwork` bus delivers, so they do **not** need real libp2p. They live here as a
sub-folder of the `multi-node` category rather than as their own category.

Consensus-recovery and invalid-checkpoint tests that used to live here moved out, since their primary
subject is not offense detection: `equivocation.test.ts` → `../recovery/equivocation_recovery.test.ts`
(an L1-confirmed checkpoint overriding a gossip-only equivocating proposal, then healing) and
`invalidate_block.parallel.test.ts` → `../invalid-attestations/` (invalid checkpoints detected,
invalidated on L1, and the chain progressing).

## Base class

Both tests use `MultiNodeTestContext` directly (`../multi_node_test_context.ts`). The validator-
registration sugar that used to live in a separate `ValidatorRegistrationHarness` is folded into the
context:

- `SLASHER_ENABLED_MULTI_VALIDATOR_OPTS` — the `setup` preset `{ mockGossipSubNetwork: true,
  skipInitialSequencer: true, slasherEnabled: true }`. Spread it alongside `setup.ts`'s
  `baseSlashingOpts` and `initialValidators: buildMockGossipValidators(NUM_VALIDATORS)`. `setup`
  deploys the L1 contracts with the validators staked at genesis and advances past the validator-set
  lag, so the committee is active when `setup` resolves.
- `test.addressAt(index)` / `test.privateKeyAt(index)` / `test.validatorAt(index)` expose the
  per-validator key material registered at genesis.
- `test.createValidatorNodeAt(index, opts)` spawns a node on the mock bus signing with the validator
  at `index`. Pass the same `index` to two calls (with different `coinbase`) to model an equivocating
  proposer sharing a key across two nodes. Validators with no spawned node stay registered-but-offline.
- `test.getSlashingContracts()` returns the rollup / slasher / slashing-proposer L1 contracts.

The generic offense/proposer helpers (`advanceToEpochBeforeProposer`, `awaitCommitteeExists`,
`awaitOffenseDetected`, …) live in `../../e2e_p2p/shared.ts` and are imported cross-folder; they take
`epochCache` / `cheatCodes` / `rollup` / `nodeAdmin`, so they work unchanged against
`MultiNodeTestContext`. The shared slashing-round/penalty config is in `setup.ts`.
