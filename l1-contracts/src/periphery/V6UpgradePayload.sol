// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Bps, MutableRewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

/**
 * @title V6UpgradePayload
 * @author Aztec Labs
 * @notice The payload governance executes to make the v6 rollup canonical.
 * @dev Governance executes each action as `target.call(data)` from its own address, in order, in a
 *      single transaction that reverts as a whole if any action fails. Every target below is
 *      `onlyOwner` and governance owns all of them, which is what makes this payload the only way
 *      to perform these steps.
 *
 *      Extend `getActions` to bundle further governance-gated calls (for example
 *      `setProtocolFeeRecipient` / `setProtocolFeeMargin`, which cannot be set any other way once
 *      the deploy script has handed rollup ownership to governance).
 */
contract V6UpgradePayload is IPayload {
  /// @notice London-local hour the window opens, inclusive.
  uint256 public constant WINDOW_OPEN_HOUR = 8;

  /// @notice London-local hour the window closes, exclusive.
  uint256 public constant WINDOW_CLOSE_HOUR = 17;

  /// @notice The registry that resolves the canonical rollup for the protocol.
  IRegistry public immutable REGISTRY;

  /// @notice The rollup being made canonical.
  IInstance public immutable ROLLUP;

  /// @notice The canonical rollup at deployment -- the one {ROLLUP} is built to succeed.
  /// @dev Public so it can be checked before signalling: a payload whose PREDECESSOR is no longer
  ///      canonical can never execute, and that is readable on-chain before any vote is committed.
  address public immutable PREDECESSOR;

  /// @notice The escape hatch this payload installs on {ROLLUP}.
  /// @dev Installed HERE rather than during the deploy. `setEscapeHatch` is `onlyOwner`, and the
  ///      rollup is constructed owned by governance -- because that same constructor argument also
  ///      becomes the Slasher's immutable GOVERNANCE, which can slash any attester with no vote.
  ///      Constructing with the deployer to do owner-gated setup would hand that power to the
  ///      deploy key permanently, and no later `transferOwnership` could take it back.
  address public immutable ESCAPE_HATCH;

  /// @notice The flush rewarder serving the outgoing rollup, or zero on a chain that has none.
  FlushRewarder public immutable OLD_FLUSH_REWARDER;

  /// @notice The replacement flush rewarder, deployed by this constructor and bound to {ROLLUP}.
  ///         Zero when {OLD_FLUSH_REWARDER} is zero.
  FlushRewarder public immutable NEW_FLUSH_REWARDER;

  /// @notice Whether execution is restricted to UK office hours. Set per chain by the deploy script.
  bool public immutable ENFORCE_EXECUTION_WINDOW;

  /// @notice The distributor holding the reward pool, read off the registry at construction.
  /// @dev Zero when {EARMARK_AMOUNT} is zero: a payload that reserves nothing has no business
  ///      requiring the chain to have a distributor at all.
  IRewardDistributor public immutable REWARD_DISTRIBUTOR;

  /// @notice The asset that distributor pays out, read off {ROLLUP} at construction.
  /// @dev Derived rather than configured: mainnet and Sepolia use different distributors and
  ///      different fee assets, and both follow from the registry and the rollup, so they cannot
  ///      drift from the chain the payload is actually pointed at.
  IERC20 public immutable REWARD_ASSET;

  /// @notice Reward-pool balance to reserve for {PREDECESSOR} before it stops being canonical.
  ///         Zero omits the reservation entirely.
  /// @dev The recipient is {PREDECESSOR} -- the OUTGOING rollup -- not {ROLLUP}. Earmarking to the
  ///      incoming rollup would be pointless: it becomes canonical and gains the whole implicit
  ///      pool regardless. The outgoing rollup is the one that loses implicit-pool access the
  ///      moment `Registry.addRollup` runs, because the distributor resolves `canonicalRollup()`
  ///      live off the registry, so anything it should keep has to be moved into its own earmarked
  ///      bucket first. Whatever is reserved here is subtracted from what {ROLLUP} can claim.
  uint256 public immutable EARMARK_AMOUNT;

  /// @notice Whether to retune {PREDECESSOR}'s reward split before it stops being canonical.
  bool public immutable RETUNE_PREDECESSOR_REWARDS;

  /// @notice The sequencer share, in basis points, to leave {PREDECESSOR} on.
  /// @dev Applies to the OUTGOING rollup only. {ROLLUP} keeps whatever the deploy script gave it.
  ///      A flag gates this rather than a sentinel value, because both zero and 10000 are
  ///      meaningful splits and neither can stand in for "leave it alone".
  uint16 public immutable PREDECESSOR_SEQUENCER_BPS;

  /// @notice The checkpoint reward to leave {PREDECESSOR} on.
  uint96 public immutable PREDECESSOR_CHECKPOINT_REWARD;

  /// @notice Thrown when the supplied flush rewarder serves a rollup other than the outgoing one.
  error V6UpgradePayload__FlushRewarderRollupMismatch(address served, address outgoing);

  /// @notice Thrown when governance executes outside the permitted window.
  error V6UpgradePayload__OutsideExecutionWindow(uint256 timestamp);

  /// @notice Thrown when the rollup this payload was built to succeed is no longer canonical.
  error V6UpgradePayload__PredecessorNotCanonical(address expected, address actual);

  /// @notice Thrown when the supplied escape hatch was built for a different rollup.
  error V6UpgradePayload__EscapeHatchRollupMismatch(address served, address expected);

  /**
   * @notice Binds the payload to the rollup it will make canonical, and deploys the replacement
   *         flush rewarder when there is an outgoing one to migrate.
   * @param _registry The registry to register the rollup in
   * @param _rollup The newly deployed rollup
   * @param _escapeHatch The escape hatch built for {_rollup}, installed by this payload
   * @param _oldFlushRewarder The flush rewarder serving the outgoing rollup, or zero to skip the
   *        flush-incentive migration entirely
   * @param _enforceExecutionWindow Whether to restrict execution to UK office hours
   * @param _earmarkAmount Reward-pool balance to reserve for the outgoing rollup, or zero for none
   * @param _retunePredecessorRewards Whether to rewrite the outgoing rollup's reward split
   * @param _predecessorSequencerBps The sequencer share to leave the outgoing rollup on
   * @param _predecessorCheckpointReward The checkpoint reward to leave the outgoing rollup on
   */
  constructor(
    IRegistry _registry,
    IInstance _rollup,
    IEscapeHatch _escapeHatch,
    FlushRewarder _oldFlushRewarder,
    bool _enforceExecutionWindow,
    uint256 _earmarkAmount,
    bool _retunePredecessorRewards,
    uint16 _predecessorSequencerBps,
    uint96 _predecessorCheckpointReward
  ) {
    REGISTRY = _registry;
    ROLLUP = _rollup;

    // The hatch names the rollup it was built for, and `setEscapeHatch` is one-shot, so a hatch
    // bound elsewhere would burn the only chance to install one.
    address hatchRollup = _escapeHatch.getRollup();
    require(hatchRollup == address(_rollup), V6UpgradePayload__EscapeHatchRollupMismatch(hatchRollup, address(_rollup)));
    ESCAPE_HATCH = address(_escapeHatch);
    OLD_FLUSH_REWARDER = _oldFlushRewarder;
    ENFORCE_EXECUTION_WINDOW = _enforceExecutionWindow;
    // Only reached for when the reservation is actually used, so a payload without one stays
    // constructible against a registry or rollup that does not answer these.
    EARMARK_AMOUNT = _earmarkAmount;
    REWARD_DISTRIBUTOR = _earmarkAmount > 0 ? _registry.getRewardDistributor() : IRewardDistributor(address(0));
    REWARD_ASSET = _earmarkAmount > 0 ? _rollup.getFeeAsset() : IERC20(address(0));
    RETUNE_PREDECESSOR_REWARDS = _retunePredecessorRewards;
    PREDECESSOR_SEQUENCER_BPS = _predecessorSequencerBps;
    PREDECESSOR_CHECKPOINT_REWARD = _predecessorCheckpointReward;

    // Read ONCE and bound as an immutable, so the rewarder check below and the execution-time
    // guard are talking about the same rollup by construction. Unconditional, so this reverts
    // with `Registry__NoRollupsRegistered` against an empty registry -- this payload succeeds a
    // rollup and cannot be used for a first registration.
    address outgoingRollup = address(_registry.getCanonicalRollup());
    PREDECESSOR = outgoingRollup;

    // Nothing on the rollup points back at its flush rewarder -- a FlushRewarder is a
    // permissionless wrapper around the permissionless `flushEntryQueue`, so a rollup may have
    // any number of them and knows about none. The address therefore has to be supplied, but it
    // can be checked: the rewarder names the rollup it serves, which must be the one being
    // replaced. This rejects a rewarder for a foreign or already-retired rollup.
    if (address(_oldFlushRewarder) != address(0)) {
      address servedRollup = address(_oldFlushRewarder.ROLLUP());
      require(
        servedRollup == outgoingRollup, V6UpgradePayload__FlushRewarderRollupMismatch(servedRollup, outgoingRollup)
      );
    }

    // A FlushRewarder's `ROLLUP` is immutable, so the incentive cannot follow the upgrade: the
    // replacement has to be a new contract. Asset and rate are mirrored off the outgoing one so
    // the incentive carries over unchanged, and governance owns it so it stays adjustable.
    NEW_FLUSH_REWARDER = address(_oldFlushRewarder) == address(0)
      ? FlushRewarder(address(0))
      : new FlushRewarder(
        _registry.getGovernance(), _rollup, _oldFlushRewarder.REWARD_ASSET(), _oldFlushRewarder.rewardPerInsertion()
      );
  }

  /// @notice Moves everything this payload holds into the distributor, reserved for {PREDECESSOR}.
  /// @dev Reads its own balance rather than taking an amount, so it cannot disagree with the
  ///      `recoverFrom` action that funds it. Permissionless by design: it can only ever push the
  ///      payload's own balance to one fixed recipient, and leaving it callable means a stray
  ///      transfer here is recoverable rather than stranded.
  // solhint-disable-next-line comprehensive-interface
  function forwardEarmark() external {
    uint256 amount = REWARD_ASSET.balanceOf(address(this));
    REWARD_ASSET.approve(address(REWARD_DISTRIBUTOR), amount);
    REWARD_DISTRIBUTOR.subsidizeAddress(PREDECESSOR, amount);
  }

  /// @inheritdoc IPayload
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    bool migrateFlushRewarder = address(OLD_FLUSH_REWARDER) != address(0);
    uint256 next = 0;

    bool earmark = EARMARK_AMOUNT > 0;

    // Always: predecessor guard, setEscapeHatch, Registry.addRollup, GSE.addRollup.
    IPayload.Action[] memory res = new IPayload
      .Action[](
      4 + (ENFORCE_EXECUTION_WINDOW ? 1 : 0) + (earmark ? 2 : 0) + (RETUNE_PREDECESSOR_REWARDS ? 1 : 0)
        + (migrateFlushRewarder ? 1 : 0)
    );

    // FIRST, before the window and before anything is written: this payload only authorises a
    // transition FROM the rollup that was canonical when it was deployed.
    //
    // Registration is append-only with last-write-wins, and `execute` is permissionless, so two
    // accepted registrations are a hazard: if this one is abandoned and a replacement executes
    // first, anyone could later execute this one and demote the replacement -- permanently, since
    // neither registry re-admits a rollup it already holds. Binding the predecessor makes a stale
    // payload inert instead: it reverts, the proposal stays Executable until it expires, and
    // nothing moves.
    //
    // Ahead of the window check deliberately. Both are non-mutating so the order is free, and of
    // the two failures "this payload must never run" is the one worth surfacing over "come back
    // on Monday".
    res[next++] =
      Action({target: address(this), data: abi.encodeWithSelector(this.assertPredecessorIsCanonical.selector)});

    // The window is enforced as its own action rather than inside `getActions` so that reading the
    // proposal stays possible at any time -- explorers, `GSEPayload.amIValid` and the deploy
    // script's simulation all call `getActions`, and a revert here would break them out of hours.
    // The same is true of the guard above, which is why it is an action too: a stale payload must
    // still be READABLE, so that what it would do stays inspectable after it can no longer do it.
    // Governance reverts the whole execution on any failed action and rolls back the Executed flag
    // with it, so a rejected attempt leaves the proposal executable again once the window opens.
    if (ENFORCE_EXECUTION_WINDOW) {
      res[next++] =
        Action({target: address(this), data: abi.encodeWithSelector(this.assertWithinExecutionWindow.selector)});
    }

    if (earmark) {
      // Reserves part of the reward pool for the OUTGOING rollup, and must run before
      // `Registry.addRollup` below. The distributor resolves `canonicalRollup()` live, so
      // {PREDECESSOR} can only reach the implicit (un-earmarked) pool while it is still canonical;
      // one action later that access is gone for good.
      //
      // Drawing FROM {PREDECESSOR} and earmarking back TO {PREDECESSOR} reads like a no-op and is
      // not: it converts pool access that is about to lapse into a balance that survives, because
      // `specificRecipientBalance` is keyed by address and is indifferent to which rollup is
      // canonical. The predecessor guard above is what makes the draw safe -- it has already
      // established that {PREDECESSOR} is canonical at this point.
      res[next++] = Action({
        target: address(REWARD_DISTRIBUTOR),
        data: abi.encodeWithSelector(
          IRewardDistributor.recoverFrom.selector, PREDECESSOR, address(this), EARMARK_AMOUNT
        )
      });

      // `subsidizeAddress` pulls via `transferFrom`, so it needs an allowance from the holder, and
      // governance can never grant one: `Governance.execute` refuses any action targeting the
      // asset. Routing through this contract is what makes the round trip possible at all.
      res[next++] = Action({target: address(this), data: abi.encodeWithSelector(this.forwardEarmark.selector)});
    }

    if (RETUNE_PREDECESSOR_REWARDS) {
      // Retunes the OUTGOING rollup's split, and must also land before `Registry.addRollup`: the
      // point is for it to be in force for whatever {PREDECESSOR} still settles on its way out.
      // {ROLLUP} is untouched and keeps the values it was constructed with.
      //
      // `setRewardConfig` has no cooldown and no step cap -- unlike `setProvingCostPerMana` and
      // `setProtocolFeeMargin`, which are both rate limited -- so this lands the moment the payload
      // executes. The split is read at PROOF time, so it also reaches checkpoints already proposed
      // under the old split but not yet proven.
      res[next++] = Action({
        target: PREDECESSOR,
        data: abi.encodeWithSelector(
          IRollupCore.setRewardConfig.selector,
          MutableRewardConfig({
            sequencerBps: Bps.wrap(PREDECESSOR_SEQUENCER_BPS), checkpointReward: PREDECESSOR_CHECKPOINT_REWARD
          })
        )
      });
    }

    // Installs the escape hatch, BEFORE the rollup becomes canonical. `setEscapeHatch` is
    // `onlyOwner` and one-shot, and governance has owned this rollup since construction -- see
    // {ESCAPE_HATCH} for why it is not owned by the deployer even briefly.
    res[next++] = Action({
      target: address(ROLLUP),
      data: abi.encodeWithSelector(IValidatorSelectionCore.setEscapeHatch.selector, ESCAPE_HATCH)
    });

    // Registers the rollup under its own version, making it the canonical rollup. Reverts if that
    // version is already registered.
    res[next++] =
      Action({target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(ROLLUP))});

    // Lets the GSE recognise the rollup as a valid instance, so existing attesters follow the
    // upgrade without withdrawing and redepositing their stake.
    res[next++] = Action({
      target: address(ROLLUP.getGSE()), data: abi.encodeWithSelector(IGSECore.addRollup.selector, address(ROLLUP))
    });

    if (migrateFlushRewarder) {
      // Moves the outgoing rewarder's unowed balance to the replacement. `recover` caps the
      // reward asset at `rewardsAvailable()` (balance minus rewards already accrued to flushers
      // who have not claimed), so the outgoing rewarder deliberately keeps that remainder and
      // must stay callable for `claimRewards`. Read at execution time, not at deploy time.
      res[next++] = Action({
        target: address(OLD_FLUSH_REWARDER),
        data: abi.encodeWithSelector(
          FlushRewarder.recover.selector,
          address(NEW_FLUSH_REWARDER.REWARD_ASSET()),
          address(NEW_FLUSH_REWARDER),
          OLD_FLUSH_REWARDER.rewardsAvailable()
        )
      });
    }

    return res;
  }

  /// @notice Reverts unless {PREDECESSOR} is still the canonical rollup.
  /// @dev Targeted by the first action. Voters can also call it directly before signalling to
  ///      confirm the payload is still live.
  // solhint-disable-next-line comprehensive-interface
  function assertPredecessorIsCanonical() external view {
    address canonical = address(REGISTRY.getCanonicalRollup());
    require(canonical == PREDECESSOR, V6UpgradePayload__PredecessorNotCanonical(PREDECESSOR, canonical));
  }

  /// @notice Reverts unless the current time is inside the permitted execution window.
  /// @dev Targeted by an action, after the predecessor guard, when {ENFORCE_EXECUTION_WINDOW} is set.
  // solhint-disable-next-line comprehensive-interface
  function assertWithinExecutionWindow() external view {
    require(isWithinExecutionWindow(block.timestamp), V6UpgradePayload__OutsideExecutionWindow(block.timestamp));
  }

  /// @inheritdoc IPayload
  function getURI() external pure override(IPayload) returns (string memory) {
    return "V6UpgradePayload";
  }

  /// @notice Whether `_timestamp` falls on a UK weekday between 08:00 (inclusive) and 17:00
  ///         (exclusive) London time.
  /// @dev Public so the window can be queried before proposing or executing.
  // solhint-disable-next-line comprehensive-interface
  function isWithinExecutionWindow(uint256 _timestamp) public pure returns (bool) {
    uint256 london = _timestamp + (_isBritishSummerTime(_timestamp) ? 1 hours : 0);

    // 1970-01-01 was a Thursday, so adding 4 puts Sunday at 0 and Saturday at 6.
    uint256 weekday = (london / 1 days + 4) % 7;
    if (weekday == 0 || weekday == 6) {
      return false;
    }

    uint256 hourOfDay = (london % 1 days) / 1 hours;
    return hourOfDay >= WINDOW_OPEN_HOUR && hourOfDay < WINDOW_CLOSE_HOUR;
  }

  /// @dev British Summer Time runs from 01:00 UTC on the last Sunday of March to 01:00 UTC on the
  ///      last Sunday of October. Derived rather than tabulated so the payload has no expiry date.
  function _isBritishSummerTime(uint256 _timestamp) private pure returns (bool) {
    uint256 year = _yearFromDays(_timestamp / 1 days);
    uint256 start = _lastSundayOfMonth(year, 3) * 1 days + 1 hours;
    uint256 end = _lastSundayOfMonth(year, 10) * 1 days + 1 hours;
    return _timestamp >= start && _timestamp < end;
  }

  /// @dev Days since the epoch of the last Sunday in `_month` of `_year`. Only used for March and
  ///      October, which both have 31 days, so the month length needs no lookup.
  function _lastSundayOfMonth(uint256 _year, uint256 _month) private pure returns (uint256) {
    uint256 lastDay = _daysFromCivil(_year, _month, 31);
    return lastDay - ((lastDay + 4) % 7);
  }

  /// @dev Days since 1970-01-01 for a proleptic Gregorian date. Howard Hinnant's `days_from_civil`,
  ///      valid for every date this contract can see.
  function _daysFromCivil(uint256 _year, uint256 _month, uint256 _day) private pure returns (uint256) {
    uint256 y = _year - (_month <= 2 ? 1 : 0);
    uint256 era = y / 400;
    uint256 yoe = y - era * 400;
    uint256 doy = (153 * (_month > 2 ? _month - 3 : _month + 9) + 2) / 5 + _day - 1;
    uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146_097 + doe - 719_468;
  }

  /// @dev Calendar year containing `_days` days since 1970-01-01. The inverse of {_daysFromCivil},
  ///      keeping only the year.
  function _yearFromDays(uint256 _days) private pure returns (uint256) {
    uint256 z = _days + 719_468;
    uint256 era = z / 146_097;
    uint256 doe = z - era * 146_097;
    uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    uint256 mp = (5 * doy + 2) / 153;
    return (mp < 10 ? mp + 3 : mp - 9) <= 2 ? yoe + era * 400 + 1 : yoe + era * 400;
  }
}
