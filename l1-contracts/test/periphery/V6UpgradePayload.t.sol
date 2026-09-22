// SPDX-License-Identifier: UNLICENSED
// solhint-disable
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IHaveVersion, IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {V6UpgradePayload} from "@aztec/periphery/V6UpgradePayload.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestBase} from "@test/base/Base.sol";

/**
 * @dev Enough of a rollup for the payload: a version the registry can key on, and a GSE address the
 *      action list can target. Deliberately NOT a real Rollup -- these tests are about the payload's
 *      action list and its preconditions, and a real rollup would only add deploy cost and noise.
 */
contract StubRollup {
  address internal immutable GSE_ADDR;

  constructor(address _gse) {
    GSE_ADDR = _gse;
  }

  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }

  function getGSE() external view returns (GSE) {
    return GSE(GSE_ADDR);
  }
}

contract V6UpgradePayloadTest is TestBase {
  TestERC20 internal token;
  Registry internal registry;

  IInstance internal outgoing; // canonical when the payload is deployed
  IInstance internal incoming; // the rollup the payload makes canonical
  address internal gseAddr = address(0x65E);

  uint256 internal constant REWARD_PER_INSERTION = 1000e18;

  /// @dev Day index of 2026-11-01, the month the v6 upgrade is prepared in.
  uint256 internal constant FIRST_DAY = 20_758;

  /// @dev `isWithinExecutionWindow` is pure; this instance is only a host to call it on.
  V6UpgradePayload internal payloadForWindow;

  function setUp() public {
    token = new TestERC20("test", "TEST", address(this));
    // Owner is the test contract, standing in for governance: it lets the test register rollups
    // directly, which is what moves the canonical pointer the guard reads.
    registry = new Registry(address(this), IERC20(address(token)));

    outgoing = IInstance(address(new StubRollup(gseAddr)));
    incoming = IInstance(address(new StubRollup(gseAddr)));
    registry.addRollup(_haveVersion(outgoing));

    payloadForWindow = _deploy({_window: true, _withRewarder: false});
  }

  // ---------------------------------------------------------------------------------------------
  // Predecessor guard
  // ---------------------------------------------------------------------------------------------

  function test_PredecessorIsTheCanonicalRollupAtDeploy() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: false});
    assertEq(payload.PREDECESSOR(), address(outgoing), "predecessor is not the outgoing rollup");
    assertEq(payload.PREDECESSOR(), address(registry.getCanonicalRollup()), "predecessor is not canonical");
  }

  function test_GuardPassesWhilePredecessorIsStillCanonical() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: false});
    // Nothing has moved since deployment, so this must not revert. Called rather than asserted:
    // the guard's whole contract is "reverts, or does nothing".
    payload.assertPredecessorIsCanonical();
  }

  function test_GuardRevertsOnceAnotherRollupIsRegistered() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: false});

    // Someone else's registration lands first -- the abandoned-payload scenario.
    IInstance other = IInstance(address(new StubRollup(gseAddr)));
    registry.addRollup(_haveVersion(other));

    vm.expectRevert(
      abi.encodeWithSelector(
        V6UpgradePayload.V6UpgradePayload__PredecessorNotCanonical.selector, address(outgoing), address(other)
      )
    );
    payload.assertPredecessorIsCanonical();
  }

  /// @dev The whole point of the guard being an action rather than a revert inside `getActions`:
  ///      a payload that can no longer execute must still be able to say what it would have done.
  function test_GetActionsStaysReadableWhenStale() public {
    V6UpgradePayload payload = _deploy({_window: true, _withRewarder: true});

    IInstance other = IInstance(address(new StubRollup(gseAddr)));
    registry.addRollup(_haveVersion(other));

    IPayload.Action[] memory actions = payload.getActions();
    assertEq(actions.length, 5, "stale payload no longer describes itself");
    assertEq(bytes4(actions[0].data), payload.assertPredecessorIsCanonical.selector, "guard action lost");
  }

  function test_GuardActionIsFirstInEveryConfiguration() public {
    bool[2] memory windows = [true, false];
    bool[2] memory rewarders = [true, false];

    for (uint256 i = 0; i < windows.length; i++) {
      for (uint256 j = 0; j < rewarders.length; j++) {
        V6UpgradePayload payload = _deploy({_window: windows[i], _withRewarder: rewarders[j]});
        IPayload.Action[] memory actions = payload.getActions();
        assertEq(actions[0].target, address(payload), "guard is not self-targeted");
        assertEq(
          bytes4(actions[0].data), payload.assertPredecessorIsCanonical.selector, "guard is not the first action"
        );
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Action list: shape, order and arguments
  // ---------------------------------------------------------------------------------------------

  function test_ActionListShapeWindowAndRewarder() public {
    V6UpgradePayload payload = _deploy({_window: true, _withRewarder: true});
    IPayload.Action[] memory a = payload.getActions();
    assertEq(a.length, 5, "wrong action count");

    _assertGuard(a[0], payload);
    _assertWindow(a[1], payload);
    _assertAddRollup(a[2]);
    _assertGseAddRollup(a[3]);
    _assertRecover(a[4], payload);
  }

  function test_ActionListShapeWindowNoRewarder() public {
    V6UpgradePayload payload = _deploy({_window: true, _withRewarder: false});
    IPayload.Action[] memory a = payload.getActions();
    assertEq(a.length, 4, "wrong action count");

    _assertGuard(a[0], payload);
    _assertWindow(a[1], payload);
    _assertAddRollup(a[2]);
    _assertGseAddRollup(a[3]);
  }

  function test_ActionListShapeNoWindowWithRewarder() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: true});
    IPayload.Action[] memory a = payload.getActions();
    assertEq(a.length, 4, "wrong action count");

    _assertGuard(a[0], payload);
    _assertAddRollup(a[1]);
    _assertGseAddRollup(a[2]);
    _assertRecover(a[3], payload);
  }

  function test_ActionListShapeNoWindowNoRewarder() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: false});
    IPayload.Action[] memory a = payload.getActions();
    assertEq(a.length, 3, "wrong action count");

    _assertGuard(a[0], payload);
    _assertAddRollup(a[1]);
    _assertGseAddRollup(a[2]);
  }

  /// @dev `rewardsAvailable()` is read when the action list is built, not when the payload is
  ///      deployed, so a balance that moves during the governance delay moves the recovered amount.
  function test_RecoverAmountIsReadAtCallTime() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: true});
    FlushRewarder old = payload.OLD_FLUSH_REWARDER();

    IPayload.Action[] memory before = payload.getActions();
    (,, uint256 amountBefore) = _decodeRecover(before[3].data);

    token.mint(address(old), 500e18);

    IPayload.Action[] memory later = payload.getActions();
    (,, uint256 amountAfter) = _decodeRecover(later[3].data);

    assertEq(amountAfter, amountBefore + 500e18, "recover amount did not follow the balance");
    assertEq(amountAfter, old.rewardsAvailable(), "recover amount is not rewardsAvailable at call time");
  }

  // ---------------------------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------------------------

  function test_ConstructorRevertsWhenRewarderServesAnotherRollup() public {
    // A rewarder bound to the INCOMING rollup, not the outgoing one it claims to replace.
    FlushRewarder foreign = new FlushRewarder(address(this), incoming, IERC20(address(token)), REWARD_PER_INSERTION);

    vm.expectRevert(
      abi.encodeWithSelector(
        V6UpgradePayload.V6UpgradePayload__FlushRewarderRollupMismatch.selector, address(incoming), address(outgoing)
      )
    );
    new V6UpgradePayload(IRegistry(address(registry)), incoming, foreign, false);
  }

  function test_ConstructorRevertsAgainstAnEmptyRegistry() public {
    Registry empty = new Registry(address(this), IERC20(address(token)));
    vm.expectRevert(abi.encodeWithSelector(Errors.Registry__NoRollupsRegistered.selector));
    new V6UpgradePayload(IRegistry(address(empty)), incoming, FlushRewarder(address(0)), false);
  }

  function test_NewRewarderIsZeroWhenThereIsNoOldOne() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: false});
    assertEq(address(payload.NEW_FLUSH_REWARDER()), address(0), "deployed a rewarder with nothing to migrate");
  }

  function test_NewRewarderMirrorsTheOldOneAndFollowsTheNewRollup() public {
    V6UpgradePayload payload = _deploy({_window: false, _withRewarder: true});
    FlushRewarder old = payload.OLD_FLUSH_REWARDER();
    FlushRewarder fresh = payload.NEW_FLUSH_REWARDER();

    assertEq(address(fresh.REWARD_ASSET()), address(old.REWARD_ASSET()), "reward asset not mirrored");
    assertEq(fresh.rewardPerInsertion(), old.rewardPerInsertion(), "reward rate not mirrored");
    assertEq(address(fresh.ROLLUP()), address(incoming), "replacement is not bound to the new rollup");
    assertEq(fresh.owner(), registry.getGovernance(), "replacement is not owned by governance");
  }

  // ---------------------------------------------------------------------------------------------
  // Execution window
  //
  // The date math is hand-rolled -- no library, no tabulated DST table -- so it is checked against
  // the real IANA Europe/London calendar rather than against a reimplementation of itself. Every
  // vector below was generated from the tz database; a reimplementation in Solidity would only
  // reproduce whatever bug the contract has.
  // ---------------------------------------------------------------------------------------------

  function test_WindowMatchesTheRealLondonCalendar() public view {
    // Boundaries in GMT: 08:00 opens, 17:00 closes.
    _vec(1_799_654_340, false); // 2027-01-11 07:59 GMT Mon
    _vec(1_799_654_400, true); //  2027-01-11 08:00 GMT Mon
    _vec(1_800_032_340, true); //  2027-01-15 16:59 GMT Fri
    _vec(1_800_032_400, false); // 2027-01-15 17:00 GMT Fri

    // The same boundaries in BST, which are an hour earlier in UTC.
    _vec(1_815_375_540, false); // 2027-07-12 07:59 BST Mon
    _vec(1_815_375_600, true); //  2027-07-12 08:00 BST Mon
    _vec(1_815_753_540, true); //  2027-07-16 16:59 BST Fri
    _vec(1_815_753_600, false); // 2027-07-16 17:00 BST Fri

    // Weekends, whatever the hour.
    _vec(1_800_100_800, false); // 2027-01-16 12:00 GMT Sat
    _vec(1_800_187_200, false); // 2027-01-17 12:00 GMT Sun

    // Leap days, including one that lands on a weekend.
    _vec(1_835_420_400, false); // 2028-02-29 07:00 GMT Tue
    _vec(1_835_438_400, true); //  2028-02-29 12:00 GMT Tue
    _vec(1_961_668_800, false); // 2032-02-29 12:00 GMT Sun
    _vec(2_087_899_200, true); //  2036-02-29 12:00 GMT Fri

    // `_lastSundayOfMonth` at both extremes: the Monday after BST starts in a year where March's
    // last Sunday is the 25th, and in one where it is the 31st. The transition instant itself is
    // always a Sunday, so it is closed by the weekday rule either way -- the first observable
    // consequence of getting the offset wrong is on the Monday that follows.
    _vec(1_869_202_740, false); // 2029-03-26 07:59 BST Mon (BST began 25 Mar)
    _vec(1_869_202_800, true); //  2029-03-26 08:00 BST Mon
    _vec(1_901_257_140, false); // 2030-04-01 07:59 BST Mon (BST began 31 Mar)
    _vec(1_901_257_200, true); //  2030-04-01 08:00 BST Mon
    _vec(1_887_955_140, false); // 2029-10-29 07:59 GMT Mon (BST ended 28 Oct)
    _vec(1_887_955_200, true); //  2029-10-29 08:00 GMT Mon

    // The cliff date itself, for the upgrade this payload exists for.
    _vec(1_794_571_200, true); //  2026-11-13 12:00 GMT Fri
    _vec(1_794_589_200, false); // 2026-11-13 17:00 GMT Fri
    _vec(1_794_657_600, false); // 2026-11-14 12:00 GMT Sat
  }

  /// @dev A property the calendar must satisfy for every day in the payload's plausible life:
  ///      nine open hours on a weekday, none at a weekend. Verified independently against the tz
  ///      database across the same range, including every DST transition in it.
  ///
  ///      It constrains the SHAPE of the window, not its alignment: dropping the BST offset
  ///      entirely still leaves nine open hours a day, just an hour out, and this test still
  ///      passes. That mutation is caught by the vectors above, which is why both exist.
  function testFuzz_NineOpenHoursOnWeekdaysNoneAtWeekends(uint256 _day) public view {
    uint256 day = bound(_day, FIRST_DAY, FIRST_DAY + 6 * 365);

    uint256 open = 0;
    for (uint256 h = 0; h < 24; h++) {
      if (payloadForWindow.isWithinExecutionWindow(day * 1 days + h * 1 hours)) {
        open++;
      }
    }

    uint256 weekday = (day + 4) % 7;
    bool isWeekend = weekday == 0 || weekday == 6;
    assertEq(open, isWeekend ? 0 : 9, "wrong number of open hours in the day");
  }

  function test_AssertWithinExecutionWindowFollowsTheWindow() public {
    vm.warp(1_799_654_340); // Mon 07:59 GMT, one minute early
    vm.expectRevert(
      abi.encodeWithSelector(V6UpgradePayload.V6UpgradePayload__OutsideExecutionWindow.selector, block.timestamp)
    );
    payloadForWindow.assertWithinExecutionWindow();

    vm.warp(1_799_654_400); // Mon 08:00 GMT
    payloadForWindow.assertWithinExecutionWindow();
  }

  /// @dev The window is enforced only where the deploy script asks for it, but the predicate is
  ///      always readable -- so a chain without the window still answers the same question.
  function test_WindowNotEnforcedStillAnswersTheQuestion() public {
    V6UpgradePayload noWindow = _deploy({_window: false, _withRewarder: false});
    assertFalse(noWindow.ENFORCE_EXECUTION_WINDOW(), "window should be off");
    assertTrue(noWindow.isWithinExecutionWindow(1_799_654_400), "predicate should still work");

    IPayload.Action[] memory actions = noWindow.getActions();
    for (uint256 i = 0; i < actions.length; i++) {
      assertTrue(
        bytes4(actions[i].data) != noWindow.assertWithinExecutionWindow.selector, "window action should be absent"
      );
    }
  }

  function _vec(uint256 _timestamp, bool _expected) internal view {
    assertEq(payloadForWindow.isWithinExecutionWindow(_timestamp), _expected, vm.toString(_timestamp));
  }

  // ---------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------

  function _deploy(bool _window, bool _withRewarder) internal returns (V6UpgradePayload) {
    FlushRewarder old = _withRewarder
      ? new FlushRewarder(address(this), outgoing, IERC20(address(token)), REWARD_PER_INSERTION)
      : FlushRewarder(address(0));
    if (_withRewarder) {
      token.mint(address(old), 1000e18);
    }
    return new V6UpgradePayload(IRegistry(address(registry)), incoming, old, _window);
  }

  function _haveVersion(IInstance _rollup) internal pure returns (IHaveVersion) {
    return IHaveVersion(address(_rollup));
  }

  function _assertGuard(IPayload.Action memory _a, V6UpgradePayload _payload) internal view {
    assertEq(_a.target, address(_payload), "guard target");
    assertEq(bytes4(_a.data), _payload.assertPredecessorIsCanonical.selector, "guard selector");
    assertEq(_a.data.length, 4, "guard takes no arguments");
  }

  function _assertWindow(IPayload.Action memory _a, V6UpgradePayload _payload) internal view {
    assertEq(_a.target, address(_payload), "window target");
    assertEq(bytes4(_a.data), _payload.assertWithinExecutionWindow.selector, "window selector");
  }

  function _assertAddRollup(IPayload.Action memory _a) internal view {
    assertEq(_a.target, address(registry), "addRollup target");
    assertEq(bytes4(_a.data), IRegistry.addRollup.selector, "addRollup selector");
    assertEq(abi.decode(_slice4(_a.data), (address)), address(incoming), "addRollup argument");
  }

  function _assertGseAddRollup(IPayload.Action memory _a) internal view {
    assertEq(_a.target, gseAddr, "gse addRollup target");
    assertEq(bytes4(_a.data), IGSECore.addRollup.selector, "gse addRollup selector");
    assertEq(abi.decode(_slice4(_a.data), (address)), address(incoming), "gse addRollup argument");
  }

  function _assertRecover(IPayload.Action memory _a, V6UpgradePayload _payload) internal view {
    assertEq(_a.target, address(_payload.OLD_FLUSH_REWARDER()), "recover target");
    assertEq(bytes4(_a.data), FlushRewarder.recover.selector, "recover selector");
    (address asset, address to, uint256 amount) = _decodeRecover(_a.data);
    assertEq(asset, address(_payload.NEW_FLUSH_REWARDER().REWARD_ASSET()), "recover asset");
    assertEq(to, address(_payload.NEW_FLUSH_REWARDER()), "recover recipient");
    assertEq(amount, _payload.OLD_FLUSH_REWARDER().rewardsAvailable(), "recover amount");
  }

  function _decodeRecover(bytes memory _data) internal pure returns (address, address, uint256) {
    return abi.decode(_slice4(_data), (address, address, uint256));
  }

  /// @dev Everything after the 4-byte selector, so arguments can be decoded rather than eyeballed.
  function _slice4(bytes memory _data) internal pure returns (bytes memory) {
    bytes memory out = new bytes(_data.length - 4);
    for (uint256 i = 0; i < out.length; i++) {
      out[i] = _data[i + 4];
    }
    return out;
  }
}
