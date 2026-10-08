# v6 rollup upgrade runbook

How to deploy the v6 rollup and get it made canonical. Covers `DeployRollupForUpgradeV6.s.sol`,
`V6UpgradePayload.sol` and `V6UpgradeSimulation.sol`.

Reviewing the payload rather than running the upgrade? Start at
[`src/periphery/V6UpgradePayload.md`](../../src/periphery/V6UpgradePayload.md) — what it intends,
guarantees, and deliberately leaves alone.

## What this does

The deploy script deploys, in one broadcast:

1. `HonkVerifier` — the real epoch proof verifier, from the pinned `script/deploy/HonkVerifier.sol`
   (see [Build](#1-build)), not from this tree's `generated/`.
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
| 1 | `assertPredecessorIsCanonical()` | refuses to run if the rollup this payload succeeds is no longer canonical |
| 2 | `assertWithinExecutionWindow()` | mainnet only; Mon–Fri 08:00–17:00 London |
| 3 | `distributor.recoverFrom(v5, payload, amount)` | skipped when the reservation is zero |
| 4 | `payload.forwardEarmark()` | parks the drawn balance in v5's own earmarked bucket |
| 5 | `v5.setRewardConfig(...)` | retunes the OUTGOING rollup's split; skipped when the flag is off |
| 6 | `v6.setEscapeHatch(hatch)` | installs the hatch; `onlyOwner`, so only governance can |
| 7 | `Registry.addRollup(v6)` | makes v6 the canonical rollup |
| 8 | `GSE.addRollup(v6)` | lets existing attesters follow without redepositing |
| 9 | `oldFlushRewarder.recover(asset, newRewarder, rewardsAvailable())` | carries the entry-queue flush incentive across (skipped if there is no old rewarder) |
| 10 | `GSE.setProofOfPossessionGasLimit(300_000)` | raises the GSE's cap on BLS proof-of-possession verification from 250k; skipped when the configured value is zero |

Actions 3–5 all act on the **outgoing** rollup and must precede action 7. The distributor resolves
`canonicalRollup()` live off the registry, so once v6 is canonical the old rollup can no longer
reach the implicit pool, and the retune would be settling a chain that has already stopped.

Action 10 has no ordering constraint and goes last. The GSE verifies each new attester's proof of
possession in a sub-call capped at this much gas, and a deposit whose verification does not fit is
refunded and dropped from the entry queue. The cost varies per key, and since Osaka's modexp
repricing about 1 in 28.6k honestly generated keys exceed 250k; at 300k it is about 1 in 2.5M. The
cost of the raise is that a failing entry can burn at most 50k more gas in a flush. The GSE is
shared, so the new cap applies to the outgoing rollup too, from the moment the payload executes.

## 1. Build

The verifier and the protocol constants are **pinned in git**, not built from this tree:

- `script/deploy/HonkVerifier.sol` — the epoch proof verifier from the v6 release build at
  `42fae4eb3feb5a493f2e8a2baf78b4716e323c40`; its provenance comment names that commit.
  `DeployRollupForUpgradeV6.s.sol` imports it as `./HonkVerifier.sol`.
- `src/core/libraries/ConstantsGen.sol` — from the same build.

The verifier is a function of the protocol circuits, and the circuits this branch would build
differ from the release's. A verifier built here has a different `VK_HASH` and rejects every proof
the v6 nodes produce, so **do not replace the pinned file with this tree's `generated/HonkVerifier.sol`**.
The verifier, `ConstantsGen.sol` and the three genesis roots in `_config()` come from one build and
move together.

No noir-projects bootstrap is needed. From a clean clone:

```bash
git clone --branch <release branch> --depth 1 https://github.com/AztecProtocol/aztec-packages.git
cd aztec-packages
git submodule update --init --recursive --depth 1 -- l1-contracts/lib
cd l1-contracts
export FOUNDRY_SOLC_VERSION=0.8.30
forge script script/deploy/DeployRollupForUpgradeV6.s.sol --sig 'run()' \
  --rpc-url $RPC     # dry run; see Deploy for the broadcast flags
```

- `FOUNDRY_SOLC_VERSION=0.8.30`: `foundry.toml` points `solc` at `./solc-0.8.30`, which only
  `./bootstrap.sh` fetches; forge downloads the same binary (`0.8.30+commit.73712a01`). Use the
  environment variable rather than `--use 0.8.30`: the flag covers compilation but not `--verify`,
  which reads `foundry.toml` again and fails with `solc ./solc-0.8.30 does not exist`.
- The submodule step is required: `forge script` does not fetch `lib/` (only `forge build` does).
- Gas: forge sets each transaction's gas limit from its local simulation (`evm_version = 'prague'`),
  which matches pre-Glamsterdam pricing, so the default limits are correct on mainnet before the
  fork. Measured pre-fork on Sepolia: verifier 3.75M gas (limit 4.88M), rollup 11.98M (limit
  15.58M). Do **not** add `--gas-estimate-multiplier` before Glamsterdam: the rollup's limit would
  exceed the EIP-7825 per-transaction cap of 16,777,216 and the node would reject it after the
  verifier had already been sent. The rollup's default limit sits about 1.2M under that cap.
- After Glamsterdam, the default limits are far too low: on post-fork Sepolia the verifier creation
  ran out of gas at its 4.88M limit. Measured there: verifier 26.7M, rollup 84.8M, escape hatch
  14.9M, payload 10.1M gas, deployed with `--gas-estimate-multiplier 1000` under a 200M block gas
  limit. Re-check that path against mainnet's post-fork rules before using it.

> Run `forge script` on the deploy script, **not** `forge build`. A whole-project build also compiles
> `DeployRollupLib.sol`, which imports `@generated/HonkVerifier.sol` and fails on a clean clone.
> Do **not** hand-write a stub `generated/HonkVerifier.sol` to get past that: a stub compiles and
> deploys a verifier that accepts every proof.

Confirm the pin before broadcasting:

```bash
grep -m1 VK_HASH script/deploy/HonkVerifier.sol
# 0x1fd4eb1d14be45e05dc78c448eb4f29d7f63e4de95129c4a5e1058cd9837f8a6
```

## 2. Fill in the inputs

All configuration is the `_config()` literal in `DeployRollupForUpgradeV6.s.sol`. Before a real
deploy these must be set:

| Field | Status | Notes |
|---|---|---|
| `vkTreeRoot` | set | `0x22fff5de…5913f219`, from the v6 release build at `42fae4eb`; see below |
| `protocolContractsHash` | set | `0x0f54271c…5c9854d7`, same build |
| `genesisArchiveRoot` | set | `0x29eb2c52…3d41e5c4`, same build. Must be below the BN254 scalar field modulus |
| `initialEthPerFeeAsset` | set | mainnet `5_934_240` (0.0000059342 ETH per AZTEC, from the AZTEC/ETH Uniswap v4 pool at block 26148995, 2026-10-08); Sepolia `10_000_000`. E12 ETH-per-fee-asset price |
| `sequencerRewardCalculator` | set | `address(0)` on both chains — v6 launches with no calculator, see below |
| `oldFlushRewarder` | set (mainnet) | `0x5B98cA4dcE7b59CCf241D12f81d3d2eCF14e410e`; zero on Sepolia |
| `earmarkAmountForPredecessor` | set | mainnet 1,800,000e18; Sepolia 5,000,000e18. Zero would omit both earmark actions |
| `retunePredecessorRewards` | set | `true` on both chains |
| `predecessorSequencerBps` | set | mainnet 7000 (v5 keeps the split it already runs); Sepolia 8000 |
| `predecessorCheckpointReward` | set | mainnet 50e18; Sepolia 100e18. Both down from the 500e18 v5 runs on |
| `enforcePayloadExecutionWindow` | set | `true` on mainnet, `false` on Sepolia |
| `proofOfPossessionGasLimit` | set | `300_000` on both chains; zero omits the action. The payload constructor reverts unless it exceeds the GSE's cap at deployment |

Neither chain has outstanding values. The three genesis values are not decisions but build outputs,
pinned with the verifier.

`run()` refuses to proceed while any of the three genesis roots is zero, so a forgotten root fails
loudly. A *stale* root does not: it is non-zero and deploys happily. Nothing guards the rest either
— `initialEthPerFeeAsset` deploys silently at whatever value is in the table.

### Sequencer reward policy

Under AZIP-31 the rollup can call a governance-set `ISequencerRewardCalculator` once per epoch
proof, and `sequencerRewardCalculator` is the address it starts with.

**v6 launches with `address(0)` on both chains, so every proposer earns the default sequencer
share.** Installing a calculator later is a governance action, `setSequencerRewardCalculator`, and
needs no redeploy.

Nothing about the calculator path is loud, so if a later deploy does set one:

- A calculator that reverts, exhausts its stipend (`200k + 100k` per checkpoint), or answers in the
  wrong shape causes every checkpoint to fall back to the default reward. There is no revert and no
  event; the rollup simply pays as though no calculator were configured.
- Nothing at deploy time checks the address is a calculator, or a contract at all. A
  wrong-but-plausible address has the same observable result as `address(0)`.
- Reward values are capped at read time at `min(default, entry)`, so a too-high entry cannot pay
  anyone more than the default. Note this cap is now applied on read rather than at construction,
  so lowering `sequencerBps` or `checkpointReward` later tightens existing entries automatically.

Read the value back with `getSequencerRewardCalculator()` after the deploy. Unlike the rest of this
table it is mutable after construction, so it is worth re-checking after any governance action that
touches rewards.

The three genesis values are produced by the protocol circuits / node build, not by anything in
`l1-contracts`. Get them from the same source the v6 release uses; do not carry v5's forward.

The values in `_config()` were read off a full build (`make fast`) of the v6 release at
`42fae4eb3feb5a493f2e8a2baf78b4716e323c40`, the same build the pinned verifier and
`ConstantsGen.sol` come from:

| Field | Value |
|---|---|
| `vkTreeRoot` | `0x22fff5de6ce590153df4468f7f0b152188a803d91b3c9c648b91d93d5913f219` |
| `protocolContractsHash` | `0x0f54271c52865841a77aaa66036eed901aff22fdce9f08e123ec8b205c9854d7` |
| `genesisArchiveRoot` | `0x29eb2c527f8d45276430363214e6c8d709ef3f657a3670ebac3179373d41e5c4` |
| verifier `VK_HASH` | `0x1fd4eb1d14be45e05dc78c448eb4f29d7f63e4de95129c4a5e1058cd9837f8a6` |

All three moved when the release build advanced to `42fae4eb`, which changes protocol circuit
sources, including `types/src/address/aztec_address.nr` and `types/src/constants.nr`. The verifier
did not: `VK_HASH` is unchanged and the pinned file only gained a new provenance comment. It still
differs from the verifier this branch's own circuits build, which is what the pin exists for.

Regenerate all of them, and re-pin the verifier and `ConstantsGen.sol`, if the release build moves
to a commit that changes the protocol circuits or protocol contracts: rebuilding the circuits moves
`vkTreeRoot` and the verifier, and rebuilding the protocol contracts moves all three roots. After
`make fast` on the release build, the first two come from the built packages and the third from the
protocol constants:

```bash
# from labs/yarn-project/prover-node
node --input-type=module -e '
import { getVKTreeRoot } from "@aztec-labs/noir-protocol-circuits-types/vk-tree";
import { protocolContractsHash } from "@aztec-labs/protocol-contracts";
console.log(getVKTreeRoot().toString(), protocolContractsHash.toString());'

grep -A1 GENESIS_ARCHIVE_ROOT \
  noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr
```

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
cast call $GSE "proofOfPossessionGasLimit()(uint64)" --rpc-url $RPC  # expect 250000, below the configured 300000
cast call $GSE "owner()(address)"                --rpc-url $RPC   # governance, or action 10 reverts
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
export FOUNDRY_SOLC_VERSION=0.8.30
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
export FOUNDRY_SOLC_VERSION=0.8.30 ETHERSCAN_API_KEY=<key>
REGISTRY_ADDRESS=0x35b22e09Ee0390539439E24f06Da43D83f90e298 \
forge script script/deploy/DeployRollupForUpgradeV6.s.sol:DeployRollupForUpgradeV6 \
  --slow \
  --rpc-url $RPC --private-key $KEY --broadcast --verify -vvv
```

`--slow` sends each transaction only after the previous one is mined, so a failure stops the
broadcast instead of leaving later transactions pending against a contract that does not exist.

`--verify` submits every contract the broadcast created to Etherscan, including the seven the
`Rollup` constructor deploys (`Slasher`, `SlashingProposer`, `SlashPayloadCloneable`,
`RewardBooster`, `Inbox`, `FeeJuicePortal`, `Outbox`). If verification fails or is skipped, re-run it
from the same checkout without sending anything: the same command with `--broadcast` replaced by
`--resume`. The verified `HonkVerifier` source is the pinned file, so anyone can read its `VK_HASH`
on Etherscan.

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

# the proof-of-possession gas cap the payload will set on the GSE
cast call <payload> "PROOF_OF_POSSESSION_GAS_LIMIT()(uint64)" --rpc-url $RPC  # 300000
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
both can move while the proposal is pending, and `rewardsAvailable` is read at execution time. So
is the earmark amount's headroom: `subsidizeAddress` is permissionless, so anyone can raise
`totalEarmarkedBalance` and shrink the implicit pool the reservation draws from.

### Executing on mainnet: office hours only

The mainnet payload will only execute **Monday to Friday, 08:00–17:00 London**, DST included —
08:00–17:00 UTC in winter, 07:00–16:00 UTC in summer. Outside that the first action reverts and
the whole execution rolls back, including the `Executed` flag, so the proposal stays executable and
can simply be retried when the window next opens. Nothing is consumed by a rejected attempt.

Check before sending, rather than discovering it from a revert:

```bash
# true when the window is open right now
cast call <payload> "isWithinExecutionWindow(uint256)(bool)" $(date +%s) --rpc-url $RPC

# and confirm the chain agrees the restriction applies
cast call <payload> "ENFORCE_EXECUTION_WINDOW()(bool)" --rpc-url $RPC
```

The longest closed stretch is Friday 17:00 to Monday 08:00, well inside the grace period, so the
window cannot strand a proposal on its own. Sepolia is unrestricted.

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

# the reservation: total distributor balance UNCHANGED, the amount moved between buckets
cast call $TOKEN "balanceOf(address)(uint256)" $RD              --rpc-url $RPC  # same as before
cast call $RD "totalEarmarkedBalance()(uint256)"               --rpc-url $RPC  # up by the amount
cast call $RD "specificRecipientBalance(address)(uint256)" $ROLLUP --rpc-url $RPC  # up by the amount
cast call <payload> "..."  # payload holds none of the asset

# the retune, read off the OUTGOING rollup
cast call $ROLLUP "getRewardConfig()" --rpc-url $RPC

# the proof-of-possession gas cap, shared by every rollup on the GSE
cast call $GSE "proofOfPossessionGasLimit()(uint64)" --rpc-url $RPC  # 300000
```

The distributor's **total balance not moving** is the check that matters for the reservation: the
funds change bucket, they do not leave. If the total fell, something claimed rather than earmarked.

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
