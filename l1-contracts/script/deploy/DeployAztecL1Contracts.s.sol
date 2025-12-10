// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order, max-states-count, gas-small-strings, comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {Rollup} from "@aztec/core/Rollup.sol";

import {CoinIssuer, IMintableERC20} from "@aztec/governance/CoinIssuer.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {FeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";
import {MockZKPassportVerifier, IZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {DateGatedRelayer} from "@aztec/periphery/DateGatedRelayer.sol";

import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";

import {DeployRollupLib, RollupAddressInput, RollupAddressOutput} from "./DeployRollupLib.sol";
import {
    IDeploymentConfiguration,
    CoinIssuerConfiguration,
    GovernanceProposerConfiguration,
    GseConfiguration,
    ZkPassportConfiguration,
    DeploymentConfiguration
} from "./DeploymentConfiguration.sol";

/// @notice Output struct containing all deployed L1 contract addresses
struct DeployAztecL1ContractsOutput {
    IERC20 feeAsset;
    IERC20 stakingAsset;
    GSE gse;
    Registry registry;
    RewardDistributor rewardDistributor;
    CoinIssuer coinIssuer;
    GovernanceProposer governanceProposer;
    Governance governance;
    RollupAddressOutput rollup;
    DateGatedRelayer dateGatedRelayer;
    FeeAssetHandler feeAssetHandler;
    IZKPassportVerifier mockZkPassportVerifier;
    StakingAssetHandler stakingAssetHandler;
}

/**
 * @title DeployAztecL1Contracts
 * @author Aztec Labs
 * @notice Deploy Aztec L1 contracts. Configuration is read from environment variables.
 * See DeploymentConfiguration and RollupConfiguration for environment variables supported.
 */
contract DeployAztecL1Contracts is Script, Test {
    /// @notice All deployed contract addresses
    DeployAztecL1ContractsOutput public output;

    /// @notice Address performing the deployment
    address public deployer;
    /// @notice Deployment configuration loaded from environment
    IDeploymentConfiguration public config;

    /// @notice Deploy with env var config, write addresses to output file
    /// @param _outputPath Path to write deployment output JSON
    function run(string memory _outputPath) public {
        config = new DeploymentConfiguration();
        config.loadConfig();
        // DEPLOYER_ADDRESS env var is intended only for tests.
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

        vm.startBroadcast(deployer);
        _deploy();
        vm.stopBroadcast();

        // Write deployed addresses to output file for TypeScript to read
        _writeDeploymentOutput(_outputPath);
    }

    /// @notice Execute the full deployment sequence
    function _deploy() internal {
        // On a test network, we deploy assets.
        _maybeDeployAssets();
        // CORE CONTRACTS
        _deployCoinIssuer();
        _deployGSE();
        _deployRegistry();
        _deployGovernanceProposer();
        _deployGovernance();
        _deployDateGatedRelayer();
        // Testnet stuff
        _maybeDeployFeeAssetHandler();
        _maybeDeployStakingAssetHandler();
        _maybeFundRewardDistributor();
        // Deploy our rollup..
        _deployRollup();
        _handoverToGovernance();
        _assertAccessControl();
    }

    /// @notice Deploy fee and staking assets on test networks
    function _maybeDeployAssets() internal {
        address existingToken = config.existingTokenAddress();
        if (existingToken != address(0)) {
            output.stakingAsset = IERC20(existingToken);
            output.feeAsset = IERC20(existingToken);
        } else {
            TestERC20 stakingAssetLocal = new TestERC20("Staking", "STK", deployer);
            TestERC20 feeAssetLocal = new TestERC20("FeeJuice", "FEE", deployer);
            feeAssetLocal.mint(deployer, 1e18);
            output.stakingAsset = stakingAssetLocal;
            output.feeAsset = feeAssetLocal;
        }
    }

    /// @notice Deploy coin issuer contract
    function _deployCoinIssuer() internal {
        CoinIssuerConfiguration memory coinConfig = config.getCoinIssuerConfiguration();
        output.coinIssuer = new CoinIssuer(
            IMintableERC20(address(output.feeAsset)),
            coinConfig.coinIssuerRate,
            deployer
        );
    }

    /// @notice Deploy fee asset handler on test chains
    function _maybeDeployFeeAssetHandler() internal {
        // Deploy on test chains only (when we control the staking asset)
        if (config.existingTokenAddress() == address(0)) {
            output.feeAssetHandler = new FeeAssetHandler(deployer, address(output.feeAsset), 1000e18);
            TestERC20(address(output.feeAsset)).addMinter(address(output.feeAssetHandler));
        }
    }

    /// @notice Deploy GSE contract
    function _deployGSE() internal {
        GseConfiguration memory gseConfig = config.getGseConfiguration();
        output.gse = new GSE(
            deployer,
            output.stakingAsset,
            gseConfig.activationThreshold,
            gseConfig.ejectionThreshold
        );
    }

    /// @notice Deploy registry and reward distributor
    function _deployRegistry() internal {
        output.registry = new Registry(deployer, output.feeAsset);
        output.rewardDistributor = RewardDistributor(address(output.registry.getRewardDistributor()));
    }

    /// @notice Deploy governance proposer contract
    function _deployGovernanceProposer() internal {
        GovernanceProposerConfiguration memory govPropConfig = config.getGovernanceProposerConfiguration();
        output.governanceProposer = new GovernanceProposer(
            output.registry,
            output.gse,
            govPropConfig.quorum,
            govPropConfig.roundSize
        );
    }

    /// @notice Deploy governance contract
    function _deployGovernance() internal {
        output.governance = new Governance(
            output.stakingAsset,
            address(output.governanceProposer),
            address(output.gse),
            config.getGovernanceConfiguration()
        );
        output.gse.setGovernance(output.governance);
    }

    /// @notice Deploy rollup and related contracts via DeployRollupLib
    function _deployRollup() internal {
        output.rollup = DeployRollupLib.deployRollup(_getRollupAddressInput(), config.rollupConfig());
    }

    /// @notice Build RollupAddressInput from deployed contracts
    function _getRollupAddressInput() internal view returns (RollupAddressInput memory) {
        return RollupAddressInput({
            deployer: deployer,
            registry: output.registry,
            gse: output.gse,
            governance: output.governance,
            feeAsset: output.feeAsset,
            stakingAsset: output.stakingAsset,
            rewardDistributor: output.rewardDistributor
        });
    }

    /// @notice Deploy date gated relayer contract
    function _deployDateGatedRelayer() internal {
        output.dateGatedRelayer = new DateGatedRelayer(address(output.governance), 1798761600);
    }

    /// @notice Deploy staking asset handler on sepolia/anvil
    function _maybeDeployStakingAssetHandler() internal {
        // Only deploy on sepolia and anvil (not devnet etc.)
        bool isSepoliaTestChain = block.chainid == 11155111;
        bool isAnvilTestChain = block.chainid == 31337;
        if (isSepoliaTestChain || isAnvilTestChain) {
            address zkPassportVerifier;

            if (isSepoliaTestChain) {
                // Sepolia - use deployed ZK Passport verifier
                // Address from lib/circuits/src/solidity/deployments/deployment-11155111.json
                zkPassportVerifier = 0x3101Bad9eA5fACadA5554844a1a88F7Fe48D4DE0;
            } else {
                // Anvil - deploy mock verifier
                output.mockZkPassportVerifier = IZKPassportVerifier(address(new MockZKPassportVerifier()));
                zkPassportVerifier = address(output.mockZkPassportVerifier);
            }

            ZkPassportConfiguration memory zkConfig = config.getZkPassportConfiguration();
            address[] memory unhinged = new address[](1);
            address AMIN = 0x3b218d0F26d15B36C715cB06c949210a0d630637;
            unhinged[0] = AMIN; // isUnhinged

            output.stakingAssetHandler = new StakingAssetHandler(StakingAssetHandler.StakingAssetHandlerArgs({
                owner: deployer,
                stakingAsset: address(output.stakingAsset),
                registry: output.registry,
                withdrawer: deployer,
                validatorsToFlush: 16,
                mintInterval: 60 * 60 * 24,
                depositsPerMint: 10,
                depositMerkleRoot: bytes32(0),
                zkPassportVerifier: ZKPassportVerifier(zkPassportVerifier),
                unhinged: unhinged,
                // Scopes
                domain: zkConfig.domain,
                scope: zkConfig.scope,
                // Skip checks
                skipBindCheck: true,
                skipMerkleCheck: true
            }));
            TestERC20(address(output.stakingAsset)).addMinter(address(output.stakingAssetHandler));
        }
    }

    /// @notice Fund reward distributor on test networks
    function _maybeFundRewardDistributor() internal {
        // If we deployed test assets, fund.
        if (config.existingTokenAddress() == address(0)) {
            uint256 funding = config.getRewardDistributorFunding();
            if (funding > 0) {
                TestERC20(address(output.feeAsset)).mint(address(output.rewardDistributor), funding);
            }
        }
    }

    /// @notice Transfer ownership of contracts to governance
    function _handoverToGovernance() internal {
        output.registry.transferOwnership(address(output.governance));
        output.gse.transferOwnership(address(output.governance));

        // If we deployed assets, set them free.
        if (config.existingTokenAddress() == address(0)) {
            Ownable(address(output.feeAsset)).transferOwnership(address(output.coinIssuer));
            output.coinIssuer.acceptTokenOwnership();
            output.coinIssuer.transferOwnership(address(output.dateGatedRelayer));
        }
    }

    /// @notice Write deployed contract addresses to JSON output file
    /// @param _outputPath Path where to write the output JSON
    function _writeDeploymentOutput(string memory _outputPath) internal {
        string memory json = "deployment";
        // Non-rollup addresses
        vm.serializeAddress(json, "registryAddress", address(output.registry));
        vm.serializeAddress(json, "feeAssetAddress", address(output.feeAsset));
        vm.serializeAddress(json, "stakingAssetAddress", address(output.stakingAsset));
        vm.serializeAddress(json, "gseAddress", address(output.gse));
        vm.serializeAddress(json, "dateGatedRelayerAddress", address(output.dateGatedRelayer));
        vm.serializeAddress(json, "rewardDistributorAddress", address(output.rewardDistributor));
        vm.serializeAddress(json, "coinIssuerAddress", address(output.coinIssuer));
        vm.serializeAddress(json, "governanceProposerAddress", address(output.governanceProposer));
        vm.serializeAddress(json, "governanceAddress", address(output.governance));
        vm.serializeAddress(json, "feeAssetHandlerAddress", address(output.feeAssetHandler));
        vm.serializeAddress(json, "stakingAssetHandlerAddress", address(output.stakingAssetHandler));
        vm.serializeAddress(json, "zkPassportVerifierAddress", address(output.mockZkPassportVerifier));
        // Rollup-related addresses
        string memory finalJson = DeployRollupLib.writeRollupAddressesToJson(vm, json, output.rollup);
        vm.writeJson(finalJson, _outputPath);
    }

    /// @notice Verify access control is correctly set up
    function _assertAccessControl() internal view {
        assertEq(output.gse.owner(), address(output.governance), "invalid gse owner");
        assertEq(address(output.gse.getGovernance()), address(output.governance), "invalid gse governance");
        assertEq(output.registry.owner(), address(output.governance), "invalid registry owner");
        assertEq(Governance(output.registry.getGovernance()).governanceProposer(), address(output.governanceProposer), "invalid governance proposer");

        assertEq(
            address(output.rewardDistributor.REGISTRY()),
            address(output.registry),
            "invalid reward distributor registry"
        );
        assertEq(output.dateGatedRelayer.owner(), address(output.governance), "invalid date gated relayer owner");

        if (config.existingTokenAddress() == address(0)) {
            assertEq(TestERC20(address(output.feeAsset)).owner(), address(output.coinIssuer), "invalid fee asset owner");
            assertEq(output.coinIssuer.owner(), address(output.dateGatedRelayer), "invalid coin issuer owner");
        }
    }
}
