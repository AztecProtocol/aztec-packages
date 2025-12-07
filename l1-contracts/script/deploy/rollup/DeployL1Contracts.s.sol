// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {CoinIssuer, IMintableERC20} from "@aztec/governance/CoinIssuer.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {FeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {HonkVerifier} from "../../../generated/HonkVerifier.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {DateGatedRelayer} from "@aztec/periphery/DateGatedRelayer.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {MockZKPassportVerifier, IZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";

import {DeploymentConfiguration} from "./DeploymentConfiguration.sol";
import {
    IDeploymentConfiguration,
    CoinIssuerConfiguration,
    GseConfiguration,
    GovernanceProposerConfiguration,
    DeploymentOptions,
    ZkPassportConfiguration
} from "./IDeploymentConfiguration.sol";

/**
 * @title DeployL1Contracts
 * @notice Deploy Aztec L1 contracts. Configuration is read from environment variables.
 *
 * Usage:
 *   # Deploy with env var config, write addresses to output file:
 *   NETWORK=devnet USE_MOCK_VERIFIER=true \
 *   forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --sig "run(string)" "./deployment-output.json" \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 *
 *   # Deploy without output file (uses defaults from env):
 *   forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 *
 * See DeploymentConfiguration.sol for available environment variables.
 */
contract DeployL1Contracts is Script, Test {
    // Deployed contracts, filled as we make progress in the deploy.
    // Note that there's no good way to scope these in Solidity
    // so that they must be accessed after creation, as it leaves the code brittle
    // to facing stack-too-deep.
    IERC20 FEE_ASSET;
    IERC20 STAKING_ASSET;
    GSE GSE_CONTRACT;
    Registry REGISTRY;
    RewardDistributor REWARD_DISTRIBUTOR;
    CoinIssuer COIN_ISSUER;
    GovernanceProposer GOVERNANCE_PROPOSER;
    Governance GOVERNANCE;
    IVerifier VERIFIER;
    Rollup ROLLUP;
    SlashFactory SLASH_FACTORY;
    DateGatedRelayer DATE_GATED_RELAYER;
    FeeAssetHandler FEE_ASSET_HANDLER;
    IZKPassportVerifier MOCK_ZK_PASSPORT_VERIFIER;
    StakingAssetHandler STAKING_ASSET_HANDLER;

    address public DEPLOYER;
    DeploymentConfiguration public CONFIG;

    function setUp() public virtual {
        DEPLOYER = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    // Main entry point: Deploy using env vars for config, write addresses to output file
    function run(string memory _outputPath) public {
        CONFIG = new DeploymentConfiguration();
        CONFIG.loadConfig();

        vm.startBroadcast(DEPLOYER);
        _deploy();
        vm.stopBroadcast();

        // Write deployed addresses to output file for TypeScript to read
        _writeDeploymentOutput(_outputPath);
    }

    function run() public {
        // No output file - skip writing (for backwards compatibility)
        CONFIG = new DeploymentConfiguration();
        CONFIG.loadConfig();

        vm.startBroadcast(DEPLOYER);
        _deploy();
        vm.stopBroadcast();
    }

    function _deploy() internal {
        // On a test network, we deploy assets.
        maybeDeployAssets();
        // CORE CONTRACTS
        deployCoinIssuer();
        deployGSE();
        deployRegistry();
        deployGovernanceProposer();
        deployGovernance();
        deployVerifier();
        deployRollup();
        deploySlashFactory();
        deployDateGatedRelayer();
        // CHEATCODE CONTRACTS (testnets only)
        maybeDeployFeeAssetHandler();
        maybeDeployStakingAssetHandler();
        // POST-DEPLOY SETUP
        registerRollup();
        maybeAddInitialValidators();
        maybeFundRewardDistributor();
        handoverToGovernance();
        assertAccessControl();
    }

    function maybeDeployAssets() internal {
        DeploymentOptions memory opts = CONFIG.getContractOptions();
        if (opts.existingStakingAssetAddress != address(0)) {
            STAKING_ASSET = IERC20(opts.existingStakingAssetAddress);
            FEE_ASSET = IERC20(opts.existingStakingAssetAddress);
        } else {
            TestERC20 stakingAsset = new TestERC20("Staking", "STK", DEPLOYER);
            TestERC20 feeAsset = new TestERC20("FeeJuice", "FEE", DEPLOYER);
            feeAsset.mint(DEPLOYER, 1e18);
            STAKING_ASSET = stakingAsset;
            FEE_ASSET = feeAsset;
        }
    }

    function deployCoinIssuer() internal {
        CoinIssuerConfiguration memory coinConfig = CONFIG.getCoinIssuerConfiguration();
        COIN_ISSUER = new CoinIssuer(
            IMintableERC20(address(FEE_ASSET)),
            coinConfig.coinIssuerRate,
            DEPLOYER
        );
    }

    function maybeDeployFeeAssetHandler() internal {
        DeploymentOptions memory opts = CONFIG.getContractOptions();
        // Deploy on test chains only (when we control the staking asset)
        if (opts.existingStakingAssetAddress == address(0)) {
            FEE_ASSET_HANDLER = new FeeAssetHandler(DEPLOYER, address(FEE_ASSET), 1000e18);
            TestERC20(address(FEE_ASSET)).addMinter(address(FEE_ASSET_HANDLER));
        }
    }

    function deployGSE() internal {
        GseConfiguration memory gseConfig = CONFIG.getGseConfiguration();
        GSE_CONTRACT = new GSE(
            DEPLOYER,
            STAKING_ASSET,
            gseConfig.activationThreshold,
            gseConfig.ejectionThreshold
        );
    }

    function deployRegistry() internal {
        REGISTRY = new Registry(DEPLOYER, FEE_ASSET);
        REWARD_DISTRIBUTOR = RewardDistributor(address(REGISTRY.getRewardDistributor()));
    }

    function deployGovernanceProposer() internal {
        GovernanceProposerConfiguration memory govPropConfig = CONFIG.getGovernanceProposerConfiguration();
        GOVERNANCE_PROPOSER = new GovernanceProposer(
            REGISTRY,
            GSE_CONTRACT,
            govPropConfig.quorum,
            govPropConfig.roundSize
        );
    }

    function deployGovernance() internal {
        GOVERNANCE = new Governance(
            STAKING_ASSET,
            address(GOVERNANCE_PROPOSER),
            address(GSE_CONTRACT),
            CONFIG.getGovernanceConfiguration()
        );
        GSE_CONTRACT.setGovernance(GOVERNANCE);
    }

    function deployVerifier() internal {
        DeploymentOptions memory opts = CONFIG.getContractOptions();
        if (opts.useMockVerifier) {
            VERIFIER = new MockVerifier();
        } else {
            VERIFIER = IVerifier(address(new HonkVerifier()));
        }
    }

    function deployRollup() internal {
        GenesisState memory genesisState = CONFIG.getGenesisState();
        RollupConfigInput memory rollupConfig = CONFIG.getRollupConfiguration(
            IRewardDistributor(address(REWARD_DISTRIBUTOR))
        );

        ROLLUP = new Rollup(
            FEE_ASSET,
            STAKING_ASSET,
            GSE_CONTRACT,
            VERIFIER,
            address(GOVERNANCE),
            genesisState,
            rollupConfig
        );
    }

    function deploySlashFactory() internal {
        SLASH_FACTORY = new SlashFactory(ROLLUP);
    }

    // WORKTODO make issue to port this
    // to align contracts. This should be ProtocolTreasury?
    // Not critical as we won't be redeploying mainnet, but good for completeness.
    function deployDateGatedRelayer() internal {
        // ProtocolTreasuryConfiguration memory protocolTreasuryConfiguration =
        // AZTEC_CONFIGURATION.getProtocolTreasuryConfiguration();

        // address insiderAtpRegistry = 0xD938bE4A2cB41105Bc2FbE707dca124A2e5d0c80;
        // if (block.chainid != 1) {
        //     // If we are not on mainnet, we have to deploy something we can use.
        //     vm.broadcast(WALLETS.deployer);
        //     insiderAtpRegistry = address(new MockATPRegistry(protocolTreasuryConfiguration.gatedUntil));
        // }

        // vm.broadcast(WALLETS.deployer);
        // PROTOCOL_TREASURY_CONTRACT = new ProtocolTreasury(
        //     address(GOVERNANCE_CONTRACT), insiderAtpRegistry, protocolTreasuryConfiguration.gatedUntil
        // );
        DATE_GATED_RELAYER = new DateGatedRelayer(address(GOVERNANCE), 1798761600);
    }

    function maybeDeployStakingAssetHandler() internal {
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
                MOCK_ZK_PASSPORT_VERIFIER = IZKPassportVerifier(address(new MockZKPassportVerifier()));
                zkPassportVerifier = address(MOCK_ZK_PASSPORT_VERIFIER);
            }

            ZkPassportConfiguration memory zkConfig = CONFIG.getZkPassportConfiguration();
            address[] memory unhinged = new address[](1);
            unhinged[0] = 0x3b218d0F26d15B36C715cB06c949210a0d630637; // AMIN isUnhinged

            STAKING_ASSET_HANDLER = new StakingAssetHandler(StakingAssetHandler.StakingAssetHandlerArgs({
                owner: DEPLOYER,
                stakingAsset: address(STAKING_ASSET),
                registry: REGISTRY,
                withdrawer: DEPLOYER,
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
            TestERC20(address(STAKING_ASSET)).addMinter(address(STAKING_ASSET_HANDLER));
        }
    }

    function registerRollup() internal {
        REGISTRY.addRollup(ROLLUP);
        GSE_CONTRACT.addRollup(address(ROLLUP));
    }

    function maybeAddInitialValidators() internal {
        CheatDepositArgs[] memory initialValidators = CONFIG.parseValidators();
        DeploymentOptions memory opts = CONFIG.getContractOptions();
        // Testnets only.
        if (initialValidators.length == 0 || opts.existingStakingAssetAddress != address(0)) {
            return;
        }

        MultiAdder multiAdder = new MultiAdder(address(ROLLUP), DEPLOYER);

        uint256 activationThreshold = ROLLUP.getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * initialValidators.length;
        TestERC20(address(STAKING_ASSET)).mint(address(multiAdder), stakeNeeded);

        uint256 chunkSize = 16;
        for (uint256 i = 0; i < initialValidators.length; i += chunkSize) {
            uint256 end = i + chunkSize > initialValidators.length ? initialValidators.length : i + chunkSize;
            uint256 chunkLen = end - i;

            CheatDepositArgs[] memory chunk = new CheatDepositArgs[](chunkLen);
            for (uint256 j = 0; j < chunkLen; j++) {
                chunk[j] = initialValidators[i + j];
            }

            multiAdder.addValidators(chunk, 0);
        }

        uint256 flushChunkSize = 16;
        while (true) {
            uint256 queueLength = ROLLUP.getEntryQueueLength();
            if (queueLength == 0) break;

            uint256 availableFlushes = ROLLUP.getAvailableValidatorFlushes();
            if (availableFlushes == 0) break;

            ROLLUP.flushEntryQueue(flushChunkSize);
        }
    }

    function maybeFundRewardDistributor() internal {
        DeploymentOptions memory opts = CONFIG.getContractOptions();
        if (opts.fundRewardDistributor && opts.existingStakingAssetAddress == address(0)) {
            uint256 funding = CONFIG.getRewardDistributorFunding();
            TestERC20(address(FEE_ASSET)).mint(address(REWARD_DISTRIBUTOR), funding);
        }
    }

    function handoverToGovernance() internal {
        REGISTRY.transferOwnership(address(GOVERNANCE));
        GSE_CONTRACT.transferOwnership(address(GOVERNANCE));

        DeploymentOptions memory opts = CONFIG.getContractOptions();
        if (opts.existingStakingAssetAddress == address(0)) {
            Ownable(address(FEE_ASSET)).transferOwnership(address(COIN_ISSUER));
            COIN_ISSUER.acceptTokenOwnership();
            COIN_ISSUER.transferOwnership(address(DATE_GATED_RELAYER));
        }
    }

    function assertAccessControl() internal view {
        assertEq(Ownable(address(GSE_CONTRACT)).owner(), address(GOVERNANCE), "invalid gse owner");
        assertEq(address(GSE_CONTRACT.getGovernance()), address(GOVERNANCE), "invalid gse governance");
        assertEq(Ownable(address(REGISTRY)).owner(), address(GOVERNANCE), "invalid registry owner");
        assertEq(
            address(REWARD_DISTRIBUTOR.REGISTRY()),
            address(REGISTRY),
            "invalid reward distributor registry"
        );
        assertEq(Ownable(address(DATE_GATED_RELAYER)).owner(), address(GOVERNANCE), "invalid date gated relayer owner");

        DeploymentOptions memory opts = CONFIG.getContractOptions();
        if (opts.existingStakingAssetAddress == address(0)) {
            assertEq(Ownable(address(FEE_ASSET)).owner(), address(COIN_ISSUER), "invalid fee asset owner");
            assertEq(Ownable(address(COIN_ISSUER)).owner(), address(DATE_GATED_RELAYER), "invalid coin issuer owner");
        }
    }

    function _writeDeploymentOutput(string memory _outputPath) internal {
        string memory json = "deployment";
        vm.serializeAddress(json, "rollupAddress", address(ROLLUP));
        vm.serializeAddress(json, "registryAddress", address(REGISTRY));
        vm.serializeAddress(json, "feeAssetAddress", address(FEE_ASSET));
        vm.serializeAddress(json, "stakingAssetAddress", address(STAKING_ASSET));
        vm.serializeAddress(json, "gseAddress", address(GSE_CONTRACT));
        vm.serializeAddress(json, "rewardDistributorAddress", address(REWARD_DISTRIBUTOR));
        vm.serializeAddress(json, "coinIssuerAddress", address(COIN_ISSUER));
        vm.serializeAddress(json, "governanceProposerAddress", address(GOVERNANCE_PROPOSER));
        vm.serializeAddress(json, "governanceAddress", address(GOVERNANCE));
        vm.serializeAddress(json, "verifierAddress", address(VERIFIER));
        vm.serializeAddress(json, "slashFactoryAddress", address(SLASH_FACTORY));
        vm.serializeAddress(json, "feeAssetHandlerAddress", address(FEE_ASSET_HANDLER));
        vm.serializeAddress(json, "stakingAssetHandlerAddress", address(STAKING_ASSET_HANDLER));
        vm.serializeAddress(json, "zkPassportVerifierAddress", address(MOCK_ZK_PASSPORT_VERIFIER));
        // Query addresses from Rollup contract (these are set during Rollup deployment)
        vm.serializeAddress(json, "inboxAddress", address(ROLLUP.getInbox()));
        vm.serializeAddress(json, "outboxAddress", address(ROLLUP.getOutbox()));
        vm.serializeAddress(json, "feeAssetPortalAddress", address(ROLLUP.getFeeAssetPortal()));
        string memory finalJson = vm.serializeUint(json, "rollupVersion", ROLLUP.getVersion());
        vm.writeJson(finalJson, _outputPath);
    }
}
