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

/**
 * @title DeployL1Contracts
 * @author Aztec Labs
 * @notice Deploy Aztec L1 contracts. Configuration is read from environment variables.
 * See DeploymentConfiguration and RollupConfiguration for environment variables supported.
 */
contract DeployL1Contracts is Script, Test {
    // Deployed contracts, filled as we make progress in the deploy.
    // Note that there's no good way to scope these in Solidity
    // so that they must be accessed after creation, as it leaves the code brittle
    // to facing stack-too-deep.

    // TODO CLAUDE: make these a struct DeployL1ContractsOutput.
    /// @notice Deployed fee asset (ERC20), could be test asset or existing asset
    IERC20 public feeAsset;
    /// @notice Deployed staking asset (ERC20), could be test asset or existing asset
    IERC20 public stakingAsset;
    /// @notice Deployed GSE contract
    GSE public gseContract;
    /// @notice Deployed registry contract
    Registry public registry;
    /// @notice Deployed reward distributor contract
    RewardDistributor public rewardDistributor;
    /// @notice Deployed coin issuer contract
    CoinIssuer public coinIssuer;
    /// @notice Deployed governance proposer contract
    GovernanceProposer public governanceProposer;
    /// @notice Deployed governance contract
    Governance public governance;
    /// @notice Rollup deployment output (rollup, verifier, slashFactory)
    RollupAddressOutput public rollupOutput;
    /// @notice Deployed date gated relayer contract
    DateGatedRelayer public dateGatedRelayer;
    /// @notice Deployed fee asset handler contract or address(0)
    FeeAssetHandler public feeAssetHandler;
    /// @notice Deployed mock zk passport verifier contract or address(0)
    IZKPassportVerifier public mockZkPassportVerifier;
    /// @notice Deployed staking asset handler contract or address(0)
    StakingAssetHandler public stakingAssetHandler;

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
        // Deploy rollup using DeployRollup helper
        _deployRollup();
        _deployDateGatedRelayer();
        // CHEATCODE CONTRACTS (testnets only)
        _maybeDeployFeeAssetHandler();
        _maybeDeployStakingAssetHandler();
        // POST-DEPLOY SETUP
        _maybeFundRewardDistributor();
        _handoverToGovernance();
        _assertAccessControl();
    }

    /// @notice Deploy fee and staking assets on test networks
    function _maybeDeployAssets() internal {
        address existingToken = config.existingTokenAddress();
        if (existingToken != address(0)) {
            stakingAsset = IERC20(existingToken);
            feeAsset = IERC20(existingToken);
        } else {
            TestERC20 stakingAssetLocal = new TestERC20("Staking", "STK", deployer);
            TestERC20 feeAssetLocal = new TestERC20("FeeJuice", "FEE", deployer);
            feeAssetLocal.mint(deployer, 1e18);
            stakingAsset = stakingAssetLocal;
            feeAsset = feeAssetLocal;
        }
    }

    /// @notice Deploy coin issuer contract
    function _deployCoinIssuer() internal {
        CoinIssuerConfiguration memory coinConfig = config.getCoinIssuerConfiguration();
        coinIssuer = new CoinIssuer(
            IMintableERC20(address(feeAsset)),
            coinConfig.coinIssuerRate,
            deployer
        );
    }

    /// @notice Deploy fee asset handler on test chains
    function _maybeDeployFeeAssetHandler() internal {
        // Deploy on test chains only (when we control the staking asset)
        if (config.existingTokenAddress() == address(0)) {
            feeAssetHandler = new FeeAssetHandler(deployer, address(feeAsset), 1000e18);
            TestERC20(address(feeAsset)).addMinter(address(feeAssetHandler));
        }
    }

    /// @notice Deploy GSE contract
    function _deployGSE() internal {
        GseConfiguration memory gseConfig = config.getGseConfiguration();
        gseContract = new GSE(
            deployer,
            stakingAsset,
            gseConfig.activationThreshold,
            gseConfig.ejectionThreshold
        );
    }

    /// @notice Deploy registry and reward distributor
    function _deployRegistry() internal {
        registry = new Registry(deployer, feeAsset);
        rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));
    }

    /// @notice Deploy governance proposer contract
    function _deployGovernanceProposer() internal {
        GovernanceProposerConfiguration memory govPropConfig = config.getGovernanceProposerConfiguration();
        governanceProposer = new GovernanceProposer(
            registry,
            gseContract,
            govPropConfig.quorum,
            govPropConfig.roundSize
        );
    }

    /// @notice Deploy governance contract
    function _deployGovernance() internal {
        governance = new Governance(
            stakingAsset,
            address(governanceProposer),
            address(gseContract),
            config.getGovernanceConfiguration()
        );
        gseContract.setGovernance(governance);
    }

    /// @notice Deploy rollup and related contracts via DeployRollupLib
    function _deployRollup() internal {
        rollupOutput = DeployRollupLib.deployRollup(_getRollupAddressInput(), config.rollupConfig());
    }

    /// @notice Build RollupAddressInput from deployed contracts
    function _getRollupAddressInput() internal view returns (RollupAddressInput memory) {
        return RollupAddressInput({
            deployer: deployer,
            registry: registry,
            gse: gseContract,
            governance: governance,
            feeAsset: feeAsset,
            stakingAsset: stakingAsset,
            rewardDistributor: rewardDistributor
        });
    }

    /// @notice Deploy date gated relayer contract
    function _deployDateGatedRelayer() internal {
        dateGatedRelayer = new DateGatedRelayer(address(governance), 1798761600);
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
                mockZkPassportVerifier = IZKPassportVerifier(address(new MockZKPassportVerifier()));
                zkPassportVerifier = address(mockZkPassportVerifier);
            }

            ZkPassportConfiguration memory zkConfig = config.getZkPassportConfiguration();
            address[] memory unhinged = new address[](1);
            unhinged[0] = 0x3b218d0F26d15B36C715cB06c949210a0d630637; // AMIN isUnhinged

            stakingAssetHandler = new StakingAssetHandler(StakingAssetHandler.StakingAssetHandlerArgs({
                owner: deployer,
                stakingAsset: address(stakingAsset),
                registry: registry,
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
            TestERC20(address(stakingAsset)).addMinter(address(stakingAssetHandler));
        }
    }

    /// @notice Fund reward distributor on test networks
    function _maybeFundRewardDistributor() internal {
        // If we deployed test assets, fund.
        if (config.existingTokenAddress() == address(0)) {
            uint256 funding = config.getRewardDistributorFunding();
            if (funding > 0) {
                TestERC20(address(feeAsset)).mint(address(rewardDistributor), funding);
            }
        }
    }

    /// @notice Transfer ownership of contracts to governance
    function _handoverToGovernance() internal {
        if (registry.owner() == deployer) {
            registry.transferOwnership(address(governance));
        }
        gseContract.transferOwnership(address(governance));

        // If we deployed assets, set them free.
        if (config.existingTokenAddress() == address(0)) {
            Ownable(address(feeAsset)).transferOwnership(address(coinIssuer));
            coinIssuer.acceptTokenOwnership();
            coinIssuer.transferOwnership(address(dateGatedRelayer));
        }
    }

    /// @notice Write deployed contract addresses to JSON output file
    /// @param _outputPath Path where to write the output JSON
    function _writeDeploymentOutput(string memory _outputPath) internal {
        string memory json = "deployment";
        // Non-rollup addresses
        vm.serializeAddress(json, "registryAddress", address(registry));
        vm.serializeAddress(json, "feeAssetAddress", address(feeAsset));
        vm.serializeAddress(json, "stakingAssetAddress", address(stakingAsset));
        vm.serializeAddress(json, "gseAddress", address(gseContract));
        vm.serializeAddress(json, "rewardDistributorAddress", address(rewardDistributor));
        vm.serializeAddress(json, "coinIssuerAddress", address(coinIssuer));
        vm.serializeAddress(json, "governanceProposerAddress", address(governanceProposer));
        vm.serializeAddress(json, "governanceAddress", address(governance));
        vm.serializeAddress(json, "feeAssetHandlerAddress", address(feeAssetHandler));
        vm.serializeAddress(json, "stakingAssetHandlerAddress", address(stakingAssetHandler));
        vm.serializeAddress(json, "zkPassportVerifierAddress", address(mockZkPassportVerifier));
        // Rollup-related addresses
        string memory finalJson = DeployRollupLib.writeRollupAddressesToJson(vm, json, rollupOutput);
        vm.writeJson(finalJson, _outputPath);
    }

    /// @notice Verify access control is correctly set up
    function _assertAccessControl() internal view {
        assertEq(gseContract.owner(), address(governance), "invalid gse owner");
        assertEq(address(gseContract.getGovernance()), address(governance), "invalid gse governance");
        assertEq(registry.owner(), address(governance), "invalid registry owner");
        assertEq(
            address(rewardDistributor.REGISTRY()),
            address(registry),
            "invalid reward distributor registry"
        );
        assertEq(dateGatedRelayer.owner(), address(governance), "invalid date gated relayer owner");

        if (config.existingTokenAddress() == address(0)) {
            assertEq(TestERC20(address(feeAsset)).owner(), address(coinIssuer), "invalid fee asset owner");
            assertEq(coinIssuer.owner(), address(dateGatedRelayer), "invalid coin issuer owner");
        }
    }
}
