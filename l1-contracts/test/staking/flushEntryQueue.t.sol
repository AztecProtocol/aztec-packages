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
import {StakingQueueConfig, StakingQueueLib} from "@aztec/core/libraries/StakingQueue.sol";
import {Rollup} from "@aztec/core/Rollup.sol";

contract FlushEntryQueueTest is StakingBase {
  function test_GivenTheQueueHasAlreadyBeenFlushedThisEpoch() external {
    // it reverts

    // the first one should be okay
    _help_deposit(address(uint160(1)), address(uint160(2)), true);
    staking.flushEntryQueue();

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__QueueAlreadyFlushed.selector,
        Epoch.wrap(block.timestamp / EPOCH_DURATION_SECONDS)
      )
    );
    staking.flushEntryQueue();
  }

  function _setupQueueConfig(
    uint256 _bootstrapValidatorSetSize,
    uint256 _bootstrapFlushSize,
    uint256 _normalFlushSizeMin,
    uint256 _normalFlushSizeQuotient
  ) internal {
    StakingQueueConfig memory stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: _bootstrapValidatorSetSize,
      bootstrapFlushSize: _bootstrapFlushSize,
      normalFlushSizeMin: _normalFlushSizeMin,
      normalFlushSizeQuotient: _normalFlushSizeQuotient
    });
    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    rollup.updateStakingQueueConfig(stakingQueueConfig);
  }

  modifier givenTheRollupHasNoValidators() {
    // the rollup has no validators by default
    _;
  }

  /// forge-config: default.fuzz.runs = 16
  function test_GivenTheQueueHasFewerValidatorsThanTheBootstrapValidatorSetSize(
    uint256 _numValidators,
    uint256 _bootstrapValidatorSetSize,
    uint256 _bootstrapFlushSize,
    uint256 _normalFlushSizeMin,
    uint256 _normalFlushSizeQuotient
  ) external {
    // it does nothing

    _bootstrapValidatorSetSize = bound(_bootstrapValidatorSetSize, 1, 1000);
    _numValidators = bound(_numValidators, 0, _bootstrapValidatorSetSize - 1);
    _bootstrapFlushSize = bound(_bootstrapFlushSize, 1, StakingQueueLib.MAX_QUEUE_FLUSH_SIZE);

    _setupQueueConfig(
      _bootstrapValidatorSetSize, _bootstrapFlushSize, _normalFlushSizeMin, _normalFlushSizeQuotient
    );

    for (uint256 i = 1; i <= _numValidators; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }

    vm.record();
    assertEq(staking.getEntryQueueFlushSize(), 0, "invalid flush size");
    staking.flushEntryQueue();
    (, bytes32[] memory writes) = vm.accesses(address(staking));
    assertEq(writes.length, 0, "writes");
  }

  /// forge-config: default.fuzz.runs = 16
  function test_GivenTheQueueHasAtLeastTheBootstrapValidatorSetSize(
    uint256 _numValidators,
    uint256 _bootstrapValidatorSetSize,
    uint256 _bootstrapFlushSize,
    uint256 _normalFlushSizeMin,
    uint256 _normalFlushSizeQuotient
  ) external givenTheRollupHasNoValidators {
    // it dequeues the bootstrap flush size
    // it calls deposit for each dequeued validator
    // it emits a {Deposit} event for each successful deposit
    // it emits a {FailedDeposit} event for each failed deposit
    // it refunds the withdrawer if the deposit fails

    _bootstrapValidatorSetSize = bound(_bootstrapValidatorSetSize, 1, 1000);
    _numValidators =
      bound(_numValidators, _bootstrapValidatorSetSize, _bootstrapValidatorSetSize * 2);
    _bootstrapFlushSize = bound(_bootstrapFlushSize, 1, _bootstrapValidatorSetSize * 2);
    uint256 effectiveFlushSize = Math.min(_bootstrapFlushSize, StakingQueueLib.MAX_QUEUE_FLUSH_SIZE);

    _setupQueueConfig(
      _bootstrapValidatorSetSize, _bootstrapFlushSize, _normalFlushSizeMin, _normalFlushSizeQuotient
    );

    _help_flushEntryQueue(_numValidators, effectiveFlushSize);
  }

  /// forge-config: default.fuzz.runs = 16
  function test_GivenTheRollupHasLessThanTheTargetValidatorSetSize(
    uint256 _bootstrapValidatorSetSize,
    uint256 _bootstrapFlushSize,
    uint256 _normalFlushSizeMin,
    uint256 _normalFlushSizeQuotient
  ) external {
    // it dequeues the bootstrap flush size
    // it calls deposit for each dequeued validator
    // it emits a {Deposit} event for each successful deposit
    // it emits a {FailedDeposit} event for each failed deposit
    // it refunds the withdrawer if the deposit fails

    _bootstrapValidatorSetSize = bound(_bootstrapValidatorSetSize, 3, 1000);
    _bootstrapFlushSize = bound(_bootstrapFlushSize, 1, _bootstrapValidatorSetSize / 3);
    uint256 effectiveFlushSize = Math.min(_bootstrapFlushSize, StakingQueueLib.MAX_QUEUE_FLUSH_SIZE);

    _setupQueueConfig(
      _bootstrapValidatorSetSize, _bootstrapFlushSize, _normalFlushSizeMin, _normalFlushSizeQuotient
    );

    for (uint256 i = 1; i <= _bootstrapValidatorSetSize; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }
    staking.flushEntryQueue();
    assertEq(staking.getActiveAttesterCount(), effectiveFlushSize, "invalid active attester count");
    assertEq(staking.getEntryQueueFlushSize(), effectiveFlushSize, "invalid flush size");

    vm.warp(block.timestamp + EPOCH_DURATION_SECONDS);
    staking.flushEntryQueue();
    assertEq(
      staking.getActiveAttesterCount(), 2 * effectiveFlushSize, "invalid active attester count"
    );
    assertEq(staking.getEntryQueueFlushSize(), effectiveFlushSize, "invalid flush size");
  }

  /// forge-config: default.fuzz.runs = 16
  function test_GivenTheRollupHasTheTargetValidatorSetSize(
    uint256 _activeAttesterCount,
    uint256 _numNewValidators,
    uint256 _normalFlushSizeMin,
    uint256 _normalFlushSizeQuotient
  ) external {
    // it dequeues a minimum or proportional amount of validators
    // it calls deposit for each dequeued validator
    // it emits a {Deposit} event for each successful deposit
    // it emits a {FailedDeposit} event for each failed deposit
    // it refunds the withdrawer if the deposit fails

    _activeAttesterCount = bound(_activeAttesterCount, 0, 1000);
    _numNewValidators = bound(_numNewValidators, 0, 5 * _activeAttesterCount);
    _normalFlushSizeMin = bound(_normalFlushSizeMin, 1, 1000);
    _normalFlushSizeQuotient = bound(_normalFlushSizeQuotient, 1, 1000);
    uint256 effectiveFlushSize =
      Math.max(_normalFlushSizeMin, _activeAttesterCount / _normalFlushSizeQuotient);
    effectiveFlushSize = Math.min(effectiveFlushSize, StakingQueueLib.MAX_QUEUE_FLUSH_SIZE);

    _setupQueueConfig(0, 0, _normalFlushSizeMin, _normalFlushSizeQuotient);

    for (uint256 i = 1; i <= _activeAttesterCount; i++) {
      bool onCanonical = i % 2 == 0;
      // hash here since we want the "normal" indices available for the new validators
      _help_deposit(
        address(uint160(bytes20(keccak256(abi.encodePacked(i * 2))))),
        address(uint160(bytes20(keccak256(abi.encodePacked(i * 2 + 1))))),
        onCanonical
      );
    }

    uint256 queueLength = staking.getEntryQueueLength();
    while (queueLength > 0) {
      staking.flushEntryQueue();
      uint256 newQueueLength = staking.getEntryQueueLength();
      assertLt(newQueueLength, queueLength, "queue length should decrease");
      queueLength = newQueueLength;
      vm.warp(block.timestamp + EPOCH_DURATION_SECONDS);
    }

    _help_flushEntryQueue(_numNewValidators, effectiveFlushSize);
  }

  function _help_deposit(address _attester, address _withdrawer, bool _onCanonical) internal {
    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);
    uint256 balance = stakingAsset.balanceOf(address(staking));

    staking.deposit({_attester: _attester, _withdrawer: _withdrawer, _onCanonical: _onCanonical});

    assertEq(stakingAsset.balanceOf(address(staking)), balance + DEPOSIT_AMOUNT, "invalid balance");
  }

  function _help_flushEntryQueue(uint256 _numValidators, uint256 _expectedFlushSize) internal {
    GSE gse = staking.getGSE();
    address canonicalMagicAddress = gse.getCanonicalMagicAddress();
    uint256 initialActiveAttesterCount = staking.getActiveAttesterCount();
    uint256 initialCanonicalCount =
      gse.getAttestersAtTime(canonicalMagicAddress, Timestamp.wrap(block.timestamp)).length;
    uint256 initialInstanceCount =
      gse.getAttestersAtTime(address(staking), Timestamp.wrap(block.timestamp)).length;

    for (uint256 i = 1; i <= _numValidators; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }

    assertEq(
      staking.getActiveAttesterCount(),
      initialActiveAttesterCount,
      "depositors should not be active"
    );
    assertEq(
      stakingAsset.balanceOf(address(staking)), _numValidators * DEPOSIT_AMOUNT, "invalid balance"
    );

    uint256 flushSize = staking.getEntryQueueFlushSize();
    assertEq(flushSize, _expectedFlushSize, "invalid flush size");

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

    assertEq(
      staking.getActiveAttesterCount(),
      initialActiveAttesterCount + depositCount,
      "invalid active attester count"
    );

    assertEq(
      stakingAsset.balanceOf(address(staking)),
      numStillInQueue * DEPOSIT_AMOUNT,
      "rollup should still have some balance"
    );

    assertEq(
      stakingAsset.balanceOf(address(staking.getGSE().getGovernance())),
      (depositCount + initialActiveAttesterCount) * DEPOSIT_AMOUNT,
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
    address[] memory attestersOnCanonical =
      gse.getAttestersAtTime(canonicalMagicAddress, Timestamp.wrap(block.timestamp));
    assertEq(
      attestersOnCanonical.length,
      initialCanonicalCount + onCanonicalCount,
      "invalid number of attesters on canonical"
    );
    for (uint256 i = 0; i < onCanonicalCount; i++) {
      assertEq(
        attestersOnCanonical[i + initialCanonicalCount],
        address(uint160((i + 1) * 4)),
        "invalid canonical attester"
      );
    }

    // Check the instance set has the proper validators
    address[] memory attestersOnInstance =
      gse.getAttestersAtTime(address(staking), Timestamp.wrap(block.timestamp));
    assertEq(
      attestersOnInstance.length,
      initialInstanceCount + depositCount,
      "invalid number of attesters on instance"
    );
    emit log_named_uint("depositCount", depositCount);
    emit log_named_uint("onCanonicalCount", onCanonicalCount);
    emit log_named_uint("initialInstanceCount", initialInstanceCount);
    for (uint256 i = 0; i < depositCount - onCanonicalCount; i++) {
      // + 6 because the first validator is not on the instance
      assertEq(
        attestersOnInstance[i + initialInstanceCount - initialCanonicalCount],
        address(uint160(i * 4 + 6)),
        "invalid instance attester"
      );
    }
  }
}
