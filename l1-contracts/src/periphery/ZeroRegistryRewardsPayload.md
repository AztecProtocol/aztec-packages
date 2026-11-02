# ZeroRegistryRewardsPayload

Installs a `RegistryReductionCalculator` on the canonical rollup and sets the sequencer checkpoint
reward to zero for validators staked through an ATP of either listed registry. Every other proposer
keeps the default reward. Deployed by `script/deploy/DeployZeroRegistryRewardsPayload.s.sol`.

## The actions, in order

Governance runs each as `target.call(data)` from its own address, in one transaction.

| # | Action |
|---|---|
| 1 | `calculator.setRegistryReward(0x667d2641cb96734f386adA6A9afCF07B1815fB8b, 0)` |
| 2 | `calculator.setRegistryReward(0xD938bE4A2cB41105Bc2FbE707dca124A2e5d0c80, 0)` |
| 3 | `rollup.setSequencerRewardCalculator(calculator)` |

The GovernanceProposer wraps the payload in a `GSEPayload`, which appends its own `amIValid` check.

## What it guarantees

- The calculator is deployed by the payload's constructor, owned by the rollup's owner and bound to
  the rollup's GSE. Neither is a constructor argument, so the deployer never holds rights over it.
- Until action 3 the rollup does not consult the calculator. An unconfigured calculator returns the
  default reward for every proposer.
- Registries that are not listed have no entry. Their validators, and any proposer whose withdrawer
  does not resolve to an ATP registry, receive the default reward.
- Entries are capped at the default reward when read, so no configuration pays more than the default.
- Governance keeps ownership of the calculator and can change or remove an entry in a later proposal.

## Deploy

```sh
REGISTRY_ADDRESS=<registry> forge script script/deploy/DeployZeroRegistryRewardsPayload.s.sol \
  --rpc-url $L1_RPC_URL --private-key $KEY --broadcast
```

The script reads the canonical rollup off the registry, checks it supports a sequencer reward
calculator and is owned by governance, deploys the payload, verifies it, and runs it through the
governance lifecycle on a snapshot. It logs the payload and calculator addresses.

## Verify a deployed payload

```sh
REGISTRY_ADDRESS=<registry> forge script script/deploy/DeployZeroRegistryRewardsPayload.s.sol \
  --sig 'verify(address)' <payload> --rpc-url $L1_RPC_URL
forge script script/deploy/ZeroRegistryRewardsSimulation.sol \
  --sig 'simulate(address)' <payload> --rpc-url $L1_RPC_URL
```

Or by hand:

```sh
cast call <payload> "ROLLUP()(address)"                   # the canonical rollup
cast call <payload> "registryCount()(uint256)"            # 2
cast call <payload> "registries(uint256)(address)" 0      # 0x667d…fB8b
cast call <payload> "registries(uint256)(address)" 1      # 0xD938…0c80
cast call <payload> "CALCULATOR()(address)"
cast call <calculator> "owner()(address)"                 # governance
cast call <calculator> "GSE()(address)"                   # the rollup's GSE
```

## Signal

Sequencers signal for the payload by setting `GOVERNANCE_PROPOSER_PAYLOAD_ADDRESS=<payload>` on their
node (`--sequencer.governanceProposerPayload`), or at runtime through the admin API with
`nodeAdmin_setConfig` and `{"governanceProposerPayload": "<payload>"}`. The node stops signalling on
its own once the payload's proposal is live or executed.
