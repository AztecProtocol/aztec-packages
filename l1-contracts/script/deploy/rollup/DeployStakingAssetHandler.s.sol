// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Script, console} from "forge-std/Script.sol";

import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {MockZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";

/**
 * @title DeployStakingAssetHandler
 * @notice Deploy StakingAssetHandler for e2e tests.
 * @dev This is a separate script from DeployL1Contracts because StakingAssetHandler
 *      is only needed for testing validator staking infrastructure.
 *
 *      Required environment variables:
 *        STAKING_ASSET    - Address of the staking asset (TestERC20)
 *        REGISTRY         - Address of the Registry contract
 *
 *      Optional environment variables:
 *        DEPLOYER_ADDRESS - Deployer address (default: msg.sender)
 *
 * Usage:
 *   forge script script/deploy/rollup/DeployStakingAssetHandler.s.sol:DeployStakingAssetHandler \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 */
contract DeployStakingAssetHandler is Script {
    address public deployer;

    // Required addresses (must be set via env)
    address public stakingAssetAddress;
    address public registryAddress;

    // Deployed contracts
    MockZKPassportVerifier public MOCK_ZK_PASSPORT_VERIFIER_CONTRACT;
    StakingAssetHandler public STAKING_ASSET_HANDLER_CONTRACT;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

        // These are required - will revert if not set
        stakingAssetAddress = vm.envAddress("STAKING_ASSET");
        registryAddress = vm.envAddress("REGISTRY");
    }

    function run() public {
        deployStakingAssetHandler();
        logDeployedAddresses();
    }

    function deployStakingAssetHandler() public {
        // Deploy MockZKPassportVerifier
        vm.broadcast(deployer);
        MOCK_ZK_PASSPORT_VERIFIER_CONTRACT = new MockZKPassportVerifier();

        // Build StakingAssetHandler args
        // Using same defaults as TypeScript deployment
        StakingAssetHandler.StakingAssetHandlerArgs memory args = StakingAssetHandler.StakingAssetHandlerArgs({
            owner: deployer,
            stakingAsset: stakingAssetAddress,
            registry: IRegistry(registryAddress),
            withdrawer: deployer, // Use deployer as withdrawer for testing
            validatorsToFlush: 16,
            mintInterval: 60 * 60 * 24, // 1 day
            depositsPerMint: 10,
            depositMerkleRoot: bytes32(0),
            zkPassportVerifier: ZKPassportVerifier(address(MOCK_ZK_PASSPORT_VERIFIER_CONTRACT)),
            unhinged: new address[](1),
            domain: "",
            scope: "",
            skipBindCheck: true, // Skip for testing
            skipMerkleCheck: true // Skip for testing
        });
        args.unhinged[0] = deployer;

        vm.broadcast(deployer);
        STAKING_ASSET_HANDLER_CONTRACT = new StakingAssetHandler(args);

        // Add StakingAssetHandler as minter on the staking asset
        vm.broadcast(deployer);
        TestERC20(stakingAssetAddress).addMinter(address(STAKING_ASSET_HANDLER_CONTRACT));
    }

    function logDeployedAddresses() internal view {
        console.log("=== StakingAssetHandler Deployment ===");
        console.log("MockZKPassportVerifier:", address(MOCK_ZK_PASSPORT_VERIFIER_CONTRACT));
        console.log("StakingAssetHandler:", address(STAKING_ASSET_HANDLER_CONTRACT));
    }
}
