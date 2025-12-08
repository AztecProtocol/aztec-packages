// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order, max-states-count, gas-small-strings, comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {Rollup} from "@aztec/core/Rollup.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";

import {HonkVerifier} from "../../../generated/HonkVerifier.sol";

import {RollupConfiguration} from "./RollupConfiguration.sol";
import {DeploymentOptions} from "./IDeploymentConfiguration.sol";

contract DeployRollupForUpgrade is Script, Test {
    // ============ Input L1 Infrastructure (loaded from env) ============

    /// @notice Existing L1 infrastructure contracts
    Registry public registry;
    GSE public gseContract;
    Governance public governance;
    IERC20 public feeAsset;
    IERC20 public stakingAsset;
    RewardDistributor public rewardDistributor;

    // ============ Newly Deployed Rollup Contracts ============

    /// @notice Newly deployed verifier (mock or real)
    IVerifier public verifier;
    /// @notice Newly deployed rollup contract
    Rollup public rollup;
    /// @notice Newly deployed slash factory
    SlashFactory public slashFactory;

    // ============ Configuration ============

    /// @notice Address performing the deployment
    address public deployer;
    /// @notice Rollup configuration component (for rollup-specific settings)
    RollupConfiguration public rollupConfig;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    function run(string memory _outputPath) public {
        _parseInputAddresses();
        rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        vm.startBroadcast(deployer);
        _deployRollup();
        vm.stopBroadcast();

        _writeDeploymentOutput(_outputPath);
    }

    function run() public {
        _parseInputAddresses();
        rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        vm.startBroadcast(deployer);
        _deployRollup();
        vm.stopBroadcast();
    }

    /// @notice Parse existing L1 infrastructure from environment variables
    function _parseInputAddresses() internal {
        address registryAddr = vm.envAddress("REGISTRY_ADDRESS");
        address gseAddr = vm.envAddress("GSE_ADDRESS");
        address governanceAddr = vm.envAddress("GOVERNANCE_ADDRESS");
        address feeAssetAddr = vm.envAddress("FEE_ASSET_ADDRESS");
        address stakingAssetAddr = vm.envAddress("STAKING_ASSET_ADDRESS");

        registry = Registry(registryAddr);
        gseContract = GSE(gseAddr);
        governance = Governance(governanceAddr);
        feeAsset = IERC20(feeAssetAddr);
        stakingAsset = IERC20(stakingAssetAddr);
        rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));
    }

    /// @notice Execute rollup deployment sequence
    function _deployRollup() internal {
        rollupConfig.validateConfig();

        // 1. Deploy verifier (mock or real)
        _deployVerifier();

        // 2. Build rollup configuration and deploy rollup
        _deployRollupContract();

        // 3. Optionally mint initial fee assets to portal
        _maybeMintInitialFeeAsset();

        // 4. Deploy slash factory
        _deploySlashFactory();

        // 5. Register rollup in registry
        _registerRollup();

        // 6. Add initial validators (if any)
        _maybeAddInitialValidators();

        // 7. Transfer ownership to governance (if not already owned)
        _transferOwnership();
    }

    /// @notice Deploy proof verifier (mock or real)
    function _deployVerifier() internal {
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        if (!opts.realVerifier) {
            verifier = new MockVerifier();
        } else {
            verifier = IVerifier(address(new HonkVerifier()));
        }
    }

    /// @notice Build rollup configuration and deploy rollup contract
    function _deployRollupContract() internal {
        GenesisState memory genesisState = rollupConfig.getGenesisState();
        RollupConfigInput memory rollupConfigInput = rollupConfig.getRollupConfiguration(
            IRewardDistributor(address(rewardDistributor))
        );

        rollup = new Rollup(
            feeAsset,
            stakingAsset,
            gseContract,
            verifier,
            address(governance),
            genesisState,
            rollupConfigInput
        );
    }

    function _deploySlashFactory() internal {
        slashFactory = new SlashFactory(rollup);
    }

    function _maybeMintInitialFeeAsset() internal {
        // We can only mint on test chains (when we control the fee asset).
        // This will revert if we ask for a balance > 0 and the fee asset is not a TestERC20.
        uint256 initialFeeAssetAmount = rollupConfig.getFeeJuicePortalInitialBalance();
        if (initialFeeAssetAmount > 0) {
            address feeAssetPortal = address(rollup.getFeeAssetPortal());
            TestERC20(address(feeAsset)).mint(feeAssetPortal, initialFeeAssetAmount);
        }
    }

    function _registerRollup() internal {
        registry.addRollup(rollup);
        gseContract.addRollup(address(rollup));
    }

    function _maybeAddInitialValidators() internal {
        CheatDepositArgs[] memory initialValidators = rollupConfig.parseValidators();
        MultiAdder multiAdder = new MultiAdder(address(rollup), deployer);

        uint256 activationThreshold = rollup.getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * initialValidators.length;
        TestERC20(address(stakingAsset)).mint(address(multiAdder), stakeNeeded);

        uint256 chunkSize = 16;
        for (uint256 i = 0; i < initialValidators.length; i += chunkSize) {
            uint256 end = i + chunkSize > initialValidators.length ? initialValidators.length : i + chunkSize;
            uint256 chunkLen = end - i;

            CheatDepositArgs[] memory chunk = new CheatDepositArgs[](chunkLen);
            for (uint256 j = 0; j < chunkLen; ++j) {
                chunk[j] = initialValidators[i + j];
            }

            multiAdder.addValidators(chunk, 0);
        }

        uint256 flushChunkSize = 16;
        while (true) {
            uint256 queueLength = rollup.getEntryQueueLength();
            if (queueLength == 0) break;

            uint256 availableFlushes = rollup.getAvailableValidatorFlushes();
            if (availableFlushes == 0) break;

            rollup.flushEntryQueue(flushChunkSize);
        }
    }

    function _transferOwnership() internal {
        rollup.transferOwnership(address(governance));
    }

    function _writeDeploymentOutput(string memory _outputPath) internal {
        string memory json = "rollup";
        vm.serializeAddress(json, "rollupAddress", address(rollup));
        vm.serializeAddress(json, "registryAddress", address(registry));
        vm.serializeAddress(json, "feeAssetAddress", address(feeAsset));
        vm.serializeAddress(json, "stakingAssetAddress", address(stakingAsset));
        vm.serializeAddress(json, "gseAddress", address(gseContract));
        vm.serializeAddress(json, "rewardDistributorAddress", address(rewardDistributor));
        vm.serializeAddress(json, "governanceAddress", address(governance));
        vm.serializeAddress(json, "verifierAddress", address(verifier));
        vm.serializeAddress(json, "slashFactoryAddress", address(slashFactory));
        // Query addresses from Rollup contract (these are set during Rollup deployment)
        vm.serializeAddress(json, "inboxAddress", address(rollup.getInbox()));
        vm.serializeAddress(json, "outboxAddress", address(rollup.getOutbox()));
        vm.serializeAddress(json, "feeAssetPortalAddress", address(rollup.getFeeAssetPortal()));
        string memory finalJson = vm.serializeUint(json, "rollupVersion", rollup.getVersion());
        vm.writeJson(finalJson, _outputPath);
    }
}
