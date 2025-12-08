// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {HonkVerifier} from "../../../generated/HonkVerifier.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";

import {DeploymentConfiguration} from "./DeploymentConfiguration.sol";
import {DeploymentOptions} from "./IDeploymentConfiguration.sol";

/**
 * @title DeployRollupForUpgrade
 * @notice Deploy a new Rollup contract for upgrading an existing Aztec deployment.
 *
 * This script deploys only:
 *   - Verifier (Mock or Real HonkVerifier)
 *   - Rollup contract
 *   - SlashFactory
 *
 * It uses existing infrastructure contracts passed via environment variables:
 *   - REGISTRY_ADDRESS
 *   - GSE_ADDRESS
 *   - GOVERNANCE_ADDRESS
 *   - FEE_ASSET_ADDRESS
 *   - STAKING_ASSET_ADDRESS
 *
 * After deployment, it optionally:
 *   - Registers the new Rollup in Registry/GSE (if deployer is owner)
 *   - Funds the FeeJuicePortal (if FUND_FEE_JUICE_PORTAL=true)
 *
 * Usage:
 *   REGISTRY_ADDRESS=0x... \
 *   GSE_ADDRESS=0x... \
 *   GOVERNANCE_ADDRESS=0x... \
 *   FEE_ASSET_ADDRESS=0x... \
 *   STAKING_ASSET_ADDRESS=0x... \
 *   forge script script/deploy/rollup/DeployRollupForUpgrade.s.sol:DeployRollupForUpgrade \
 *     --sig "run(string)" "./upgrade-output.json" \
 *     --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast -vvv
 *
 * See DeploymentConfiguration.sol for rollup configuration variables (genesis, timing, slashing, etc.)
 */
contract DeployRollupForUpgrade is Script, Test {
    // Existing infrastructure (loaded from env)
    struct L1ContractsConfiguration {
        Registry registry;
        GSE gseContract;
        address governance;
        IERC20 feeAsset;
        IERC20 stakingAsset;
        RewardDistributor rewardDistributor;
    }

    struct NewlyDeployedContracts {
        IVerifier verifier;
        Rollup rollup;
        SlashFactory slashFactory;
    }

    L1ContractsConfiguration public L1_CONTRACTS;
    NewlyDeployedContracts public deployed;

    address public DEPLOYER;
    DeploymentConfiguration public CONFIG;

    function setUp() public virtual {
        // i.e. the private key passed to the deploy script
        DEPLOYER = msg.sender;
    }

    function deployRollup() internal {
        GenesisState memory genesisState = CONFIG.getGenesisState();
        RollupConfigInput memory rollupConfig = CONFIG.getRollupConfiguration(
            IRewardDistributor(address(REWARD_DISTRIBUTOR))
        );

        ROLLUP = new Rollup(
            L1_CONTRACTS.feeAsset,
            L1_CONTRACTS.stakingAsset,
            L1_CONTRACTS.gseContract,
            VERIFIER,
            L1_CONTRACTS.governance,
            genesisState,
            rollupConfig
        );
    }

    function run(string memory _outputPath) public {
        _loadExistingContracts();

        CONFIG = new DeploymentConfiguration();
        CONFIG.loadConfig();
        CONFIG.validateConfig();

        vm.startBroadcast(DEPLOYER);
        _deployRollupContracts();
        _postDeploySetup();
        vm.stopBroadcast();

        _writeDeploymentOutput(_outputPath);
    }

    function run() public {
        _loadExistingContracts();

        CONFIG = new DeploymentConfiguration();
        CONFIG.loadConfig();
        CONFIG.validateConfig();

        vm.startBroadcast(DEPLOYER);
        _deployRollupContracts();
        _postDeploySetup();
        vm.stopBroadcast();
    }

    function _loadExistingContracts() internal {
        address registryAddr = vm.envAddress("REGISTRY_ADDRESS");
        address gseAddr = vm.envAddress("GSE_ADDRESS");
        address governanceAddr = vm.envAddress("GOVERNANCE_ADDRESS");
        address feeAssetAddr = vm.envAddress("FEE_ASSET_ADDRESS");
        address stakingAssetAddr = vm.envAddress("STAKING_ASSET_ADDRESS");

        require(registryAddr != address(0), "REGISTRY_ADDRESS required");
        require(gseAddr != address(0), "GSE_ADDRESS required");
        require(governanceAddr != address(0), "GOVERNANCE_ADDRESS required");
        require(feeAssetAddr != address(0), "FEE_ASSET_ADDRESS required");
        require(stakingAssetAddr != address(0), "STAKING_ASSET_ADDRESS required");

        REGISTRY = Registry(registryAddr);
        GSE_CONTRACT = GSE(gseAddr);
        GOVERNANCE = governanceAddr;
        FEE_ASSET = IERC20(feeAssetAddr);
        STAKING_ASSET = IERC20(stakingAssetAddr);
        REWARD_DISTRIBUTOR = RewardDistributor(address(REGISTRY.getRewardDistributor()));
    }

    function _deployRollupContracts() internal {
        // Deploy verifier
        DeploymentOptions memory opts = CONFIG.getContractOptions();
        if (!opts.realVerifier) {
            VERIFIER = new MockVerifier();
        } else {
            VERIFIER = IVerifier(address(new HonkVerifier()));
        }

        // Deploy rollup
        GenesisState memory genesisState = CONFIG.getGenesisState();
        RollupConfigInput memory rollupConfig = CONFIG.getRollupConfiguration(
            IRewardDistributor(address(REWARD_DISTRIBUTOR))
        );

        // For upgrades, version = number of existing versions in Registry
        // This ensures each rollup has a unique, incrementing version
        uint256 nextVersion = REGISTRY.numberOfVersions();
        rollupConfig.version = uint32(nextVersion);

        ROLLUP = new Rollup(
            FEE_ASSET,
            STAKING_ASSET,
            GSE_CONTRACT,
            VERIFIER,
            GOVERNANCE,
            genesisState,
            rollupConfig
        );

        // Deploy slash factory
        SLASH_FACTORY = new SlashFactory(ROLLUP);
    }

    function _postDeploySetup() internal {
        // Register in Registry if we're the owner
        if (Ownable(address(REGISTRY)).owner() == DEPLOYER) {
            REGISTRY.addRollup(ROLLUP);
        }

        // Register in GSE if we're the owner
        if (Ownable(address(GSE_CONTRACT)).owner() == DEPLOYER) {
            GSE_CONTRACT.addRollup(address(ROLLUP));
        }

        // Fund FeeJuicePortal if requested
        bool shouldFund = vm.envOr("FUND_FEE_JUICE_PORTAL", false);
        uint256 fundingAmount = vm.envOr("FEE_JUICE_PORTAL_BALANCE", uint256(0));
        DeploymentOptions memory opts = CONFIG.getContractOptions();

        if (shouldFund && fundingAmount > 0 && opts.existingStakingAssetAddress == address(0)) {
            TestERC20(address(FEE_ASSET)).mint(address(ROLLUP.getFeeAssetPortal()), fundingAmount);
        }
    }

    function _writeDeploymentOutput(string memory _outputPath) internal {
        string memory json = "upgrade";
        vm.serializeAddress(json, "rollupAddress", address(ROLLUP));
        vm.serializeAddress(json, "verifierAddress", address(VERIFIER));
        vm.serializeAddress(json, "slashFactoryAddress", address(SLASH_FACTORY));
        vm.serializeAddress(json, "inboxAddress", address(ROLLUP.getInbox()));
        vm.serializeAddress(json, "outboxAddress", address(ROLLUP.getOutbox()));
        vm.serializeAddress(json, "feeAssetPortalAddress", address(ROLLUP.getFeeAssetPortal()));
        string memory finalJson = vm.serializeUint(json, "rollupVersion", ROLLUP.getVersion());
        vm.writeJson(finalJson, _outputPath);
    }
}
