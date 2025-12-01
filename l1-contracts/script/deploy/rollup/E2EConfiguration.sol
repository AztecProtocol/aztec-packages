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
    bool fundRewardDistributor;
}

/**
 * @title E2EConfiguration
 * @notice Configuration for e2e tests - uses SlasherFlavor.NONE and targetCommitteeSize: 0
 *         to avoid committee selection complexity in tests.
 *
 *         All configuration values can be overridden via environment variables:
 *
 *         FAKE_PROOFS              - 1=MockVerifier (default), 0=HonkVerifier
 *         FUND_REWARD_DISTRIBUTOR  - 1=fund reward distributor (default), 0=skip
 *         VK_TREE_ROOT             - Verification key tree root (default: 0)
 *         PROTOCOL_CONTRACTS_HASH  - Protocol contracts hash (default: 0)
 *         GENESIS_ARCHIVE_ROOT     - Genesis archive root (default: 0)
 *         ACTIVATION_THRESHOLD     - GSE activation threshold in wei (default: 100_000e18)
 *         EJECTION_THRESHOLD       - GSE ejection threshold in wei (default: 50_000e18)
 *         AZTEC_SLOT_DURATION      - L2 slot duration in seconds (default: 36)
 *         AZTEC_EPOCH_DURATION     - L2 epoch duration in slots (default: 32)
 *         TARGET_COMMITTEE_SIZE    - Target committee size (default: 0 for e2e)
 *         SLASHER_FLAVOR           - 0=NONE, 1=EMPIRE, 2=TALLY (default: 0)
 *         REWARD_DISTRIBUTOR_FUNDING - Amount to fund reward distributor (default: 50_000_000e18)
 */
contract E2EConfiguration is Script {
    // ============ GSE Configuration ============

    function getGseConfiguration() public view returns (GseConfiguration memory) {
        uint256 activationThreshold = vm.envOr("ACTIVATION_THRESHOLD", uint256(100_000e18));
        uint256 ejectionThreshold = vm.envOr("EJECTION_THRESHOLD", uint256(50_000e18));

        return GseConfiguration({
            activationThreshold: activationThreshold,
            ejectionThreshold: ejectionThreshold
        });
    }

    // ============ Governance Proposer Configuration ============

    function getGovernanceProposerConfiguration() public view returns (GovernanceProposerConfiguration memory) {
        uint256 quorum = vm.envOr("GOVERNANCE_PROPOSER_QUORUM", uint256(6));
        uint256 roundSize = vm.envOr("GOVERNANCE_PROPOSER_ROUND_SIZE", uint256(10));

        return GovernanceProposerConfiguration({quorum: quorum, roundSize: roundSize});
    }

    // ============ Coin Issuer Configuration ============

    function getCoinIssuerConfiguration() public pure returns (CoinIssuerConfiguration memory) {
        return CoinIssuerConfiguration({coinIssuerRate: 0.2e18});
    }

    // ============ Governance Configuration ============

    function getGovernanceConfiguration() public view returns (GovernanceConfiguration memory) {
        // Allow governance config to be customized via env vars for faster testing
        uint256 votingDelay = vm.envOr("GOVERNANCE_VOTING_DELAY", uint256(1 days));
        uint256 votingDuration = vm.envOr("GOVERNANCE_VOTING_DURATION", uint256(7 days));
        uint256 executionDelay = vm.envOr("GOVERNANCE_EXECUTION_DELAY", uint256(1 days));
        uint256 gracePeriod = vm.envOr("GOVERNANCE_GRACE_PERIOD", uint256(7 days));

        return GovernanceConfiguration({
            proposeConfig: ProposeWithLockConfiguration({
                lockDelay: Timestamp.wrap(90 days),
                lockAmount: 10_000_000e18
            }),
            votingDelay: Timestamp.wrap(votingDelay),
            votingDuration: Timestamp.wrap(votingDuration),
            executionDelay: Timestamp.wrap(executionDelay),
            gracePeriod: Timestamp.wrap(gracePeriod),
            quorum: 0.1e18,
            requiredYeaMargin: 0.5e18,
            minimumVotes: 100_000e18
        });
    }

    // ============ Reward Configuration ============

    function getRewardConfiguration(IRewardDistributor _rewardDistributor) public view returns (RewardConfig memory) {
        uint256 sequencerBps = vm.envOr("SEQUENCER_BPS", uint256(5000));
        uint256 checkpointReward = vm.envOr("CHECKPOINT_REWARD", uint256(50e18));

        return RewardConfig({
            rewardDistributor: _rewardDistributor,
            sequencerBps: Bps.wrap(uint16(sequencerBps)),
            booster: IBoosterCore(address(0)),
            checkpointReward: uint96(checkpointReward)
        });
    }

    function getRewardBoostConfiguration() public pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
    }

    // ============ Staking Queue Configuration ============

    function getStakingQueueConfiguration() public view returns (StakingQueueConfig memory) {
        uint64 bootstrapValidatorSetSize = uint64(vm.envOr("BOOTSTRAP_VALIDATOR_SET_SIZE", uint256(48)));
        uint64 bootstrapFlushSize = uint64(vm.envOr("BOOTSTRAP_FLUSH_SIZE", uint256(8)));
        uint64 normalFlushSizeMin = uint64(vm.envOr("NORMAL_FLUSH_SIZE_MIN", uint256(1)));
        uint64 normalFlushSizeQuotient = uint64(vm.envOr("NORMAL_FLUSH_SIZE_QUOTIENT", uint256(2048)));
        uint64 maxQueueFlushSize = uint64(vm.envOr("MAX_QUEUE_FLUSH_SIZE", uint256(8)));

        return StakingQueueConfig({
            bootstrapValidatorSetSize: bootstrapValidatorSetSize,
            bootstrapFlushSize: bootstrapFlushSize,
            normalFlushSizeMin: normalFlushSizeMin,
            normalFlushSizeQuotient: normalFlushSizeQuotient,
            maxQueueFlushSize: maxQueueFlushSize
        });
    }

    function getEarliestRewardsClaimableTimestamp() public view returns (Timestamp) {
        return Timestamp.wrap(block.timestamp + 90 days);
    }

    // ============ Rollup Configuration ============

    /// @notice Returns rollup configuration for e2e tests.
    ///         Configuration can be overridden via environment variables.
    ///         See contract header for available environment variables.
    function getRollupConfiguration(IRewardDistributor _rewardDistributor)
        public
        view
        returns (RollupConfigInput memory config)
    {
        // Core timing - use hardcoded defaults for e2e tests
        config.aztecSlotDuration = vm.envOr("AZTEC_SLOT_DURATION", uint256(36));
        config.aztecEpochDuration = vm.envOr("AZTEC_EPOCH_DURATION", uint256(32));
        config.targetCommitteeSize = vm.envOr("TARGET_COMMITTEE_SIZE", uint256(0));

        // Validator set config
        config.lagInEpochsForValidatorSet = vm.envOr("LAG_IN_EPOCHS_FOR_VALIDATOR_SET", uint256(3));
        config.lagInEpochsForRandao = vm.envOr("LAG_IN_EPOCHS_FOR_RANDAO", uint256(2));
        config.aztecProofSubmissionEpochs = vm.envOr("AZTEC_PROOF_SUBMISSION_EPOCHS", uint256(2));

        // Slashing config - default to NONE for e2e tests
        config.slasherFlavor = _parseSlasherFlavor(vm.envOr("SLASHER_FLAVOR", uint256(0)));
        config.slashingQuorum = vm.envOr("SLASHING_QUORUM", uint256(6));
        config.slashingRoundSize = vm.envOr("SLASHING_ROUND_SIZE", uint256(10));
        config.slashingLifetimeInRounds = vm.envOr("SLASHING_LIFETIME_IN_ROUNDS", uint256(5));
        config.slashingExecutionDelayInRounds = vm.envOr("SLASHING_EXECUTION_DELAY_IN_ROUNDS", uint256(0));
        config.slashingOffsetInRounds = vm.envOr("SLASHING_OFFSET_IN_ROUNDS", uint256(0));
        config.slashingDisableDuration = vm.envOr("SLASHING_DISABLE_DURATION", uint256(5 days));
        config.slashingVetoer = vm.envOr("SLASHING_VETOER", address(0));
        config.slashAmounts = [
            vm.envOr("SLASH_AMOUNT_SMALL", uint256(10_000e18)),
            vm.envOr("SLASH_AMOUNT_MEDIUM", uint256(10_000e18)),
            vm.envOr("SLASH_AMOUNT_LARGE", uint256(10_000e18))
        ];

        // Fee config
        config.manaTarget = vm.envOr("MANA_TARGET", uint256(100_000_000));
        config.exitDelaySeconds = vm.envOr("EXIT_DELAY_SECONDS", uint256(4 days));
        config.provingCostPerMana = EthValue.wrap(vm.envOr("PROVING_COST_PER_MANA", uint256(0)));
        config.localEjectionThreshold = vm.envOr("LOCAL_EJECTION_THRESHOLD", uint256(96_000e18));

        // Static fields
        config.version = 0;
        config.rewardConfig = getRewardConfiguration(_rewardDistributor);
        config.rewardBoostConfig = getRewardBoostConfiguration();
        config.stakingQueueConfig = getStakingQueueConfiguration();
        config.earliestRewardsClaimableTimestamp = getEarliestRewardsClaimableTimestamp();
    }

    // ============ Deployment Configuration ============

    function getRewardDistributorFunding() public view returns (uint256) {
        return vm.envOr("REWARD_DISTRIBUTOR_FUNDING", uint256(50_000_000e18));
    }

    function getDeploymentConfiguration() public view returns (DeploymentConfiguration memory) {
        // FAKE_PROOFS=1 means use mock verifier (default), FAKE_PROOFS=0 means use real verifier
        bool useMock = vm.envOr("FAKE_PROOFS", uint256(1)) == 1;
        // FUND_REWARD_DISTRIBUTOR=1 means fund the reward distributor (default)
        bool fundRewardDistributor = vm.envOr("FUND_REWARD_DISTRIBUTOR", uint256(1)) == 1;

        return DeploymentConfiguration({useMockVerifier: useMock, fundRewardDistributor: fundRewardDistributor});
    }

    // ============ Helper Functions ============

    function _parseSlasherFlavor(uint256 raw) internal pure returns (SlasherFlavor) {
        if (raw == 0) return SlasherFlavor.NONE;
        if (raw == 1) return SlasherFlavor.EMPIRE;
        if (raw == 2) return SlasherFlavor.TALLY;
        revert("Invalid slasher flavor");
    }
}
