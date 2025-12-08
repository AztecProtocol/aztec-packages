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
import {RollupConfiguration} from "./RollupConfiguration.sol";

/**
 * @title DeploymentConfiguration
 * @notice Implements IDeploymentConfiguration with values loaded from environment variables.
 *         Composes RollupConfiguration as a component for rollup-specific configuration.
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

    // Rollup configuration component
    RollupConfiguration public rollupConfig;

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
        _loadRollupConfiguration();
    }

    function _loadRollupConfiguration() private {
        rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();
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
        return rollupConfig.getGenesisState();
    }

    function getRewardConfiguration(IRewardDistributor _rewardDistributor) external view returns (RewardConfig memory) {
        return rollupConfig.getRewardConfiguration(_rewardDistributor);
    }

    function getRewardBoostConfiguration() external view returns (RewardBoostConfig memory) {
        return rollupConfig.getRewardBoostConfiguration();
    }

    function getStakingQueueConfiguration() external view returns (StakingQueueConfig memory) {
        return rollupConfig.getStakingQueueConfiguration();
    }

    function getRollupConfiguration(IRewardDistributor _rewardDistributor) external view returns (RollupConfigInput memory) {
        return rollupConfig.getRollupConfiguration(_rewardDistributor);
    }

    function getRewardDistributorFunding() external view returns (uint256) {
        return rollupConfig.getRewardDistributorFunding();
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

    // ============ Configuration Validation ============

    /**
     * @notice Validates invariants about the deployment. Reverts if any are violated.
     */
    function validateConfig() external view {
        // Delegate to rollup configuration for rollup-specific validation
        rollupConfig.validateConfig();
    }
}
