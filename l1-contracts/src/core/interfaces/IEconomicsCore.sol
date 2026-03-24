// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {EpochSettlementPlan, ProposalFeeParameters} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Timestamp, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

interface IEconomicsCore {
  function updateL1GasFeeOracle() external;

  function recordCheckpoint(
    uint256 _checkpointNumber,
    int256 _feeAssetPriceModifier,
    uint256 _manaUsed,
    uint256 _congestionCost,
    uint256 _proverCost
  ) external;

  function finalizeEpochSettlement(
    uint256 _start,
    uint256 _end,
    address _prover,
    bytes32[] calldata _fees,
    Epoch _endEpoch,
    uint256 _checkpointRewardsReceived
  ) external;

  function getRollup() external view returns (address);
  function getFeeAsset() external view returns (IERC20);
  function getGenesisTime() external view returns (Timestamp);
  function getSlotDuration() external view returns (uint256);
  function getEpochDuration() external view returns (uint256);
  function getProofSubmissionEpochs() external view returns (uint256);

  function getProposalFeeParameters(uint256 _checkpointOfInterest, Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ProposalFeeParameters memory);

  function getEpochSettlementPlan(uint256 _length, bytes32[] calldata _fees, Epoch _endEpoch)
    external
    view
    returns (EpochSettlementPlan memory);
}
