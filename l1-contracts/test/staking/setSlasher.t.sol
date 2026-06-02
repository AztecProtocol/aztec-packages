// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStakingCore, Timestamp} from "@aztec/core/interfaces/IStaking.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract SetSlasherTest is StakingBase {
  function _owner() internal view returns (address) {
    return Ownable(address(staking)).owner();
  }

  function _delay() internal view returns (uint256) {
    return staking.getSlasherExecutionDelay();
  }

  /// @dev Make `_slasher` look like a real Slasher whose proposer is already initialized so
  ///      queueSetSlasher accepts it. Tests that want to exercise the uninitialized-slasher
  ///      guard call queueSetSlasher directly without mocking.
  function _mockInitializedSlasher(address _slasher) internal {
    // Foundry intercepts every call to the console address and dispatches it to its console
    // handler, which bypasses vm.mockCall. A fuzzed slasher equal to that address therefore makes
    // the PROPOSER() lookup revert with "unknown selector for ConsoleCalls" instead of returning
    // the mocked value, so exclude the reserved forge addresses.
    assumeNotForgeAddress(_slasher);
    vm.mockCall(_slasher, abi.encodeWithSignature("PROPOSER()"), abi.encode(address(0xBEEF)));
  }

  function test_queueSetSlasher_whenNotOwner(address _caller) external {
    vm.assume(_caller != _owner());
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    staking.queueSetSlasher(address(1));
  }

  function test_cancelSetSlasher_whenNotOwner(address _caller) external {
    vm.assume(_caller != _owner());
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    staking.cancelSetSlasher();
  }

  function test_finalizeSetSlasher_callableByAnyone(address _caller, address _newSlasher) external {
    address oldSlasher = staking.getSlasher();

    _mockInitializedSlasher(_newSlasher);
    vm.prank(_owner());
    staking.queueSetSlasher(_newSlasher);

    vm.warp(block.timestamp + _delay());

    vm.expectEmit(true, true, true, true);
    emit IStakingCore.SlasherUpdated(oldSlasher, _newSlasher);
    vm.prank(_caller);
    staking.finalizeSetSlasher();

    assertEq(staking.getSlasher(), _newSlasher, "finalize must be permissionless");
  }

  function test_queueSetSlasher_emitsEventAndRecordsPending(address _newSlasher) external {
    uint256 readyAt = block.timestamp + _delay();

    _mockInitializedSlasher(_newSlasher);
    vm.expectEmit(true, true, true, true);
    emit IStakingCore.PendingSlasherQueued(_newSlasher, readyAt);

    vm.prank(_owner());
    staking.queueSetSlasher(_newSlasher);

    (address pending, Timestamp pendingReadyAt) = staking.getPendingSlasher();
    assertEq(pending, _newSlasher, "pending slasher mismatch");
    assertEq(Timestamp.unwrap(pendingReadyAt), readyAt, "ready at mismatch");
    assertEq(staking.getSlasher(), SLASHER, "active slasher must not change before finalize");
  }

  function test_queueSetSlasher_overwritesExistingPending(address _first, address _second) external {
    vm.assume(_first != _second);

    _mockInitializedSlasher(_first);
    _mockInitializedSlasher(_second);
    vm.prank(_owner());
    staking.queueSetSlasher(_first);

    vm.warp(block.timestamp + 1 days);
    uint256 expectedReadyAt = block.timestamp + _delay();

    vm.expectEmit(true, true, true, true);
    emit IStakingCore.PendingSlasherQueued(_second, expectedReadyAt);
    vm.prank(_owner());
    staking.queueSetSlasher(_second);

    (address pending, Timestamp pendingReadyAt) = staking.getPendingSlasher();
    assertEq(pending, _second);
    assertEq(Timestamp.unwrap(pendingReadyAt), expectedReadyAt);
  }

  function test_cancelSetSlasher_clearsPending(address _newSlasher) external {
    _mockInitializedSlasher(_newSlasher);
    vm.prank(_owner());
    staking.queueSetSlasher(_newSlasher);

    vm.expectEmit(true, true, true, true);
    emit IStakingCore.PendingSlasherCancelled(_newSlasher);
    vm.prank(_owner());
    staking.cancelSetSlasher();

    (address pending, Timestamp readyAt) = staking.getPendingSlasher();
    assertEq(pending, address(0));
    assertEq(Timestamp.unwrap(readyAt), 0);
  }

  function test_cancelSetSlasher_revertsIfNothingPending() external {
    address owner = _owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NoPendingSlasher.selector));
    vm.prank(owner);
    staking.cancelSetSlasher();
  }

  function test_finalizeSetSlasher_revertsIfNothingPending() external {
    address owner = _owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NoPendingSlasher.selector));
    vm.prank(owner);
    staking.finalizeSetSlasher();
  }

  function test_finalizeSetSlasher_revertsBeforeReady(address _newSlasher, uint256 _earlyOffset) external {
    uint256 delay = _delay();
    uint256 earlyOffset = bound(_earlyOffset, 0, delay - 1);
    address owner = _owner();

    _mockInitializedSlasher(_newSlasher);
    vm.prank(owner);
    staking.queueSetSlasher(_newSlasher);
    uint256 readyAt = block.timestamp + delay;

    vm.warp(block.timestamp + earlyOffset);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__SlasherNotReady.selector, Timestamp.wrap(readyAt)));
    vm.prank(owner);
    staking.finalizeSetSlasher();
  }

  function test_queueSetSlasher_revertsWhenProposerUnset(address _newSlasher) external {
    // PROPOSER returns address(0) -- the uninitialized state. Queueing must reject because
    // Slasher.initializeProposer is permissionless and an attacker could claim the proposer
    // role during the 60-day delay.
    address owner = _owner(); // cache before expectRevert to avoid consuming it
    assumeNotForgeAddress(_newSlasher);
    vm.mockCall(_newSlasher, abi.encodeWithSignature("PROPOSER()"), abi.encode(address(0)));

    vm.prank(owner);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__SlasherProposerNotInitialized.selector, _newSlasher));
    staking.queueSetSlasher(_newSlasher);
  }

  function test_finalizeSetSlasher_revertsIfProposerWentToZero(address _newSlasher) external {
    // Queue with a wired proposer, then drop the proposer to zero just before finalize. The
    // defense-in-depth guard in finalizeSetSlasher must catch this and refuse to install the
    // replacement slasher.
    address owner = _owner();
    uint256 delay = _delay();

    _mockInitializedSlasher(_newSlasher);
    vm.prank(owner);
    staking.queueSetSlasher(_newSlasher);

    vm.warp(block.timestamp + delay);

    vm.mockCall(_newSlasher, abi.encodeWithSignature("PROPOSER()"), abi.encode(address(0)));

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__SlasherProposerNotInitialized.selector, _newSlasher));
    staking.finalizeSetSlasher();
  }

  function test_finalizeSetSlasher_appliesAfterDelay(address _newSlasher) external {
    address oldSlasher = staking.getSlasher();

    _mockInitializedSlasher(_newSlasher);
    vm.prank(_owner());
    staking.queueSetSlasher(_newSlasher);

    vm.warp(block.timestamp + _delay());

    vm.expectEmit(true, true, true, true);
    emit IStakingCore.SlasherUpdated(oldSlasher, _newSlasher);
    vm.prank(_owner());
    staking.finalizeSetSlasher();

    assertEq(staking.getSlasher(), _newSlasher, "slasher not applied");

    (address pending, Timestamp readyAt) = staking.getPendingSlasher();
    assertEq(pending, address(0), "pending not cleared");
    assertEq(Timestamp.unwrap(readyAt), 0, "readyAt not cleared");
  }
}
