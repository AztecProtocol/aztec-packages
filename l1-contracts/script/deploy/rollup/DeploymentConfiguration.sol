// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {EthValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {
    Configuration as GovernanceConfiguration,
    ProposeWithLockConfiguration
} from "@aztec/governance/interfaces/IGovernance.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {
    IDeploymentConfiguration,
    ProtocolTreasuryConfiguration,
    CoinIssuerConfiguration,
    GseConfiguration,
    GovernanceProposerConfiguration,
    FlushRewardConfiguration,
    DeploymentOptions,
    ZkPassportConfiguration
} from "./IDeploymentConfiguration.sol";

/**
 * @title DeploymentConfiguration
 * @notice Implements IDeploymentConfiguration with values loaded from JSON or defaults.
 *         Uses individual getter functions to avoid stack too deep issues.
 */
contract DeploymentConfiguration is IDeploymentConfiguration, Test {
    using stdJson for string;
    // Deployment options (not part of IDeploymentConfiguration)

    // Storage for loaded config
    string internal configJson;
    string public networkName;
    DeploymentOptions public deploymentOptions;
    ZkPassportConfiguration public zkPassportConfig;

    function loadConfig(string memory _configJson) external {
        configJson = _configJson;
        networkName = _getString(".networkName", "local");
        _loadDeploymentOptions();
        _loadZkPassportConfiguration();
    }

    // ============ IDeploymentConfiguration Implementation ============

    function useMockVerifier() external view returns (bool) {
        return deploymentOptions.useMockVerifier;
    }

    function shouldFundRewardDistributor() external view returns (bool) {
        return deploymentOptions.fundRewardDistributor;
    }

    function getAssetAddress() external view returns (address) {
        return deploymentOptions.existingStakingAssetAddress;
    }

    function getContractOptions() external view returns (DeploymentOptions memory) {
        return deploymentOptions;
    }

    function getProtocolTreasuryConfiguration() external view returns (ProtocolTreasuryConfiguration memory) {
        return ProtocolTreasuryConfiguration({gatedUntil: block.timestamp + 90 minutes});
    }

    function getEarliestRewardsClaimableTimestamp() public view returns (Timestamp) {
        return Timestamp.wrap(block.timestamp + 90 days);
    }

    function getCoinIssuerConfiguration() external pure returns (CoinIssuerConfiguration memory) {
        return CoinIssuerConfiguration({coinIssuerRate: 0.2e18});
    }

    function getGseConfiguration() external view returns (GseConfiguration memory) {
        return GseConfiguration({
            activationThreshold: _getUint(".activationThreshold", 100e18),
            ejectionThreshold: _getUint(".ejectionThreshold", 50e18)
        });
    }

    function getGovernanceProposerConfiguration() external view returns (GovernanceProposerConfiguration memory) {
        uint256 roundSize = _getUint(".governanceProposerRoundSize", 300);
        uint256 defaultQuorum = roundSize / 2 + 1;
        return GovernanceProposerConfiguration({
            quorum: _getUint(".governanceProposerQuorum", defaultQuorum),
            roundSize: roundSize
        });
    }

    function getGovernanceConfiguration() external view returns (GovernanceConfiguration memory) {
        bytes32 h = keccak256(bytes(networkName));

        if (h == keccak256("staging-public")) {
            return GovernanceConfiguration({
                proposeConfig: ProposeWithLockConfiguration({
                    lockDelay: Timestamp.wrap(60 * 60 * 24 * 30),
                    lockAmount: 100e18 * 100
                }),
                votingDelay: Timestamp.wrap(60),
                votingDuration: Timestamp.wrap(60 * 60),
                executionDelay: Timestamp.wrap(60),
                gracePeriod: Timestamp.wrap(60 * 60 * 24 * 7),
                quorum: 0.3e18,
                requiredYeaMargin: 0.04e18,
                minimumVotes: 50_000e18 * 200
            });
        } else if (h == keccak256("testnet")) {
            return GovernanceConfiguration({
                proposeConfig: ProposeWithLockConfiguration({
                    lockDelay: Timestamp.wrap(10 * 365 * 24 * 60 * 60),
                    lockAmount: 1250 * 200_000e18
                }),
                votingDelay: Timestamp.wrap(12 * 60 * 60),
                votingDuration: Timestamp.wrap(1 * 24 * 60 * 60),
                executionDelay: Timestamp.wrap(12 * 60 * 60),
                gracePeriod: Timestamp.wrap(1 * 24 * 60 * 60),
                quorum: 0.2e18,
                requiredYeaMargin: 0.1e18,
                minimumVotes: 100 * 200_000e18
            });
        } else if (h == keccak256("staging-ignition")) {
            return GovernanceConfiguration({
                proposeConfig: ProposeWithLockConfiguration({
                    lockDelay: Timestamp.wrap(10 * 365 * 24 * 60 * 60),
                    lockAmount: 1250 * 200_000e18
                }),
                votingDelay: Timestamp.wrap(7 * 24 * 60 * 60),
                votingDuration: Timestamp.wrap(7 * 24 * 60 * 60),
                executionDelay: Timestamp.wrap(30 * 24 * 60 * 60),
                gracePeriod: Timestamp.wrap(7 * 24 * 60 * 60),
                quorum: 0.2e18,
                requiredYeaMargin: 0.1e18,
                minimumVotes: 1250 * 200_000e18
            });
        } else if (h == keccak256("mainnet")) {
            return GovernanceConfiguration({
                proposeConfig: ProposeWithLockConfiguration({
                    lockDelay: Timestamp.wrap(90 * 24 * 60 * 60),
                    lockAmount: 258_750_000e18
                }),
                votingDelay: Timestamp.wrap(3 * 24 * 60 * 60),
                votingDuration: Timestamp.wrap(7 * 24 * 60 * 60),
                executionDelay: Timestamp.wrap(7 * 24 * 60 * 60),
                gracePeriod: Timestamp.wrap(7 * 24 * 60 * 60),
                quorum: 0.2e18,
                requiredYeaMargin: 0.33e18,
                minimumVotes: 1000 * 200_000e18
            });
        } else {
            // local, devnet, next-net
            return GovernanceConfiguration({
                proposeConfig: ProposeWithLockConfiguration({
                    lockDelay: Timestamp.wrap(60 * 60 * 24 * 30),
                    lockAmount: 1e24
                }),
                votingDelay: Timestamp.wrap(60),
                votingDuration: Timestamp.wrap(60 * 60),
                executionDelay: Timestamp.wrap(60),
                gracePeriod: Timestamp.wrap(60 * 60 * 24 * 7),
                quorum: 0.1e18,
                requiredYeaMargin: 0.04e18,
                minimumVotes: 400e18
            });
        }
    }

    function getFlushRewardConfiguration() external pure returns (FlushRewardConfiguration memory) {
        return FlushRewardConfiguration({rewardPerInsertion: 100e18, initialFundingAmount: 1_000_000e18});
    }

    function getGenesisState() external view returns (GenesisState memory) {
        return GenesisState({
            vkTreeRoot: bytes32(_getUint(".vkTreeRoot", 0)),
            protocolContractsHash: bytes32(_getUint(".protocolContractsHash", 0)),
            genesisArchiveRoot: bytes32(_getUint(".genesisArchiveRoot", 0))
        });
    }

    function getRewardConfiguration(IRewardDistributor _rewardDistributor) external view returns (RewardConfig memory) {
        // Default: sequencerBps=8000, checkpointReward=500e18
        // Mainnet: sequencerBps=7000, checkpointReward=400e18
        (uint16 sequencerBps, uint96 checkpointReward) = _getRewardDefaults();
        return RewardConfig({
            rewardDistributor: _rewardDistributor,
            sequencerBps: Bps.wrap(uint16(_getUint(".reward.sequencerBps", sequencerBps))),
            booster: IBoosterCore(_getAddress(".reward.booster", address(0))),
            checkpointReward: uint96(_getUint(".reward.checkpointReward", checkpointReward))
        });
    }

    function getRewardBoostConfiguration() external pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
    }

    function getStakingQueueConfiguration() external view returns (StakingQueueConfig memory) {
        bytes32 h = keccak256(bytes(networkName));

        if (h == keccak256("staging-public")) {
            return StakingQueueConfig({
                bootstrapValidatorSetSize: 48,
                bootstrapFlushSize: 48,
                normalFlushSizeMin: 1,
                normalFlushSizeQuotient: 2475,
                maxQueueFlushSize: 32
            });
        } else if (h == keccak256("testnet")) {
            return StakingQueueConfig({
                bootstrapValidatorSetSize: 256,
                bootstrapFlushSize: 256,
                normalFlushSizeMin: 4,
                normalFlushSizeQuotient: 2048,
                maxQueueFlushSize: 8
            });
        } else if (h == keccak256("staging-ignition")) {
            return StakingQueueConfig({
                bootstrapValidatorSetSize: 48,
                bootstrapFlushSize: 48,
                normalFlushSizeMin: 1,
                normalFlushSizeQuotient: 2048,
                maxQueueFlushSize: 24
            });
        } else if (h == keccak256("mainnet")) {
            return StakingQueueConfig({
                bootstrapValidatorSetSize: 1000,
                bootstrapFlushSize: 1000,
                normalFlushSizeMin: 1,
                normalFlushSizeQuotient: 2048,
                maxQueueFlushSize: 8
            });
        } else {
            // local, devnet, next-net, etc.
            return StakingQueueConfig({
                bootstrapValidatorSetSize: 0,
                bootstrapFlushSize: 0,
                normalFlushSizeMin: 48,
                normalFlushSizeQuotient: 2,
                maxQueueFlushSize: 48
            });
        }
    }

    function getRollupConfiguration(IRewardDistributor _rewardDistributor) external view returns (RollupConfigInput memory) {
        return RollupConfigInput({
            aztecSlotDuration: _getUint(".aztecSlotDuration", 36),
            aztecEpochDuration: _getUint(".aztecEpochDuration", 32),
            targetCommitteeSize: _getUint(".aztecTargetCommitteeSize", 48),
            lagInEpochsForValidatorSet: _getUint(".lagInEpochsForValidatorSet", 2),
            lagInEpochsForRandao: _getUint(".lagInEpochsForRandao", 2),
            aztecProofSubmissionEpochs: _getUint(".aztecProofSubmissionEpochs", 1),
            localEjectionThreshold: _getUint(".localEjectionThreshold", 98e18),
            slashingQuorum: _getSlashingQuorum(),
            slashingRoundSize: _getSlashingRoundSize(),
            slashingLifetimeInRounds: _getUint(".slashingLifetimeInRounds", 5),
            slashingExecutionDelayInRounds: _getUint(".slashingExecutionDelayInRounds", 0),
            slashAmounts: _getSlashAmounts(),
            slashingOffsetInRounds: _getSlashingOffset(),
            slasherFlavor: _getSlasherFlavor(),
            slashingVetoer: _getAddress(".slashingVetoer", address(0)),
            slashingDisableDuration: _getUint(".slashingDisableDuration", 5 days),
            manaTarget: _getUint(".manaTarget", 100_000_000),
            exitDelaySeconds: _getUint(".exitDelaySeconds", 2 days),
            version: 0,
            provingCostPerMana: EthValue.wrap(_getUint(".provingCostPerMana", 100)),
            rewardConfig: this.getRewardConfiguration(_rewardDistributor),
            rewardBoostConfig: this.getRewardBoostConfiguration(),
            stakingQueueConfig: this.getStakingQueueConfiguration(),
            earliestRewardsClaimableTimestamp: getEarliestRewardsClaimableTimestamp()
        });
    }

    function _getSlasherFlavor() private view returns (SlasherFlavor) {
        return _parseSlasherFlavor(_getString(".slasherFlavor", "tally"));
    }

    function _getSlashingRoundSize() private view returns (uint256) {
        uint256 roundSizeInEpochs = _getUint(".slashingRoundSizeInEpochs", 4);
        uint256 aztecEpochDuration = _getUint(".aztecEpochDuration", 32);
        uint256 defaultRoundSize = roundSizeInEpochs * aztecEpochDuration;
        return defaultRoundSize;
    }

    function _getSlashingQuorum() private view returns (uint256) {
        uint256 roundSize = _getSlashingRoundSize();
        uint256 defaultQuorum = roundSize / 2 + 1;
        return _getUint(".slashingQuorum", defaultQuorum);
    }

    function _getSlashingOffset() private view returns (uint256) {
        SlasherFlavor flavor = _getSlasherFlavor();
        return _getUint(".slashingOffsetInRounds", flavor == SlasherFlavor.TALLY ? 2 : 0);
    }

    function _getSlashAmounts() private view returns (uint256[3] memory) {
        return [
            _getUint(".slashAmountSmall", 10e18),
            _getUint(".slashAmountMedium", 20e18),
            _getUint(".slashAmountLarge", 50e18)
        ];
    }

    function getRewardDistributorFunding() external view returns (uint256) {
        (, uint96 checkpointReward) = _getRewardDefaults();
        uint256 defaultFunding = uint256(checkpointReward) * 200_000;
        return _getUint(".rewardDistributorFunding", defaultFunding);
    }

    function getZkPassportConfiguration() external view returns (ZkPassportConfiguration memory) {
        return zkPassportConfig;
    }

    function parseValidators() external view returns (CheatDepositArgs[] memory) {
        if (!configJson.keyExists(".initialValidators")) {
            return new CheatDepositArgs[](0);
        }

        uint256 count = _countValidators();
        if (count == 0) {
            return new CheatDepositArgs[](0);
        }

        CheatDepositArgs[] memory validators = new CheatDepositArgs[](count);
        for (uint256 i = 0; i < count; i++) {
            validators[i] = _parseValidator(i);
        }
        return validators;
    }

    // ============ Internal Loading Functions ============

    function _loadDeploymentOptions() private {
        address existingAsset = _getAddress(".existingStakingAssetAddress", address(0));

        deploymentOptions = DeploymentOptions({
            useMockVerifier: _getBool(".useMockVerifier", true),
            fundRewardDistributor: _getBool(".fundRewardDistributor", true),
            existingStakingAssetAddress: existingAsset
        });
    }

    function _loadZkPassportConfiguration() private {
        zkPassportConfig = ZkPassportConfiguration({
            domain: _getString(".zkPassportDomain", "sequencer.alpha-testnet.aztec.network"),
            scope: _getString(".zkPassportScope", "personhood")
        });
    }

    function _getRewardDefaults() private view returns (uint16 sequencerBps, uint96 checkpointReward) {
        if (keccak256(bytes(networkName)) == keccak256("mainnet")) {
            return (7000, 400e18);
        }
        return (8000, 500e18);
    }

    // ============ Validator Parsing ============
    // TODO(AD): Is there anything less clumsy possible here?
    // TODO(AD): but test-only code...
    function _countValidators() private view returns (uint256 count) {
        while (configJson.keyExists(string.concat(".initialValidators[", vm.toString(count), "]"))) {
            count++;
        }
    }

    function _parseValidator(uint256 i) private view returns (CheatDepositArgs memory) {
        string memory basePath = string.concat(".initialValidators[", vm.toString(i), "]");
        (G1Point memory pubKeyG1, G1Point memory pop) = _computeG1Points(basePath);

        return CheatDepositArgs({
            attester: configJson.readAddress(string.concat(basePath, ".attester")),
            withdrawer: configJson.readAddress(string.concat(basePath, ".withdrawer")),
            publicKeyInG2: _parseG2Point(basePath),
            publicKeyInG1: pubKeyG1,
            proofOfPossession: pop
        });
    }

    function _computeG1Points(string memory basePath) private view returns (G1Point memory, G1Point memory) {
        uint256 privateKey = configJson.readUint(string.concat(basePath, ".privateKey"));
        G1Point memory pubKeyG1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), privateKey);
        G1Point memory pop = BN254Lib.g1Mul(BN254Lib.g1ToDigestPoint(pubKeyG1), privateKey);
        return (pubKeyG1, pop);
    }

    function _parseG2Point(string memory basePath) private view returns (G2Point memory) {
        return G2Point({
            x0: configJson.readUint(string.concat(basePath, ".publicKeyInG2.x0")),
            x1: configJson.readUint(string.concat(basePath, ".publicKeyInG2.x1")),
            y0: configJson.readUint(string.concat(basePath, ".publicKeyInG2.y0")),
            y1: configJson.readUint(string.concat(basePath, ".publicKeyInG2.y1"))
        });
    }

    // ============ JSON Helpers ============

    function _getUint(string memory path, uint256 defaultValue) private view returns (uint256) {
        return configJson.readUintOr(path, defaultValue);
    }

    function _getBool(string memory path, bool defaultValue) private view returns (bool) {
        return configJson.readBoolOr(path, defaultValue);
    }

    function _getAddress(string memory path, address defaultValue) private view returns (address) {
        return configJson.readAddressOr(path, defaultValue);
    }

    function _getString(string memory path, string memory defaultValue) private view returns (string memory) {
        return configJson.readStringOr(path, defaultValue);
    }

    function _parseSlasherFlavor(string memory flavor) private pure returns (SlasherFlavor) {
        if (keccak256(bytes(flavor)) == keccak256("empire")) return SlasherFlavor.EMPIRE;
        if (keccak256(bytes(flavor)) == keccak256("tally")) return SlasherFlavor.TALLY;
        return SlasherFlavor.NONE;
    }
}
