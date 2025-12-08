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
 * @notice Implements IDeploymentConfiguration with values loaded from environment variables.
 *         Uses individual getter functions to avoid stack too deep issues.
 *
 * Environment Variables:
 *   NETWORK                              - Network name (local, devnet, testnet, mainnet, etc.)
 *   REAL_VERIFIER                    - Use mock verifier (default: true)
 *   FUND_REWARD_DISTRIBUTOR              - Fund reward distributor (default: true)
 *   DEPLOY_FEE_ASSET_HANDLER             - Deploy fee asset handler (default: true)
 *   DEPLOY_STAKING_ASSET_HANDLER         - Deploy staking asset handler (default: true)
 *   EXISTING_STAKING_ASSET_ADDRESS       - Use existing ERC20 for staking (default: deploy new)
 *   VK_TREE_ROOT                         - VK tree root for genesis
 *   PROTOCOL_CONTRACTS_HASH              - Protocol contracts hash for genesis
 *   GENESIS_ARCHIVE_ROOT                 - Genesis archive root
 *   AZTEC_SLOT_DURATION                  - L2 slot duration in seconds (default: 36)
 *   AZTEC_EPOCH_DURATION                 - L2 slots per epoch (default: 32)
 *   AZTEC_TARGET_COMMITTEE_SIZE          - Target committee size (default: 48)
 *   AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET - Lag for validator set (default: 2)
 *   AZTEC_LAG_IN_EPOCHS_FOR_RANDAO       - Lag for randao (default: 2)
 *   AZTEC_PROOF_SUBMISSION_EPOCHS        - Proof submission window (default: 1)
 *   AZTEC_ACTIVATION_THRESHOLD           - Validator deposit amount (default: 100e18)
 *   AZTEC_EJECTION_THRESHOLD             - Minimum validator stake (default: 50e18)
 *   AZTEC_LOCAL_EJECTION_THRESHOLD       - Local ejection threshold (default: 98e18)
 *   AZTEC_SLASHER_FLAVOR                 - Slasher type: none, tally, empire (default: tally)
 *   AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS  - Slashing round size (default: 4)
 *   AZTEC_SLASHING_OFFSET_IN_ROUNDS      - Slashing offset (default: 2 for tally)
 *   AZTEC_SLASHING_LIFETIME_IN_ROUNDS    - Slashing lifetime (default: 5)
 *   AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS - Execution delay (default: 0)
 *   AZTEC_SLASHING_VETOER                - Slashing vetoer address (default: 0x0)
 *   AZTEC_SLASHING_DISABLE_DURATION      - Disable duration in seconds (default: 5 days)
 *   AZTEC_SLASH_AMOUNT_SMALL             - Small slash amount (default: 10e18)
 *   AZTEC_SLASH_AMOUNT_MEDIUM            - Medium slash amount (default: 20e18)
 *   AZTEC_SLASH_AMOUNT_LARGE             - Large slash amount (default: 50e18)
 *   AZTEC_MANA_TARGET                    - Mana target (default: 100_000_000)
 *   AZTEC_PROVING_COST_PER_MANA          - Proving cost per mana (default: 100)
 *   AZTEC_EXIT_DELAY_SECONDS             - Exit delay (default: 2 days)
 *   AZTEC_GOVERNANCE_PROPOSER_QUORUM     - Governance quorum (default: roundSize/2 + 1)
 *   AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE - Governance round size (default: 300)
 *   ZKPASSPORT_DOMAIN                    - ZKPassport domain
 *   ZKPASSPORT_SCOPE                     - ZKPassport scope
 *   INITIAL_VALIDATORS                   - JSON array of initial validators (default: [])
 */
contract DeploymentConfiguration is IDeploymentConfiguration, Test {
    using stdJson for string;

    // Storage for loaded config
    string public networkName;
    string internal validatorsJson;
    DeploymentOptions public deploymentOptions;
    ZkPassportConfiguration public zkPassportConfig;

    function loadConfig() external {
        networkName = vm.envOr("NETWORK", string("local"));
        validatorsJson = vm.envOr("INITIAL_VALIDATORS", string("[]"));
        _loadDeploymentOptions();
        _loadZkPassportConfiguration();
    }

    // ============ IDeploymentConfiguration Implementation ============

    function realVerifier() external view returns (bool) {
        return deploymentOptions.realVerifier;
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
        // We only set a delay on mainnet.
        // Since we don't plan to redeploy on mainnet (knock on wood), this is mostly documentation in code form.
        if (block.chainid == 1) {
            return Timestamp.wrap(block.timestamp + 90 days);
        } else {
            return Timestamp.wrap(0);
        }
    }

    function getCoinIssuerConfiguration() external pure returns (CoinIssuerConfiguration memory) {
        return CoinIssuerConfiguration({coinIssuerRate: 0.2e18});
    }

    function getGseConfiguration() external view returns (GseConfiguration memory) {
        return GseConfiguration({
            activationThreshold: vm.envOr("AZTEC_ACTIVATION_THRESHOLD", uint256(100e18)),
            ejectionThreshold: vm.envOr("AZTEC_EJECTION_THRESHOLD", uint256(50e18))
        });
    }

    function getGovernanceProposerConfiguration() external view returns (GovernanceProposerConfiguration memory) {
        uint256 roundSize = vm.envOr("AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE", uint256(300));
        uint256 defaultQuorum = roundSize / 2 + 1;
        return GovernanceProposerConfiguration({
            quorum: vm.envOr("AZTEC_GOVERNANCE_PROPOSER_QUORUM", defaultQuorum),
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
            vkTreeRoot: bytes32(vm.envOr("VK_TREE_ROOT", uint256(0))),
            protocolContractsHash: bytes32(vm.envOr("PROTOCOL_CONTRACTS_HASH", uint256(0))),
            genesisArchiveRoot: bytes32(vm.envOr("GENESIS_ARCHIVE_ROOT", uint256(0)))
        });
    }

    function getRewardConfiguration(IRewardDistributor _rewardDistributor) external view returns (RewardConfig memory) {
        // Default: sequencerBps=8000, checkpointReward=500e18
        // Mainnet: sequencerBps=7000, checkpointReward=400e18
        (uint16 sequencerBps, uint96 checkpointReward) = _getRewardDefaults();
        return RewardConfig({
            rewardDistributor: _rewardDistributor,
            sequencerBps: Bps.wrap(uint16(vm.envOr("REWARD_SEQUENCER_BPS", uint256(sequencerBps)))),
            booster: IBoosterCore(vm.envOr("REWARD_BOOSTER", address(0))),
            checkpointReward: uint96(vm.envOr("REWARD_CHECKPOINT_REWARD", uint256(checkpointReward)))
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
            aztecSlotDuration: vm.envOr("AZTEC_SLOT_DURATION", uint256(36)),
            aztecEpochDuration: vm.envOr("AZTEC_EPOCH_DURATION", uint256(32)),
            targetCommitteeSize: vm.envOr("AZTEC_TARGET_COMMITTEE_SIZE", uint256(48)),
            lagInEpochsForValidatorSet: vm.envOr("AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET", uint256(2)),
            lagInEpochsForRandao: vm.envOr("AZTEC_LAG_IN_EPOCHS_FOR_RANDAO", uint256(2)),
            aztecProofSubmissionEpochs: vm.envOr("AZTEC_PROOF_SUBMISSION_EPOCHS", uint256(1)),
            localEjectionThreshold: vm.envOr("AZTEC_LOCAL_EJECTION_THRESHOLD", uint256(98e18)),
            slashingQuorum: _getSlashingQuorum(),
            slashingRoundSize: _getSlashingRoundSize(),
            slashingLifetimeInRounds: vm.envOr("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", uint256(5)),
            slashingExecutionDelayInRounds: vm.envOr("AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS", uint256(0)),
            slashAmounts: _getSlashAmounts(),
            slashingOffsetInRounds: _getSlashingOffset(),
            slasherFlavor: _getSlasherFlavor(),
            slashingVetoer: vm.envOr("AZTEC_SLASHING_VETOER", address(0)),
            slashingDisableDuration: vm.envOr("AZTEC_SLASHING_DISABLE_DURATION", uint256(5 days)),
            manaTarget: vm.envOr("AZTEC_MANA_TARGET", uint256(100_000_000)),
            exitDelaySeconds: vm.envOr("AZTEC_EXIT_DELAY_SECONDS", uint256(2 days)),
            version: 0,
            provingCostPerMana: EthValue.wrap(vm.envOr("AZTEC_PROVING_COST_PER_MANA", uint256(100))),
            rewardConfig: this.getRewardConfiguration(_rewardDistributor),
            rewardBoostConfig: this.getRewardBoostConfiguration(),
            stakingQueueConfig: this.getStakingQueueConfiguration(),
            earliestRewardsClaimableTimestamp: getEarliestRewardsClaimableTimestamp()
        });
    }

    function _getSlasherFlavor() private view returns (SlasherFlavor) {
        return _parseSlasherFlavor(vm.envOr("AZTEC_SLASHER_FLAVOR", string("tally")));
    }

    function _getSlashingRoundSize() private view returns (uint256) {
        uint256 roundSizeInEpochs = vm.envOr("AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS", uint256(4));
        uint256 aztecEpochDuration = vm.envOr("AZTEC_EPOCH_DURATION", uint256(32));
        uint256 defaultRoundSize = roundSizeInEpochs * aztecEpochDuration;
        return defaultRoundSize;
    }

    function _getSlashingQuorum() private view returns (uint256) {
        uint256 roundSize = _getSlashingRoundSize();
        uint256 defaultQuorum = roundSize / 2 + 1;
        return vm.envOr("AZTEC_SLASHING_QUORUM", defaultQuorum);
    }

    function _getSlashingOffset() private view returns (uint256) {
        SlasherFlavor flavor = _getSlasherFlavor();
        return vm.envOr("AZTEC_SLASHING_OFFSET_IN_ROUNDS", flavor == SlasherFlavor.TALLY ? uint256(2) : uint256(0));
    }

    function _getSlashAmounts() private view returns (uint256[3] memory) {
        return [
            vm.envOr("AZTEC_SLASH_AMOUNT_SMALL", uint256(10e18)),
            vm.envOr("AZTEC_SLASH_AMOUNT_MEDIUM", uint256(20e18)),
            vm.envOr("AZTEC_SLASH_AMOUNT_LARGE", uint256(50e18))
        ];
    }

    function getRewardDistributorFunding() external view returns (uint256) {
        (, uint96 checkpointReward) = _getRewardDefaults();
        uint256 defaultFunding = uint256(checkpointReward) * 200_000;
        return vm.envOr("REWARD_DISTRIBUTOR_FUNDING", defaultFunding);
    }

    function getZkPassportConfiguration() external view returns (ZkPassportConfiguration memory) {
        return zkPassportConfig;
    }

    function parseValidators() external view returns (CheatDepositArgs[] memory) {
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
        deploymentOptions = DeploymentOptions({
            realVerifier: vm.envOr("REAL_VERIFIER", true),
            fundRewardDistributor: vm.envOr("FUND_REWARD_DISTRIBUTOR", true),
            existingStakingAssetAddress: vm.envOr("EXISTING_STAKING_ASSET_ADDRESS", address(0))
        });
    }

    function _loadZkPassportConfiguration() private {
        zkPassportConfig = ZkPassportConfiguration({
            domain: vm.envOr("ZKPASSPORT_DOMAIN", string("sequencer.alpha-testnet.aztec.network")),
            scope: vm.envOr("ZKPASSPORT_SCOPE", string("personhood"))
        });
    }

    function _getRewardDefaults() private view returns (uint16 sequencerBps, uint96 checkpointReward) {
        if (keccak256(bytes(networkName)) == keccak256("mainnet")) {
            return (7000, 400e18);
        }
        return (8000, 500e18);
    }

    // ============ Validator Parsing (from INITIAL_VALIDATORS env var JSON) ============
    // TODO(AD): Is there anything less clumsy possible here?
    // TODO(AD): but test-only code...
    function _countValidators() private view returns (uint256 count) {
        while (validatorsJson.keyExists(string.concat("[", vm.toString(count), "]"))) {
            count++;
        }
    }

    function _parseValidator(uint256 i) private view returns (CheatDepositArgs memory) {
        string memory basePath = string.concat("[", vm.toString(i), "]");
        (G1Point memory pubKeyG1, G1Point memory pop) = _computeG1Points(basePath);

        return CheatDepositArgs({
            attester: validatorsJson.readAddress(string.concat(basePath, ".attester")),
            withdrawer: validatorsJson.readAddress(string.concat(basePath, ".withdrawer")),
            publicKeyInG2: _parseG2Point(basePath),
            publicKeyInG1: pubKeyG1,
            proofOfPossession: pop
        });
    }

    function _computeG1Points(string memory basePath) private view returns (G1Point memory, G1Point memory) {
        uint256 privateKey = validatorsJson.readUint(string.concat(basePath, ".privateKey"));
        G1Point memory pubKeyG1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), privateKey);
        G1Point memory pop = BN254Lib.g1Mul(BN254Lib.g1ToDigestPoint(pubKeyG1), privateKey);
        return (pubKeyG1, pop);
    }

    function _parseG2Point(string memory basePath) private view returns (G2Point memory) {
        return G2Point({
            x0: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.x0")),
            x1: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.x1")),
            y0: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.y0")),
            y1: validatorsJson.readUint(string.concat(basePath, ".publicKeyInG2.y1"))
        });
    }

    function _parseSlasherFlavor(string memory flavor) private pure returns (SlasherFlavor) {
        if (keccak256(bytes(flavor)) == keccak256("empire")) return SlasherFlavor.EMPIRE;
        if (keccak256(bytes(flavor)) == keccak256("tally")) return SlasherFlavor.TALLY;
        return SlasherFlavor.NONE;
    }

    // ============ Configuration Validation ============

    /**
     * @notice Validates the deployment configuration to ensure all requirements enforced by L1 contracts
     *         during construction are satisfied before deployment.
     * @dev Reverts with descriptive error messages if any validation fails.
     *      Call this function before deploying to catch configuration errors early.
     */
    function validateConfig() external view {
        // Get configuration values
        StakingQueueConfig memory stakingQueueConfig = this.getStakingQueueConfiguration();
        GovernanceProposerConfiguration memory govPropConfig = this.getGovernanceProposerConfiguration();
        GseConfiguration memory gseConfig = this.getGseConfiguration();

        uint256 aztecSlotDuration = vm.envOr("AZTEC_SLOT_DURATION", uint256(36));
        uint256 aztecEpochDuration = vm.envOr("AZTEC_EPOCH_DURATION", uint256(32));
        uint256 aztecTargetCommitteeSize = vm.envOr("AZTEC_TARGET_COMMITTEE_SIZE", uint256(48));
        uint256 slashingRoundSizeInEpochs = vm.envOr("AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS", uint256(4));
        uint256 slashingLifetimeInRounds = vm.envOr("AZTEC_SLASHING_LIFETIME_IN_ROUNDS", uint256(5));
        uint256 slashingExecutionDelayInRounds = vm.envOr("AZTEC_SLASHING_EXECUTION_DELAY_IN_ROUNDS", uint256(0));
        uint256 slashingQuorum = _getSlashingQuorum();
        uint256 slashingRoundSize = _getSlashingRoundSize();
        uint256[3] memory slashAmounts = _getSlashAmounts();
        SlasherFlavor slasherFlavor = _getSlasherFlavor();
        uint256 slashingOffsetInRounds = _getSlashingOffset();

        // RollupCore constructor validation: normalFlushSizeMin > 0
        require(
            stakingQueueConfig.normalFlushSizeMin > 0,
            "validateConfig: normalFlushSizeMin must be greater than 0"
        );

        // EmpireBase constructor validations for governance proposers
        // require(QUORUM_SIZE > ROUND_SIZE / 2)
        require(
            govPropConfig.quorum > govPropConfig.roundSize / 2,
            "validateConfig: governanceProposerQuorum must be greater than half of roundSize"
        );

        // require(QUORUM_SIZE <= ROUND_SIZE)
        require(
            govPropConfig.quorum <= govPropConfig.roundSize,
            "validateConfig: governanceProposerQuorum cannot be larger than roundSize"
        );

        // Slashing quorum validations
        require(
            slashingQuorum > slashingRoundSize / 2,
            "validateConfig: slashingQuorum must be greater than half of slashingRoundSize"
        );

        require(
            slashingQuorum <= slashingRoundSize,
            "validateConfig: slashingQuorum cannot be larger than slashingRoundSize"
        );

        // EmpireBase and TallySlashingProposer lifetime and execution delay validation
        require(
            slashingLifetimeInRounds > slashingExecutionDelayInRounds,
            "validateConfig: slashingLifetimeInRounds must be greater than slashingExecutionDelayInRounds"
        );

        // Staking asset validation: activationThreshold >= ejectionThreshold
        require(
            gseConfig.activationThreshold >= gseConfig.ejectionThreshold,
            "validateConfig: activationThreshold must be >= ejectionThreshold"
        );

        // Basic positive checks
        require(aztecSlotDuration > 0, "validateConfig: aztecSlotDuration must be greater than 0");
        require(aztecEpochDuration > 0, "validateConfig: aztecEpochDuration must be greater than 0");

        // Tally-specific validations
        if (slasherFlavor == SlasherFlavor.TALLY) {
            _validateTallySlasherConfig(
                aztecEpochDuration,
                aztecTargetCommitteeSize,
                slashingRoundSizeInEpochs,
                slashingQuorum,
                slashingLifetimeInRounds,
                slashingOffsetInRounds,
                slashAmounts
            );
        }
    }

    /**
     * @notice Validates Tally slasher-specific configuration
     */
    function _validateTallySlasherConfig(
        uint256 aztecEpochDuration,
        uint256 aztecTargetCommitteeSize,
        uint256 slashingRoundSizeInEpochs,
        uint256 slashingQuorum,
        uint256 slashingLifetimeInRounds,
        uint256 slashingOffsetInRounds,
        uint256[3] memory slashAmounts
    ) private pure {
        uint256 roundSizeInSlots = slashingRoundSizeInEpochs * aztecEpochDuration;

        // From: require(SLASH_OFFSET_IN_ROUNDS > 0)
        require(
            slashingOffsetInRounds > 0,
            "validateConfig: slashingOffsetInRounds must be greater than 0 for tally slasher"
        );

        // From: require(QUORUM > 0)
        require(
            slashingQuorum > 0,
            "validateConfig: slashingQuorum must be greater than 0"
        );

        // From: require(ROUND_SIZE > 1)
        require(
            roundSizeInSlots > 1,
            "validateConfig: slashing round size in slots must be greater than 1"
        );

        // From: require(_slashAmounts[0] <= _slashAmounts[1])
        require(
            slashAmounts[0] <= slashAmounts[1],
            "validateConfig: slashAmountSmall must be <= slashAmountMedium"
        );

        // From: require(_slashAmounts[1] <= _slashAmounts[2])
        require(
            slashAmounts[1] <= slashAmounts[2],
            "validateConfig: slashAmountMedium must be <= slashAmountLarge"
        );

        // From: require(LIFETIME_IN_ROUNDS < ROUNDABOUT_SIZE)
        uint256 ROUNDABOUT_SIZE = 128;
        require(
            slashingLifetimeInRounds < ROUNDABOUT_SIZE,
            "validateConfig: slashingLifetimeInRounds must be less than 128"
        );

        // From: require(ROUND_SIZE_IN_EPOCHS > 0)
        require(
            slashingRoundSizeInEpochs > 0,
            "validateConfig: slashingRoundSizeInEpochs must be greater than 0"
        );

        // From: require(ROUND_SIZE < MAX_ROUND_SIZE)
        uint256 MAX_ROUND_SIZE = 1024;
        require(
            roundSizeInSlots < MAX_ROUND_SIZE,
            "validateConfig: slashing round size in slots must be less than 1024"
        );

        // From: require(COMMITTEE_SIZE > 0)
        require(
            aztecTargetCommitteeSize > 0,
            "validateConfig: aztecTargetCommitteeSize must be greater than 0"
        );

        // From: require(voteSize <= 128)
        // voteSize = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4
        uint256 voteSize = (aztecTargetCommitteeSize * slashingRoundSizeInEpochs) / 4;
        require(
            voteSize <= 128,
            "validateConfig: vote size must be <= 128"
        );

        // From: require(COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS % 4 == 0)
        require(
            (aztecTargetCommitteeSize * slashingRoundSizeInEpochs) % 4 == 0,
            "validateConfig: committee size * round size in epochs must be divisible by 4"
        );
    }

    // The following commented code has been ported to Solidity above.
    // Original TypeScript reference preserved for documentation:
// /**
//  * Validates the L1 contracts configuration to ensure all requirements enforced by L1 contracts
//  * during construction are satisfied before deployment.
//  * Accumulates all validation errors and throws an exception listing them all if any are found.
//  */
// export function validateConfig(config: Omit<L1ContractsConfig, keyof L1TxUtilsConfig>): void {
//   const errors: string[] = [];

//   // RollupCore constructor validation: normalFlushSizeMin > 0
//   // From: require(_config.stakingQueueConfig.normalFlushSizeMin > 0, Errors.Staking__InvalidStakingQueueConfig());
//   const entryQueueConfig = getEntryQueueConfig('testnet'); // Get config to check normalFlushSizeMin
//   if (entryQueueConfig.normalFlushSizeMin <= 0n) {
//     errors.push('normalFlushSizeMin must be greater than 0');
//   }

//   // TimeLib initialization validation: aztecSlotDuration should be a multiple of ethereumSlotDuration
//   // While not explicitly required in constructor, this is a common validation for time-based systems
//   if (config.aztecSlotDuration % config.ethereumSlotDuration !== 0) {
//     errors.push(
//       `aztecSlotDuration (${config.aztecSlotDuration}) must be a multiple of ethereumSlotDuration (${config.ethereumSlotDuration})`,
//     );
//   }

//   // EmpireBase constructor validations for governance/slashing proposers
//   // From: require(QUORUM_SIZE > ROUND_SIZE / 2, Errors.EmpireBase__InvalidQuorumAndRoundSize(QUORUM_SIZE, ROUND_SIZE));
//   const { governanceProposerQuorum, governanceProposerRoundSize } = config;
//   if (
//     governanceProposerQuorum !== undefined &&
//     governanceProposerQuorum <= Math.floor(governanceProposerRoundSize / 2)
//   ) {
//     errors.push(
//       `governanceProposerQuorum (${governanceProposerQuorum}) must be greater than half of governanceProposerRoundSize (${Math.floor(governanceProposerRoundSize / 2)})`,
//     );
//   }

//   // From: require(QUORUM_SIZE <= ROUND_SIZE, Errors.EmpireBase__QuorumCannotBeLargerThanRoundSize(QUORUM_SIZE, ROUND_SIZE));
//   if (governanceProposerQuorum !== undefined && governanceProposerQuorum > governanceProposerRoundSize) {
//     errors.push(
//       `governanceProposerQuorum (${governanceProposerQuorum}) cannot be larger than governanceProposerRoundSize (${governanceProposerRoundSize})`,
//     );
//   }

//   // Slashing quorum validations (similar to governance quorum)
//   const slashingRoundSize = config.slashingRoundSizeInEpochs * config.aztecEpochDuration;
//   const { slashingQuorum } = config;
//   if (slashingQuorum !== undefined && slashingQuorum <= Math.floor(slashingRoundSize / 2)) {
//     errors.push(
//       `slashingQuorum (${slashingQuorum}) must be greater than half of slashingRoundSizeInEpochs (${Math.floor(slashingRoundSize / 2)})`,
//     );
//   }

//   if (slashingQuorum !== undefined && slashingQuorum > slashingRoundSize) {
//     errors.push(
//       `slashingQuorum (${slashingQuorum}) cannot be larger than slashingRoundSizeInEpochs (${slashingRoundSize})`,
//     );
//   }

//   // EmpireBase and TallySlashingProposer lifetime and execution delay validation
//   // From: require(LIFETIME_IN_ROUNDS > EXECUTION_DELAY_IN_ROUNDS);
//   if (config.slashingLifetimeInRounds <= config.slashingExecutionDelayInRounds) {
//     errors.push(
//       `slashingLifetimeInRounds (${config.slashingLifetimeInRounds}) must be greater than slashingExecutionDelayInRounds (${config.slashingExecutionDelayInRounds})`,
//     );
//   }

//   // Staking asset validation: activationThreshold > ejectionThreshold
//   if (config.activationThreshold < config.ejectionThreshold) {
//     errors.push(
//       `activationThreshold (${config.activationThreshold}) must be greater than ejectionThreshold (${config.ejectionThreshold})`,
//     );
//   }

//   // TallySlashingProposer constructor validations
//   if (config.slasherFlavor === 'tally') {
//     validateTallySlasherConfig(config, errors);
//   }

//   // Epoch and slot duration validations
//   if (config.aztecSlotDuration <= 0) {
//     errors.push('aztecSlotDuration must be greater than 0');
//   }

//   if (config.ethereumSlotDuration <= 0) {
//     errors.push('ethereumSlotDuration must be greater than 0');
//   }

//   if (config.aztecEpochDuration <= 0) {
//     errors.push('aztecEpochDuration must be greater than 0');
//   }

//   // Committee size validation
//   if (config.aztecTargetCommitteeSize < 0) {
//     errors.push('aztecTargetCommitteeSize cannot be negative');
//   }

//   // Proof submission epochs validation
//   if (config.aztecProofSubmissionEpochs < 0) {
//     errors.push('aztecProofSubmissionEpochs cannot be negative');
//   }

//   // Exit delay validation
//   if (config.exitDelaySeconds < 0) {
//     errors.push('exitDelaySeconds cannot be negative');
//   }

//   // Mana validation
//   if (config.manaTarget < 0n) {
//     errors.push('manaTarget cannot be negative');
//   }

//   if (config.provingCostPerMana < 0n) {
//     errors.push('provingCostPerMana cannot be negative');
//   }

//   // If any errors were found, throw an exception with all of them
//   if (errors.length > 0) {
//     throw new Error(
//       `L1 contracts configuration validation failed with ${errors.length} error(s):\n${errors.map((error, index) => `${index + 1}. ${error}`).join('\n')}`,
//     );
//   }
// }

// function validateTallySlasherConfig(config: L1ContractsConfig, errors: string[]) {
//   if (config.slasherFlavor !== 'tally') {
//     return;
//   }

//   // From: require(SLASH_OFFSET_IN_ROUNDS > 0, Errors.TallySlashingProposer__SlashOffsetMustBeGreaterThanZero(...));
//   if (config.slashingOffsetInRounds <= 0) {
//     errors.push(`slashingOffsetInRounds (${config.slashingOffsetInRounds}) must be greater than 0`);
//   }

//   // From: require(ROUND_SIZE_IN_EPOCHS * _epochDuration == ROUND_SIZE, Errors.TallySlashingProposer__RoundSizeMustBeMultipleOfEpochDuration(...));
//   const roundSizeInSlots = config.slashingRoundSizeInEpochs * config.aztecEpochDuration;

//   // From: require(QUORUM > 0, Errors.TallySlashingProposer__QuorumMustBeGreaterThanZero());
//   const { slashingQuorum } = config;
//   if (slashingQuorum !== undefined && slashingQuorum <= 0) {
//     errors.push(`slashingQuorum (${slashingQuorum}) must be greater than 0`);
//   }

//   // From: require(ROUND_SIZE > 1, Errors.TallySlashingProposer__InvalidQuorumAndRoundSize(QUORUM, ROUND_SIZE));
//   if (roundSizeInSlots <= 1) {
//     errors.push(`slashing round size in slots (${roundSizeInSlots}) must be greater than 1`);
//   }

//   // From: require(_slashAmounts[0] <= _slashAmounts[1], Errors.TallySlashingProposer__InvalidSlashAmounts(_slashAmounts));
//   if (config.slashAmountSmall > config.slashAmountMedium) {
//     errors.push(
//       `slashAmountSmall (${config.slashAmountSmall}) must be less than or equal to slashAmountMedium (${config.slashAmountMedium})`,
//     );
//   }

//   // From: require(_slashAmounts[1] <= _slashAmounts[2], Errors.TallySlashingProposer__InvalidSlashAmounts(_slashAmounts));
//   if (config.slashAmountMedium > config.slashAmountLarge) {
//     errors.push(
//       `slashAmountMedium (${config.slashAmountMedium}) must be less than or equal to slashAmountLarge (${config.slashAmountLarge})`,
//     );
//   }

//   // From: require(LIFETIME_IN_ROUNDS < ROUNDABOUT_SIZE, Errors.TallySlashingProposer__LifetimeMustBeLessThanRoundabout(...));
//   const ROUNDABOUT_SIZE = 128; // Constant from TallySlashingProposer
//   if (config.slashingLifetimeInRounds >= ROUNDABOUT_SIZE) {
//     errors.push(`slashingLifetimeInRounds (${config.slashingLifetimeInRounds}) must be less than ${ROUNDABOUT_SIZE}`);
//   }

//   // From: require(ROUND_SIZE_IN_EPOCHS > 0, Errors.TallySlashingProposer__RoundSizeInEpochsMustBeGreaterThanZero(...));
//   if (config.slashingRoundSizeInEpochs <= 0) {
//     errors.push(`slashingRoundSizeInEpochs (${config.slashingRoundSizeInEpochs}) must be greater than 0`);
//   }

//   // From: require(ROUND_SIZE < MAX_ROUND_SIZE, Errors.TallySlashingProposer__RoundSizeTooLarge(ROUND_SIZE, MAX_ROUND_SIZE));
//   const MAX_ROUND_SIZE = 1024; // Constant from TallySlashingProposer
//   if (roundSizeInSlots >= MAX_ROUND_SIZE) {
//     errors.push(`slashing round size in slots (${roundSizeInSlots}) must be less than ${MAX_ROUND_SIZE}`);
//   }

//   // From: require(COMMITTEE_SIZE > 0, Errors.TallySlashingProposer__CommitteeSizeMustBeGreaterThanZero(COMMITTEE_SIZE));
//   if (config.aztecTargetCommitteeSize <= 0) {
//     errors.push(`aztecTargetCommitteeSize (${config.aztecTargetCommitteeSize}) must be greater than 0`);
//   }

//   // From: require(voteSize <= 128, Errors.TallySlashingProposer__VoteSizeTooBig(voteSize, 128));
//   // voteSize = COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS / 4
//   const voteSize = (config.aztecTargetCommitteeSize * config.slashingRoundSizeInEpochs) / 4;
//   if (voteSize > 128) {
//     errors.push(`vote size (${voteSize}) must be <= 128 (committee size * round size in epochs / 4)`);
//   }

//   // From: require(COMMITTEE_SIZE * ROUND_SIZE_IN_EPOCHS % 4 == 0, Errors.TallySlashingProposer__InvalidCommitteeAndRoundSize(...));
//   if ((config.aztecTargetCommitteeSize * config.slashingRoundSizeInEpochs) % 4 !== 0) {
//     errors.push(
//       `aztecTargetCommitteeSize * slashingRoundSizeInEpochs (${config.aztecTargetCommitteeSize * config.slashingRoundSizeInEpochs}) must be divisible by 4`,
//     );
//   }

//   // Slashing offset validation: should be positive to allow proper slashing timing
//   if (config.slashingOffsetInRounds < 0) {
//     errors.push('slashingOffsetInRounds cannot be negative');
//   }
// }

// Network-specific governance configurations reference.
// See getGovernanceConfiguration() for the actual implementation.
// These values are used to ensure consistency across networks.

// const LocalGovernanceConfiguration = {
//   proposeConfig: {
//     lockDelay: 60n * 60n * 24n * 30n,
//     lockAmount: 1n * 10n ** 24n,
//   },
//   votingDelay: 60n,
//   votingDuration: 60n * 60n,
//   executionDelay: 60n,
//   gracePeriod: 60n * 60n * 24n * 7n,
//   quorum: 1n * 10n ** 17n, // 10%
//   requiredYeaMargin: 4n * 10n ** 16n, // 4%
//   minimumVotes: 400n * 10n ** 18n,
// };

// const StagingPublicGovernanceConfiguration = {
//   proposeConfig: {
//     lockDelay: 60n * 60n * 24n * 30n,
//     lockAmount: DefaultL1ContractsConfig.activationThreshold * 100n,
//   },
//   votingDelay: 60n,
//   votingDuration: 60n * 60n,
//   executionDelay: 60n,
//   gracePeriod: 60n * 60n * 24n * 7n,
//   quorum: 3n * 10n ** 17n, // 30%
//   requiredYeaMargin: 4n * 10n ** 16n, // 4%
//   minimumVotes: DefaultL1ContractsConfig.ejectionThreshold * 200n, // >= 200 validators must vote
// };

// const TestnetGovernanceConfiguration = {
//   proposeConfig: {
//     lockDelay: 10n * 365n * 24n * 60n * 60n,
//     lockAmount: 1250n * 200_000n * 10n ** 18n,
//   },

//   votingDelay: 12n * 60n * 60n, // 12 hours
//   votingDuration: 1n * 24n * 60n * 60n, // 1 day
//   executionDelay: 12n * 60n * 60n, // 12 hours
//   gracePeriod: 1n * 24n * 60n * 60n, // 1 day
//   quorum: 2n * 10n ** 17n, // 20%
//   requiredYeaMargin: 1n * 10n ** 17n, // 10%
//   minimumVotes: 100n * 200_000n * 10n ** 18n,
// };

// const StagingIgnitionGovernanceConfiguration = {
//   proposeConfig: {
//     lockDelay: 10n * 365n * 24n * 60n * 60n,
//     lockAmount: 1250n * 200_000n * 10n ** 18n,
//   },

//   votingDelay: 7n * 24n * 60n * 60n,
//   votingDuration: 7n * 24n * 60n * 60n,
//   executionDelay: 30n * 24n * 60n * 60n,
//   gracePeriod: 7n * 24n * 60n * 60n,
//   quorum: 2n * 10n ** 17n, // 20%
//   requiredYeaMargin: 1n * 10n ** 17n, // 10%
//   minimumVotes: 1250n * 200_000n * 10n ** 18n,
// };

// const MainnetGovernanceConfiguration = {
//   proposeConfig: {
//     lockDelay: 90n * 24n * 60n * 60n,
//     lockAmount: 258_750_000n * 10n ** 18n,
//   },

//   votingDelay: 3n * 24n * 60n * 60n,
//   votingDuration: 7n * 24n * 60n * 60n,
//   executionDelay: 7n * 24n * 60n * 60n,
//   gracePeriod: 7n * 24n * 60n * 60n,
//   quorum: 2n * 10n ** 17n, // 20%
//   requiredYeaMargin: 33n * 10n ** 16n, // 33%
//   minimumVotes: 1000n * 200_000n * 10n ** 18n,
// };

// export const getGovernanceConfiguration = (networkName: NetworkNames) => {
//   switch (networkName) {
//     case 'local':
//       return LocalGovernanceConfiguration;
//     case 'next-net':
//       return LocalGovernanceConfiguration;
//     case 'devnet':
//       return LocalGovernanceConfiguration;
//     case 'staging-public':
//       return StagingPublicGovernanceConfiguration;
//     case 'testnet':
//       return TestnetGovernanceConfiguration;
//     case 'staging-ignition':
//       return StagingIgnitionGovernanceConfiguration;
//     case 'mainnet':
//       return MainnetGovernanceConfiguration;
//     default:
//       throw new Error(`Unrecognized network name: ${networkName}`);
//   }
// };

// // Making a default config here as we are only using it thought the deployment
// // and do not expect to be using different setups, so having environment variables
// // for it seems overkill

// const DefaultRewardConfig = {
//   sequencerBps: 8000,
//   rewardDistributor: EthAddress.ZERO.toString(),
//   booster: EthAddress.ZERO.toString(),
//   checkpointReward: 500n * 10n ** 18n,
// };

// const MainnetRewardConfig = {
//   sequencerBps: 7_000,
//   rewardDistributor: EthAddress.ZERO.toString(),
//   booster: EthAddress.ZERO.toString(),
//   checkpointReward: 400n * 10n ** 18n,
// };

// export const getRewardConfig = (networkName: NetworkNames) => {
//   switch (networkName) {
//     case 'local':
//     case 'devnet':
//     case 'next-net':
//     case 'staging-public':
//     case 'testnet':
//     case 'staging-ignition':
//       return DefaultRewardConfig;
//     case 'mainnet':
//       return MainnetRewardConfig;
//     default:
//       throw new Error(`Unrecognized network name: ${networkName}`);
//   }
// };

// export const getRewardBoostConfig = () => {
//   // The reward configuration is specified with a precision of 1e5, and we use the same across
//   // all networks.
//   return {
//     increment: 125_000, // 1.25
//     maxScore: 15_000_000, // 150
//     a: 1_000, // 0.01
//     k: 1_000_000, // 10
//     minimum: 100_000, // 1
//   };
// };

// // Similar to the above, no need for environment variables for this.
// const LocalEntryQueueConfig = {
//   bootstrapValidatorSetSize: 0n,
//   bootstrapFlushSize: 0n,
//   normalFlushSizeMin: 48n,
//   normalFlushSizeQuotient: 2n,
//   maxQueueFlushSize: 48n,
// };

// const StagingPublicEntryQueueConfig = {
//   bootstrapValidatorSetSize: 48n,
//   bootstrapFlushSize: 48n,
//   normalFlushSizeMin: 1n,
//   normalFlushSizeQuotient: 2475n,
//   maxQueueFlushSize: 32n, // Limited to 32 so flush cost are kept below 15M gas.
// };

// const TestnetEntryQueueConfig = {
//   bootstrapValidatorSetSize: 256n,
//   bootstrapFlushSize: 256n,
//   normalFlushSizeMin: 4n,
//   normalFlushSizeQuotient: 2048n,
//   maxQueueFlushSize: 8n,
// };

// const StagingIgnitionEntryQueueConfig = {
//   bootstrapValidatorSetSize: 48n,
//   bootstrapFlushSize: 48n,
//   normalFlushSizeMin: 1n,
//   normalFlushSizeQuotient: 2048n,
//   maxQueueFlushSize: 24n,
// };

// const MainnetEntryQueueConfig = {
//   bootstrapValidatorSetSize: 1_000n,
//   bootstrapFlushSize: 1_000n,
//   normalFlushSizeMin: 1n,
//   normalFlushSizeQuotient: 2_048n,
//   maxQueueFlushSize: 8n,
// };

// export const getEntryQueueConfig = (networkName: NetworkNames) => {
//   switch (networkName) {
//     case 'local':
//       return LocalEntryQueueConfig;
//     case 'next-net':
//       return LocalEntryQueueConfig;
//     case 'devnet':
//       return LocalEntryQueueConfig;
//     case 'staging-public':
//       return StagingPublicEntryQueueConfig;
//     case 'testnet':
//       return TestnetEntryQueueConfig;
//     case 'staging-ignition':
//       return StagingIgnitionEntryQueueConfig;
//     case 'mainnet':
//       return MainnetEntryQueueConfig;
//     default:
//       throw new Error(`Unrecognized network name: ${networkName}`);
//   }
// };

}
