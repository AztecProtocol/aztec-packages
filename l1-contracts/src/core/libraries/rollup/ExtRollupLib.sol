// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {EpochProofLib} from "./EpochProofLib.sol";
import {ProposeLib, ProposeArgs, CommitteeAttestation, ValidateHeaderArgs} from "./ProposeLib.sol";

// We are using this library such that we can more easily "link" just a larger external library
// instead of a few smaller ones.
library ExtRollupLib {
  using TimeLib for Timestamp;

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofLib.submitEpochRootProof(_args);
  }

  function validateHeader(ValidateHeaderArgs calldata _args) external {
    ProposeLib.validateHeader(_args);
  }

  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestation[] memory _attestations,
    bytes calldata _blobInput,
    bool _checkBlob
  ) external {
    ProposeLib.propose(_args, _attestations, _blobInput, _checkBlob);
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
