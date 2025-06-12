// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {StakingLib} from "./../staking/StakingLib.sol";
import {ValidatorSelectionLib} from "./../validator-selection/ValidatorSelectionLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {EpochProofLib} from "./EpochProofLib.sol";
import {ProposeLib, ProposeArgs, CommitteeAttestation} from "./ProposeLib.sol";

// We are using this library such that we can more easily "link" just a larger external library
// instead of a few smaller ones.
library ExtRollupLib {
  using TimeLib for Timestamp;

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofLib.submitEpochRootProof(_args);
  }

  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestation[] memory _attestations,
    bytes calldata _blobInput,
    bool _checkBlob
  ) external {
    ProposeLib.propose(_args, _attestations, _blobInput, _checkBlob);
  }

  function initializeValidatorSelection(uint256 _targetCommitteeSize) external {
    ValidatorSelectionLib.initialize(_targetCommitteeSize);
  }

  function setupEpoch() external {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setupEpoch(currentEpoch);
  }

  function setupSeedSnapshotForNextEpoch() external {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setSampleSeedForNextEpoch(currentEpoch);
  }

  function setSlasher(address _slasher) external {
    StakingLib.setSlasher(_slasher);
  }

  function vote(uint256 _proposalId) external {
    StakingLib.vote(_proposalId);
  }

  function deposit(address _attester, address _withdrawer, bool _onCanonical) external {
    StakingLib.deposit(_attester, _withdrawer, _onCanonical);
  }

  function initiateWithdraw(address _attester, address _recipient) external returns (bool) {
    return StakingLib.initiateWithdraw(_attester, _recipient);
  }

  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs
  ) external view returns (bytes32[] memory) {
    return EpochProofLib.getEpochProofPublicInputs(_start, _end, _args, _fees, _blobPublicInputs);
  }

  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    external
    view
    returns (
      bytes32[] memory blobHashes,
      bytes32 blobsHashesCommitment,
      bytes[] memory blobCommitments
    )
  {
    return BlobLib.validateBlobs(_blobsInput, _checkBlob);
  }

  function getBlobBaseFee() external view returns (uint256) {
    return BlobLib.getBlobBaseFee();
  }
}
