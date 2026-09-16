// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "@test/governance/governance/base.t.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Configuration} from "@aztec/governance/interfaces/IGovernance.sol";
import {CheckpointedUintLib} from "@aztec/governance/libraries/CheckpointedUintLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract AttesterExitUsageHarness {
  using CheckpointedUintLib for Checkpoints.Trace224;

  constructor(GSE _gse) {
    StakingLib.getStorage().gse = _gse;
  }

  function recordExit() external {
    StakingLib.getStorage().attesterExitHistory.add(1);
  }

  function getWindow() external view returns (Timestamp) {
    return StakingLib.getAttesterExitWindow();
  }

  function getUsage() external view returns (uint256) {
    return StakingLib.getAttesterExitUsage();
  }

  function setCommitteeSize(uint32 _committeeSize) external {
    ValidatorSelectionLib.getStorage().targetCommitteeSize = _committeeSize;
  }

  function consumeExitAllowance() external {
    StakingLib.consumeAttesterExitAllowance();
  }
}

contract AttesterExitUsageTest is GovernanceBase {
  AttesterExitUsageHarness internal harness;

  uint256 internal constant START = 1000;

  uint256 internal constant BASIC_VOTING_DELAY = 60;
  uint256 internal constant BASIC_VOTING_DURATION = 60;
  uint256 internal constant LONG_VOTING_DURATION = BASIC_VOTING_DURATION * 2;
  uint256 internal constant BASIC_EXECUTION_DELAY = 60;
  uint256 internal constant BASIC_VALIDATOR_COUNT = 1337;
  uint32 internal constant BASIC_COMMITTEE_SIZE = 48;

  // Our standard formula for exit window
  uint256 internal constant WINDOW = (BASIC_VOTING_DELAY / 5) + BASIC_VOTING_DURATION + BASIC_EXECUTION_DELAY;

  GSE internal gse;

  function setUp() public override {
    super.setUp();
    vm.warp(START);

    Configuration memory config = governance.getConfiguration();
    config.votingDelay = Timestamp.wrap(BASIC_VOTING_DELAY);
    config.votingDuration = Timestamp.wrap(BASIC_VOTING_DURATION);
    config.executionDelay = Timestamp.wrap(BASIC_EXECUTION_DELAY);

    vm.prank(address(governance));
    governance.updateConfiguration(config);

    gse = new GSE(
      address(this), IERC20(address(token)), TestConstants.ACTIVATION_THRESHOLD, TestConstants.EJECTION_THRESHOLD
    );
    gse.setGovernance(governance);

    harness = new AttesterExitUsageHarness(gse);
  }

  /// @notice Set the validator count and committee size
  /// @dev Has to be called every time after warp, since the mock call is bound to the timestamp
  function _setPool(uint256 _validatorCount, uint32 _committeeSize) internal {
    harness.setCommitteeSize(_committeeSize);

    vm.mockCall(
      address(gse),
      abi.encodeWithSelector(GSE.getAttesterCountAtTime.selector, address(harness), Timestamp.wrap(block.timestamp)),
      abi.encode(_validatorCount)
    );
  }

  function _setVotingDuration(uint256 _duration) internal {
    Configuration memory config = governance.getConfiguration();
    config.votingDuration = Timestamp.wrap(_duration);

    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WindowMatchesGovernanceConfiguration() external {
    assertEq(Timestamp.unwrap(harness.getWindow()), WINDOW);
  }

  function test_EmptyHistoryHasZeroUsage() external {
    assertEq(harness.getUsage(), 0);
  }

  function test_CountsMultipleExitsAtSameTimestamp() external {
    harness.recordExit();
    harness.recordExit();
    harness.recordExit();

    assertEq(harness.getUsage(), 3);
  }

  function test_ExitExpiresExactlyAtWindowBoundary() external {
    harness.recordExit();

    vm.warp(START + WINDOW - 1);
    assertEq(harness.getUsage(), 1);

    vm.warp(START + WINDOW);
    assertEq(harness.getUsage(), 0);

    vm.warp(START + WINDOW + 1);
    assertEq(harness.getUsage(), 0);
  }

  function test_ExistExpireAtTheirOwnBoundaries() external {
    harness.recordExit();
    harness.recordExit();

    vm.warp(START + 10);
    harness.recordExit();
    assertEq(harness.getUsage(), 3);

    vm.warp(START + WINDOW);
    assertEq(harness.getUsage(), 1);

    vm.warp(START + 10 + WINDOW);
    assertEq(harness.getUsage(), 0);
  }

  function test_IncreasingTheWindowCountsOlderExits() external {
    harness.recordExit();

    vm.warp(START + WINDOW);
    assertEq(harness.getUsage(), 0);

    _setVotingDuration(LONG_VOTING_DURATION);

    assertEq(Timestamp.unwrap(harness.getWindow()), WINDOW - BASIC_VOTING_DURATION + LONG_VOTING_DURATION);
    assertEq(harness.getUsage(), 1);
  }

  function test_ShorterWindowStopsCountingOlderExits() external {
    _setVotingDuration(LONG_VOTING_DURATION);
    harness.recordExit();

    vm.warp(START + WINDOW);
    assertEq(harness.getUsage(), 1);

    _setVotingDuration(BASIC_VOTING_DURATION);

    assertEq(Timestamp.unwrap(harness.getWindow()), WINDOW);
    assertEq(harness.getUsage(), 0);
  }

  function test_EmptyHistoryAtTimestampZero() external {
    vm.warp(0);

    assertEq(harness.getUsage(), 0);
  }

  function test_ExitAtZeroCountsUntilItsWindowExpires() external {
    vm.warp(0);
    harness.recordExit();

    vm.warp(1);
    assertEq(harness.getUsage(), 1);

    vm.warp(WINDOW - 1);
    assertEq(harness.getUsage(), 1);

    vm.warp(WINDOW);
    assertEq(harness.getUsage(), 0);
  }

  function test_AllowedExitConsumesOneUnit() external {
    _setPool(BASIC_VALIDATOR_COUNT, BASIC_COMMITTEE_SIZE);

    harness.consumeExitAllowance();

    assertEq(harness.getUsage(), 1);
  }

  function test_poolShrinkingIsRespected() external {
    /// 104,103,102,101 should all cause a 5% limit of 5 exits per window so no need to change
    _setPool(104, BASIC_COMMITTEE_SIZE);
    harness.consumeExitAllowance();
    harness.consumeExitAllowance();
    harness.consumeExitAllowance();
    harness.consumeExitAllowance();

    assertEq(harness.getUsage(), 4);

    _setPool(99, BASIC_COMMITTEE_SIZE);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    harness.consumeExitAllowance();

    assertEq(harness.getUsage(), 4);

    _setPool(101, BASIC_COMMITTEE_SIZE);

    harness.consumeExitAllowance();

    assertEq(harness.getUsage(), 5);
  }

  function test_CannotExitBelowCommitteeSize() external {
    _setPool(BASIC_COMMITTEE_SIZE, BASIC_COMMITTEE_SIZE);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__AttesterExitPoolTooSmall.selector, uint256(BASIC_COMMITTEE_SIZE), uint256(BASIC_COMMITTEE_SIZE)
      )
    );
    harness.consumeExitAllowance();
    assertEq(harness.getUsage(), 0);
  }

  function test_CanLeaveExactlyCommitteeSize() external {
    _setPool(BASIC_COMMITTEE_SIZE + 1, BASIC_COMMITTEE_SIZE);

    harness.consumeExitAllowance();
    assertEq(harness.getUsage(), 1);
  }

  function test_ZeroRoundedEdgecase() external {
    _setPool(20, 1);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(0), uint256(0)));
    harness.consumeExitAllowance();

    assertEq(harness.getUsage(), 0);
  }

  function test_ExpiryRestoresAllowance() external {
    _setPool(BASIC_COMMITTEE_SIZE + 1, BASIC_COMMITTEE_SIZE);

    harness.recordExit();
    harness.recordExit();

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(2), uint256(2)));
    harness.consumeExitAllowance();

    vm.warp(START + WINDOW);
    // We have to reset pull, since it's a mocked call
    _setPool(BASIC_COMMITTEE_SIZE + 1, BASIC_COMMITTEE_SIZE);

    harness.consumeExitAllowance();
    assertEq(harness.getUsage(), 1);
  }

  function test_EmptyPool() external {
    _setPool(0, BASIC_COMMITTEE_SIZE);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__AttesterExitPoolTooSmall.selector, uint256(0), uint256(BASIC_COMMITTEE_SIZE)
      )
    );
    harness.consumeExitAllowance();
  }
}
