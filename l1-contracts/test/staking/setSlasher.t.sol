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

    vm.prank(owner);
    staking.queueSetSlasher(_newSlasher);
    uint256 readyAt = block.timestamp + delay;

    vm.warp(block.timestamp + earlyOffset);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__SlasherNotReady.selector, Timestamp.wrap(readyAt)));
    vm.prank(owner);
    staking.finalizeSetSlasher();
  }

  function test_finalizeSetSlasher_appliesAfterDelay(address _newSlasher) external {
    address oldSlasher = staking.getSlasher();

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
