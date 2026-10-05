// SPDX-License-Identifier: UNLICENSED
// solhint-disable
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {RollupBuilder} from "../../builder/RollupBuilder.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";

/**
 * Every validator here deposits into the GSE's shared "bonus" bucket, which is how mainnet is
 * staked. That bucket is credited to whichever rollup the GSE considers latest *at the timestamp
 * being queried*, and the attribution is never backdated. So a rollup that has just been made
 * canonical owns the whole validator set for a query at `now`, yet sees an empty set at the lagged
 * timestamp its committee sampling actually reads from.
 */
contract ValidatorSetSampleFloorTest is TestBase {
  uint256 internal constant VALIDATOR_COUNT = 48;

  Registry internal registry;
  GSE internal gse;
  TestERC20 internal token;
  Rollup internal oldRollup;
  Rollup internal newRollup;

  uint256 internal targetCommitteeSize;
  uint256 internal lag;
  uint256 internal epochSeconds;

  function setUp() external {
    vm.warp(1_000_000);

    StakingQueueConfig memory queueConfig = TestConstants.getStakingQueueConfig();
    queueConfig.normalFlushSizeMin = VALIDATOR_COUNT;

    RollupBuilder builder = new RollupBuilder(address(this)).setStakingQueueConfig(queueConfig)
      .setValidators(_validators("validator", VALIDATOR_COUNT));
    builder.deploy();

    oldRollup = Rollup(address(builder.getConfig().rollup));
    registry = builder.getConfig().registry;
    gse = builder.getConfig().gse;
    token = builder.getConfig().testERC20;

    // The version is a hash of the config, so the successor needs a config that differs somewhere or
    // the Registry rejects it as already registered. `setMakeGovernance(false)` keeps the successor
    // from standing up a second Governance and repointing the GSE at it, which would orphan the
    // stake; `setUpdateOwnerships` then leaves this contract owning the rollup and the GSE, standing
    // in for governance.
    RollupConfigInput memory successorConfig = TestConstants.getRollupConfigInput();
    successorConfig.version = successorConfig.version + 1;

    RollupBuilder successorBuilder = new RollupBuilder(address(this)).setRegistry(registry).setGSE(gse)
      .setTestERC20(token).setRollupConfigInput(successorConfig).setStakingQueueConfig(queueConfig)
      .setMakeCanonical(false).setMakeGovernance(false);
    successorBuilder.deploy();
    newRollup = Rollup(address(successorBuilder.getConfig().rollup));

    targetCommitteeSize = oldRollup.getTargetCommitteeSize();
    lag = oldRollup.getLagInEpochsForValidatorSet();
    epochSeconds = oldRollup.getEpochDuration() * oldRollup.getSlotDuration();

    assertGt(targetCommitteeSize, 0, "fixture needs a committee");
    assertGt(lag, 0, "fixture needs a lag");

    // Let enough history accumulate that the outgoing rollup samples normally, and land partway
    // into an epoch rather than on a boundary. On a boundary the sample time of epoch
    // `cutover + lag` lands exactly on the cutover and already resolves to the successor, so the
    // stall is one epoch shorter; a governance execution is not going to be that well aligned.
    vm.warp(block.timestamp + (lag + 1) * epochSeconds + epochSeconds / 3);

    assertEq(gse.supplyOf(address(oldRollup)), 0, "validators must sit in the bonus bucket");
    assertEq(
      oldRollup.getEpochCommittee(oldRollup.getCurrentEpoch()).length,
      targetCommitteeSize,
      "outgoing rollup should have a committee"
    );
  }

  function _validators(string memory _salt, uint256 _count) internal pure returns (CheatDepositArgs[] memory) {
    CheatDepositArgs[] memory out = new CheatDepositArgs[](_count);
    for (uint256 i = 0; i < _count; i++) {
      address validator = vm.addr(uint256(keccak256(abi.encode(_salt, i))));
      out[i] = CheatDepositArgs({
        attester: validator,
        withdrawer: validator,
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }
    return out;
  }

  /// The two actions every upgrade payload has always had, and nothing else.
  function _cutover() internal {
    registry.addRollup(IHaveVersion(address(newRollup)));
    gse.addRollup(address(newRollup));
  }

  function test_WhenNoFloorIsPinned_TheSuccessorCannotFormACommittee() external {
    _cutover();

    assertEq(
      gse.getAttesterCountAtTime(address(newRollup), Timestamp.wrap(block.timestamp)),
      VALIDATOR_COUNT,
      "the successor has inherited every validator as of now"
    );

    for (uint256 k = 0; k <= lag; k++) {
      Epoch epoch = newRollup.getCurrentEpoch();
      vm.expectRevert(
        abi.encodeWithSelector(Errors.ValidatorSelection__InsufficientValidatorSetSize.selector, 0, targetCommitteeSize)
      );
      newRollup.getEpochCommittee(epoch);
      vm.warp(block.timestamp + epochSeconds);
    }

    // The stall ends on its own once the lagged sample time passes the cutover.
    assertEq(newRollup.getEpochCommittee(newRollup.getCurrentEpoch()).length, targetCommitteeSize);
  }

  function test_WhenAFloorIsPinned_TheSuccessorFormsACommitteeImmediately() external {
    _cutover();
    newRollup.setValidatorSetSampleFloor();

    for (uint256 k = 0; k <= lag; k++) {
      assertEq(
        newRollup.getEpochCommittee(newRollup.getCurrentEpoch()).length,
        targetCommitteeSize,
        "successor should have a committee from the cutover epoch onwards"
      );
      vm.warp(block.timestamp + epochSeconds);
    }
  }

  /// The clamped epochs read one validator set but mix a different randao, so their committees must
  /// not collapse onto each other.
  function test_ClampedEpochsDoNotShareACommittee() external {
    _cutover();
    newRollup.setValidatorSetSampleFloor();

    bytes32 first = keccak256(abi.encode(newRollup.getEpochCommittee(newRollup.getCurrentEpoch())));
    vm.warp(block.timestamp + epochSeconds);
    bytes32 second = keccak256(abi.encode(newRollup.getEpochCommittee(newRollup.getCurrentEpoch())));

    assertNotEq(first, second, "clamped epochs should still sample distinct committees");
  }

  /// Once the lagged sample time overtakes the floor the clamp has to stop mattering, so validators
  /// who joined after the floor must show up exactly as they would have without it.
  function test_TheClampBecomesInertOnceTheLagClears() external {
    _cutover();
    newRollup.setValidatorSetSampleFloor();
    assertEq(newRollup.getSamplingSizeAt(Timestamp.wrap(block.timestamp)), VALIDATOR_COUNT);

    CheatDepositArgs[] memory extra = _validators("late-validator", 4);
    MultiAdder adder = new MultiAdder(address(newRollup), address(this));
    vm.prank(token.owner());
    token.addMinter(address(this));
    token.mint(address(adder), gse.ACTIVATION_THRESHOLD() * extra.length);
    adder.addValidators(extra);

    vm.warp(block.timestamp + (lag + 2) * epochSeconds);

    assertEq(
      newRollup.getSamplingSizeAt(Timestamp.wrap(block.timestamp)),
      VALIDATOR_COUNT + extra.length,
      "sampling must track the validator set again once the floor is behind the lagged time"
    );
  }

  function test_WhenOrderedBeforeTheGseAction_ItReverts() external {
    registry.addRollup(IHaveVersion(address(newRollup)));

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ValidatorSelection__NotLatestRollupInGSE.selector, address(newRollup), address(oldRollup)
      )
    );
    newRollup.setValidatorSetSampleFloor();
  }

  function test_ItIsOneShot() external {
    _cutover();
    newRollup.setValidatorSetSampleFloor();

    vm.expectRevert(abi.encodeWithSelector(Errors.ValidatorSelection__SampleFloorAlreadySet.selector));
    newRollup.setValidatorSetSampleFloor();
  }

  function test_ItIsOwnerOnly() external {
    _cutover();

    address stranger = address(uint160(bytes20("stranger")));
    vm.prank(stranger);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
    newRollup.setValidatorSetSampleFloor();
  }

  function test_TheFloorIsReadableAfterwards() external {
    assertEq(newRollup.getValidatorSetSampleFloor(), 0, "unset by default");
    _cutover();
    newRollup.setValidatorSetSampleFloor();
    assertEq(newRollup.getValidatorSetSampleFloor(), block.timestamp, "floor is the cutover timestamp");
  }
}
