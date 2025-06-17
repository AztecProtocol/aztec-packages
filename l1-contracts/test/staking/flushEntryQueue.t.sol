// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Status, AttesterView, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";

contract FlushEntryQueueTest is StakingBase {
  function test_GivenTheQueueHasAlreadyBeenFlushedThisEpoch() external {
    // it reverts

    // the first one should be okay
    staking.flushEntryQueue();

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__QueueAlreadyFlushed.selector,
        Epoch.wrap(block.timestamp / EPOCH_DURATION_SECONDS)
      )
    );
    staking.flushEntryQueue();
  }

  function test_GivenTheQueueHasNotBeenFlushedThisEpoch(uint256 _numValidators) external {
    // it dequeues up to the configured flush size
    // it calls deposit for each dequeued validator
    // it emits a {Deposit} event for each successful deposit
    // it emits a {FailedDeposit} event for each failed deposit
    // it refunds the withdrawer if the deposit fails
    GSE gse = staking.getGSE();

    uint256 flushSize = staking.getEntryQueueFlushSize();

    _numValidators = bound(_numValidators, 0, 2 * flushSize);

    for (uint256 i = 1; i <= _numValidators; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }

    assertEq(staking.getActiveAttesterCount(), 0, "depositors should not be active");
    assertEq(
      stakingAsset.balanceOf(address(staking)), _numValidators * DEPOSIT_AMOUNT, "invalid balance"
    );

    uint256 numDequeued = Math.min(flushSize, _numValidators);
    uint256 numStillInQueue = _numValidators - numDequeued;
    uint256 onCanonicalCount = 0;
    uint256 depositCount = 0;
    for (uint256 i = 1; i <= numDequeued; i++) {
      address attester = address(uint160(i * 2));
      address withdrawer = address(uint160(i * 2 + 1));
      bool onCanonical = i % 2 == 0;
      if (i == 1) {
        // mock that the first depositor fails
        vm.mockCallRevert(
          address(gse),
          abi.encodeWithSelector(IGSECore.deposit.selector, attester, withdrawer, false),
          bytes(string("something bad happened"))
        );
        vm.expectEmit(true, true, true, true);
        emit IStakingCore.FailedDeposit(attester, withdrawer);
      } else {
        if (onCanonical) {
          onCanonicalCount++;
        }
        depositCount++;
        vm.expectEmit(true, true, true, true);
        emit IStakingCore.Deposit(attester, withdrawer, DEPOSIT_AMOUNT);
      }
    }

    staking.flushEntryQueue();

    assertEq(stakingAsset.allowance(address(staking), address(gse)), 0, "invalid allowance");

    assertEq(staking.getActiveAttesterCount(), depositCount, "invalid active attester count");

    assertEq(
      stakingAsset.balanceOf(address(staking)),
      numStillInQueue * DEPOSIT_AMOUNT,
      "rollup should still have some balance"
    );

    assertEq(
      stakingAsset.balanceOf(address(staking.getGSE().getGovernance())),
      depositCount * DEPOSIT_AMOUNT,
      "governance should have received the deposits from successful deposits"
    );

    if (numDequeued > 1) {
      assertEq(
        stakingAsset.balanceOf(address(uint160(1 * 2 + 1))),
        DEPOSIT_AMOUNT,
        "withdrawer should have received the deposit"
      );
    }

    for (uint256 i = 1; i <= numDequeued; i++) {
      address attester = address(uint160(i * 2));
      address withdrawer = address(uint160(i * 2 + 1));
      AttesterView memory attesterView = staking.getAttesterView(attester);
      if (i == 1) {
        assertEq(attesterView.effectiveBalance, 0, "invalid effective balance");
        assertTrue(attesterView.status == Status.NONE, "invalid status");
      } else {
        attesterView = staking.getAttesterView(attester);
        assertEq(attesterView.effectiveBalance, DEPOSIT_AMOUNT, "invalid effective balance");
        assertEq(attesterView.config.withdrawer, withdrawer, "invalid withdrawer");
        assertTrue(attesterView.status == Status.VALIDATING, "invalid status");
      }
    }

    // Check the canonical set has the proper validators
    address canonicalMagicAddress = gse.CANONICAL_MAGIC_ADDRESS();
    address[] memory attestersOnCanonical =
      gse.getAttestersAtTime(canonicalMagicAddress, Timestamp.wrap(block.timestamp));
    assertEq(
      attestersOnCanonical.length, onCanonicalCount, "invalid number of attesters on canonical"
    );
    for (uint256 i = 0; i < attestersOnCanonical.length; i++) {
      assertEq(attestersOnCanonical[i], address(uint160((i + 1) * 4)), "invalid attester");
    }

    // Check the instance set has the proper validators
    address[] memory attestersOnInstance =
      gse.getAttestersAtTime(address(staking), Timestamp.wrap(block.timestamp));
    assertEq(attestersOnInstance.length, depositCount, "invalid number of attesters on instance");
    for (uint256 i = 0; i < attestersOnInstance.length - onCanonicalCount; i++) {
      // + 6 because the first validator is not on the instance
      assertEq(attestersOnInstance[i], address(uint160(i * 4 + 6)), "invalid attester");
    }
  }

  function _help_deposit(address _attester, address _withdrawer, bool _onCanonical) internal {
    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);
    uint256 balance = stakingAsset.balanceOf(address(staking));

    staking.deposit({_attester: _attester, _withdrawer: _withdrawer, _onCanonical: _onCanonical});

    assertEq(stakingAsset.balanceOf(address(staking)), balance + DEPOSIT_AMOUNT, "invalid balance");
  }
}
