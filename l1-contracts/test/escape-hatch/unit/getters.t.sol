// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";

contract EscapeHatchGettersTest is EscapeHatchBase {
  function test_WhenCallingGetCurrentHatch(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the current hatch based on current epoch
    _warpToSafeEpoch();

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch expected = escapeHatch.getHatch(currentEpoch);
    Hatch result = escapeHatch.getCurrentHatch();

    assertEq(Hatch.unwrap(result), Hatch.unwrap(expected), "getCurrentHatch should match getHatch(currentEpoch)");
  }

  function test_WhenCallingGetHatch(EscapeHatchConfig memory _config, uint256 _epoch)
    external
    givenValidConfig(_config)
  {
    // it should return epoch / FREQUENCY
    _epoch = bound(_epoch, 0, type(uint32).max);

    Hatch result = escapeHatch.getHatch(Epoch.wrap(_epoch));
    uint256 expected = _epoch / config.frequency;

    assertEq(Hatch.unwrap(result), expected, "getHatch should return epoch / FREQUENCY");
  }

  function test_WhenCallingGetFirstEpoch(EscapeHatchConfig memory _config, uint256 _hatch)
    external
    givenValidConfig(_config)
  {
    // it should return hatch * FREQUENCY
    _hatch = bound(_hatch, 0, type(uint32).max / config.frequency);

    Epoch result = escapeHatch.getFirstEpoch(Hatch.wrap(_hatch));
    uint256 expected = _hatch * config.frequency;

    assertEq(Epoch.unwrap(result), expected, "getFirstEpoch should return hatch * FREQUENCY");
  }

  function test_GetHatchAndGetFirstEpoch_RoundTrip(EscapeHatchConfig memory _config, uint256 _hatch)
    external
    givenValidConfig(_config)
  {
    // Property: getHatch(getFirstEpoch(hatch)) == hatch
    // This verifies the two functions are inverses at hatch boundaries
    _hatch = bound(_hatch, 0, type(uint32).max / config.frequency);

    Epoch firstEpoch = escapeHatch.getFirstEpoch(Hatch.wrap(_hatch));
    Hatch resultHatch = escapeHatch.getHatch(firstEpoch);

    assertEq(Hatch.unwrap(resultHatch), _hatch, "Round-trip should return original hatch");
  }

  function test_WhenCallingGetDesignatedProposer(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the designated proposer for the hatch

    // Without selection, should be zero
    assertEq(escapeHatch.getDesignatedProposer(Hatch.wrap(1)), address(0), "Should be zero without selection");

    _joinCandidateSetWithConfig(CANDIDATE1);
    _warpToSafeEpoch();
    _warpForwardEpochs(3);

    escapeHatch.selectCandidates();

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);

    assertEq(escapeHatch.getDesignatedProposer(preparedHatch), CANDIDATE1, "Should return CANDIDATE1");
  }

  modifier whenCallingIsHatchPrepared() {
    _;
  }

  function test_GivenHatchHasBeenPrepared(EscapeHatchConfig memory _config)
    external
    whenCallingIsHatchPrepared
    givenValidConfig(_config)
  {
    // it should return true

    // Warp to safe epoch to avoid underflow in _stableEpochToSetSampleTime
    _warpToSafeEpoch();

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);

    assertFalse(escapeHatch.isHatchPrepared(preparedHatch), "Should not be prepared before selectCandidates");

    escapeHatch.selectCandidates();

    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Should be prepared after selectCandidates");
  }

  function test_GivenHatchHasNotBeenPrepared(EscapeHatchConfig memory _config)
    external
    whenCallingIsHatchPrepared
    givenValidConfig(_config)
  {
    // it should return false
    // Use a hatch far in the future that won't be prepared
    Hatch farFutureHatch = Hatch.wrap(999);
    assertFalse(escapeHatch.isHatchPrepared(farFutureHatch), "Far future hatch should not be prepared");
  }

  // ============ Candidate State ============

  function test_WhenCallingGetCandidateInfo(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return correct data through full lifecycle: NONE -> ACTIVE -> PROPOSING -> EXITING
    CandidateInfo memory info;

    // NONE: before joining
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE");
    assertEq(info.amount, 0, "Amount should be 0 for NONE");

    // ACTIVE: after joining
    _joinCandidateSetWithConfig(CANDIDATE1);
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.ACTIVE), "Status should be ACTIVE");
    assertEq(info.amount, config.bondSize, "Amount should match bondSize");
    assertEq(info.exitableAt, 0, "exitableAt should be 0 for ACTIVE");

    // PROPOSING: after selection
    _warpToSafeEpoch();
    _warpForwardEpochs(3);
    escapeHatch.selectCandidates();

    // Record which hatch the candidate was selected for (currentHatch + lagInHatches)
    Hatch selectedHatch = escapeHatch.getCurrentHatch() + Hatch.wrap(config.lagInHatches);

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Status should be PROPOSING");
    assertEq(info.amount, config.bondSize, "Amount should match bondSize");
    assertGt(info.exitableAt, 0, "exitableAt should be > 0 for PROPOSING");
    assertEq(escapeHatch.getDesignatedProposer(selectedHatch), CANDIDATE1, "CANDIDATE1 should be designated proposer");

    // EXITING: after validation
    vm.warp(info.exitableAt);
    escapeHatch.validateProofSubmission(selectedHatch);

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertGt(info.exitableAt, 0, "exitableAt should be > 0 for EXITING");
  }

  function test_WhenCallingGetCandidateCount(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the current number of active candidates
    assertEq(escapeHatch.getCandidateCount(), 0, "Should start with 0 candidates");

    _joinCandidateSetWithConfig(CANDIDATE1);
    assertEq(escapeHatch.getCandidateCount(), 1, "Should have 1 candidate");

    _joinCandidateSetWithConfig(CANDIDATE2);
    assertEq(escapeHatch.getCandidateCount(), 2, "Should have 2 candidates");

    _joinCandidateSetWithConfig(CANDIDATE3);
    assertEq(escapeHatch.getCandidateCount(), 3, "Should have 3 candidates");
  }

  function test_WhenCallingGetCandidateCountForHatch(EscapeHatchConfig memory _config, uint256 _futureTimeJump)
    external
    givenValidConfig(_config)
  {
    // it should return the number of candidates in the snapshot at freeze time
    //
    // This test verifies that getCandidateCountForHatch returns the snapshotted count
    // consistent with what selectCandidates() would use for selection.
    //
    // Key properties tested:
    // 1. DETERMINISM: At exact freeze timestamp, queries must revert (not yet stable)
    // 2. IMMUTABILITY: Once frozen, the snapshot is immutable regardless of time/changes
    // 3. CONSISTENCY: selectCandidates() uses the same snapshot as the getter

    // Bound future time jump to reasonable range (1 second to 10 years)
    _futureTimeJump = bound(_futureTimeJump, 1, 365 days * 10);

    // ============ PART 1: DETERMINISM AT EXACT FREEZE TIMESTAMP ============
    // Join one candidate early (at timestamp ~1)
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Calculate a valid targetHatch that won't underflow:
    // - targetHatch >= lagInHatches (so samplingHatch doesn't underflow)
    // - samplingHatch's firstEpoch >= LAG_IN_EPOCHS_FOR_SET_SIZE (so freezeEpoch doesn't underflow)
    uint256 lagInEpochs = escapeHatch.LAG_IN_EPOCHS_FOR_SET_SIZE();
    uint256 minSamplingHatch = (lagInEpochs / config.frequency) + 1;
    uint256 minTargetHatch = config.lagInHatches + minSamplingHatch;
    Hatch targetHatch = Hatch.wrap(minTargetHatch);
    uint256 freezeTs = escapeHatch.getSetTimestamp(targetHatch);

    // Warp to EXACTLY the freeze timestamp
    vm.warp(freezeTs);
    assertEq(block.timestamp, freezeTs, "Should be at exact freeze timestamp");

    // At exact freeze timestamp, query should REVERT (snapshot not yet finalized).
    // This ensures determinism: we only read from strictly past timestamps where
    // the snapshot value cannot change within the same block.
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__SetUnstable.selector, targetHatch));
    escapeHatch.getCandidateCountForHatch(targetHatch);

    // Add another candidate at the SAME timestamp
    _joinCandidateSetWithConfig(CANDIDATE2);

    // ============ PART 2: IMMUTABILITY AFTER FREEZE ============
    // Warp past the freeze timestamp so snapshot is stable
    vm.warp(freezeTs + 1);

    // Query the same targetHatch - now both CANDIDATE1 and CANDIDATE2 are in snapshot
    // (both joined at or before freezeTs)
    uint256 snapshotCount = escapeHatch.getCandidateCountForHatch(targetHatch);
    assertEq(snapshotCount, 2, "Snapshot should have 2 candidates");

    // Add a third candidate at current timestamp (after freeze)
    _joinCandidateSetWithConfig(CANDIDATE3);

    // Live count is now 3
    assertEq(escapeHatch.getCandidateCount(), 3, "Live count should be 3");

    // Snapshot count should still be 2 (CANDIDATE3 joined after freeze)
    uint256 snapshotCountAfterAdd = escapeHatch.getCandidateCountForHatch(targetHatch);
    assertEq(snapshotCountAfterAdd, 2, "Snapshot count should still be 2 after adding CANDIDATE3");

    // ============ PART 3: FUZZED TIME JUMP ============
    // Jump arbitrarily far into the future - snapshot must remain immutable
    vm.warp(block.timestamp + _futureTimeJump);

    // Snapshot is STILL 2 - time passage doesn't affect frozen snapshots
    uint256 snapshotCountAfterTimeJump = escapeHatch.getCandidateCountForHatch(targetHatch);
    assertEq(snapshotCountAfterTimeJump, 2, "Snapshot count must be immutable after freeze regardless of time");
  }

  function test_WhenCallingGetCandidateAtIndex(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the candidate address at the given index
    _joinCandidateSetWithConfig(CANDIDATE1);
    _joinCandidateSetWithConfig(CANDIDATE2);
    _joinCandidateSetWithConfig(CANDIDATE3);

    // Verify we can retrieve all candidates by index
    address[] memory candidates = new address[](3);
    for (uint256 i = 0; i < 3; i++) {
      candidates[i] = escapeHatch.getCandidateAtIndex(i);
    }

    // Check all expected candidates are present (order may vary based on set implementation)
    bool foundCandidate1 = false;
    bool foundCandidate2 = false;
    bool foundCandidate3 = false;

    for (uint256 i = 0; i < 3; i++) {
      if (candidates[i] == CANDIDATE1) foundCandidate1 = true;
      if (candidates[i] == CANDIDATE2) foundCandidate2 = true;
      if (candidates[i] == CANDIDATE3) foundCandidate3 = true;
    }

    assertTrue(foundCandidate1, "CANDIDATE1 should be in set");
    assertTrue(foundCandidate2, "CANDIDATE2 should be in set");
    assertTrue(foundCandidate3, "CANDIDATE3 should be in set");
  }

  modifier whenCallingGetCandidateAtIndexForHatch() {
    _;
  }

  function test_GivenFreezeTimestampHasPassed(EscapeHatchConfig memory _config)
    external
    whenCallingGetCandidateAtIndexForHatch
    givenValidConfig(_config)
  {
    // it should return the candidate address from the snapshot at the given index

    // Join candidates at different times
    _joinCandidateSetWithConfig(CANDIDATE1);
    _joinCandidateSetWithConfig(CANDIDATE2);

    // Calculate a valid targetHatch
    uint256 lagInEpochs = escapeHatch.LAG_IN_EPOCHS_FOR_SET_SIZE();
    uint256 minSamplingHatch = (lagInEpochs / config.frequency) + 1;
    uint256 minTargetHatch = config.lagInHatches + minSamplingHatch;
    Hatch targetHatch = Hatch.wrap(minTargetHatch);
    uint256 freezeTs = escapeHatch.getSetTimestamp(targetHatch);

    // Warp past freeze timestamp
    vm.warp(freezeTs + 1);

    // Query snapshot - should have CANDIDATE1 and CANDIDATE2
    uint256 snapshotCount = escapeHatch.getCandidateCountForHatch(targetHatch);
    assertEq(snapshotCount, 2, "Snapshot should have 2 candidates");

    // Retrieve by index
    address candidate0 = escapeHatch.getCandidateAtIndexForHatch(0, targetHatch);
    address candidate1 = escapeHatch.getCandidateAtIndexForHatch(1, targetHatch);

    // Verify both expected candidates are present
    bool has1 = (candidate0 == CANDIDATE1 || candidate1 == CANDIDATE1);
    bool has2 = (candidate0 == CANDIDATE2 || candidate1 == CANDIDATE2);
    assertTrue(has1, "CANDIDATE1 should be in snapshot");
    assertTrue(has2, "CANDIDATE2 should be in snapshot");

    // Add CANDIDATE3 after freeze - should not affect snapshot
    _joinCandidateSetWithConfig(CANDIDATE3);

    // Snapshot still only has 2 candidates
    assertEq(escapeHatch.getCandidateCountForHatch(targetHatch), 2, "Snapshot count should still be 2");
  }

  function test_GivenFreezeTimestampHasNotPassed(EscapeHatchConfig memory _config)
    external
    whenCallingGetCandidateAtIndexForHatch
    givenValidConfig(_config)
  {
    // it should revert with SetUnstable

    _joinCandidateSetWithConfig(CANDIDATE1);

    // Calculate a valid targetHatch
    uint256 lagInEpochs = escapeHatch.LAG_IN_EPOCHS_FOR_SET_SIZE();
    uint256 minSamplingHatch = (lagInEpochs / config.frequency) + 1;
    uint256 minTargetHatch = config.lagInHatches + minSamplingHatch;
    Hatch targetHatch = Hatch.wrap(minTargetHatch);
    uint256 freezeTs = escapeHatch.getSetTimestamp(targetHatch);

    // Warp to exactly freeze timestamp (not past it)
    vm.warp(freezeTs);

    // Should revert because snapshot not yet stable
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__SetUnstable.selector, targetHatch));
    escapeHatch.getCandidateAtIndexForHatch(0, targetHatch);
  }

  modifier whenCallingIsCandidate() {
    _;
  }

  function test_GivenAddressIsInActiveCandidateSet(EscapeHatchConfig memory _config)
    external
    whenCallingIsCandidate
    givenValidConfig(_config)
  {
    // it should return true
    _joinCandidateSetWithConfig(CANDIDATE1);
    assertTrue(escapeHatch.isCandidate(CANDIDATE1), "Should return true for active candidate");
  }

  function test_GivenAddressIsNotInActiveCandidateSet(EscapeHatchConfig memory _config)
    external
    whenCallingIsCandidate
    givenValidConfig(_config)
  {
    // it should return false
    assertFalse(escapeHatch.isCandidate(CANDIDATE1), "Should return false for non-candidate");
  }

  function test_WhenCallingGetSetTimestamp(EscapeHatchConfig memory _config, uint256 _hatch)
    external
    givenValidConfig(_config)
  {
    // it should return the timestamp when candidate set freezes for the target hatch
    // getSetTimestamp(targetHatch) computes samplingHatch = targetHatch - LAG_IN_HATCHES
    // then returns timestamp of (samplingHatch.firstEpoch - LAG_IN_EPOCHS_FOR_SET_SIZE)

    uint256 lagInEpochs = escapeHatch.LAG_IN_EPOCHS_FOR_SET_SIZE();

    // Bound hatch to avoid underflow and overflow:
    // 1. targetHatch >= lagInHatches (so samplingHatch doesn't underflow)
    // 2. samplingHatch's firstEpoch >= lagInEpochs (so freezeEpoch doesn't underflow)
    // 3. Resulting timestamp fits in uint32
    uint256 minSamplingHatch = (lagInEpochs / config.frequency) + 1;
    uint256 minTargetHatch = config.lagInHatches + minSamplingHatch;
    // Max epoch that fits in uint32 timestamp: (uint32.max - genesis) / (slotDuration * epochDuration)
    // Use conservative bound to avoid overflow
    uint256 maxHatch = 1000;
    _hatch = bound(_hatch, minTargetHatch, maxHatch);

    Hatch targetHatch = Hatch.wrap(_hatch);
    uint32 freezeTimestamp = escapeHatch.getSetTimestamp(targetHatch);

    // Verify: freezeTimestamp should be the timestamp of (samplingHatch.firstEpoch - LAG_IN_EPOCHS_FOR_SET_SIZE)
    Hatch samplingHatch = Hatch.wrap(_hatch - config.lagInHatches);
    Epoch firstEpochOfSamplingHatch = escapeHatch.getFirstEpoch(samplingHatch);
    Epoch freezeEpoch = Epoch.wrap(Epoch.unwrap(firstEpochOfSamplingHatch) - lagInEpochs);
    uint256 expectedTimestamp = Timestamp.unwrap(IValidatorSelection(_getRollup()).getTimestampForEpoch(freezeEpoch));

    assertEq(freezeTimestamp, expectedTimestamp, "getSetTimestamp should return correct freeze timestamp");
  }

  function test_WhenCallingGetSeedTimestamp(EscapeHatchConfig memory _config, uint256 _hatch)
    external
    givenValidConfig(_config)
  {
    // it should return the timestamp when RANDAO seed is sampled for the target hatch
    // getSeedTimestamp(targetHatch) computes samplingHatch = targetHatch - LAG_IN_HATCHES
    // then returns timestamp of (samplingHatch.firstEpoch - LAG_IN_EPOCHS_FOR_RANDAO)

    uint256 lagInEpochsForRandao = escapeHatch.LAG_IN_EPOCHS_FOR_RANDAO();

    // Bound hatch to avoid underflow and overflow:
    // 1. targetHatch >= lagInHatches (so samplingHatch doesn't underflow)
    // 2. samplingHatch's firstEpoch >= lagInEpochsForRandao (so seedEpoch doesn't underflow)
    // 3. Resulting timestamp fits in uint32
    uint256 minSamplingHatch = (lagInEpochsForRandao / config.frequency) + 1;
    uint256 minTargetHatch = config.lagInHatches + minSamplingHatch;
    // Max epoch that fits in uint32 timestamp: (uint32.max - genesis) / (slotDuration * epochDuration)
    // Use conservative bound to avoid overflow
    uint256 maxHatch = 1000;
    _hatch = bound(_hatch, minTargetHatch, maxHatch);

    Hatch targetHatch = Hatch.wrap(_hatch);
    uint32 seedTimestamp = escapeHatch.getSeedTimestamp(targetHatch);

    // Verify: seedTimestamp should be the timestamp of (samplingHatch.firstEpoch - LAG_IN_EPOCHS_FOR_RANDAO)
    Hatch samplingHatch = Hatch.wrap(_hatch - config.lagInHatches);
    Epoch firstEpochOfSamplingHatch = escapeHatch.getFirstEpoch(samplingHatch);
    Epoch seedEpoch = Epoch.wrap(Epoch.unwrap(firstEpochOfSamplingHatch) - lagInEpochsForRandao);
    uint256 expectedTimestamp = Timestamp.unwrap(IValidatorSelection(_getRollup()).getTimestampForEpoch(seedEpoch));

    assertEq(seedTimestamp, expectedTimestamp, "getSeedTimestamp should return correct seed timestamp");
  }

  // ============ Immutable Getters ============
  // These just return constructor values, so fuzz testing the config itself
  // is already covered by the constructor tests. Here we verify the getters work.

  function test_WhenCallingGetRollup(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the ROLLUP address
    assertEq(escapeHatch.getRollup(), address(_getRollup()), "Should return rollup address");
  }

  function test_WhenCallingGetBondToken(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the BOND_TOKEN address
    assertEq(escapeHatch.getBondToken(), address(bondToken), "Should return bond token address");
  }

  function test_WhenCallingGetBondSize(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the BOND_SIZE value
    assertEq(escapeHatch.getBondSize(), config.bondSize, "Should return BOND_SIZE");
  }

  function test_WhenCallingGetWithdrawalTax(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the WITHDRAWAL_TAX value
    assertEq(escapeHatch.getWithdrawalTax(), config.withdrawalTax, "Should return WITHDRAWAL_TAX");
  }

  function test_WhenCallingGetFailedHatchPunishment(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
  {
    // it should return the FAILED_HATCH_PUNISHMENT value
    assertEq(
      escapeHatch.getFailedHatchPunishment(), config.failedHatchPunishment, "Should return FAILED_HATCH_PUNISHMENT"
    );
  }

  function test_WhenCallingGetFrequency(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the FREQUENCY value
    assertEq(escapeHatch.getFrequency(), config.frequency, "Should return FREQUENCY");
  }

  function test_WhenCallingGetActiveDuration(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the ACTIVE_DURATION value
    assertEq(escapeHatch.getActiveDuration(), config.activeDuration, "Should return ACTIVE_DURATION");
  }

  function test_WhenCallingGetLagInHatches(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the LAG_IN_HATCHES value
    assertEq(escapeHatch.getLagInHatches(), config.lagInHatches, "Should return LAG_IN_HATCHES");
  }

  function test_WhenCallingGetProposingExitDelay(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return the PROPOSING_EXIT_DELAY value
    assertEq(escapeHatch.getProposingExitDelay(), config.proposingExitDelay, "Should return PROPOSING_EXIT_DELAY");
  }
}
