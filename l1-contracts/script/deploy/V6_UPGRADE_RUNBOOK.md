# v6 rollup upgrade runbook

How to deploy the v6 rollup and get it made canonical. Covers `DeployRollupForUpgradeV6.s.sol`,
`V6UpgradePayload.sol` and `V6UpgradeSimulation.sol`.

Reviewing the payload rather than running the upgrade? Start at
[`src/periphery/V6UpgradePayload.md`](../../src/periphery/V6UpgradePayload.md) — what it intends,
guarantees, and deliberately leaves alone.

## What this does

The deploy script deploys, in one broadcast:

1. `HonkVerifier` — the real epoch proof verifier.
2. `Rollup` — owned by **governance** from construction. Deploying it also constructs its `Inbox`,
   `Outbox`, `FeeJuicePortal`, `Slasher` + `SlashingProposer`, and a fresh `RewardBooster`.
   **The owner argument is not only the owner:** it also becomes the Slasher's immutable
   `GOVERNANCE`, which can execute any slash payload with no vote and no delay. Constructing with
   the deploy key would hand that power to the key permanently — `transferOwnership` moves only the
   `Ownable` half. This is why no owner-gated setup happens in the script.
3. `EscapeHatch` — built here, but **installed by the payload**, since `setEscapeHatch` is
   `onlyOwner` and the owner is governance.
4. `V6UpgradePayload` — and, on a chain with a flush rewarder, a replacement `FlushRewarder`
   deployed inside the payload's constructor.

Nothing is canonical yet. The payload is what governance executes later; it performs:

| # | Action | Why |
|---|---|---|
| 1 | `v6.setEscapeHatch(hatch)` | installs the hatch; `onlyOwner`, so only governance can |
| 2 | `Registry.addRollup(v6)` | makes v6 the canonical rollup |
| 3 | `GSE.addRollup(v6)` | lets existing attesters follow without redepositing |
| 4 | `oldFlushRewarder.recover(asset, newRewarder, rewardsAvailable())` | carries the entry-queue flush incentive across (skipped if there is no old rewarder) |

## 1. Build

The script needs two generated artifacts that are not in git:

- `src/core/libraries/ConstantsGen.sol` — from `./scripts/remake-constants.sh`
- `generated/HonkVerifier.sol` — copied by `l1-contracts/bootstrap.sh build_verifier` from
  `noir-projects/fnd/noir-protocol-circuits/target/keys/rollup_root_verifier.sol`, so
  **noir-projects must have been bootstrapped first**

From the repo root:

```bash
make l1-contracts          # or: cd l1-contracts && ./bootstrap.sh
```

This also fetches the pinned `solc-0.8.30` that `foundry.toml` points at. Then confirm:

```bash
cd l1-contracts && forge build --skip test
```

> Do **not** hand-write a stub `generated/HonkVerifier.sol`. A stub compiles and deploys a verifier
> that accepts every proof.

## 2. Fill in the inputs

All configuration is the `_config()` literal in `DeployRollupForUpgradeV6.s.sol`. Before a real
deploy these must be set:

| Field | Status | Notes |
|---|---|---|
| `vkTreeRoot` | **TODO — zero** | from the v6 protocol circuits build |
| `protocolContractsHash` | **TODO — zero** | same |
| `genesisArchiveRoot` | **TODO — zero** | same; must be below the BN254 scalar field modulus |
| `initialEthPerFeeAsset` | **TODO — stale** | E12 ETH-per-fee-asset price; refresh at deploy time |
| `oldFlushRewarder` | set (mainnet) | `0x5B98cA4dcE7b59CCf241D12f81d3d2eCF14e410e` |

`run()` refuses to proceed while any of the three genesis roots is zero. The other fields have no
such guard — `initialEthPerFeeAsset` will deploy silently at whatever value is in the table.

The three genesis values are produced by the protocol circuits / node build, not by anything in
`l1-contracts`. Get them from the same source the v6 release uses; do not carry v5's forward.

## 3. Pre-flight checks

Read the chain and confirm the assumptions the config is built on. Mainnet registry:
`0x35b22e09Ee0390539439E24f06Da43D83f90e298`.

```bash
export RPC=<mainnet rpc>
REG=0x35b22e09Ee0390539439E24f06Da43D83f90e298
ROLLUP=$(cast call $REG "getCanonicalRollup()(address)"    --rpc-url $RPC)
GSE=$(cast    call $ROLLUP "getGSE()(address)"             --rpc-url $RPC)
RD=$(cast     call $REG "getRewardDistributor()(address)"  --rpc-url $RPC)
BONUS=$(cast  call $GSE "BONUS_INSTANCE_ADDRESS()(address)" --rpc-url $RPC)

cast call $GSE "ACTIVATION_THRESHOLD()(uint256)" --rpc-url $RPC   # expect 200_000e18
cast call $GSE "EJECTION_THRESHOLD()(uint256)"   --rpc-url $RPC   # expect 100_000e18
cast call $ROLLUP "getActiveAttesterCount()(uint256)" --rpc-url $RPC
cast call $ROLLUP "getIsBootstrapped()(bool)"        --rpc-url $RPC

# must be 0, or funds earmarked to the outgoing rollup strand when it stops being canonical
cast call $RD "totalEarmarkedBalance()(uint256)" --rpc-url $RPC
cast call $RD "specificRecipientBalance(address)(uint256)" $ROLLUP --rpc-url $RPC

# how much the payload will actually move (balance minus unclaimed debt)
cast call 0x5B98cA4dcE7b59CCf241D12f81d3d2eCF14e410e "rewardsAvailable()(uint256)" --rpc-url $RPC
```

Baseline measured 2026-09-15 (block 25980374), for comparison rather than as expected constants:
attesters 3187, all in the bonus instance; `isBootstrapped` true; distributor holds ~98.98M with
`totalEarmarkedBalance` 0; flush rewarder holds 390,000e18 of which 378,900e18 is movable.

`totalEarmarkedBalance` is the one to re-check immediately before the proposal executes —
`subsidizeAddress` is permissionless, so anyone can earmark funds to the outgoing rollup after
this check and strand them.

## 4. Dry run

Run without `--broadcast` first. This executes the whole script including `verify`,
`verifyFlushRewarder` and the governance simulation, against forked state, changing nothing:

```bash
cd l1-contracts
REGISTRY_ADDRESS=0x35b22e09Ee0390539439E24f06Da43D83f90e298 \
forge script script/deploy/DeployRollupForUpgradeV6.s.sol:DeployRollupForUpgradeV6 \
  --rpc-url $RPC -vvv
```

`V6UpgradeSimulation` wraps the payload in a `GSEPayload` exactly as `GovernanceProposer` does,
funds a simulation-only voter with a majority of power, votes, warps past the delays, executes,
asserts the post-state, then reverts the snapshot. It proves the **actions execute correctly**; it
does not predict whether a real proposal would pass.

A green dry run means the config is self-consistent and the payload works. It does not check the
genesis roots are the right ones — nothing on chain can.

## 5. Deploy

```bash
REGISTRY_ADDRESS=0x35b22e09Ee0390539439E24f06Da43D83f90e298 \
forge script script/deploy/DeployRollupForUpgradeV6.s.sol:DeployRollupForUpgradeV6 \
  --rpc-url $RPC --private-key $KEY --broadcast --verify -vvv
```

Record the logged addresses: `rollup`, `verifier`, `inbox`, `outbox`, `feeJuicePortal`, `slasher`,
`rewardBooster`, `escapeHatch`, `payload`, `newFlushRewarder`, `version`.

Re-run the checks against the deployed contracts at any time:

```bash
forge script ... --sig 'verify(address)' <rollup>
forge script ... --sig 'verifyFlushRewarder(address,address)' <rollup> <payload>
forge script script/deploy/V6UpgradeSimulation.sol:V6UpgradeSimulation \
  --sig 'simulate(address)' <payload> --rpc-url $RPC
```

Sanity-check by hand that the rollup is inert and correctly owned:

```bash
cast call <rollup> "owner()(address)"           --rpc-url $RPC  # governance
cast call <rollup> "getEscapeHatch()(address)"  --rpc-url $RPC  # ZERO until the payload executes
cast call <payload> "ESCAPE_HATCH()(address)"  --rpc-url $RPC  # the hatch it will install
cast call <rollup> "owner()(address)"          --rpc-url $RPC  # governance, from construction
cast call <rollup> "getVersion()(uint256)"      --rpc-url $RPC  # not already in the registry

# the payload is bound to the rollup it succeeds; must equal the OUTGOING rollup, not the new one
cast call <payload> "PREDECESSOR()(address)"    --rpc-url $RPC
cast call $REG "getCanonicalRollup()(address)"  --rpc-url $RPC
```

## 6. Governance proposal

Propose the **payload address**, not the rollup. `GovernanceProposer` wraps it in a `GSEPayload`
automatically. After proposing, read the exact timings off the proposal rather than assuming:

```bash
cast call <governance> "getProposal(uint256)" <id> --rpc-url $RPC
```

On mainnet the configured delays are long (voting delay, then voting duration, then execution
delay — on the order of weeks in total), so expect the proposal to sit before it is executable.

Before execution, re-run the `totalEarmarkedBalance` and `rewardsAvailable` checks from step 3 —
both can move while the proposal is pending, and `rewardsAvailable` is read at execution time.

### Before signalling or voting, check the payload is still live

The payload only authorises a transition **from** the rollup that was canonical when it was
deployed, and it refuses to execute once that is no longer true. Both halves are readable on-chain,
and both should be checked before anything is committed to:

```bash
# (a) the guard is actually in the action list — expect assertPredecessorIsCanonical first
cast call <payload> "getActions()((address,bytes)[])" --rpc-url $RPC

# (b) the rollup it is bound to is still canonical — these two must be equal
cast call <payload> "PREDECESSOR()(address)"         --rpc-url $RPC
cast call $REG "getCanonicalRollup()(address)"       --rpc-url $RPC
```

A registration payload without that guard is the hazard the guard exists to remove: registration is
append-only with last-write-wins and `execute` is permissionless, so an accepted-but-abandoned
payload can be executed by anyone later and demote whatever replaced it — permanently, since
neither the registry nor the GSE re-admits a rollup it already holds.

**The consequence, which is intended but worth stating.** Once *any* other registration executes,
this payload is dead: it can never execute, even if its proposal was accepted and is still inside
its grace period. Registering v6 then requires deploying a fresh payload — which picks up the new
canonical rollup as its `PREDECESSOR` — and taking it through the full governance cycle again. So a
patched replacement for a bad v6 is not a quick swap; budget the whole cycle for it.

## 7. After execution

```bash
cast call $REG "getCanonicalRollup()(address)"            --rpc-url $RPC  # the new rollup
cast call $RD  "canonicalRollup()(address)"               --rpc-url $RPC  # follows automatically
cast call <rollup> "getActiveAttesterCount()(uint256)"    --rpc-url $RPC  # inherits the bonus bucket
cast call $ROLLUP  "getActiveAttesterCount()(uint256)"    --rpc-url $RPC  # outgoing rollup, expect 0
cast call <newFlushRewarder> "rewardsAvailable()(uint256)" --rpc-url $RPC
```

The outgoing rollup dropping to **exactly 0** is expected, not a fault: every mainnet attester is
registered against the bonus instance (`moveWithLatestRollup = true`), and the bonus instance is
only visible to whichever rollup is currently canonical.

## Deliberately not done

- **Protocol fee recipient and margin.** The rollup launches with `protocolFeeMarginBps = 0` and
  `protocolFeeRecipient` set to a placeholder address. Both are `onlyOwner`, so they now require a
  governance proposal. **Set the recipient before, or in the same payload as, any non-zero
  margin** — otherwise the protocol fee tranche is transferred to an unrecoverable address on
  every claim. The first margin increase is exempt from the 30-day cooldown but capped at
  5000 bps by the ×3/2 step on the fee multiplier.
- **Reward distributor migration.** Not needed: the distributor resolves the canonical rollup live
  off the registry, so its implicit pool follows v6 the moment action 1 executes. This holds only
  while `totalEarmarkedBalance` is 0.
- **Registry address pinning.** `REGISTRY_ADDRESS` is an unvalidated env input. Everything else —
  fee asset, staking asset, GSE, governance, reward distributor — is derived from it, so a wrong
  registry silently changes all of them together. Double-check it on the command line.

## Do not renounce ownership of the outgoing rollup

Retired rollups have had ownership renounced in the past. Two things break if that is done here:

- the outgoing `FlushRewarder` keeps its unclaimed `debt` and must stay callable for
  `claimRewards()`;
- `updateStakingQueueConfig` is the only way to recover a rollup whose entry queue is wedged, and
  it is `onlyOwner`.

Mainnet's outgoing rollup is already `isBootstrapped = true`, so its queue still flushes at
1 validator/epoch from zero and it remains restartable. Renouncing ownership removes the fallback.
