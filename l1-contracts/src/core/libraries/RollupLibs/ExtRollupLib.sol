// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";

import {BlobLib} from "./BlobLib.sol";
import {EpochProofLib} from "./EpochProofLib.sol";
import {ProposeLib, ProposeArgs, Signature} from "./ProposeLib.sol";
// We are using this library such that we can more easily "link" just a larger external library
// instead of a few smaller ones.

library ExtRollupLib {
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external {
    EpochProofLib.submitEpochRootProof(_args);
  }

  function propose(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    // TODO(#9101): Extract blobs from beacon chain => remove below body input
    bytes calldata _body,
    bytes calldata _blobInput,
    bool _checkBlob
  ) external {
    ProposeLib.propose(_args, _signatures, _body, _blobInput, _checkBlob);
  }

  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs,
    bytes calldata _aggregationObject
  ) external view returns (bytes32[] memory) {
    return EpochProofLib.getEpochProofPublicInputs(
      _start, _end, _args, _fees, _blobPublicInputs, _aggregationObject
    );
  }

  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    external
    view
    returns (
      bytes32[] memory blobHashes,
      bytes32 blobsHashesCommitment,
      bytes32 blobPublicInputsHash
    )
  {
    return BlobLib.validateBlobs(_blobsInput, _checkBlob);
  }

  function getBlobBaseFee() external view returns (uint256) {
    return BlobLib.getBlobBaseFee();
  }
}
