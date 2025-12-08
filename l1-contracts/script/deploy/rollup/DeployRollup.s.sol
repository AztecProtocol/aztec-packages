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

/// @title DeployRollup
/// @author Aztec Labs
/// @notice Core rollup deployment logic used by DeployL1Contracts and DeployRollupForUpgrade.
/// This contract handles the actual deployment of rollup contracts but does not provide
/// standalone entrypoints. Use DeployRollupForUpgrade.s.sol for standalone upgrades.
contract DeployRollup is Script, Test {
    // ============ L1 Infrastructure ============

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

        // 5. Register rollup in registry (if deployer is owner)
        _maybeRegisterRollup();

        // 6. Add initial validators (if any)
        _maybeAddInitialValidators();

        // 7. Transfer ownership to governance (if not already owned)
        _transferOwnership();
    }

    /// @notice Deploy proof verifier (mock or real)
    function _deployVerifier() internal {
        if (!rollupConfig.useRealVerifier()) {
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
            deployer,
            genesisState,
            rollupConfigInput
        );
    }

    function _deploySlashFactory() internal {
        slashFactory = new SlashFactory(rollup);
    }

    /// @notice Mint initial fee assets to portal (test chains only)
    function _maybeMintInitialFeeAsset() internal {
        // We can only mint on test chains (when we control the fee asset).
        // Will revert if not a TestERC20 or deployer is not a minter.
        uint256 initialFeeAssetAmount = rollupConfig.getFeeJuicePortalInitialBalance();
        if (initialFeeAssetAmount > 0) {
            address feeAssetPortal = address(rollup.getFeeAssetPortal());
            TestERC20(address(feeAsset)).mint(feeAssetPortal, initialFeeAssetAmount);
        }
    }

    /// @notice Register rollup if caller can register (happens during initial deploy, not upgrades)
    /// @dev During initial deployment, deployer owns registry/GSE and rollup is auto-registered.
    ///      During upgrades, governance owns them, so registration happens via governance proposal.
    ///      We try to register and silently fail if unauthorized (expected for upgrades).
    function _maybeRegisterRollup() internal {
        // Try to register - will only succeed if caller has permission
        // This succeeds during initial deploy, fails during upgrades (expected)
        try registry.addRollup(rollup) {
            // Successfully registered
        } catch {
            // Not authorized - this is expected for upgrades
        }

        try gseContract.addRollup(address(rollup)) {
            // Successfully registered
        } catch {
            // Not authorized - this is expected for upgrades
        }
    }

    /// @notice Add initial validators (test chains only)
    function _maybeAddInitialValidators() internal {
        CheatDepositArgs[] memory initialValidators = rollupConfig.parseValidators();
        if (initialValidators.length == 0) {
            return;
        }

        MultiAdder multiAdder = new MultiAdder(address(rollup), deployer);

        uint256 activationThreshold = rollup.getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * initialValidators.length;
        // Will revert if not a TestERC20 or deployer is not a minter
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

    /// @notice Transfer rollup ownership to governance (if deployer is owner)
    function _transferOwnership() internal {
        // Only transfer ownership if deployer is currently the owner
        if (rollup.owner() == deployer) {
            rollup.transferOwnership(address(governance));
        }
    }

    // ============ JSON Output Helpers ============

    /// @notice Write rollup-specific addresses to an existing JSON string
    /// @param jsonKey The JSON key to use for serialization
    /// @return The updated JSON string
    function writeRollupAddressesToJson(string memory jsonKey) public returns (string memory) {
        vm.serializeAddress(jsonKey, "rollupAddress", address(rollup));
        vm.serializeAddress(jsonKey, "verifierAddress", address(verifier));
        vm.serializeAddress(jsonKey, "slashFactoryAddress", address(slashFactory));
        vm.serializeAddress(jsonKey, "inboxAddress", address(rollup.getInbox()));
        vm.serializeAddress(jsonKey, "outboxAddress", address(rollup.getOutbox()));
        vm.serializeAddress(jsonKey, "feeAssetPortalAddress", address(rollup.getFeeAssetPortal()));
        return vm.serializeUint(jsonKey, "rollupVersion", rollup.getVersion());
    }

    // ============ External Interface for DeployL1Contracts ============

    /// @notice Initialize with existing infrastructure (called by DeployL1Contracts)
    /// @param deployerAddr Deployer address (must match the broadcaster)
    /// @param registryAddr Registry contract address
    /// @param gse GSE contract address
    /// @param gov Governance contract address
    /// @param feeAssetAddr Fee asset ERC20 address
    /// @param stakingAssetAddr Staking asset ERC20 address
    /// @param rewardDist Reward distributor address
    function setEnv(
        address deployerAddr,
        Registry registryAddr,
        GSE gse,
        Governance gov,
        IERC20 feeAssetAddr,
        IERC20 stakingAssetAddr,
        RewardDistributor rewardDist
    ) external {
        deployer = deployerAddr;
        registry = registryAddr;
        gseContract = gse;
        governance = gov;
        feeAsset = feeAssetAddr;
        stakingAsset = stakingAssetAddr;
        rewardDistributor = rewardDist;
    }

    /// @notice Deploy rollup using provided configuration (callable after initialization)
    /// @dev Manages its own broadcast context using the deployer address
    /// @param config Rollup configuration to use for deployment
    function deployRollupWithConfig(RollupConfiguration config) external {
        rollupConfig = config;
        vm.startBroadcast(deployer);
        _deployRollup();
        vm.stopBroadcast();
    }

    /// @notice Deploy rollup using provided configuration without registration or ownership transfer
    /// @dev Used when called from DeployL1Contracts, which handles registration and ownership itself
    /// @param config Rollup configuration to use for deployment
    function deployRollupWithConfigNoRegister(RollupConfiguration config) external {
        rollupConfig = config;
        rollupConfig.validateConfig();

        // 1. Deploy verifier (mock or real)
        _deployVerifier();

        // 2. Build rollup configuration and deploy rollup
        _deployRollupContract();

        // 3. Optionally mint initial fee assets to portal
        _maybeMintInitialFeeAsset();

        // 4. Deploy slash factory
        _deploySlashFactory();

        // 5. Add initial validators (if any)
        _maybeAddInitialValidators();

        // Skip registration and ownership transfer - caller handles these
    }

    /// @notice Just deploy verifier and rollup contract (without registration or validators)
    function deployRollupCore() external {
        rollupConfig.validateConfig();
        _deployVerifier();
        _deployRollupContract();
        _deploySlashFactory();
    }
}
