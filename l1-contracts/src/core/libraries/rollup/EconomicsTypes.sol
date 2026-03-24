// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {EthPerFeeAssetE12, EthValue} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {CompressedEpoch} from "@aztec/shared/libraries/CompressedTimeMath.sol";

type Bps is uint32;

library BpsLib {
  function mul(uint256 _a, Bps _b) internal pure returns (uint256) {
    return _a * uint256(Bps.unwrap(_b)) / 10_000;
  }
}

struct RewardBoostConfig {
  uint32 increment;
  uint32 maxScore;
  uint32 a;
  uint32 minimum;
  uint32 k;
}

struct ActivityScore {
  Epoch time;
  uint32 value;
}

struct CompressedActivityScore {
  CompressedEpoch time;
  uint32 value;
}

struct RewardConfig {
  IRewardDistributor rewardDistributor;
  Bps sequencerBps;
  uint96 checkpointReward;
}

struct OracleInput {
  int256 feeAssetPriceModifier;
}

struct ManaMinFeeComponents {
  uint256 congestionCost;
  uint256 congestionMultiplier;
  uint256 sequencerCost;
  uint256 proverCost;
}

struct ProposalFeeParameters {
  uint256 manaLimit;
  uint256 manaMinFee;
  ManaMinFeeComponents feeComponents;
}

struct EconomicsInitArgs {
  uint256 manaTarget;
  EthValue provingCostPerMana;
  EthPerFeeAssetE12 initialEthPerFeeAsset;
  RewardConfig rewardConfig;
  RewardBoostConfig rewardBoostConfig;
  uint256 genesisTime;
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 aztecProofSubmissionEpochs;
}

struct EpochSettlementPlan {
  IRewardDistributor rewardDistributor;
  address rewardRecipient;
  uint256 checkpointRewardsToClaim;
  uint256 portalFeesToDistribute;
}
