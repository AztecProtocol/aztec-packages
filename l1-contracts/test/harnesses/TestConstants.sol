// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.

pragma solidity >=0.8.27;

import {
  RollupConfigInput,
  GenesisState,
  EthValue,
  RewardConfig
} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {RewardBoostConfig, IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Configuration, ProposeConfiguration} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";

library TestConstants {
  uint256 internal constant ETHEREUM_SLOT_DURATION = 12;
  uint256 internal constant AZTEC_SLOT_DURATION = 36;
  uint256 internal constant AZTEC_EPOCH_DURATION = 32;
  uint256 internal constant AZTEC_TARGET_COMMITTEE_SIZE = 48;
  uint256 internal constant AZTEC_PROOF_SUBMISSION_EPOCHS = 1;
  uint256 internal constant AZTEC_SLASHING_QUORUM = 6;
  uint256 internal constant AZTEC_SLASHING_ROUND_SIZE = 10;
  uint256 internal constant AZTEC_MANA_TARGET = 100000000;
  uint256 internal constant AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN = 4;
  uint256 internal constant AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT = 2;
  uint256 internal constant AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE = 0;
  uint256 internal constant AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE = 0;
  uint256 internal constant AZTEC_EXIT_DELAY_SECONDS = 2 * 24 * 60 * 60; // 2 days
  EthValue internal constant AZTEC_PROVING_COST_PER_MANA = EthValue.wrap(100);

  // Genesis state
  bytes32 internal constant GENESIS_ARCHIVE_ROOT = bytes32(Constants.GENESIS_ARCHIVE_ROOT);
  bytes32 internal constant GENESIS_VK_TREE_ROOT = bytes32(0);
  bytes32 internal constant GENESIS_PROTOCOL_CONTRACT_TREE_ROOT = bytes32(0);

  function getGovernanceConfiguration() internal pure returns (Configuration memory) {
    return Configuration({
      proposeConfig: ProposeConfiguration({
        lockDelay: Timestamp.wrap(60 * 60 * 24 * 30),
        lockAmount: 1e24
      }),
      votingDelay: Timestamp.wrap(Math.max(DEPOSIT_GRANULARITY_SECONDS * 3, 60)),
      votingDuration: Timestamp.wrap(Math.max(DEPOSIT_GRANULARITY_SECONDS * 6, 60 * 60)),
      executionDelay: Timestamp.wrap(Math.max(DEPOSIT_GRANULARITY_SECONDS * 3, 60)),
      gracePeriod: Timestamp.wrap(60 * 60 * 24 * 7),
      quorum: 0.1e18,
      voteDifferential: 0.04e18,
      minimumVotes: 400e18
    });
  }

  function getGenesisState() internal pure returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: GENESIS_VK_TREE_ROOT,
      protocolContractTreeRoot: GENESIS_PROTOCOL_CONTRACT_TREE_ROOT,
      genesisArchiveRoot: GENESIS_ARCHIVE_ROOT
    });
  }

  function getRewardBoostConfig() internal pure returns (RewardBoostConfig memory) {
    return RewardBoostConfig({
      increment: 200000,
      maxScore: 5000000,
      a: 5000,
      k: 1000000,
      minimum: 100000
    });
  }

  function getRewardConfig() internal pure returns (RewardConfig memory) {
    return RewardConfig({
      rewardDistributor: IRewardDistributor(address(0)),
      sequencerBps: Bps.wrap(5000),
      booster: IBoosterCore(address(0)) // Will cause a deployment
    });
  }

  function getStakingQueueConfig() internal pure returns (StakingQueueConfig memory) {
    return StakingQueueConfig({
      bootstrapValidatorSetSize: AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE,
      bootstrapFlushSize: AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE,
      normalFlushSizeMin: AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN,
      normalFlushSizeQuotient: AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT
    });
  }

  function getRollupConfigInput() internal pure returns (RollupConfigInput memory) {
    return RollupConfigInput({
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecEpochDuration: AZTEC_EPOCH_DURATION,
      aztecProofSubmissionEpochs: AZTEC_PROOF_SUBMISSION_EPOCHS,
      targetCommitteeSize: AZTEC_TARGET_COMMITTEE_SIZE,
      slashingQuorum: AZTEC_SLASHING_QUORUM,
      slashingRoundSize: AZTEC_SLASHING_ROUND_SIZE,
      manaTarget: AZTEC_MANA_TARGET,
      exitDelaySeconds: AZTEC_EXIT_DELAY_SECONDS,
      provingCostPerMana: AZTEC_PROVING_COST_PER_MANA,
      rewardConfig: getRewardConfig(),
      rewardBoostConfig: getRewardBoostConfig(),
      stakingQueueConfig: getStakingQueueConfig()
    });
  }
}
