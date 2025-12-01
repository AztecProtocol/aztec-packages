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
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Configuration as GovernanceConfiguration} from "@aztec/governance/interfaces/IGovernance.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {CoinIssuer, IMintableERC20} from "@aztec/governance/CoinIssuer.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {FeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {HonkVerifier} from "../../../generated/HonkVerifier.sol";

import {
    E2EConfiguration,
    DeploymentConfiguration,
    GseConfiguration,
    GovernanceProposerConfiguration,
    CoinIssuerConfiguration
} from "./E2EConfiguration.sol";

/**
 * @title DeployL1Contracts
 * @notice Deploy Aztec L1 contracts for e2e tests.
 * @dev Uses E2EConfiguration to determine deployment parameters including
 *      whether to use MockVerifier (FAKE_PROOFS=1) or HonkVerifier (FAKE_PROOFS=0).
 *
 * Usage:
 *   # With mock verifier (default, FAKE_PROOFS=1):
 *   forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 *
 *   # With real verifier (FAKE_PROOFS=0):
 *   FAKE_PROOFS=0 forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 */
contract DeployL1Contracts is Script, Test {
    // Wallets
    address public deployer;

    // Cached configuration values (read in setUp before broadcasts)
    // These must be cached because vm.broadcast() disallows staticcalls
    bool internal useMockVerifier;
    bool internal fundRewardDistributor;
    uint256 internal coinIssuerRate;
    uint256 internal gseActivationThreshold;
    uint256 internal gseEjectionThreshold;
    uint256 internal governanceProposerQuorum;
    uint256 internal governanceProposerRoundSize;
    GovernanceConfiguration internal governanceConfig;
    uint256 internal rewardDistributorFunding;
    bytes32 internal vkTreeRoot;
    bytes32 internal protocolContractsHash;
    bytes32 internal genesisArchiveRoot;
    // Note: rollupConfig can't be cached because it depends on REWARD_DISTRIBUTOR_CONTRACT
    // which isn't known until after deployRegistry(). We use a helper contract created
    // before the broadcast to get it.
    E2EConfiguration internal configHelper;

    // Deployed contracts
    IERC20 public FEE_ASSET_CONTRACT;
    IERC20 public STAKING_ASSET_CONTRACT;
    GSE public GSE_CONTRACT;
    Registry public REGISTRY_CONTRACT;
    RewardDistributor public REWARD_DISTRIBUTOR_CONTRACT;
    GovernanceProposer public GOVERNANCE_PROPOSER_CONTRACT;
    Governance public GOVERNANCE_CONTRACT;
    CoinIssuer public COIN_ISSUER_CONTRACT;
    IVerifier public VERIFIER_CONTRACT;
    Rollup public ROLLUP_CONTRACT;
    FeeAssetHandler public FEE_ASSET_HANDLER_CONTRACT;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

        // Create configuration and cache all values before any broadcasts
        // (cheatcodes and staticcalls can't be made after vm.broadcast)
        E2EConfiguration config = new E2EConfiguration();
        configHelper = config; // Store for later use (rollup config needs reward distributor address)

        // Deployment config
        DeploymentConfiguration memory deployConfig = config.getDeploymentConfiguration();
        useMockVerifier = deployConfig.useMockVerifier;
        fundRewardDistributor = deployConfig.fundRewardDistributor;

        // Coin issuer config
        CoinIssuerConfiguration memory coinIssuerConfig = config.getCoinIssuerConfiguration();
        coinIssuerRate = coinIssuerConfig.coinIssuerRate;

        // GSE config
        GseConfiguration memory gseConfig = config.getGseConfiguration();
        gseActivationThreshold = gseConfig.activationThreshold;
        gseEjectionThreshold = gseConfig.ejectionThreshold;

        // Governance proposer config
        GovernanceProposerConfiguration memory govProposerConfig = config.getGovernanceProposerConfiguration();
        governanceProposerQuorum = govProposerConfig.quorum;
        governanceProposerRoundSize = govProposerConfig.roundSize;

        // Governance config
        governanceConfig = config.getGovernanceConfiguration();

        // Reward distributor funding
        rewardDistributorFunding = config.getRewardDistributorFunding();

        // Genesis state from env vars
        vkTreeRoot = bytes32(vm.envOr("VK_TREE_ROOT", uint256(0)));
        protocolContractsHash = bytes32(vm.envOr("PROTOCOL_CONTRACTS_HASH", uint256(0)));
        genesisArchiveRoot = bytes32(vm.envOr("GENESIS_ARCHIVE_ROOT", uint256(0)));
    }

    function run() public {
        deployAztecContracts();
        logDeployedAddresses();
    }

    function getRewardDistributorFunding() public view returns (uint256) {
        return rewardDistributorFunding;
    }

    function deployAztecContracts() public {
        deployAssets();
        deployCoinIssuer();
        deployFeeAssetHandler();
        deployGSE();
        deployRegistry();
        deployGovernanceProposer();
        deployGovernance();
        deployVerifier();
        deployRollup();
        registerRollup();
        fundRewardDistributorIfEnabled();
        handoverToGovernance();

        _assertAccessControl();
    }

    // ============ Asset Deployment ============

    function deployAssets() public virtual {
        vm.broadcast(deployer);
        TestERC20 feeAsset = new TestERC20("Fee Asset", "FEE", deployer);
        FEE_ASSET_CONTRACT = IERC20(address(feeAsset));
        STAKING_ASSET_CONTRACT = FEE_ASSET_CONTRACT; // Same asset for fee and staking

        // Mint initial supply
        vm.broadcast(deployer);
        feeAsset.mint(deployer, 1_000_000_000e18);
    }

    function deployCoinIssuer() public virtual {
        vm.broadcast(deployer);
        COIN_ISSUER_CONTRACT = new CoinIssuer(
            IMintableERC20(address(FEE_ASSET_CONTRACT)),
            coinIssuerRate,
            deployer
        );
    }

    function deployFeeAssetHandler() public virtual {
        vm.broadcast(deployer);
        FEE_ASSET_HANDLER_CONTRACT = new FeeAssetHandler(
            deployer,
            address(FEE_ASSET_CONTRACT),
            1000e18 // mintAmount - amount minted per mint() call
        );

        // Add FeeAssetHandler as minter on the fee asset
        vm.broadcast(deployer);
        TestERC20(address(FEE_ASSET_CONTRACT)).addMinter(address(FEE_ASSET_HANDLER_CONTRACT));
    }

    // ============ Governance Deployment ============

    function deployGSE() public virtual {
        vm.broadcast(deployer);
        GSE_CONTRACT = new GSE(
            deployer,
            STAKING_ASSET_CONTRACT,
            gseActivationThreshold,
            gseEjectionThreshold
        );
    }

    function deployRegistry() public virtual {
        vm.broadcast(deployer);
        REGISTRY_CONTRACT = new Registry(deployer, FEE_ASSET_CONTRACT);
        REWARD_DISTRIBUTOR_CONTRACT = RewardDistributor(address(REGISTRY_CONTRACT.getRewardDistributor()));
    }

    function deployGovernanceProposer() public virtual {
        vm.broadcast(deployer);
        GOVERNANCE_PROPOSER_CONTRACT = new GovernanceProposer(
            REGISTRY_CONTRACT,
            GSE_CONTRACT,
            governanceProposerQuorum,
            governanceProposerRoundSize
        );
    }

    function deployGovernance() public virtual {
        vm.broadcast(deployer);
        GOVERNANCE_CONTRACT = new Governance(
            STAKING_ASSET_CONTRACT,
            address(GOVERNANCE_PROPOSER_CONTRACT),
            address(0), // Allow anyone to deposit
            governanceConfig
        );

        vm.broadcast(deployer);
        GSE_CONTRACT.setGovernance(GOVERNANCE_CONTRACT);
    }

    // ============ Verifier Deployment ============

    /// @notice Deploy the verifier contract based on FAKE_PROOFS env var.
    ///         FAKE_PROOFS=1 (default) -> MockVerifier
    ///         FAKE_PROOFS=0 -> HonkVerifier (real proofs)
    function deployVerifier() public virtual {
        vm.broadcast(deployer);
        if (useMockVerifier) {
            VERIFIER_CONTRACT = IVerifier(address(new MockVerifier()));
        } else {
            VERIFIER_CONTRACT = IVerifier(address(new HonkVerifier()));
        }
    }

    // ============ Rollup Deployment ============

    function deployRollup() public virtual {
        GenesisState memory genesisState = GenesisState({
            vkTreeRoot: vkTreeRoot,
            protocolContractsHash: protocolContractsHash,
            genesisArchiveRoot: genesisArchiveRoot
        });

        // Build rollup config using the configHelper created in setUp
        // (the configHelper was created before any broadcasts)
        RollupConfigInput memory rollupConfig = configHelper.getRollupConfiguration(
            IRewardDistributor(address(REWARD_DISTRIBUTOR_CONTRACT))
        );

        vm.broadcast(deployer);
        ROLLUP_CONTRACT = new Rollup(
            FEE_ASSET_CONTRACT,
            STAKING_ASSET_CONTRACT,
            GSE_CONTRACT,
            VERIFIER_CONTRACT,
            address(GOVERNANCE_CONTRACT),
            genesisState,
            rollupConfig
        );
    }

    function registerRollup() public virtual {
        vm.broadcast(deployer);
        REGISTRY_CONTRACT.addRollup(IHaveVersion(address(ROLLUP_CONTRACT)));

        vm.broadcast(deployer);
        GSE_CONTRACT.addRollup(address(ROLLUP_CONTRACT));
    }

    function fundRewardDistributorIfEnabled() public virtual {
        if (!fundRewardDistributor) {
            return;
        }
        vm.broadcast(deployer);
        TestERC20(address(FEE_ASSET_CONTRACT)).mint(
            address(REWARD_DISTRIBUTOR_CONTRACT),
            rewardDistributorFunding
        );
    }

    function handoverToGovernance() public virtual {
        vm.broadcast(deployer);
        REGISTRY_CONTRACT.transferOwnership(address(GOVERNANCE_CONTRACT));

        vm.broadcast(deployer);
        GSE_CONTRACT.transferOwnership(address(GOVERNANCE_CONTRACT));
    }

    // ============ Assertions ============

    function _assertAccessControl() internal {
        assertEq(Ownable(address(GSE_CONTRACT)).owner(), address(GOVERNANCE_CONTRACT), "invalid gse owner");
        assertEq(address(GSE_CONTRACT.getGovernance()), address(GOVERNANCE_CONTRACT), "invalid gse governance");
        assertEq(Ownable(address(REGISTRY_CONTRACT)).owner(), address(GOVERNANCE_CONTRACT), "invalid registry owner");
        assertEq(
            address(REWARD_DISTRIBUTOR_CONTRACT.REGISTRY()),
            address(REGISTRY_CONTRACT),
            "invalid reward distributor registry"
        );
    }

    // ============ Logging ============

    function logDeployedAddresses() internal virtual view {
        console.log("=== Deployed Contract Addresses ===");
        console.log("Deployer:", deployer);
        console.log("FeeAsset:", address(FEE_ASSET_CONTRACT));
        console.log("StakingAsset:", address(STAKING_ASSET_CONTRACT));
        console.log("GSE:", address(GSE_CONTRACT));
        console.log("Registry:", address(REGISTRY_CONTRACT));
        console.log("RewardDistributor:", address(REWARD_DISTRIBUTOR_CONTRACT));
        console.log("GovernanceProposer:", address(GOVERNANCE_PROPOSER_CONTRACT));
        console.log("Governance:", address(GOVERNANCE_CONTRACT));
        console.log("CoinIssuer:", address(COIN_ISSUER_CONTRACT));
        console.log("Verifier:", address(VERIFIER_CONTRACT));
        console.log("Rollup:", address(ROLLUP_CONTRACT));
        console.log("FeeAssetHandler:", address(FEE_ASSET_HANDLER_CONTRACT));
    }
}
