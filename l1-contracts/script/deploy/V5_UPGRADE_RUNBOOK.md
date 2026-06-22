# V5 Upgrade Runbook

`script/deploy/DeployRollupForUpgradeV5.s.sol` deploys the v5 `RewardDistributor`, `Rollup`,
and `EscapeHatch`, plus the `V5UpgradePayload` governance executes to: drain the v4
distributor, `Registry.addRollup(v5)` + `updateRewardDistributor(new)`, `GSE.addRollup(v5)`,
`Rollup.setEscapeHatch(hatch)` (one-shot; emits `EscapeHatchSet`, not v4's `EscapeHatchUpdated`
— update indexers), and on mainnet migrate `FlushRewarder` funds to a v5-bound rewarder.

## Profile

```bash
forge clean && FOUNDRY_PROFILE=production forge build   # mainnet
forge clean && forge build                              # testnet
```

## Deploy

```bash
export PRIVATE_KEY=0x... RPC_URL=https://... ETHERSCAN_API_KEY=...
export FOUNDRY_PROFILE=production   # mainnet only

forge script script/deploy/DeployRollupForUpgradeV5.s.sol \
  --sig 'run()' --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" \
  --broadcast --verify --batch-size 8 # drop these flags to simulate
```

Mainnet is blocked until the final genesis roots land
([GK-696](https://linear.app/aztec-labs/issue/GK-696)); `DANGEROUSLY_DEPLOY_TO_MAINNET=true`
overrides. Output: one `JSON DEPLOY RESULT: {...}` line with every address.

## Tests

```bash
SEPOLIA_RPC_URL=<url> MAINNET_RPC_URL=<url> \
  forge test --match-path 'test/periphery/V5UpgradePayload*' -vv
```

Fork tests run every action against live state; unit tests cover the same against stubs.
