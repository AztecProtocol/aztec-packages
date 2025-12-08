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

/// @notice Input addresses required for rollup deployment (existing L1 infrastructure)
struct RollupDeploymentInput {
    address deployer;
    Registry registry;
    GSE gse;
    Governance governance;
    IERC20 feeAsset;
    IERC20 stakingAsset;
    RewardDistributor rewardDistributor;
}

/// @notice Output addresses from rollup deployment (newly deployed contracts)
struct RollupDeploymentOutput {
    Rollup rollup;
    IVerifier verifier;
    SlashFactory slashFactory;
}

/// @title DeployRollup
/// @author Aztec Labs
/// @notice Core rollup deployment logic used by DeployL1Contracts and DeployRollupForUpgrade.
/// This contract handles the actual deployment of rollup contracts but does not provide
/// standalone entrypoints. Use DeployRollupForUpgrade.s.sol for standalone upgrades.
contract DeployRollup is Script, Test {
    /// @notice Input: existing L1 infrastructure
    RollupDeploymentInput public input;

    /// @notice Output: newly deployed rollup contracts
    RollupDeploymentOutput public output;

    /// @notice Rollup configuration component (for rollup-specific settings)
    RollupConfiguration public rollupConfig;


    // ============ External Interface ============

    /// @notice Initialize with existing infrastructure
    function setEnv(RollupDeploymentInput memory _input) external {
        input = _input;
    }

    /// @notice Deploy rollup using provided configuration (callable after initialization)
    /// @dev Manages its own broadcast context using the deployer address
    function deployRollupWithConfig(RollupConfiguration config) external {
        rollupConfig = config;
        vm.startBroadcast(input.deployer);
        _deployRollup();
        vm.stopBroadcast();
    }

    /// @notice Deploy rollup using provided configuration without registration or ownership transfer
    /// @dev Used when called from DeployL1Contracts, which handles registration and ownership itself
    function deployRollupWithConfigNoRegister(RollupConfiguration config) external {
        rollupConfig = config;
        rollupConfig.validateConfig();

        _deployVerifier();
        _deployRollupContract();
        _maybeMintInitialFeeAsset();
        _deploySlashFactory();
        _maybeAddInitialValidators();

        // Skip registration and ownership transfer - caller handles these
    }

    /// @notice Write rollup-specific addresses to an existing JSON string
    function writeRollupAddressesToJson(string memory jsonKey) public returns (string memory) {
        vm.serializeAddress(jsonKey, "rollupAddress", address(output.rollup));
        vm.serializeAddress(jsonKey, "verifierAddress", address(output.verifier));
        vm.serializeAddress(jsonKey, "slashFactoryAddress", address(output.slashFactory));
        vm.serializeAddress(jsonKey, "inboxAddress", address(output.rollup.getInbox()));
        vm.serializeAddress(jsonKey, "outboxAddress", address(output.rollup.getOutbox()));
        vm.serializeAddress(jsonKey, "feeAssetPortalAddress", address(output.rollup.getFeeAssetPortal()));
        return vm.serializeUint(jsonKey, "rollupVersion", output.rollup.getVersion());
    }

    /// @notice Get the deployed rollup contract
    function rollup() external view returns (Rollup) {
        return output.rollup;
    }

    // ============ Internal Deployment Steps ============

    function _deployRollup() internal {
        rollupConfig.validateConfig();

        _deployVerifier();
        _deployRollupContract();
        _maybeMintInitialFeeAsset();
        _deploySlashFactory();
        _maybeRegisterRollup();
        _maybeAddInitialValidators();
        _transferOwnership();
    }

    function _deployVerifier() internal {
        if (!rollupConfig.useRealVerifier()) {
            output.verifier = new MockVerifier();
        } else {
            output.verifier = IVerifier(address(new HonkVerifier()));
        }
    }

    function _deployRollupContract() internal {
        GenesisState memory genesisState = rollupConfig.getGenesisState();
        RollupConfigInput memory rollupConfigInput = rollupConfig.getRollupConfiguration(
            IRewardDistributor(address(input.rewardDistributor))
        );

        output.rollup = new Rollup(
            input.feeAsset,
            input.stakingAsset,
            input.gse,
            output.verifier,
            input.deployer,
            genesisState,
            rollupConfigInput
        );
    }

    function _deploySlashFactory() internal {
        output.slashFactory = new SlashFactory(output.rollup);
    }

    function _maybeMintInitialFeeAsset() internal {
        uint256 initialFeeAssetAmount = rollupConfig.getFeeJuicePortalInitialBalance();
        if (initialFeeAssetAmount > 0) {
            address feeAssetPortal = address(output.rollup.getFeeAssetPortal());
            TestERC20(address(input.feeAsset)).mint(feeAssetPortal, initialFeeAssetAmount);
        }
    }

    function _maybeRegisterRollup() internal {
        if (input.registry.owner() == input.deployer) {
            input.registry.addRollup(output.rollup);
        }
        if (input.gse.owner() == input.deployer) {
            input.gse.addRollup(address(output.rollup));
        }
    }

    function _maybeAddInitialValidators() internal {
        CheatDepositArgs[] memory initialValidators = rollupConfig.parseValidators();
        if (initialValidators.length == 0) {
            return;
        }

        MultiAdder multiAdder = new MultiAdder(address(output.rollup), input.deployer);

        uint256 activationThreshold = output.rollup.getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * initialValidators.length;
        TestERC20(address(input.stakingAsset)).mint(address(multiAdder), stakeNeeded);

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
            uint256 queueLength = output.rollup.getEntryQueueLength();
            if (queueLength == 0) break;

            uint256 availableFlushes = output.rollup.getAvailableValidatorFlushes();
            if (availableFlushes == 0) break;

            output.rollup.flushEntryQueue(flushChunkSize);
        }
    }

    function _transferOwnership() internal {
        if (output.rollup.owner() == input.deployer) {
            output.rollup.transferOwnership(address(input.governance));
        }
    }
}
