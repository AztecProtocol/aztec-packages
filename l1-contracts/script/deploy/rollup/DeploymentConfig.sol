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

/**
 * @title DeploymentConfig
 * @notice Reads deployment configuration from a JSON file.
 *
 *         JSON Structure:
 *         {
 *           "deployment": { "useMockVerifier": bool, "fundRewardDistributor": bool, "rewardDistributorFunding": string },
 *           "genesis": { "vkTreeRoot": string, "protocolContractsHash": string, "genesisArchiveRoot": string },
 *           "timing": { "aztecSlotDuration": number, "aztecEpochDuration": number, "targetCommitteeSize": number },
 *           "validatorSet": { "lagInEpochsForValidatorSet": number, "lagInEpochsForRandao": number, "aztecProofSubmissionEpochs": number },
 *           "gse": { "activationThreshold": string, "ejectionThreshold": string },
 *           "slashing": { "flavor": string, "roundSizeInEpochs": number, ... },
 *           "fee": { "manaTarget": string, "exitDelaySeconds": number, ... },
 *           "governance": { "proposerQuorum": number, "proposerRoundSize": number, ... },
 *           "reward": { "sequencerBps": number, "checkpointReward": string },
 *           "stakingQueue": { "bootstrapValidatorSetSize": number, ... }
 *         }
 *
 *         Pass the config file path via: DEPLOY_CONFIG_PATH=/path/to/config.json
 */
contract DeploymentConfig is Script {
    string internal $configJson;
    bool internal $hasConfig;

    error InvalidJsonConfig(string reason);

    // ============ Initialization ============

    /// @notice Load configuration from a JSON string passed as parameter.
    ///         If configJson is empty, defaults will be used for all values.
    /// @param configJson The JSON configuration string (can be empty for defaults)
    function _loadConfig(string memory configJson) internal {
        if (bytes(configJson).length > 0) {
            // Validate JSON is parseable before storing
            try vm.parseJson(configJson) {
                $configJson = configJson;
                $hasConfig = true;
            } catch {
                revert InvalidJsonConfig("Failed to parse JSON - check syntax");
            }
        }
    }

    function _hasJsonConfig() internal view returns (bool) {
        return $hasConfig;
    }

    // ============ JSON Helpers ============

    function _readUint(string memory path, uint256 defaultValue) internal view returns (uint256) {
        if (!$hasConfig) return defaultValue;
        try vm.parseJsonUint($configJson, path) returns (uint256 value) {
            return value;
        } catch {
            // Key not found is OK - use default. JSON parse errors would have been caught in _validateJsonConfig
            return defaultValue;
        }
    }

    function _readBool(string memory path, bool defaultValue) internal view returns (bool) {
        if (!$hasConfig) return defaultValue;
        try vm.parseJsonBool($configJson, path) returns (bool value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _readAddress(string memory path, address defaultValue) internal view returns (address) {
        if (!$hasConfig) return defaultValue;
        try vm.parseJsonAddress($configJson, path) returns (address value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _readString(string memory path, string memory defaultValue) internal view returns (string memory) {
        if (!$hasConfig) return defaultValue;
        try vm.parseJsonString($configJson, path) returns (string memory value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    // ============ GSE Configuration ============

    struct GseConfiguration {
        uint256 activationThreshold;
        uint256 ejectionThreshold;
    }

    function getGseConfiguration() public view returns (GseConfiguration memory) {
        return GseConfiguration({
            activationThreshold: _readUint(".gse.activationThreshold", 100_000e18),
            ejectionThreshold: _readUint(".gse.ejectionThreshold", 50_000e18)
        });
    }

    // ============ Governance Proposer Configuration ============

    struct GovernanceProposerConfiguration {
        uint256 quorum;
        uint256 roundSize;
    }

    function getGovernanceProposerConfiguration() public view returns (GovernanceProposerConfiguration memory) {
        uint256 roundSize = _readUint(".governance.proposerRoundSize", 10);
        uint256 defaultQuorum = roundSize / 2 + 1;

        return GovernanceProposerConfiguration({
            quorum: _readUint(".governance.proposerQuorum", defaultQuorum),
            roundSize: roundSize
        });
    }

    // ============ Coin Issuer Configuration ============

    struct CoinIssuerConfiguration {
        uint256 coinIssuerRate;
    }

    function getCoinIssuerConfiguration() public pure returns (CoinIssuerConfiguration memory) {
        return CoinIssuerConfiguration({coinIssuerRate: 0.2e18});
    }

    // ============ Governance Configuration ============

    function getGovernanceConfiguration() public view returns (GovernanceConfiguration memory) {
        return GovernanceConfiguration({
            proposeConfig: ProposeWithLockConfiguration({
                lockDelay: Timestamp.wrap(_readUint(".governance.proposeLockDelay", 90 days)),
                lockAmount: _readUint(".governance.proposeLockAmount", 10_000_000e18)
            }),
            votingDelay: Timestamp.wrap(_readUint(".governance.votingDelay", 1 days)),
            votingDuration: Timestamp.wrap(_readUint(".governance.votingDuration", 7 days)),
            executionDelay: Timestamp.wrap(_readUint(".governance.executionDelay", 1 days)),
            gracePeriod: Timestamp.wrap(_readUint(".governance.gracePeriod", 7 days)),
            quorum: _readUint(".governance.quorum", 0.1e18),
            requiredYeaMargin: _readUint(".governance.requiredYeaMargin", 0.5e18),
            minimumVotes: _readUint(".governance.minimumVotes", 100_000e18)
        });
    }

    // ============ Reward Configuration ============

    function getRewardConfiguration(IRewardDistributor _rewardDistributor) public view returns (RewardConfig memory) {
        return RewardConfig({
            rewardDistributor: _rewardDistributor,
            sequencerBps: Bps.wrap(uint16(_readUint(".reward.sequencerBps", 5000))),
            booster: IBoosterCore(address(0)),
            checkpointReward: uint96(_readUint(".reward.checkpointReward", 50e18))
        });
    }

    function getRewardBoostConfiguration() public pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
    }

    // ============ Staking Queue Configuration ============

    function getStakingQueueConfiguration() public view returns (StakingQueueConfig memory) {
        return StakingQueueConfig({
            bootstrapValidatorSetSize: uint64(_readUint(".stakingQueue.bootstrapValidatorSetSize", 48)),
            bootstrapFlushSize: uint64(_readUint(".stakingQueue.bootstrapFlushSize", 8)),
            normalFlushSizeMin: uint64(_readUint(".stakingQueue.normalFlushSizeMin", 1)),
            normalFlushSizeQuotient: uint64(_readUint(".stakingQueue.normalFlushSizeQuotient", 2048)),
            maxQueueFlushSize: uint64(_readUint(".stakingQueue.maxQueueFlushSize", 8))
        });
    }

    function getEarliestRewardsClaimableTimestamp() public view returns (Timestamp) {
        return Timestamp.wrap(block.timestamp + 90 days);
    }

    // ============ Rollup Configuration ============

    function getRollupConfiguration(IRewardDistributor _rewardDistributor)
        public
        view
        returns (RollupConfigInput memory config)
    {
        // Core timing
        config.aztecSlotDuration = _readUint(".timing.aztecSlotDuration", 36);
        config.aztecEpochDuration = _readUint(".timing.aztecEpochDuration", 32);
        config.targetCommitteeSize = _readUint(".timing.targetCommitteeSize", 0);

        // Validator set config
        config.lagInEpochsForValidatorSet = _readUint(".validatorSet.lagInEpochsForValidatorSet", 3);
        config.lagInEpochsForRandao = _readUint(".validatorSet.lagInEpochsForRandao", 2);
        config.aztecProofSubmissionEpochs = _readUint(".validatorSet.aztecProofSubmissionEpochs", 2);

        // Slashing config
        config.slasherFlavor = _parseSlasherFlavor(_readString(".slashing.flavor", "none"));

        // Calculate slashingRoundSize from roundSizeInEpochs * epochDuration
        uint256 roundSizeInEpochs = _readUint(".slashing.roundSizeInEpochs", 4);
        uint256 defaultRoundSize = roundSizeInEpochs * config.aztecEpochDuration;
        config.slashingRoundSize = _readUint(".slashing.roundSize", defaultRoundSize);

        // Calculate slashingQuorum (must be > roundSize/2)
        uint256 defaultQuorum = config.slashingRoundSize / 2 + 1;
        config.slashingQuorum = _readUint(".slashing.quorum", defaultQuorum);

        config.slashingLifetimeInRounds = _readUint(".slashing.lifetimeInRounds", 5);
        config.slashingExecutionDelayInRounds = _readUint(".slashing.executionDelayInRounds", 0);

        // slashingOffsetInRounds must be > 0 for TALLY
        uint256 defaultOffset = config.slasherFlavor == SlasherFlavor.TALLY ? 2 : 0;
        config.slashingOffsetInRounds = _readUint(".slashing.offsetInRounds", defaultOffset);

        config.slashingDisableDuration = _readUint(".slashing.disableDuration", 5 days);
        config.slashingVetoer = _readAddress(".slashing.vetoer", address(0));
        config.slashAmounts = [
            _readUint(".slashing.amountSmall", 10_000e18),
            _readUint(".slashing.amountMedium", 10_000e18),
            _readUint(".slashing.amountLarge", 10_000e18)
        ];

        // Fee config
        config.manaTarget = _readUint(".fee.manaTarget", 100_000_000);
        config.exitDelaySeconds = _readUint(".fee.exitDelaySeconds", 4 days);
        config.provingCostPerMana = EthValue.wrap(_readUint(".fee.provingCostPerMana", 0));
        config.localEjectionThreshold = _readUint(".fee.localEjectionThreshold", 96_000e18);

        // Static fields
        config.version = 0;
        config.rewardConfig = getRewardConfiguration(_rewardDistributor);
        config.rewardBoostConfig = getRewardBoostConfiguration();
        config.stakingQueueConfig = getStakingQueueConfiguration();
        config.earliestRewardsClaimableTimestamp = getEarliestRewardsClaimableTimestamp();
    }

    // ============ Deployment Configuration ============

    struct DeploymentOptions {
        bool useMockVerifier;
        bool fundRewardDistributor;
    }

    function getRewardDistributorFunding() public view returns (uint256) {
        return _readUint(".deployment.rewardDistributorFunding", 50_000_000e18);
    }

    function getDeploymentOptions() public view returns (DeploymentOptions memory) {
        return DeploymentOptions({
            useMockVerifier: _readBool(".deployment.useMockVerifier", true),
            fundRewardDistributor: _readBool(".deployment.fundRewardDistributor", true)
        });
    }

    // ============ Genesis Configuration ============

    struct GenesisConfiguration {
        bytes32 vkTreeRoot;
        bytes32 protocolContractsHash;
        bytes32 genesisArchiveRoot;
    }

    function getGenesisConfiguration() public view returns (GenesisConfiguration memory) {
        return GenesisConfiguration({
            vkTreeRoot: bytes32(_readUint(".genesis.vkTreeRoot", 0)),
            protocolContractsHash: bytes32(_readUint(".genesis.protocolContractsHash", 0)),
            genesisArchiveRoot: bytes32(_readUint(".genesis.genesisArchiveRoot", 0))
        });
    }

    // ============ Helper Functions ============

    function _parseSlasherFlavor(string memory flavor) internal pure returns (SlasherFlavor) {
        if (_strEq(flavor, "empire")) return SlasherFlavor.EMPIRE;
        if (_strEq(flavor, "tally")) return SlasherFlavor.TALLY;
        return SlasherFlavor.NONE;
    }

    function _strEq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
