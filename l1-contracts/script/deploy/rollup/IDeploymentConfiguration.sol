// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {
    Configuration as GovernanceConfiguration,
    ProposeWithLockConfiguration
} from "@aztec/governance/interfaces/IGovernance.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";

// ZKPassport Address is determined by chain ID (Sepolia address, or a mock).
struct ZkPassportConfiguration {
    string domain;
    string scope;
}

struct ProtocolTreasuryConfiguration {
    uint256 gatedUntil;
}

struct CoinIssuerConfiguration {
    uint256 coinIssuerRate;
}

struct GseConfiguration {
    uint256 activationThreshold;
    uint256 ejectionThreshold;
}

struct GovernanceProposerConfiguration {
    uint256 quorum;
    uint256 roundSize;
}

struct FlushRewardConfiguration {
    uint256 rewardPerInsertion;
    uint256 initialFundingAmount;
}

struct DeploymentOptions {
    bool useMockVerifier;
    bool fundRewardDistributor;
    bool deployFeeAssetHandler;
    bool deployStakingAssetHandler;
    address existingStakingAssetAddress;
}

// Configuration for the various contracts we deploy for the rollup.
interface IDeploymentConfiguration {
    function useMockVerifier() external view returns (bool);
    function shouldFundRewardDistributor() external view returns (bool);
    function getAssetAddress() external view returns (address);
    function getZkPassportConfiguration() external view returns (ZkPassportConfiguration memory);
    function getProtocolTreasuryConfiguration() external view returns (ProtocolTreasuryConfiguration memory);
    function getEarliestRewardsClaimableTimestamp() external view returns (Timestamp);
    function getCoinIssuerConfiguration() external view returns (CoinIssuerConfiguration memory);
    function getGseConfiguration() external view returns (GseConfiguration memory);
    function getGovernanceProposerConfiguration() external view returns (GovernanceProposerConfiguration memory);
    function getGovernanceConfiguration() external view returns (GovernanceConfiguration memory);
    function getFlushRewardConfiguration() external view returns (FlushRewardConfiguration memory);
    function getGenesisState() external view returns (GenesisState memory);
    function getRewardConfiguration(IRewardDistributor _rewardDistributor)
        external
        view
        returns (RewardConfig memory);
    function getRewardBoostConfiguration() external view returns (RewardBoostConfig memory);
    function getStakingQueueConfiguration() external view returns (StakingQueueConfig memory);
    function getRollupConfiguration(IRewardDistributor _rewardDistributor)
        external
        view
        returns (RollupConfigInput memory);
    function getRewardDistributorFunding() external view returns (uint256);
}
