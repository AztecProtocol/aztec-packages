// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Script, console} from "forge-std/Script.sol";

import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {MockZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";

import {DeploymentConfig} from "./DeploymentConfig.sol";

/**
 * @title DeployStakingAssetHandler
 * @notice Deploy StakingAssetHandler for e2e tests.
 * @dev This is a separate script from DeployL1Contracts because StakingAssetHandler
 *      is only needed for testing validator staking infrastructure.
 *
 *      Configuration is passed as a JSON string parameter to run(), using the same
 *      JSON structure as DeployL1Contracts (see DeploymentConfig.sol).
 *
 *      JSON Structure (relevant sections):
 *      {
 *        "stakingAssetHandler": {
 *          "stakingAsset": "0x...",  // Required: Address of staking asset from DeployL1Contracts
 *          "registry": "0x..."       // Required: Address of Registry from DeployL1Contracts
 *        },
 *        "zkPassport": {
 *          "domain": "...",          // Optional: Domain for ZKPassport verification (default: "")
 *          "scope": "..."            // Optional: Scope for ZKPassport verification (default: "")
 *        }
 *      }
 *
 * Usage:
 *   forge script script/deploy/rollup/DeployStakingAssetHandler.s.sol:DeployStakingAssetHandler \
 *     --sig "run(string)" \
 *     '{"stakingAssetHandler":{"stakingAsset":"0x...","registry":"0x..."},"zkPassport":{"domain":"test","scope":"test"}}' \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 */
contract DeployStakingAssetHandler is Script, DeploymentConfig {
    address public deployer;

    // Cached config values
    address internal stakingAssetAddress;
    address internal registryAddress;
    string internal zkPassportDomain;
    string internal zkPassportScope;

    // Deployed contracts
    MockZKPassportVerifier public MOCK_ZK_PASSPORT_VERIFIER_CONTRACT;
    StakingAssetHandler public STAKING_ASSET_HANDLER_CONTRACT;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    /// @notice Cache configuration values from DeploymentConfig.
    ///         Must be called after _loadConfig() and before any broadcasts.
    function _cacheConfig() internal {
        StakingAssetHandlerConfiguration memory config = getStakingAssetHandlerConfiguration();

        stakingAssetAddress = config.stakingAsset;
        registryAddress = config.registry;
        zkPassportDomain = config.zkPassportDomain;
        zkPassportScope = config.zkPassportScope;

        require(stakingAssetAddress != address(0), "stakingAsset is required");
        require(registryAddress != address(0), "registry is required");
    }

    /// @notice Entry point with JSON config.
    /// @param configJson JSON configuration string (same format as DeployL1Contracts)
    function run(string memory configJson) public {
        _loadConfig(configJson);
        _cacheConfig();
        deployStakingAssetHandler();
        logDeployedAddresses();
    }

    function deployStakingAssetHandler() public {
        // Deploy MockZKPassportVerifier
        vm.broadcast(deployer);
        MOCK_ZK_PASSPORT_VERIFIER_CONTRACT = new MockZKPassportVerifier();

        // Build StakingAssetHandler args
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
            domain: zkPassportDomain,
            scope: zkPassportScope,
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
