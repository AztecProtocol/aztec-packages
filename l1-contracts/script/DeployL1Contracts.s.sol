// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";

import {RollupBuilder, Config} from "@test/builder/RollupBuilder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GenesisState} from "@aztec/core/interfaces/IRollup.sol";

/**
 * @title DeployL1Contracts
 * @notice A minimal script to deploy core Aztec L1 contracts using forge.
 *         This provides an alternative to the TypeScript deployment in yarn-project/ethereum.
 *
 * @dev Usage:
 *   forge script script/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast
 *
 *   Environment variables:
 *   - DEPLOYER_ADDRESS: The address that will deploy and own contracts initially
 *   - VK_TREE_ROOT: The VK tree root (optional, defaults to zero)
 *   - PROTOCOL_CONTRACTS_HASH: The protocol contracts hash (optional, defaults to zero)
 *   - GENESIS_ARCHIVE_ROOT: The genesis archive root (optional, defaults to zero)
 */
contract DeployL1Contracts is Script, Test {
    // Configuration
    address public deployer;

    function setUp() public {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    function run() public {
        vm.startBroadcast(deployer);

        // Get genesis state from env or use defaults
        GenesisState memory genesisState = GenesisState({
            vkTreeRoot: bytes32(vm.envOr("VK_TREE_ROOT", uint256(0))),
            protocolContractsHash: bytes32(vm.envOr("PROTOCOL_CONTRACTS_HASH", uint256(0))),
            genesisArchiveRoot: bytes32(vm.envOr("GENESIS_ARCHIVE_ROOT", uint256(0)))
        });

        // Use RollupBuilder to deploy all contracts
        RollupBuilder builder = new RollupBuilder(deployer);
        builder = builder.setGenesisState(genesisState).setUpdateOwnerships(false);
        builder = builder.deploy();

        Config memory deployedConfig = builder.getConfig();

        vm.stopBroadcast();

        // Log deployed addresses
        emit log("=== Deployed Contract Addresses ===");
        emit log_named_address("Deployer", deployer);
        emit log_named_address("FeeAsset", address(deployedConfig.testERC20));
        emit log_named_address("StakingAsset", address(deployedConfig.testERC20));
        emit log_named_address("GSE", address(deployedConfig.gse));
        emit log_named_address("Registry", address(deployedConfig.registry));
        emit log_named_address("RewardDistributor", address(deployedConfig.rewardDistributor));
        emit log_named_address("Governance", address(deployedConfig.governance));
        emit log_named_address("CoinIssuer", address(deployedConfig.coinIssuer));
        emit log_named_address("Rollup", address(deployedConfig.rollup));
    }
}
