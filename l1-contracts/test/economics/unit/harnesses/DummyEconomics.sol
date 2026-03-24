// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {IEconomicsCore} from "@aztec/core/interfaces/IEconomicsCore.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {
  EpochSettlementPlan,
  ManaMinFeeComponents,
  ProposalFeeParameters
} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

contract DummyEconomics is IEconomicsCore {
  struct TimingConfig {
    Timestamp genesisTime;
    uint256 slotDuration;
    uint256 epochDuration;
    uint256 proofSubmissionEpochs;
  }

  address private immutable rollup;
  IERC20 private immutable feeAsset;
  TimingConfig private timingConfig;

  constructor(address _rollup, IERC20 _feeAsset, TimingConfig memory _timingConfig) {
    rollup = _rollup;
    feeAsset = _feeAsset;
    timingConfig = _timingConfig;
  }

  function updateL1GasFeeOracle() external {}

  function getRollup() external view returns (address) {
    return rollup;
  }

  function getFeeAsset() external view returns (IERC20) {
    return feeAsset;
  }

  function getGenesisTime() external view returns (Timestamp) {
    return timingConfig.genesisTime;
  }

  function getSlotDuration() external view returns (uint256) {
    return timingConfig.slotDuration;
  }

  function getEpochDuration() external view returns (uint256) {
    return timingConfig.epochDuration;
  }

  function getProofSubmissionEpochs() external view returns (uint256) {
    return timingConfig.proofSubmissionEpochs;
  }

  function getProposalFeeParameters(uint256, Timestamp, bool) external pure returns (ProposalFeeParameters memory) {
    return ProposalFeeParameters({
      manaLimit: type(uint256).max,
      manaMinFee: 0,
      feeComponents: ManaMinFeeComponents({congestionCost: 0, congestionMultiplier: 0, sequencerCost: 0, proverCost: 0})
    });
  }

  function recordCheckpoint(uint256, int256, uint256, uint256, uint256) external {}

  function getEpochSettlementPlan(uint256, bytes32[] calldata, Epoch)
    external
    pure
    returns (EpochSettlementPlan memory)
  {
    return EpochSettlementPlan({
      rewardDistributor: IRewardDistributor(address(0)),
      rewardRecipient: address(0),
      checkpointRewardsToClaim: 0,
      portalFeesToDistribute: 0
    });
  }

  function finalizeEpochSettlement(uint256, uint256, address, bytes32[] calldata, Epoch, uint256) external {}
}
