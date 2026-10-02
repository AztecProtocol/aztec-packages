// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IStaking, IStakingCore, Exit, Status, AttesterExitLimitState} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {IRegistry, IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {GSE, IGSECore} from "@aztec/governance/GSE.sol";
import {Configuration, Withdrawal} from "@aztec/governance/interfaces/IGovernance.sol";
import {Errors as GovernanceErrors} from "@aztec/governance/libraries/Errors.sol";

contract InitiateWithdrawByAttesterTest is StakingBase {
  uint256 internal constant POOL_SIZE = 101;

  GSE internal gse;
  Governance internal gov;

  error ForcedWithdrawalFailure();

  function setUp() public override {
    super.setUp();

    gse = staking.getGSE();
    gov = gse.getGovernance();

    StakingQueueConfig memory queueConfig = StakingQueueConfig({
      bootstrapValidatorSetSize: POOL_SIZE,
      bootstrapFlushSize: POOL_SIZE,
      normalFlushSizeMin: POOL_SIZE,
      normalFlushSizeQuotient: 1,
      maxQueueFlushSize: POOL_SIZE
    });

    vm.prank(address(gov));
    staking.updateStakingQueueConfig(queueConfig);

    uint256 totalStake = POOL_SIZE * ACTIVATION_THRESHOLD;
    mint(address(this), totalStake);
    stakingAsset.approve(address(staking), totalStake);

    for (uint256 i = 0; i < POOL_SIZE; i++) {
      staking.deposit({
        _attester: _attester(i),
        _withdrawer: WITHDRAWER,
        _publicKeyInG1: BN254Lib.g1Zero(),
        _publicKeyInG2: BN254Lib.g2Zero(),
        _proofOfPossession: BN254Lib.g1Zero(),
        _moveWithLatestRollup: i % 2 == 0
      });
    }

    staking.flushEntryQueue();

    assertEq(staking.getEntryQueueLength(), 0);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
  }

  function _attester(uint256 _index) internal pure returns (address) {
    return _index == 0 ? ATTESTER : address(uint160(1000 + _index));
  }

  function _exit(uint256 _index) internal {
    address attester = _attester(_index);
    vm.prank(attester);
    staking.initiateWithdrawByAttester(attester);
  }

  function _finalizableAt(address _attesterAddress) internal view returns (uint256) {
    Exit memory exit = staking.getExit(_attesterAddress);

    uint256 localUnlock = Timestamp.unwrap(exit.exitableAt);
    uint256 governanceUnlock = Timestamp.unwrap(gov.getWithdrawal(exit.withdrawalId).unlocksAt);

    return localUnlock > governanceUnlock ? localUnlock : governanceUnlock;
  }

  function _makeGovernanceDelayLonger() internal {
    Configuration memory config = gov.getConfiguration();
    config.votingDuration = Timestamp.wrap(Timestamp.unwrap(staking.getExitDelay()) + 1 days);

    vm.prank(address(gov));
    gov.updateConfiguration(config);
  }

  function _selectRecipient() internal {
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
  }

  function _activateNewRollup() internal returns (IStaking nextRollup) {
    RollupBuilder builder = new RollupBuilder(address(this)).setGSE(gse).setTestERC20(stakingAsset)
      .setRegistry(registry).setMakeCanonical(false).setMakeGovernance(false).setUpdateOwnerships(false);
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    builder.setRollupConfigInput(config).deploy();
    nextRollup = IStaking(address(builder.getConfig().rollup));

    AttesterExitLimitState memory initialState = nextRollup.getAttesterExitLimitState();
    assertEq(initialState.validatorCount, 0);
    assertEq(initialState.used, 0);
    assertEq(initialState.allowance, 0);
    assertFalse(initialState.canExit);

    vm.prank(registry.owner());
    registry.addRollup(IHaveVersion(address(nextRollup)));
    vm.prank(gse.owner());
    gse.addRollup(address(nextRollup));
  }

  function test_AttesterExitRemovesPosition(bool _bonus) external {
    // The attesters differ only in whether they move with the latest rollup
    uint256 index = _bonus ? 0 : 1;
    address attester = _attester(index);

    uint256 withdrawalId = gov.withdrawalCount();
    uint256 governanceBalance = stakingAsset.balanceOf(address(gov));

    Timestamp expectedLocalUnlock = Timestamp.wrap(block.timestamp) + staking.getExitDelay();

    vm.expectEmit(true, true, false, true, address(staking));
    emit IStakingCore.WithdrawInitiatedByAttester(attester, WITHDRAWER, ACTIVATION_THRESHOLD, withdrawalId);

    _exit(index);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 1);
    assertEq(gse.effectiveBalanceOf(address(staking), attester), 0);

    Exit memory exit = staking.getExit(attester);
    assertTrue(exit.exists);
    assertFalse(exit.isRecipient);
    assertEq(exit.recipientOrWithdrawer, WITHDRAWER);
    assertEq(exit.amount, ACTIVATION_THRESHOLD);
    assertEq(exit.withdrawalId, withdrawalId);
    assertEq(exit.exitableAt, expectedLocalUnlock);
    // A status for pending withdrawal whose recipient has not been selected
    assertTrue(staking.getStatus(attester) == Status.ZOMBIE);

    Withdrawal memory withdrawal = gov.getWithdrawal(withdrawalId);
    assertEq(withdrawal.recipient, address(staking));
    assertEq(withdrawal.amount, ACTIVATION_THRESHOLD);
    assertFalse(withdrawal.claimed);
    assertEq(gov.withdrawalCount(), withdrawalId + 1);

    assertEq(stakingAsset.balanceOf(address(gov)), governanceBalance);
  }

  function test_OnlyAttesterCanInitiate(address _caller) external {
    vm.assume(_caller != ATTESTER);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotAttester.selector, ATTESTER, _caller));
    vm.prank(_caller);
    staking.initiateWithdrawByAttester(ATTESTER);

    assertFalse(staking.getExit(ATTESTER).exists);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
  }

  function test_UnregisteredAttesterCannotExit() external {
    address unknownAttester = address(0xDEADBEEF);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, unknownAttester));
    vm.prank(unknownAttester);
    staking.initiateWithdrawByAttester(unknownAttester);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
  }

  function test_DuplicateExitPreservesOriginalRecord() external {
    _exit(0);

    Exit memory original = staking.getExit(ATTESTER);

    uint256 withdrawalCount = gov.withdrawalCount();

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AlreadyExiting.selector, ATTESTER));
    _exit(0);

    Exit memory afterAttempt = staking.getExit(ATTESTER);

    assertEq(abi.encode(afterAttempt), abi.encode(original));
    assertEq(gov.withdrawalCount(), withdrawalCount);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 1);
  }

  function test_AllowanceLimitsRealWithdrawals() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }

    assertEq(staking.getActiveAttesterCount(), 97);
    uint256 withdrawalCount = gov.withdrawalCount();
    // Since we are at 97 active attesters, allowance goes down to floor(97/20) = 4
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    _exit(4);

    assertEq(staking.getActiveAttesterCount(), 97);
    assertEq(gov.withdrawalCount(), withdrawalCount);
    assertFalse(staking.getExit(_attester(4)).exists);
    assertEq(gse.effectiveBalanceOf(address(staking), _attester(4)), ACTIVATION_THRESHOLD);
  }

  function test_AttesterExitCannotReducePoolBelowCommitteeSize() external {
    for (uint256 i = 0; i < 52; i++) {
      vm.prank(WITHDRAWER);
      staking.initiateWithdraw(_attester(i), RECIPIENT);
    }

    assertEq(staking.getActiveAttesterCount(), 49);

    _exit(52);
    assertEq(staking.getActiveAttesterCount(), 48);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitPoolTooSmall.selector, uint256(48), uint256(48)));
    _exit(53);

    assertEq(staking.getActiveAttesterCount(), 48);
    assertFalse(staking.getExit(_attester(53)).exists);
  }

  function test_GovernanceFailureRollsBackAttesterExit() external {
    uint256 withdrawalCount = gov.withdrawalCount();

    vm.mockCallRevert(
      address(gov),
      abi.encodeWithSelector(Governance.initiateWithdraw.selector, address(staking), ACTIVATION_THRESHOLD),
      abi.encodeWithSelector(ForcedWithdrawalFailure.selector)
    );

    vm.expectRevert(ForcedWithdrawalFailure.selector);
    _exit(0);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    assertEq(gse.effectiveBalanceOf(address(staking), ATTESTER), ACTIVATION_THRESHOLD);
    assertFalse(staking.getExit(ATTESTER).exists);
    assertEq(gov.withdrawalCount(), withdrawalCount);

    vm.clearMockedCalls();

    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }

    assertEq(staking.getActiveAttesterCount(), 97);
  }

  function test_GSEFailureRollsBackAttesterExit() external {
    uint256 withdrawalCount = gov.withdrawalCount();

    vm.mockCall(
      address(gse),
      abi.encodeWithSelector(IGSECore.withdraw.selector, ATTESTER, ACTIVATION_THRESHOLD),
      abi.encode(ACTIVATION_THRESHOLD, false, uint256(0))
    );

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__WithdrawFailed.selector, ATTESTER));
    _exit(0);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    assertEq(gse.effectiveBalanceOf(address(staking), ATTESTER), ACTIVATION_THRESHOLD);
    assertFalse(staking.getExit(ATTESTER).exists);
    assertEq(gov.withdrawalCount(), withdrawalCount);

    vm.clearMockedCalls();

    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }

    assertEq(staking.getActiveAttesterCount(), 97);
  }

  function test_NonCanonicalRollupCannotInitiateWithdrawByAttester() external {
    vm.mockCall(
      address(registry), abi.encodeWithSelector(IRegistry.getCanonicalRollup.selector), abi.encode(address(0xBEEF))
    );

    AttesterExitLimitState memory state = staking.getAttesterExitLimitState();
    assertEq(state.validatorCount, POOL_SIZE);
    assertEq(state.used, 0);
    assertEq(state.allowance, 5);
    assertFalse(state.canExit);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotCanonical.selector, address(staking)));
    _exit(0);

    assertEq(staking.getActiveAttesterCount(), POOL_SIZE);
    assertFalse(staking.getExit(ATTESTER).exists);
  }

  function test_CanonicalButNotLatestRollupCannotInitiateWithdrawByAttester() external {
    address nextRollup = address(0xDEADBEEF);
    address gseOwner = gse.owner();

    vm.prank(gseOwner);
    gse.addRollup(nextRollup);

    uint256 countBefore = staking.getActiveAttesterCount();
    AttesterExitLimitState memory state = staking.getAttesterExitLimitState();
    assertEq(state.validatorCount, 50);
    assertEq(state.used, 0);
    assertEq(state.allowance, 2);
    assertFalse(state.canExit);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotLatestRollup.selector, address(staking), nextRollup));
    _exit(1);

    assertEq(staking.getActiveAttesterCount(), countBefore);
    assertFalse(staking.getExit(_attester(1)).exists);
    assertEq(gse.effectiveBalanceOf(address(staking), _attester(1)), ACTIVATION_THRESHOLD);
  }

  function test_AttesterCannotSelectRecipient() external {
    _exit(0);

    Exit memory original = staking.getExit(ATTESTER);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotWithdrawer.selector, WITHDRAWER, ATTESTER));
    vm.prank(ATTESTER);
    staking.initiateWithdraw(ATTESTER, ATTESTER);

    Exit memory afterAttempt = staking.getExit(ATTESTER);
    assertEq(abi.encode(afterAttempt), abi.encode(original));
  }

  function test_SelectingRecipientPreservesWithdrawal() external {
    _exit(0);

    Exit memory original = staking.getExit(ATTESTER);
    Withdrawal memory originalGov = gov.getWithdrawal(original.withdrawalId);
    uint256 withdrawalCount = gov.withdrawalCount();

    vm.warp(block.timestamp + 60);
    _selectRecipient();

    Exit memory updated = staking.getExit(ATTESTER);

    assertTrue(updated.exists);
    assertTrue(updated.isRecipient);
    assertEq(updated.recipientOrWithdrawer, RECIPIENT);

    assertEq(updated.amount, original.amount);
    assertEq(updated.withdrawalId, original.withdrawalId);
    assertEq(updated.exitableAt, original.exitableAt);

    Withdrawal memory updatedGov = gov.getWithdrawal(original.withdrawalId);

    assertEq(abi.encode(updatedGov), abi.encode(originalGov));
    assertEq(gov.withdrawalCount(), withdrawalCount);
    assertTrue(staking.getStatus(ATTESTER) == Status.EXITING);
  }

  function test_FinalizationRequiresRecipient() external {
    _exit(0);

    vm.warp(_finalizableAt(ATTESTER));

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InitiateWithdrawNeeded.selector, ATTESTER));
    staking.finalizeWithdraw(ATTESTER);

    assertTrue(staking.getExit(ATTESTER).exists);
  }

  function test_FinalizationWaitsForLocalDeadline() external {
    _exit(0);
    _selectRecipient();

    Exit memory exit = staking.getExit(ATTESTER);
    Timestamp governanceUnlock = gov.getWithdrawal(exit.withdrawalId).unlocksAt;

    assertGt(exit.exitableAt, governanceUnlock);

    vm.warp(Timestamp.unwrap(exit.exitableAt) - 1);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__WithdrawalNotUnlockedYet.selector, Timestamp.wrap(block.timestamp), exit.exitableAt
      )
    );
    staking.finalizeWithdraw(ATTESTER);

    assertTrue(staking.getExit(ATTESTER).exists);
  }

  function test_FinalizationWaitsForGovernanceDeadline() external {
    _makeGovernanceDelayLonger();

    _exit(0);
    _selectRecipient();

    Exit memory original = staking.getExit(ATTESTER);
    Timestamp governanceUnlock = gov.getWithdrawal(original.withdrawalId).unlocksAt;

    assertGt(governanceUnlock, original.exitableAt);

    vm.warp(Timestamp.unwrap(governanceUnlock) - 1);

    vm.expectRevert(
      abi.encodeWithSelector(
        GovernanceErrors.Governance__WithdrawalNotUnlockedYet.selector,
        Timestamp.wrap(block.timestamp),
        governanceUnlock
      )
    );
    staking.finalizeWithdraw(ATTESTER);

    Exit memory afterAttempt = staking.getExit(ATTESTER);
    assertEq(abi.encode(afterAttempt), abi.encode(original));
    assertFalse(gov.getWithdrawal(original.withdrawalId).claimed);
  }

  function test_FinalizationPaysExactlyOnce(bool _governanceLonger, bool _claimFromGovernanceFirst) external {
    if (_governanceLonger) {
      _makeGovernanceDelayLonger();
    }

    _exit(0);
    _selectRecipient();

    Exit memory exit = staking.getExit(ATTESTER);
    vm.warp(_finalizableAt(ATTESTER));

    if (_claimFromGovernanceFirst) {
      gov.finalizeWithdraw(exit.withdrawalId);
    }

    uint256 recipientBalance = stakingAsset.balanceOf(RECIPIENT);

    vm.expectEmit(true, true, false, true, address(staking));
    emit IStakingCore.WithdrawFinalized(ATTESTER, RECIPIENT, exit.amount);

    vm.prank(address(0xDEADBEEF));
    staking.finalizeWithdraw(ATTESTER);

    assertEq(stakingAsset.balanceOf(RECIPIENT), recipientBalance + exit.amount);
    assertFalse(staking.getExit(ATTESTER).exists);
    assertTrue(gov.getWithdrawal(exit.withdrawalId).claimed);
    assertTrue(staking.getStatus(ATTESTER) == Status.NONE);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finalizeWithdraw(ATTESTER);

    assertEq(stakingAsset.balanceOf(RECIPIENT), recipientBalance + exit.amount);
  }

  function test_SlashingReducesAttesterExitPayout(bool _recipientAlreadySelected) external {
    _exit(0);

    if (_recipientAlreadySelected) {
      _selectRecipient();
    }

    Exit memory original = staking.getExit(ATTESTER);
    uint256 slashAmount = original.amount / 4;

    vm.warp(Timestamp.unwrap(original.exitableAt) - 1);

    vm.prank(SLASHER);
    bool slashed = staking.slash(ATTESTER, slashAmount);
    assertTrue(slashed);

    Exit memory updated = staking.getExit(ATTESTER);
    assertEq(updated.amount, original.amount - slashAmount);
    assertEq(updated.exitableAt, original.exitableAt);
    assertEq(updated.withdrawalId, original.withdrawalId);
    assertEq(updated.isRecipient, _recipientAlreadySelected);

    assertEq(gov.getWithdrawal(original.withdrawalId).amount, original.amount);

    if (!_recipientAlreadySelected) {
      _selectRecipient();
    }

    vm.warp(_finalizableAt(ATTESTER));

    uint256 recipientBalance = stakingAsset.balanceOf(RECIPIENT);
    staking.finalizeWithdraw(ATTESTER);

    assertEq(stakingAsset.balanceOf(RECIPIENT), recipientBalance + original.amount - slashAmount);
  }

  function test_SlashingStopsAtLocalDeadline() external {
    _exit(0);

    Exit memory original = staking.getExit(ATTESTER);
    vm.warp(Timestamp.unwrap(original.exitableAt));

    vm.prank(SLASHER);
    bool slashed = staking.slash(ATTESTER, 1);

    assertFalse(slashed);

    Exit memory afterAttempt = staking.getExit(ATTESTER);
    assertEq(abi.encode(afterAttempt), abi.encode(original));
  }

  function test_OwnerWithdrawalBypassesExhaustedAllowance() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    _exit(4);

    address attester = _attester(4);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(attester, RECIPIENT);

    Exit memory exit = staking.getExit(attester);
    assertTrue(exit.exists);
    assertTrue(exit.isRecipient);
    assertEq(exit.recipientOrWithdrawer, RECIPIENT);
    assertEq(exit.amount, ACTIVATION_THRESHOLD);
    assertEq(staking.getActiveAttesterCount(), 96);
  }

  function test_ZeroRecipientPreservesPendingExit() external {
    _exit(0);
    Exit memory original = staking.getExit(ATTESTER);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InvalidRecipient.selector, address(0)));
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, address(0));

    Exit memory afterAttempt = staking.getExit(ATTESTER);
    assertEq(abi.encode(afterAttempt), abi.encode(original));
  }

  function test_SelectedRecipientCannotBeChanged() external {
    _exit(0);
    _selectRecipient();
    Exit memory original = staking.getExit(ATTESTER);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, ATTESTER));
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, address(0xDEADBEEF));

    Exit memory afterAttempt = staking.getExit(ATTESTER);
    assertEq(abi.encode(afterAttempt), abi.encode(original));
  }

  function test_FullSlashRemovesPendingExitWithoutPayout() external {
    _exit(0);
    _selectRecipient();
    Exit memory original = staking.getExit(ATTESTER);
    uint256 finalizableAt = _finalizableAt(ATTESTER);
    uint256 recipientBalance = stakingAsset.balanceOf(RECIPIENT);

    vm.prank(SLASHER);
    bool slashed = staking.slash(ATTESTER, original.amount);

    assertTrue(slashed);
    assertFalse(staking.getExit(ATTESTER).exists);
    assertTrue(staking.getStatus(ATTESTER) == Status.NONE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), recipientBalance);

    vm.warp(finalizableAt);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finalizeWithdraw(ATTESTER);

    assertEq(stakingAsset.balanceOf(RECIPIENT), recipientBalance);
  }

  function test_RecipientSelectionBypassesExhaustedAllowance() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    _exit(4);

    Exit memory expected = staking.getExit(ATTESTER);
    uint256 withdrawalCount = gov.withdrawalCount();
    _selectRecipient();

    expected.recipientOrWithdrawer = RECIPIENT;
    expected.isRecipient = true;
    Exit memory selected = staking.getExit(ATTESTER);
    assertEq(abi.encode(selected), abi.encode(expected));
    assertEq(gov.withdrawalCount(), withdrawalCount);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    _exit(4);
  }

  function test_SlashingBypassesExhaustedAllowance() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    _exit(4);

    address attester = _attester(4);
    vm.prank(SLASHER);
    bool slashed = staking.slash(attester, ACTIVATION_THRESHOLD);

    assertTrue(slashed);
    assertEq(gse.effectiveBalanceOf(address(staking), attester), 0);
    assertEq(staking.getActiveAttesterCount(), POOL_SIZE - 5);
    assertFalse(staking.getExit(attester).exists);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitLimitExceeded.selector, uint256(4), uint256(4)));
    _exit(5);
  }

  function test_AttesterExitLimitState() external {
    Configuration memory config = gov.getConfiguration();
    Timestamp expectedWindow = Timestamp.wrap(
      Timestamp.unwrap(config.votingDelay) / 5 + Timestamp.unwrap(config.votingDuration)
        + Timestamp.unwrap(config.executionDelay)
    );
    AttesterExitLimitState memory state = staking.getAttesterExitLimitState();
    assertEq(state.window, expectedWindow);
    assertEq(staking.getAttesterExitWindow(), expectedWindow);
    assertEq(state.validatorCount, POOL_SIZE);
    assertEq(state.committeeSize, 48);
    assertEq(state.used, 0);
    assertEq(state.allowance, 5);
    assertTrue(state.canExit);

    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }
    state = staking.getAttesterExitLimitState();
    assertEq(state.validatorCount, 97);
    assertEq(state.used, 4);
    assertEq(state.allowance, 4);
    assertFalse(state.canExit);
  }

  function test_AttesterExitLimitStateAtWindowExpiry() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }
    uint256 expiresAt = block.timestamp + Timestamp.unwrap(staking.getAttesterExitWindow());
    vm.warp(expiresAt - 1);
    AttesterExitLimitState memory state = staking.getAttesterExitLimitState();
    assertEq(state.used, 4);
    assertFalse(state.canExit);

    vm.warp(expiresAt);
    state = staking.getAttesterExitLimitState();
    assertEq(state.used, 0);
    assertEq(state.validatorCount, 97);
    assertEq(state.allowance, 4);
    assertTrue(state.canExit);

    _exit(4);
    state = staking.getAttesterExitLimitState();
    assertEq(state.used, 1);
    assertEq(state.validatorCount, 96);
    assertTrue(state.canExit);
  }

  function test_AttesterExitLimitStateTracksGovernanceWindow() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }
    Exit memory originalExit = staking.getExit(ATTESTER);
    Configuration memory originalConfig = gov.getConfiguration();
    Timestamp originalWindow = staking.getAttesterExitWindow();
    vm.warp(block.timestamp + Timestamp.unwrap(originalWindow));

    AttesterExitLimitState memory state = staking.getAttesterExitLimitState();
    assertEq(state.used, 0);
    assertTrue(state.canExit);

    Configuration memory longerConfig = gov.getConfiguration();
    longerConfig.votingDuration = Timestamp.wrap(Timestamp.unwrap(longerConfig.votingDuration) + 1 days);
    vm.prank(address(gov));
    gov.updateConfiguration(longerConfig);

    state = staking.getAttesterExitLimitState();
    assertEq(state.window, Timestamp.wrap(Timestamp.unwrap(originalWindow) + 1 days));
    assertEq(staking.getAttesterExitWindow(), state.window);
    assertEq(state.used, 4);
    assertFalse(state.canExit);

    vm.prank(address(gov));
    gov.updateConfiguration(originalConfig);
    state = staking.getAttesterExitLimitState();
    assertEq(state.window, originalWindow);
    assertEq(staking.getAttesterExitWindow(), originalWindow);
    assertEq(state.used, 0);
    assertTrue(state.canExit);
    assertEq(abi.encode(staking.getExit(ATTESTER)), abi.encode(originalExit));
  }

  function test_UpgradeStartsWithEmptyAttesterExitHistory() external {
    for (uint256 i = 0; i < 4; i++) {
      _exit(i);
    }
    IStaking nextRollup = _activateNewRollup();
    AttesterExitLimitState memory oldState = staking.getAttesterExitLimitState();
    AttesterExitLimitState memory newState = nextRollup.getAttesterExitLimitState();
    assertEq(oldState.validatorCount, 48);
    assertEq(oldState.used, 4);
    assertFalse(oldState.canExit);
    assertEq(newState.validatorCount, 49);
    assertEq(newState.committeeSize, 48);
    assertEq(newState.used, 0);
    assertEq(newState.allowance, 2);
    assertTrue(newState.canExit);

    address attester = _attester(4);
    vm.prank(attester);
    nextRollup.initiateWithdrawByAttester(attester);
    newState = nextRollup.getAttesterExitLimitState();
    assertEq(newState.validatorCount, 48);
    assertEq(newState.used, 1);
    assertFalse(newState.canExit);
    oldState = staking.getAttesterExitLimitState();
    assertEq(oldState.used, 4);

    address nextAttester = _attester(6);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__AttesterExitPoolTooSmall.selector, uint256(48), uint256(48)));
    vm.prank(nextAttester);
    nextRollup.initiateWithdrawByAttester(nextAttester);
  }

  function test_UpgradePreservesPendingAttesterWithdrawal() external {
    _exit(0);
    Exit memory originalExit = staking.getExit(ATTESTER);
    Withdrawal memory originalWithdrawal = gov.getWithdrawal(originalExit.withdrawalId);
    uint256 finalizableAt = _finalizableAt(ATTESTER);
    IStaking nextRollup = _activateNewRollup();
    assertFalse(nextRollup.getExit(ATTESTER).exists);
    assertEq(gse.effectiveBalanceOf(address(staking), _attester(1)), ACTIVATION_THRESHOLD);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotCanonical.selector, address(staking)));
    _exit(1);

    vm.warp(block.timestamp + 60);
    _selectRecipient();
    Exit memory selectedExit = staking.getExit(ATTESTER);
    assertEq(selectedExit.withdrawalId, originalExit.withdrawalId);
    assertEq(selectedExit.exitableAt, originalExit.exitableAt);
    assertEq(selectedExit.amount, originalExit.amount);
    assertEq(selectedExit.recipientOrWithdrawer, RECIPIENT);
    assertTrue(selectedExit.isRecipient);
    assertEq(abi.encode(gov.getWithdrawal(originalExit.withdrawalId)), abi.encode(originalWithdrawal));

    vm.warp(finalizableAt);
    uint256 recipientBalance = stakingAsset.balanceOf(RECIPIENT);
    staking.finalizeWithdraw(ATTESTER);
    assertEq(stakingAsset.balanceOf(RECIPIENT), recipientBalance + originalExit.amount);
    assertFalse(staking.getExit(ATTESTER).exists);
    assertTrue(gov.getWithdrawal(originalExit.withdrawalId).claimed);
    assertFalse(nextRollup.getExit(ATTESTER).exists);
  }
}
