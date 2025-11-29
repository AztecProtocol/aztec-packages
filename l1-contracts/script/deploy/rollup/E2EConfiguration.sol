// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {EthValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {
    Configuration as GovernanceConfiguration,
    ProposeWithLockConfiguration
} from "@aztec/governance/interfaces/IGovernance.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Script} from "forge-std/Script.sol";

struct GseConfiguration {
    uint256 activationThreshold;
    uint256 ejectionThreshold;
}

struct GovernanceProposerConfiguration {
    uint256 quorum;
    uint256 roundSize;
}

struct CoinIssuerConfiguration {
    uint256 coinIssuerRate;
}

struct DeploymentConfiguration {
    bool useMockVerifier;
}

/**
 * @title E2EConfiguration
 * @notice Configuration for e2e tests - uses SlasherFlavor.NONE and targetCommitteeSize: 0
 *         to avoid committee selection complexity in tests.
 */
contract E2EConfiguration is Script {
    function getGseConfiguration() public pure returns (GseConfiguration memory) {
        return GseConfiguration({
            activationThreshold: 100_000e18,
            ejectionThreshold: 50_000e18
        });
    }

    function getGovernanceProposerConfiguration() public pure returns (GovernanceProposerConfiguration memory) {
        return GovernanceProposerConfiguration({
            quorum: 6,
            roundSize: 10
        });
    }

    function getCoinIssuerConfiguration() public pure returns (CoinIssuerConfiguration memory) {
        return CoinIssuerConfiguration({coinIssuerRate: 0.2e18});
    }

    function getGovernanceConfiguration() public pure returns (GovernanceConfiguration memory) {
        return GovernanceConfiguration({
            proposeConfig: ProposeWithLockConfiguration({
                lockDelay: Timestamp.wrap(90 days),
                lockAmount: 10_000_000e18
            }),
            votingDelay: Timestamp.wrap(1 days),
            votingDuration: Timestamp.wrap(7 days),
            executionDelay: Timestamp.wrap(1 days),
            gracePeriod: Timestamp.wrap(7 days),
            quorum: 0.1e18,
            requiredYeaMargin: 0.5e18,
            minimumVotes: 100_000e18
        });
    }

    function getRewardConfiguration(IRewardDistributor _rewardDistributor) public pure returns (RewardConfig memory) {
        return RewardConfig({
            rewardDistributor: _rewardDistributor,
            sequencerBps: Bps.wrap(5000),
            booster: IBoosterCore(address(0)),
            checkpointReward: 50e18
        });
    }

    function getRewardBoostConfiguration() public pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({
            increment: 125_000,
            maxScore: 15_000_000,
            a: 1000,
            minimum: 100_000,
            k: 1_000_000
        });
    }

    function getStakingQueueConfiguration() public pure returns (StakingQueueConfig memory) {
        return StakingQueueConfig({
            bootstrapValidatorSetSize: 48,
            bootstrapFlushSize: 8,
            normalFlushSizeMin: 1,
            normalFlushSizeQuotient: 2048,
            maxQueueFlushSize: 8
        });
    }

    function getEarliestRewardsClaimableTimestamp() public view returns (Timestamp) {
        return Timestamp.wrap(block.timestamp + 90 days);
    }

    function getRollupConfiguration(IRewardDistributor _rewardDistributor)
        public
        view
        returns (RollupConfigInput memory)
    {
        return RollupConfigInput({
            aztecSlotDuration: 36,
            aztecEpochDuration: 32,
            targetCommitteeSize: 0, // No committee selection in e2e tests
            lagInEpochsForValidatorSet: 3,
            lagInEpochsForRandao: 2,
            aztecProofSubmissionEpochs: 2,
            slashingQuorum: 6,
            slashingRoundSize: 10,
            slashingLifetimeInRounds: 5,
            slashingExecutionDelayInRounds: 0,
            slashAmounts: [uint256(10_000e18), uint256(10_000e18), uint256(10_000e18)],
            slashingOffsetInRounds: 0,
            slasherFlavor: SlasherFlavor.NONE, // No slashing in e2e tests
            slashingVetoer: address(0),
            slashingDisableDuration: 5 days,
            manaTarget: 100_000_000, // 100e6
            exitDelaySeconds: 4 days,
            version: 0,
            provingCostPerMana: EthValue.wrap(0),
            rewardConfig: getRewardConfiguration(_rewardDistributor),
            rewardBoostConfig: getRewardBoostConfiguration(),
            stakingQueueConfig: getStakingQueueConfiguration(),
            localEjectionThreshold: 96_000e18,
            earliestRewardsClaimableTimestamp: getEarliestRewardsClaimableTimestamp()
        });
    }

    function getRewardDistributorFunding() public pure returns (uint256) {
        return 50_000_000e18;
    }

    function getDeploymentConfiguration() public view returns (DeploymentConfiguration memory) {
        // FAKE_PROOFS=1 means use mock verifier, FAKE_PROOFS=0 means use real verifier
        bool useMock = vm.envOr("FAKE_PROOFS", uint256(1)) == 1;
        return DeploymentConfiguration({useMockVerifier: useMock});
    }
}
