// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DataStructures} from "../DataStructures.sol";
import {BlockLog} from "@aztec/core/interfaces/IRollup.sol";
import {SignedEpochProofQuote} from "./EpochProofQuoteLib.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";

import {Slot, Epoch} from "../TimeMath.sol";

import {ValidationLib, ValidateHeaderArgs} from "./ValidationLib.sol";
import {HeaderLib, Header} from "./HeaderLib.sol";
import {TxsDecoder} from "./TxsDecoder.sol";

import {FeeMath, ManaBaseFeeComponents, FeeHeader, L1FeeData} from "./FeeMath.sol";

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

  function decodeHeader(bytes calldata _header) external pure returns (Header memory) {
    return HeaderLib.decode(_header);
  }

  function computeTxsEffectsHash(bytes calldata _body) external pure returns (bytes32) {
    return TxsDecoder.decode(_body);
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
}
