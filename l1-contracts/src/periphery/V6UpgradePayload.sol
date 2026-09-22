// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";

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

  /// @notice The flush rewarder serving the outgoing rollup, or zero on a chain that has none.
  FlushRewarder public immutable OLD_FLUSH_REWARDER;

  /// @notice The replacement flush rewarder, deployed by this constructor and bound to {ROLLUP}.
  ///         Zero when {OLD_FLUSH_REWARDER} is zero.
  FlushRewarder public immutable NEW_FLUSH_REWARDER;

  /// @notice Whether execution is restricted to UK office hours. Set per chain by the deploy script.
  bool public immutable ENFORCE_EXECUTION_WINDOW;

  /// @notice Thrown when the supplied flush rewarder serves a rollup other than the outgoing one.
  error V6UpgradePayload__FlushRewarderRollupMismatch(address served, address outgoing);

  /// @notice Thrown when governance executes outside the permitted window.
  error V6UpgradePayload__OutsideExecutionWindow(uint256 timestamp);

  /// @notice Thrown when the rollup this payload was built to succeed is no longer canonical.
  error V6UpgradePayload__PredecessorNotCanonical(address expected, address actual);

  /**
   * @notice Binds the payload to the rollup it will make canonical, and deploys the replacement
   *         flush rewarder when there is an outgoing one to migrate.
   * @param _registry The registry to register the rollup in
   * @param _rollup The newly deployed rollup
   * @param _oldFlushRewarder The flush rewarder serving the outgoing rollup, or zero to skip the
   *        flush-incentive migration entirely
   * @param _enforceExecutionWindow Whether to restrict execution to UK office hours
   */
  constructor(IRegistry _registry, IInstance _rollup, FlushRewarder _oldFlushRewarder, bool _enforceExecutionWindow) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
    OLD_FLUSH_REWARDER = _oldFlushRewarder;
    ENFORCE_EXECUTION_WINDOW = _enforceExecutionWindow;

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

  /// @inheritdoc IPayload
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    bool migrateFlushRewarder = address(OLD_FLUSH_REWARDER) != address(0);
    uint256 next = 0;

    IPayload.Action[] memory res =
      new IPayload.Action[](1 + (ENFORCE_EXECUTION_WINDOW ? 1 : 0) + (migrateFlushRewarder ? 3 : 2));

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
