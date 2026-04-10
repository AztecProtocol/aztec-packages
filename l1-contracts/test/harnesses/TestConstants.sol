// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.

pragma solidity >=0.8.27;

import {
  RollupConfigInput,
  GenesisState,
  EthValue,
  RewardConfig,
  EthPerFeeAssetE12
} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {RewardBoostConfig, IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Configuration, ProposeWithLockConfiguration} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

library TestConstants {
  uint256 internal constant ETHEREUM_SLOT_DURATION = 12;
  uint256 internal constant AZTEC_SLOT_DURATION = 36;
  uint256 internal constant AZTEC_EPOCH_DURATION = 32;
  uint256 internal constant AZTEC_TARGET_COMMITTEE_SIZE = 48;
  uint256 internal constant AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET = 3;
  uint256 internal constant AZTEC_LAG_IN_EPOCHS_FOR_RANDAO = 2;
  uint256 internal constant AZTEC_INBOX_LAG = 2;
  uint256 internal constant AZTEC_PROOF_SUBMISSION_EPOCHS = 1;
  uint256 internal constant AZTEC_SLASHING_QUORUM = 17; // Must be > ROUND_SIZE / 2 (ROUND_SIZE derived from
    // EPOCH_DURATION)
  uint256 internal constant AZTEC_SLASHING_ROUND_SIZE = 32;
  uint256 internal constant AZTEC_SLASHING_LIFETIME_IN_ROUNDS = 5;
  uint256 internal constant AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS = 0;
  uint256 internal constant AZTEC_SLASHING_OFFSET_IN_ROUNDS = 2;
  address internal constant AZTEC_SLASHING_VETOER = address(0);
  uint256 internal constant AZTEC_SLASHING_DISABLE_DURATION = 5 days;
  uint256 internal constant AZTEC_SLASH_AMOUNT_SMALL = 20e18;
  uint256 internal constant AZTEC_SLASH_AMOUNT_MEDIUM = 40e18;
  uint256 internal constant AZTEC_SLASH_AMOUNT_LARGE = 60e18;
  uint256 internal constant AZTEC_MANA_TARGET = 75_000_000;
  uint256 internal constant AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN = 4;
  uint256 internal constant AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT = 2;
  uint256 internal constant AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE = 0;
  uint256 internal constant AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE = 0;
  uint256 internal constant AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE = 480;
  uint256 internal constant AZTEC_EXIT_DELAY_SECONDS = 2 * 24 * 60 * 60; // 2 days
  EthValue internal constant AZTEC_PROVING_COST_PER_MANA = EthValue.wrap(100);
  EthPerFeeAssetE12 internal constant AZTEC_INITIAL_ETH_PER_FEE_ASSET = EthPerFeeAssetE12.wrap(1e12 / 1e5);
  uint256 internal constant AZTEC_COIN_ISSUER_RATE = uint256(25_000_000_000e18) / uint256(60 * 60 * 24 * 365);

  uint256 internal constant ACTIVATION_THRESHOLD = 100e18;
  uint256 internal constant EJECTION_THRESHOLD = 50e18;

  // Genesis state
  bytes32 internal constant GENESIS_ARCHIVE_ROOT = bytes32(Constants.GENESIS_ARCHIVE_ROOT);
  bytes32 internal constant GENESIS_VK_TREE_ROOT = bytes32(0);
  bytes32 internal constant GENESIS_PROTOCOL_CONTRACTS_HASH = bytes32(0);

  function getGovernanceConfiguration() internal pure returns (Configuration memory) {
    return Configuration({
      proposeConfig: ProposeWithLockConfiguration({lockDelay: Timestamp.wrap(60 * 60 * 24 * 30), lockAmount: 1e24}),
      votingDelay: Timestamp.wrap(60),
      votingDuration: Timestamp.wrap(60 * 60),
      executionDelay: Timestamp.wrap(60),
      gracePeriod: Timestamp.wrap(60 * 60 * 24 * 7),
      quorum: 0.1e18,
      requiredYeaMargin: 0.04e18,
      minimumVotes: 400e18
    });
  }

  function getGenesisState() internal pure returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: GENESIS_VK_TREE_ROOT,
      protocolContractsHash: GENESIS_PROTOCOL_CONTRACTS_HASH,
      genesisArchiveRoot: GENESIS_ARCHIVE_ROOT
    });
  }

  function getRewardBoostConfig() internal pure returns (RewardBoostConfig memory) {
    return RewardBoostConfig({increment: 200_000, maxScore: 5_000_000, a: 5000, k: 1_000_000, minimum: 100_000});
  }

  function getRewardConfig() internal pure returns (RewardConfig memory) {
    return RewardConfig({
      rewardDistributor: IRewardDistributor(address(0)),
      sequencerBps: Bps.wrap(5000),
      booster: IBoosterCore(address(0)), // Will cause a deployment
      checkpointReward: 50e18
    });
  }

  function getStakingQueueConfig() internal pure returns (StakingQueueConfig memory) {
    return StakingQueueConfig({
      bootstrapValidatorSetSize: AZTEC_ENTRY_QUEUE_BOOTSTRAP_VALIDATOR_SET_SIZE,
      bootstrapFlushSize: AZTEC_ENTRY_QUEUE_BOOTSTRAP_FLUSH_SIZE,
      normalFlushSizeMin: AZTEC_ENTRY_QUEUE_FLUSH_SIZE_MIN,
      normalFlushSizeQuotient: AZTEC_ENTRY_QUEUE_FLUSH_SIZE_QUOTIENT,
      maxQueueFlushSize: AZTEC_ENTRY_QUEUE_MAX_FLUSH_SIZE
    });
  }

  function getRollupConfigInput() internal view returns (RollupConfigInput memory) {
    RewardConfig memory rewardConfig = getRewardConfig();
    RewardBoostConfig memory rewardBoostConfig = getRewardBoostConfig();
    StakingQueueConfig memory stakingQueueConfig = getStakingQueueConfig();
    uint256[3] memory slashAmounts = [AZTEC_SLASH_AMOUNT_SMALL, AZTEC_SLASH_AMOUNT_MEDIUM, AZTEC_SLASH_AMOUNT_LARGE];

    RollupConfigInput memory config;
    config.aztecSlotDuration = AZTEC_SLOT_DURATION;
    config.aztecEpochDuration = AZTEC_EPOCH_DURATION;
    config.aztecProofSubmissionEpochs = AZTEC_PROOF_SUBMISSION_EPOCHS;
    config.targetCommitteeSize = AZTEC_TARGET_COMMITTEE_SIZE;
    config.lagInEpochsForValidatorSet = AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET;
    config.lagInEpochsForRandao = AZTEC_LAG_IN_EPOCHS_FOR_RANDAO;
    config.slashingQuorum = AZTEC_SLASHING_QUORUM;
    config.slashingRoundSize = AZTEC_SLASHING_ROUND_SIZE;
    config.slashingLifetimeInRounds = AZTEC_SLASHING_LIFETIME_IN_ROUNDS;
    config.slashingExecutionDelayInRounds = AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS;
    config.slashingOffsetInRounds = AZTEC_SLASHING_OFFSET_IN_ROUNDS;
    config.slashingVetoer = AZTEC_SLASHING_VETOER;
    config.slashingDisableDuration = AZTEC_SLASHING_DISABLE_DURATION;
    config.manaTarget = AZTEC_MANA_TARGET;
    config.exitDelaySeconds = AZTEC_EXIT_DELAY_SECONDS;
    config.provingCostPerMana = AZTEC_PROVING_COST_PER_MANA;
    config.initialEthPerFeeAsset = AZTEC_INITIAL_ETH_PER_FEE_ASSET;
    config.version = 0;
    config.rewardConfig = rewardConfig;
    config.rewardBoostConfig = rewardBoostConfig;
    config.stakingQueueConfig = stakingQueueConfig;
    config.slashAmounts = slashAmounts;
    config.slasherEnabled = false;
    config.localEjectionThreshold = 0;
    config.earliestRewardsClaimableTimestamp = Timestamp.wrap(0);
    config.inboxLag = AZTEC_INBOX_LAG;

    // For the version we derive it based on the config (with a 0 version)
    // TODO(https://linear.app/aztec-labs/issue/TMNT-139/version-at-deployment)
    uint32 version =
      uint32(uint256(keccak256(abi.encode(bytes("aztec_rollup"), block.chainid, getGenesisState(), config))));
    config.version = version;

    return config;
  }
}
