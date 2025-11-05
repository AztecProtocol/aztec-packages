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
import {StakingQueueLib, DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {StakingQueueConfig, StakingQueueConfigLib} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract FlushEntryQueueTest is StakingBase {
  uint256 public constant MAX_QUEUE_FLUSH_SIZE = 48;

  function test_GivenTheQueueHasAlreadyBeenFlushedThisEpoch() external {
    // it reverts

    // the first one should be okay
    _help_deposit(address(uint160(1)), address(uint160(2)), true);
    _help_deposit(address(uint160(2)), address(uint160(2)), true);

    uint256 flushableValidators = staking.getAvailableValidatorFlushes();
    staking.flushEntryQueue(1);

    assertEq(staking.getAvailableValidatorFlushes(), flushableValidators - 1, "invalid flushable validators");

    staking.flushEntryQueue();
    assertEq(staking.getAvailableValidatorFlushes(), flushableValidators - 2, "invalid flushable validators");
  }

  function _setupQueueConfig(
    uint256 _bootstrapValidatorSetSize,
    uint256 _bootstrapFlushSize,
    uint256 _normalFlushSizeMin,
    uint256 _normalFlushSizeQuotient
  ) internal {
    StakingQueueConfig memory stakingQueueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: bound(_bootstrapValidatorSetSize, 0, type(uint32).max),
      bootstrapFlushSize: bound(_bootstrapFlushSize, 0, type(uint32).max),
      normalFlushSizeMin: bound(_normalFlushSizeMin, 0, type(uint32).max),
      normalFlushSizeQuotient: bound(_normalFlushSizeQuotient, 1, type(uint32).max),
      maxQueueFlushSize: MAX_QUEUE_FLUSH_SIZE
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
    _bootstrapFlushSize = bound(_bootstrapFlushSize, 1, MAX_QUEUE_FLUSH_SIZE);

    _setupQueueConfig(_bootstrapValidatorSetSize, _bootstrapFlushSize, _normalFlushSizeMin, _normalFlushSizeQuotient);

    for (uint256 i = 1; i <= _numValidators; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }

    vm.record();
    assertEq(staking.getEntryQueueFlushSize(), 0, "invalid flush size");
    staking.flushEntryQueue();
    (, bytes32[] memory writes) = vm.accesses(address(staking));
    assertEq(writes.length, 2, "writes");
    assertEq(writes[0], writes[1], "writes not to the same slot");
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
    _numValidators = bound(_numValidators, _bootstrapValidatorSetSize, _bootstrapValidatorSetSize * 2);
    _bootstrapFlushSize = bound(_bootstrapFlushSize, 1, _bootstrapValidatorSetSize * 2);
    uint256 effectiveFlushSize = _bootstrapFlushSize;

    _setupQueueConfig(_bootstrapValidatorSetSize, _bootstrapFlushSize, _normalFlushSizeMin, _normalFlushSizeQuotient);

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
    uint256 effectiveFlushSize = _bootstrapFlushSize;

    _setupQueueConfig(_bootstrapValidatorSetSize, _bootstrapFlushSize, _normalFlushSizeMin, _normalFlushSizeQuotient);

    for (uint256 i = 1; i <= _bootstrapValidatorSetSize; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }
    staking.flushEntryQueue();
    assertEq(staking.getActiveAttesterCount(), effectiveFlushSize, "invalid active attester count");
    assertEq(staking.getEntryQueueFlushSize(), effectiveFlushSize, "invalid flush size");

    vm.warp(block.timestamp + EPOCH_DURATION_SECONDS);
    staking.flushEntryQueue();
    assertEq(staking.getActiveAttesterCount(), 2 * effectiveFlushSize, "invalid active attester count");
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

    _activeAttesterCount = bound(_activeAttesterCount, 0, 500);
    _numNewValidators = bound(_numNewValidators, 0, 5 * _activeAttesterCount);
    _normalFlushSizeMin = bound(_normalFlushSizeMin, 1, 500);
    _normalFlushSizeQuotient = bound(_normalFlushSizeQuotient, 1, 500);
    uint256 effectiveFlushSize = Math.max(_normalFlushSizeMin, _activeAttesterCount / _normalFlushSizeQuotient);
    effectiveFlushSize = Math.min(effectiveFlushSize, MAX_QUEUE_FLUSH_SIZE);

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

  function _help_deposit(address _attester, address _withdrawer, bool _moveWithLatestRollup) internal {
    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);
    uint256 balance = stakingAsset.balanceOf(address(staking));

    staking.deposit({
      _attester: _attester,
      _withdrawer: _withdrawer,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: _moveWithLatestRollup
    });

    assertEq(stakingAsset.balanceOf(address(staking)), balance + ACTIVATION_THRESHOLD, "invalid balance");

    DepositArgs memory validator = staking.getEntryQueueAt(staking.getEntryQueueLength() - 1);
    assertEq(validator.attester, _attester, "invalid attester");
    assertEq(validator.withdrawer, _withdrawer, "invalid withdrawer");
    assertTrue(BN254Lib.isZero(validator.publicKeyInG1), "invalid public key in G1");
    assertTrue(BN254Lib.isZero(validator.publicKeyInG2), "invalid public key in G2");
    assertTrue(BN254Lib.isZero(validator.proofOfPossession), "invalid proof of possession");
    assertEq(validator.moveWithLatestRollup, _moveWithLatestRollup, "invalid move with latest rollup");
  }

  function _help_flushEntryQueue(uint256 _numValidators, uint256 _expectedFlushSize) internal {
    GSE gse = staking.getGSE();
    address bonusInstanceAddress = gse.BONUS_INSTANCE_ADDRESS();
    uint256 initialActiveAttesterCount = staking.getActiveAttesterCount();
    uint256 initialCanonicalCount =
      getAttestersAtTime(gse, bonusInstanceAddress, Timestamp.wrap(block.timestamp)).length;
    uint256 initialInstanceCount = getAttestersAtTime(gse, address(staking), Timestamp.wrap(block.timestamp)).length;

    for (uint256 i = 1; i <= _numValidators; i++) {
      bool onCanonical = i % 2 == 0;
      _help_deposit(address(uint160(i * 2)), address(uint160(i * 2 + 1)), onCanonical);
    }

    assertEq(staking.getActiveAttesterCount(), initialActiveAttesterCount, "depositors should not be active");
    assertEq(stakingAsset.balanceOf(address(staking)), _numValidators * ACTIVATION_THRESHOLD, "invalid balance");

    uint256 flushSize = staking.getAvailableValidatorFlushes();
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
        emit IStakingCore.FailedDeposit(attester, withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero());
      } else {
        if (onCanonical) {
          onCanonicalCount++;
        }
        depositCount++;
        vm.expectEmit(true, true, true, true);
        emit IStakingCore.Deposit(
          attester, withdrawer, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), ACTIVATION_THRESHOLD
        );
      }
    }

    staking.flushEntryQueue();

    assertEq(stakingAsset.allowance(address(staking), address(gse)), 0, "invalid allowance");

    assertEq(
      staking.getActiveAttesterCount(), initialActiveAttesterCount + depositCount, "invalid active attester count"
    );

    assertEq(
      stakingAsset.balanceOf(address(staking)),
      numStillInQueue * ACTIVATION_THRESHOLD,
      "rollup should still have some balance"
    );

    assertEq(
      stakingAsset.balanceOf(address(staking.getGSE().getGovernance())),
      (depositCount + initialActiveAttesterCount) * ACTIVATION_THRESHOLD,
      "governance should have received the deposits from successful deposits"
    );

    if (numDequeued > 1) {
      assertEq(
        stakingAsset.balanceOf(address(uint160(1 * 2 + 1))),
        ACTIVATION_THRESHOLD,
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
        assertEq(attesterView.effectiveBalance, ACTIVATION_THRESHOLD, "invalid effective balance");
        assertEq(attesterView.config.withdrawer, withdrawer, "invalid withdrawer");
        assertTrue(attesterView.status == Status.VALIDATING, "invalid status");
      }
    }

    // Check the canonical set has the proper validators
    address[] memory attestersOnCanonical =
      getAttestersAtTime(gse, bonusInstanceAddress, Timestamp.wrap(block.timestamp));
    assertEq(
      attestersOnCanonical.length, initialCanonicalCount + onCanonicalCount, "invalid number of attesters on canonical"
    );
    for (uint256 i = 0; i < onCanonicalCount; i++) {
      assertEq(
        attestersOnCanonical[i + initialCanonicalCount], address(uint160((i + 1) * 4)), "invalid canonical attester"
      );
    }

    // Check the instance set has the proper validators
    address[] memory attestersOnInstance = getAttestersAtTime(gse, address(staking), Timestamp.wrap(block.timestamp));
    assertEq(attestersOnInstance.length, initialInstanceCount + depositCount, "invalid number of attesters on instance");
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

  function getAttestersAtTime(GSE _gse, address _instance, Timestamp _timestamp)
    internal
    view
    returns (address[] memory)
  {
    uint256 count = _gse.getAttesterCountAtTime(_instance, _timestamp);
    address[] memory attesters = new address[](count);
    for (uint256 i = 0; i < count; i++) {
      attesters[i] = _gse.getAttesterFromIndexAtTime(_instance, i, _timestamp);
    }
    return attesters;
  }
}
