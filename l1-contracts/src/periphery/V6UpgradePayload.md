# V6UpgradePayload — what governance is being asked to approve

A single-use payload that makes the v6 rollup canonical, and nothing else. Deployed by
`script/deploy/DeployRollupForUpgradeV6.s.sol`; executed once, by governance, weeks later.

This is the reviewer's map. The contract's NatSpec carries the detail — this says what the payload
intends, what it guarantees, and what it deliberately leaves alone.

## The actions, in order

Governance runs each as `target.call(data)` from its own address, in this order, in one transaction.

| # | Action | Present when | Why |
|---|---|---|---|
| 1 | `this.assertPredecessorIsCanonical()` | always | this payload only authorises a transition **from** the rollup that was canonical when it was deployed |
| 2 | `this.assertWithinExecutionWindow()` | `ENFORCE_EXECUTION_WINDOW` | mainnet only: UK weekdays 08:00–17:00 London, so an upgrade is not executed unattended |
| 3 | `v6.setEscapeHatch(ESCAPE_HATCH)` | always | installs the escape hatch, before v6 is canonical |
| 4 | `Registry.addRollup(v6)` | always | makes v6 canonical |
| 5 | `GSE.addRollup(v6)` | always | existing attesters follow without withdrawing and redepositing |
| 6 | `oldFlushRewarder.recover(asset, newRewarder, rewardsAvailable())` | a rewarder exists | carries the entry-queue flush incentive to the replacement |

Four to six actions depending on chain. Sepolia has neither the window nor a rewarder.

## What it guarantees

- **Only the approved transition.** `PREDECESSOR` is read from the registry in the constructor and
  compared at execution. If any other registration lands first, this payload can never execute.
- **All or nothing.** `Governance.execute` requires success per action inside one transaction, so a
  failed check leaves *nothing* behind — not a registration, not a moved GSE, not a moved balance.
  This holds regardless of where in the list the failure happens.
- **It stays readable when it is dead.** Both checks are actions rather than reverts inside
  `getActions()`, so explorers, `GSEPayload.amIValid` and the deploy simulation can still read what
  the payload would do after it can no longer do it.
- **The deploy key holds no power over v6, at any point.** The rollup is constructed owned by
  governance rather than transferred afterwards. That matters beyond ownership: the same
  constructor argument becomes the Slasher's immutable `GOVERNANCE`, which can slash any attester
  with no vote and no delay, and `transferOwnership` cannot move it. Constructing with governance
  is what keeps it out of the deploy key's hands — at the cost of the escape hatch having to be
  installed here, by governance, rather than during the deploy.

## What it deliberately does not do

- **No reward-distributor migration.** The distributor resolves the canonical rollup live off the
  registry, so its implicit pool follows v6 the moment action 3 executes.
- **No protocol fee margin or recipient.** The rollup launches with margin `0` and a placeholder
  recipient. Both are `onlyOwner` and now need their own proposal. **Set the recipient before, or
  in the same payload as, any non-zero margin**, or the fee tranche goes to an unrecoverable
  address on every claim.
- **It does not retire the outgoing rollup.** Its ownership must NOT be renounced: the old
  `FlushRewarder` keeps unclaimed debt and must stay callable, and `updateStakingQueueConfig` is the
  only way to recover a wedged entry queue.

## What to check before signalling or voting

```bash
cast call <payload> "PREDECESSOR()(address)"        # must equal the CURRENT canonical rollup
cast call $REG "getCanonicalRollup()(address)"
cast call <payload> "getActions()((address,bytes)[])"  # guard must be present, and first
cast call <rollup> "owner()(address)"                  # governance, from construction
cast call <slasher> "GOVERNANCE()(address)"            # governance -- NOT the deploy key
```

A registration payload without that guard is the hazard the guard exists to remove.

## Known limits, stated rather than discovered

- **Once any other registration executes, this payload is dead.** Intended — voters re-approve
  "v6 succeeds X" explicitly rather than letting execution order decide — but it means a patched
  replacement needs a fresh deploy and a full governance cycle, not a quick swap.
- **`totalEarmarkedBalance` is not enforced on-chain.** A non-zero earmark at execution shrinks the
  implicit pool v6 inherits. It is recoverable by governance via `recoverFrom`, and it is *not*
  enforced here on purpose: `subsidizeAddress` is permissionless, so a 1-wei call from anyone would
  otherwise block the upgrade indefinitely. Check it before execution; treat it as an accounting
  surprise, not a lost-funds event.
- **The execution window hardcodes the UK DST rule.** Derived from the rule rather than tabulated,
  so it has no expiry — but it would be wrong if the rule itself changed.
- **`REGISTRY_ADDRESS` is an unvalidated deploy input.** Everything else is derived from it, so a
  wrong registry changes all of them together and silently.

## Where things are

| | |
|---|---|
| Contract | `src/periphery/V6UpgradePayload.sol` |
| Unit tests — actions, constructor, calendar | `test/periphery/V6UpgradePayload.t.sol` |
| Atomicity through real governance | `test/governance/scenario/V6UpgradeAtomicity.t.sol` |
| Deploy script and its config table | `script/deploy/DeployRollupForUpgradeV6.s.sol` |
| Config table deployed on both chains | `test/script/DeployRollupForUpgradeV6.t.sol` |
| Fork simulation of the full lifecycle | `script/deploy/V6UpgradeSimulation.sol` |
| How to run the upgrade | `script/deploy/V6_UPGRADE_RUNBOOK.md` |
