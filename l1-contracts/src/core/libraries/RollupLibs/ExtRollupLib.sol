// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {BlockLog, RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {DataStructures} from "./../DataStructures.sol";
import {Slot, Epoch} from "./../TimeLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {EpochProofLib} from "./EpochProofLib.sol";
import {SignedEpochProofQuote} from "./EpochProofQuoteLib.sol";
import {FeeMath, ManaBaseFeeComponents, FeeHeader, L1FeeData} from "./FeeMath.sol";
import {HeaderLib, Header} from "./HeaderLib.sol";
import {ValidationLib, ValidateHeaderArgs} from "./ValidationLib.sol";
// We are using this library such that we can more easily "link" just a larger external library
// instead of a few smaller ones.

library ExtRollupLib {
  function validateHeaderForSubmissionBase(
    ValidateHeaderArgs memory _args,
    mapping(uint256 blockNumber => BlockLog log) storage _blocks
  ) external view {
    ValidationLib.validateHeaderForSubmissionBase(_args, _blocks);
  }

  function validateEpochProofRightClaimAtTime(
    Slot _currentSlot,
    address _currentProposer,
    Epoch _epochToProve,
    uint256 _posInEpoch,
    SignedEpochProofQuote calldata _quote,
    bytes32 _digest,
    DataStructures.EpochProofClaim storage _proofClaim,
    uint256 _claimDurationInL2Slots,
    uint256 _proofCommitmentMinBondAmountInTst,
    IProofCommitmentEscrow _proofCommitmentEscrow
  ) external view {
    ValidationLib.validateEpochProofRightClaimAtTime(
      _currentSlot,
      _currentProposer,
      _epochToProve,
      _posInEpoch,
      _quote,
      _digest,
      _proofClaim,
      _claimDurationInL2Slots,
      _proofCommitmentMinBondAmountInTst,
      _proofCommitmentEscrow
    );
  }

  function getManaBaseFeeComponentsAt(
    FeeHeader storage _parentFeeHeader,
    L1FeeData memory _fees,
    uint256 _feeAssetPrice,
    uint256 _epochDuration
  ) external view returns (ManaBaseFeeComponents memory) {
    return
      FeeMath.getManaBaseFeeComponentsAt(_parentFeeHeader, _fees, _feeAssetPrice, _epochDuration);
  }

  function getEpochProofPublicInputs(
    RollupStore storage _rollupStore,
    uint256 _start,
    uint256 _end,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs,
    bytes calldata _aggregationObject
  ) external view returns (bytes32[] memory) {
    return EpochProofLib.getEpochProofPublicInputs(
      _rollupStore, _start, _end, _args, _fees, _blobPublicInputs, _aggregationObject
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

  function getBlobBaseFee(address _vmAddress) external view returns (uint256) {
    return BlobLib.getBlobBaseFee(_vmAddress);
  }

  function decodeHeader(bytes calldata _header) external pure returns (Header memory) {
    return HeaderLib.decode(_header);
  }
}
