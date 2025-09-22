// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Epoch, Slot, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {StakingLib} from "./StakingLib.sol";
import {InvalidateLib} from "./InvalidateLib.sol";
import {ValidatorSelectionLib} from "./ValidatorSelectionLib.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

/**
 * @title ValidatorOperationsExtLib - External Rollup Library (Validator and Staking Functions)
 * @author Aztec Labs
 * @notice External library containing staking-related functions for the Rollup contract to avoid exceeding max contract
 * size.
 *
 * @dev This library serves as an external library for the Rollup contract, splitting off staking-related
 *      functionality to keep the main contract within the maximum contract size limit. The library contains
 *      external functions primarily focused on:
 *      - Validator staking operations (deposit, withdraw, queue management)
 *      - Validator selection and committee setup
 *      - Block attestation invalidation
 *      - Slashing mechanism integration
 *      - Epoch and proposer management
 */
library ValidatorOperationsExtLib {
  using TimeLib for Timestamp;

  function setSlasher(address _slasher) external {
    StakingLib.setSlasher(_slasher);
  }

  function setLocalEjectionThreshold(uint256 _localEjectionThreshold) external {
    StakingLib.setLocalEjectionThreshold(_localEjectionThreshold);
  }

  function vote(uint256 _proposalId) external {
    StakingLib.vote(_proposalId);
  }

  function deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) external {
    StakingLib.deposit(
      _attester, _withdrawer, _publicKeyInG1, _publicKeyInG2, _proofOfPossession, _moveWithLatestRollup
    );
  }

  function flushEntryQueue(uint256 _toAdd) external {
    StakingLib.flushEntryQueue(_toAdd);
  }

  function initiateWithdraw(address _attester, address _recipient) external returns (bool) {
    return StakingLib.initiateWithdraw(_attester, _recipient);
  }

  function finalizeWithdraw(address _attester) external {
    StakingLib.finalizeWithdraw(_attester);
  }

  function initializeValidatorSelection(uint256 _targetCommitteeSize, uint256 _lagInEpochs) external {
    ValidatorSelectionLib.initialize(_targetCommitteeSize, _lagInEpochs);
  }

  function setupEpoch() external {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setupEpoch(currentEpoch);
  }

  function checkpointRandao() external {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.checkpointRandao(currentEpoch);
  }

  function updateStakingQueueConfig(StakingQueueConfig memory _config) external {
    StakingLib.updateStakingQueueConfig(_config);
  }

  function invalidateBadAttestation(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee,
    uint256 _invalidIndex
  ) external {
    InvalidateLib.invalidateBadAttestation(_blockNumber, _attestations, _committee, _invalidIndex);
  }

  function invalidateInsufficientAttestations(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) external {
    InvalidateLib.invalidateInsufficientAttestations(_blockNumber, _attestations, _committee);
  }

  function slash(address _attester, uint256 _amount) external returns (bool) {
    return StakingLib.trySlash(_attester, _amount);
  }

  function canProposeAtTime(Timestamp _ts, bytes32 _archive, address _who) external returns (Slot, uint256) {
    return ValidatorSelectionLib.canProposeAtTime(_ts, _archive, _who);
  }

  function getCommitteeAt(Epoch _epoch) external returns (address[] memory) {
    return ValidatorSelectionLib.getCommitteeAt(_epoch);
  }

  function getProposerAt(Slot _slot) external returns (address proposer) {
    (proposer,) = ValidatorSelectionLib.getProposerAt(_slot);
  }

  function getCommitteeCommitmentAt(Epoch _epoch) external returns (bytes32, uint256) {
    return ValidatorSelectionLib.getCommitteeCommitmentAt(_epoch);
  }

  function getSampleSeedAt(Epoch _epoch) external view returns (uint256) {
    return ValidatorSelectionLib.getSampleSeed(_epoch);
  }

  function getSamplingSizeAt(Epoch _epoch) external view returns (uint256) {
    return ValidatorSelectionLib.getSamplingSize(_epoch);
  }

  function getLagInEpochs() external view returns (uint256) {
    return ValidatorSelectionLib.getLagInEpochs();
  }

  function getTargetCommitteeSize() external view returns (uint256) {
    return ValidatorSelectionLib.getStorage().targetCommitteeSize;
  }

  function getEntryQueueFlushSize() external view returns (uint256) {
    uint256 activeAttesterCount = StakingLib.getAttesterCountAtTime(Timestamp.wrap(block.timestamp));
    return StakingLib.getEntryQueueFlushSize(activeAttesterCount);
  }

  function getAvailableValidatorFlushes() external view returns (uint256) {
    return StakingLib.getAvailableValidatorFlushes();
  }
}
