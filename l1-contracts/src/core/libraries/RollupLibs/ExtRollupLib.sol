// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {BlockLog, RollupStore, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {DataStructures} from "./../DataStructures.sol";
import {Slot, Epoch} from "./../TimeMath.sol";
import {
  EpochProofLib,
  SubmitEpochRootProofAddresses,
  SubmitEpochRootProofInterimValues
} from "./EpochProofLib.sol";
import {SignedEpochProofQuote} from "./EpochProofQuoteLib.sol";
import {FeeMath, ManaBaseFeeComponents, FeeHeader, L1FeeData} from "./FeeMath.sol";
import {HeaderLib, Header} from "./HeaderLib.sol";
import {TxsDecoder} from "./TxsDecoder.sol";
import {ValidationLib, ValidateHeaderArgs} from "./ValidationLib.sol";
// We are using this library such that we can more easily "link" just a larger external library
// instead of a few smaller ones.

library ExtRollupLib {
  function submitEpochRootProof(
    RollupStore storage _rollupStore,
    SubmitEpochRootProofArgs calldata _args,
    SubmitEpochRootProofInterimValues memory _interimValues,
    IProofCommitmentEscrow _proofCommitmentEscrow,
    IFeeJuicePortal _feeJuicePortal,
    IRewardDistributor _rewardDistributor,
    IERC20 _asset,
    address _cuauhxicalli
  ) external returns (uint256) {
    return EpochProofLib.submitEpochRootProof(
      _rollupStore,
      _args,
      _interimValues,
      SubmitEpochRootProofAddresses({
        proofCommitmentEscrow: _proofCommitmentEscrow,
        feeJuicePortal: _feeJuicePortal,
        rewardDistributor: _rewardDistributor,
        asset: _asset,
        cuauhxicalli: _cuauhxicalli
      })
    );
  }

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
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _aggregationObject
  ) external view returns (bytes32[] memory) {
    return EpochProofLib.getEpochProofPublicInputs(
      _rollupStore, _epochSize, _args, _fees, _aggregationObject
    );
  }

  function decodeHeader(bytes calldata _header) external pure returns (Header memory) {
    return HeaderLib.decode(_header);
  }

  function computeTxsEffectsHash(bytes calldata _body) external pure returns (bytes32) {
    return TxsDecoder.decode(_body);
  }
}
