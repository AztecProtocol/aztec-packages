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
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {DateGatedRelayer} from "@aztec/periphery/DateGatedRelayer.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {MockZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";

import {
    Configuration as GovernanceConfiguration,
    ProposeWithLockConfiguration
} from "@aztec/governance/interfaces/IGovernance.sol";
import {RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {EthValue} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";

/**
 * @title DeployL1Contracts
 * @notice Deploy Aztec L1 contracts.
 *
 * Usage:
 *   # With JSON config (passed as parameter):
 *   forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --sig "run(string)" '{"deployment":{"useMockVerifier":true}}' \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 *
 *   # Without config (uses defaults):
 *   forge script script/deploy/rollup/DeployL1Contracts.s.sol:DeployL1Contracts \
 *     --rpc-url $RPC_URL \
 *     --private-key $PRIVATE_KEY \
 *     --broadcast \
 *     -vvv
 */
contract DeployL1Contracts is Script, Test {
    struct DeploymentOptions {
        bool useMockVerifier;
        bool fundRewardDistributor;
        address existingStakingAssetAddress;
        bool deployFeeAssetHandler;
        bool deployStakingAssetHandler;
    }

    struct GseConfiguration {
        uint256 activationThreshold;
        uint256 ejectionThreshold;
    }

    struct GovernanceProposerConfiguration {
        uint256 quorum;
        uint256 roundSize;
    }

    struct CoinIssuerConfiguration {
        uint256 coinIssuerRate;
    }

    struct GenesisConfiguration {
        bytes32 vkTreeRoot;
        bytes32 protocolContractsHash;
        bytes32 genesisArchiveRoot;
    }

    struct ZkPassportConfiguration {
        string domain;
        string scope;
    }

    struct RollupTimingConfiguration {
        uint256 aztecSlotDuration;
        uint256 aztecEpochDuration;
        uint256 targetCommitteeSize;
    }

    struct ValidatorSetConfiguration {
        uint256 lagInEpochsForValidatorSet;
        uint256 lagInEpochsForRandao;
        uint256 aztecProofSubmissionEpochs;
    }

    struct SlashingConfiguration {
        SlasherFlavor flavor;
        uint256 roundSize;
        uint256 quorum;
        uint256 lifetimeInRounds;
        uint256 executionDelayInRounds;
        uint256 offsetInRounds;
        uint256 disableDuration;
        address vetoer;
        uint256[3] slashAmounts;
    }

    struct FeeConfiguration {
        uint256 manaTarget;
        uint256 exitDelaySeconds;
        uint256 provingCostPerMana;
        uint256 localEjectionThreshold;
    }

    struct RewardConfiguration {
        uint256 sequencerBps;
        uint256 checkpointReward;
    }

    struct StakingQueueConfiguration {
        uint256 bootstrapValidatorSetSize;
        uint256 bootstrapFlushSize;
        uint256 normalFlushSizeMin;
        uint256 normalFlushSizeQuotient;
        uint256 maxQueueFlushSize;
    }

    // Comprehensive configuration struct that holds all parsed deployment configuration
    struct DeploymentConfiguration {
        string networkName;
        DeploymentOptions deploymentOptions;
        CoinIssuerConfiguration coinIssuerConfig;
        GseConfiguration gseConfig;
        GovernanceProposerConfiguration governanceProposerConfig;
        GovernanceConfiguration governanceConfig;
        GenesisConfiguration genesisConfig;
        ZkPassportConfiguration zkPassportConfig;
        RollupTimingConfiguration timingConfig;
        ValidatorSetConfiguration validatorSetConfig;
        SlashingConfiguration slashingConfig;
        FeeConfiguration feeConfig;
        RewardConfiguration rewardConfig;
        StakingQueueConfiguration stakingQueueConfig;
        uint256 rewardDistributorFunding;
        uint256 earliestRewardsClaimableTimestamp;
        // Note: initialValidators are loaded separately via loadInitialValidators() since dynamic arrays cannot be stored in config
    }

    // Struct holding all deployed contract addresses
    struct DeployedContracts {
        IERC20 feeAsset;
        IERC20 stakingAsset;
        GSE gse;
        Registry registry;
        RewardDistributor rewardDistributor;
        CoinIssuer coinIssuer;
        GovernanceProposer governanceProposer;
        Governance governance;
        IVerifier verifier;
        Rollup rollup;
        SlashFactory slashFactory;
        DateGatedRelayer dateGatedRelayer;
        address feeAssetHandler;
        MockZKPassportVerifier mockZkPassportVerifier;
        address stakingAssetHandler;
    }

    address public deployer;
    string internal configJson;
    DeploymentConfiguration internal config;
    DeployedContracts public deployed;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    // Main entry point: Parse JSON config and deploy
    function run(string memory _configJson) public returns (DeployedContracts memory) {
        config = parseJsonConfig(_configJson);

        vm.startBroadcast(deployer);
        deploy();
        vm.stopBroadcast();

        return deployed;
    }

    function run() public {
        run("");
    }

    // Parse JSON configuration and apply defaults
    // This ONLY parses the JSON and returns the config - does NOT deploy
    // Use this to inspect config before calling runParsed()
    function parseJsonConfig(string memory _configJson) public returns (DeploymentConfiguration memory) {
        configJson = _configJson;

        // Read networkName from config, default to "local"
        // Valid values: local, devnet, next-net, staging-public, testnet, staging-ignition, mainnet
        config.networkName = _readString(".deployment.networkName", "local");

        // Load all configuration sections
        loadDeploymentOptions();
        loadCoinIssuerConfig();
        loadGseConfig();
        loadGovernanceProposerConfig();
        loadGovernanceConfig();
        loadGenesisConfig();
        loadZkPassportConfig();
        loadTimingConfig();
        loadValidatorSetConfig();
        loadSlashingConfig();
        loadFeeConfig();
        loadRewardConfig();
        loadStakingQueueConfig();
        loadRewardDistributorFunding();
        config.earliestRewardsClaimableTimestamp = block.timestamp + 90 days;
        // Note: initialValidators are loaded separately in deployRollupAndSetup() since dynamic arrays cannot be stored in config

        return config;
    }

    // Get the current contract-level config
    // This allows tests to inspect the parsed configuration before deployment
    function getConfiguration() public view returns (DeploymentConfiguration memory) {
        return config;
    }

    // Internal deployment function that uses the contract-level config
    function deploy() internal {
        console.log("=== Deploying Aztec L1 Contracts ===");
        console.log("Deployer:", deployer);
        console.log("Network:", config.networkName);

        {
            // Deploy assets and store in deployed struct
            (address feeAsset, address stakingAsset) = maybeDeployAssets(config.deploymentOptions.existingStakingAssetAddress);
            deployed.feeAsset = IERC20(feeAsset);
            deployed.stakingAsset = IERC20(stakingAsset);
            console.log("FeeAsset:", feeAsset);
            console.log("StakingAsset:", stakingAsset);
        }

        {
            // Deploy coin issuer and store in deployed struct
            address coinIssuer = deployCoinIssuer(feeAsset, config.coinIssuerConfig.coinIssuerRate);
            deployed.coinIssuer = CoinIssuer(coinIssuer);
            console.log("CoinIssuer:", coinIssuer);
        }
        {
            // Deploy fee asset handler and store in deployed struct
            address feeAssetHandler = maybeDeployFeeAssetHandler(feeAsset, config.deploymentOptions.deployFeeAssetHandler);
            deployed.feeAssetHandler = feeAssetHandler;
            if (feeAssetHandler != address(0)) {
                console.log("FeeAssetHandler:", feeAssetHandler);
            }
        }

        // Deploy governance infrastructure and store in deployed struct
        (address gse, address registry, address rewardDistributor) = deployGovernanceInfrastructure(feeAsset, stakingAsset);
        deployed.gse = GSE(gse);
        deployed.registry = Registry(registry);
        deployed.rewardDistributor = RewardDistributor(rewardDistributor);

        // Deploy governance contracts and store in deployed struct
        (address governance) = deployGovernanceContracts(stakingAsset, registry, gse);
        deployed.governance = Governance(governance);

        // Deploy rollup and periphery contracts
        deployRollupAndSetup(
            feeAsset,
            stakingAsset,
            feeAssetHandler,
            gse,
            registry,
            rewardDistributor,
            coinIssuer,
            governance
        );
        console.log("=== Deployment Complete ===");
    }

    // Split to avoid "stack too deep".
    function deployRollupAndSetup(
        address feeAsset,
        address stakingAsset,
        address feeAssetHandler,
        address gse,
        address registry,
        address rewardDistributor,
        address coinIssuer,
        address governance
    ) internal {
        // Deploy rollup and store in deployed struct
        address rollup = deployRollupInfrastructure(feeAsset, stakingAsset, gse, governance, rewardDistributor);
        deployed.rollup = Rollup(rollup);

        // Deploy date gated relayer and store in deployed struct
        address dateGatedRelayer = deployDateGatedRelayer(governance);
        deployed.dateGatedRelayer = DateGatedRelayer(dateGatedRelayer);
        console.log("DateGatedRelayer:", dateGatedRelayer);

        // Deploy staking asset handler and store in deployed struct
        (address mockZKPassportVerifier, address stakingAssetHandler) = maybeDeployStakingAssetHandler(
            stakingAsset,
            registry,
            config.deploymentOptions.deployStakingAssetHandler,
            config.zkPassportConfig.domain,
            config.zkPassportConfig.scope
        );
        if (stakingAssetHandler != address(0)) {
            deployed.mockZkPassportVerifier = MockZKPassportVerifier(mockZKPassportVerifier);
            deployed.stakingAssetHandler = stakingAssetHandler;
            console.log("MockZKPassportVerifier:", mockZKPassportVerifier);
            console.log("StakingAssetHandler:", stakingAssetHandler);
        }

        // Setup and finalize
        wireContracts(feeAsset, stakingAsset, feeAssetHandler, stakingAssetHandler, gse, governance, config.deploymentOptions.existingStakingAssetAddress);
        registerRollup(registry, gse, rollup);

        // Add initial validators if provided (mirrors TypeScript addMultipleValidators logic)
        // Validators are added AFTER registering rollup in GSE but BEFORE handover to governance
        // This allows us to add validators while deployer still owns the contracts
        CheatDepositArgs[] memory initialValidators = loadInitialValidators();
        if (initialValidators.length > 0 && config.deploymentOptions.existingStakingAssetAddress == address(0)) {
            // Only add validators if:
            // 1. We have validators to add
            // 2. We control the staking asset (can mint tokens)
            addValidators(rollup, stakingAsset, initialValidators);
        }

        maybeFundRewardDistributor(
            feeAsset,
            rewardDistributor,
            config.deploymentOptions.fundRewardDistributor,
            config.deploymentOptions.existingStakingAssetAddress,
            config.rewardDistributorFunding
        );
        handoverToGovernance(feeAsset, registry, gse, coinIssuer, governance, dateGatedRelayer, config.deploymentOptions.existingStakingAssetAddress);
        assertAccessControl(feeAsset, gse, registry, rewardDistributor, coinIssuer, governance, dateGatedRelayer, config.deploymentOptions.existingStakingAssetAddress);
    }

    function deployGovernanceInfrastructure(address feeAsset, address stakingAsset) internal returns (address gse, address registry, address rewardDistributor) {
        gse = deployGSE(stakingAsset, config.gseConfig.activationThreshold, config.gseConfig.ejectionThreshold);
        console.log("GSE:", gse);

        (registry, rewardDistributor) = deployRegistry(feeAsset);
        console.log("Registry:", registry);
        console.log("RewardDistributor:", rewardDistributor);

        return (gse, registry, rewardDistributor);
    }

    function deployGovernanceContracts(
        address stakingAsset,
        address registry,
        address gse
    ) internal returns (address governance) {
        // Deploy governance proposer and store in deployed struct
        address governanceProposer = deployGovernanceProposer(registry, gse, config.governanceProposerConfig.quorum, config.governanceProposerConfig.roundSize);
        deployed.governanceProposer = GovernanceProposer(governanceProposer);
        console.log("GovernanceProposer:", governanceProposer);

        governance = deployGovernance(stakingAsset, governanceProposer, gse, config.governanceConfig);
        console.log("Governance:", governance);

        return (governance);
    }

    function deployRollupInfrastructure(
        address feeAsset,
        address stakingAsset,
        address gse,
        address governance,
        address rewardDistributor
    ) internal returns (address rollup) {
        // Deploy verifier and store in deployed struct
        address verifier = deployVerifier(config.deploymentOptions.useMockVerifier);
        deployed.verifier = IVerifier(verifier);
        console.log("Verifier:", verifier);

        rollup = deployRollup(feeAsset, stakingAsset, gse, verifier, governance, rewardDistributor);
        console.log("Rollup:", rollup);

        // Deploy slash factory and store in deployed struct
        address slashFactory = deploySlashFactory(rollup);
        deployed.slashFactory = SlashFactory(slashFactory);
        console.log("SlashFactory:", slashFactory);

        return (rollup);
    }

    function maybeDeployAssets(address existingStakingAssetAddress) internal returns (address feeAsset, address stakingAsset) {
        // Deploy FeeAsset
        console.log("--- TestERC20 (FeeAsset) constructor args ---");
        console.log("  name: FeeJuice");
        console.log("  symbol: FEE");
        console.log("  owner:", deployer);
        TestERC20 feeAssetContract = new TestERC20("FeeJuice", "FEE", deployer);

        // Mint a tiny bit of tokens to satisfy coin-issuer constraints
        console.log("--- Transaction: FeeAsset.mint (initial supply) ---");
        console.log("  to:", address(feeAssetContract));
        console.log("  recipient:", deployer);
        console.log("  amount: 1000000000000000000");
        feeAssetContract.mint(deployer, 1e18);

        // Deploy StakingAsset (separate contract, or use existing)
        if (existingStakingAssetAddress != address(0)) {
            console.log("--- TestERC20 (StakingAsset): using existing ---");
            console.log("  address:", existingStakingAssetAddress);
            return (address(feeAssetContract), existingStakingAssetAddress);
        }

        console.log("--- TestERC20 (StakingAsset) constructor args ---");
        console.log("  name: Staking");
        console.log("  symbol: STK");
        console.log("  owner:", deployer);
        TestERC20 stakingAssetContract = new TestERC20("Staking", "STK", deployer);

        return (address(feeAssetContract), address(stakingAssetContract));
    }

    function deployCoinIssuer(address feeAsset, uint256 coinIssuerRate) internal returns (address) {
        console.log("--- CoinIssuer constructor args ---");
        console.log("  feeAsset:", feeAsset);
        console.log("  coinIssuerRate:", coinIssuerRate);
        console.log("  owner:", deployer);
        return address(new CoinIssuer(IMintableERC20(feeAsset), coinIssuerRate, deployer));
    }

    function maybeDeployFeeAssetHandler(address feeAsset, bool shouldDeploy) internal returns (address) {
        if (!shouldDeploy) {
            return address(0);
        }
        console.log("--- FeeAssetHandler constructor args ---");
        console.log("  owner:", deployer);
        console.log("  feeAsset:", feeAsset);
        console.log("  initialMint: 1000e18");
        return address(new FeeAssetHandler(deployer, feeAsset, 1000e18));
    }

    function deployGSE(address stakingAsset, uint256 activationThreshold, uint256 ejectionThreshold) internal returns (address) {
        console.log("--- GSE constructor args ---");
        console.log("  owner:", deployer);
        console.log("  stakingAsset:", stakingAsset);
        console.log("  activationThreshold:", activationThreshold);
        console.log("  ejectionThreshold:", ejectionThreshold);
        return address(new GSE(deployer, IERC20(stakingAsset), activationThreshold, ejectionThreshold));
    }

    function deployRegistry(address feeAsset) internal returns (address registry, address rewardDistributor) {
        console.log("--- Registry constructor args ---");
        console.log("  owner:", deployer);
        console.log("  feeAsset:", feeAsset);
        Registry reg = new Registry(deployer, IERC20(feeAsset));
        return (address(reg), address(reg.getRewardDistributor()));
    }

    function deployGovernanceProposer(address registry, address gse, uint256 quorum, uint256 roundSize) internal returns (address) {
        console.log("--- GovernanceProposer constructor args ---");
        console.log("  registry:", registry);
        console.log("  gse:", gse);
        console.log("  quorum:", quorum);
        console.log("  roundSize:", roundSize);
        return address(new GovernanceProposer(
            Registry(registry), GSE(gse), quorum, roundSize
        ));
    }

    function deployGovernance(address stakingAsset, address govProposer, address gse, GovernanceConfiguration memory govConfig) internal returns (address) {
        console.log("--- Governance constructor args ---");
        console.log("  stakingAsset:", stakingAsset);
        console.log("  govProposer:", govProposer);
        console.log("  gse:", gse);
        console.log("  config.proposeConfig.lockDelay:", Timestamp.unwrap(govConfig.proposeConfig.lockDelay));
        console.log("  config.proposeConfig.lockAmount:", govConfig.proposeConfig.lockAmount);
        console.log("  config.votingDelay:", Timestamp.unwrap(govConfig.votingDelay));
        console.log("  config.votingDuration:", Timestamp.unwrap(govConfig.votingDuration));
        console.log("  config.executionDelay:", Timestamp.unwrap(govConfig.executionDelay));
        console.log("  config.gracePeriod:", Timestamp.unwrap(govConfig.gracePeriod));
        console.log("  config.quorum:", govConfig.quorum);
        console.log("  config.requiredYeaMargin:", govConfig.requiredYeaMargin);
        console.log("  config.minimumVotes:", govConfig.minimumVotes);
        return address(new Governance(
            IERC20(stakingAsset), govProposer, gse, govConfig
        ));
    }

    function deployVerifier(bool useMockVerifier) internal returns (address) {
        console.log("--- Verifier constructor args ---");
        console.log("  useMockVerifier:", useMockVerifier);
        if (useMockVerifier) {
            return address(new MockVerifier());
        }
        return address(new HonkVerifier());
    }

    function deployRollup(
        address feeAsset,
        address stakingAsset,
        address gse,
        address verifier,
        address governance,
        address rewardDistributor
    ) internal returns (address) {
        GenesisState memory genesisState = GenesisState({
            vkTreeRoot: config.genesisConfig.vkTreeRoot,
            protocolContractsHash: config.genesisConfig.protocolContractsHash,
            genesisArchiveRoot: config.genesisConfig.genesisArchiveRoot
        });

        RollupConfigInput memory rollupConfig = buildRollupConfiguration(IRewardDistributor(rewardDistributor));

        console.log("--- Rollup constructor args ---");
        console.log("  feeAsset:", feeAsset);
        console.log("  stakingAsset:", stakingAsset);
        console.log("  gse:", gse);
        console.log("  verifier:", verifier);
        console.log("  governance:", governance);
        console.log("  genesisState.vkTreeRoot:", uint256(genesisState.vkTreeRoot));
        console.log("  genesisState.protocolContractsHash:", uint256(genesisState.protocolContractsHash));
        console.log("  genesisState.genesisArchiveRoot:", uint256(genesisState.genesisArchiveRoot));
        console.log("  rollupConfig.aztecSlotDuration:", rollupConfig.aztecSlotDuration);
        console.log("  rollupConfig.aztecEpochDuration:", rollupConfig.aztecEpochDuration);
        console.log("  rollupConfig.targetCommitteeSize:", rollupConfig.targetCommitteeSize);
        console.log("  rollupConfig.aztecProofSubmissionEpochs:", rollupConfig.aztecProofSubmissionEpochs);
        console.log("  rollupConfig.slasherFlavor:", uint8(rollupConfig.slasherFlavor));
        console.log("  rollupConfig.lagInEpochsForValidatorSet:", rollupConfig.lagInEpochsForValidatorSet);
        console.log("  rollupConfig.lagInEpochsForRandao:", rollupConfig.lagInEpochsForRandao);
        console.log("  rollupConfig.slashingQuorum:", rollupConfig.slashingQuorum);
        console.log("  rollupConfig.slashingRoundSize:", rollupConfig.slashingRoundSize);
        console.log("  rollupConfig.manaTarget:", rollupConfig.manaTarget);
        console.log("  rollupConfig.provingCostPerMana:", EthValue.unwrap(rollupConfig.provingCostPerMana));
        console.log("  rollupConfig.slashingOffsetInRounds:", rollupConfig.slashingOffsetInRounds);
        console.log("  rollupConfig.slashAmounts[0]:", rollupConfig.slashAmounts[0]);
        console.log("  rollupConfig.slashAmounts[1]:", rollupConfig.slashAmounts[1]);
        console.log("  rollupConfig.slashAmounts[2]:", rollupConfig.slashAmounts[2]);
        console.log("  rollupConfig.exitDelaySeconds:", rollupConfig.exitDelaySeconds);
        console.log("  rollupConfig.localEjectionThreshold:", rollupConfig.localEjectionThreshold);
        console.log("  rollupConfig.slashingDisableDuration:", rollupConfig.slashingDisableDuration);
        console.log("  rollupConfig.slashingLifetimeInRounds:", rollupConfig.slashingLifetimeInRounds);
        console.log("  rollupConfig.slashingExecutionDelayInRounds:", rollupConfig.slashingExecutionDelayInRounds);
        console.log("  rollupConfig.rewardConfig.sequencerBps:", Bps.unwrap(rollupConfig.rewardConfig.sequencerBps));
        console.log("  rollupConfig.rewardConfig.checkpointReward:", rollupConfig.rewardConfig.checkpointReward);
        console.log("  rollupConfig.rewardBoostConfig.increment:", rollupConfig.rewardBoostConfig.increment);
        console.log("  rollupConfig.rewardBoostConfig.maxScore:", rollupConfig.rewardBoostConfig.maxScore);
        console.log("  rollupConfig.rewardBoostConfig.a:", rollupConfig.rewardBoostConfig.a);
        console.log("  rollupConfig.rewardBoostConfig.k:", rollupConfig.rewardBoostConfig.k);
        console.log("  rollupConfig.rewardBoostConfig.minimum:", rollupConfig.rewardBoostConfig.minimum);
        console.log("  rollupConfig.stakingQueueConfig.bootstrapValidatorSetSize:", rollupConfig.stakingQueueConfig.bootstrapValidatorSetSize);
        console.log("  rollupConfig.stakingQueueConfig.bootstrapFlushSize:", rollupConfig.stakingQueueConfig.bootstrapFlushSize);
        console.log("  rollupConfig.stakingQueueConfig.normalFlushSizeMin:", rollupConfig.stakingQueueConfig.normalFlushSizeMin);
        console.log("  rollupConfig.stakingQueueConfig.normalFlushSizeQuotient:", rollupConfig.stakingQueueConfig.normalFlushSizeQuotient);
        console.log("  rollupConfig.stakingQueueConfig.maxQueueFlushSize:", rollupConfig.stakingQueueConfig.maxQueueFlushSize);
        console.log("  rollupConfig.version:", rollupConfig.version);
        console.log("  rollupConfig.earliestRewardsClaimableTimestamp:", Timestamp.unwrap(rollupConfig.earliestRewardsClaimableTimestamp));

        return address(new Rollup(
            IERC20(feeAsset),
            IERC20(stakingAsset),
            GSE(gse),
            IVerifier(verifier),
            governance,
            genesisState,
            rollupConfig
        ));
    }

    function deploySlashFactory(address rollup) internal returns (address) {
        console.log("--- SlashFactory constructor args ---");
        console.log("  rollup:", rollup);
        return address(new SlashFactory(Rollup(rollup)));
    }

    function deployDateGatedRelayer(address governance) internal returns (address) {
        console.log("--- DateGatedRelayer constructor args ---");
        console.log("  governance:", governance);
        console.log("  activationTimestamp: 1798761600"); // 2027-01-01 00:00:00 UTC
        return address(new DateGatedRelayer(governance, 1798761600));
    }

    function maybeDeployStakingAssetHandler(address stakingAsset, address registry, bool shouldDeploy, string memory zkPassportDomain, string memory zkPassportScope) internal returns (address mockVerifier, address handler) {
        if (!shouldDeploy) {
            return (address(0), address(0));
        }

        console.log("--- MockZKPassportVerifier constructor args ---");
        console.log("  (no args)");
        MockZKPassportVerifier zkVerifier = new MockZKPassportVerifier();

        console.log("--- StakingAssetHandler constructor args ---");
        console.log("  owner:", deployer);
        console.log("  stakingAsset:", stakingAsset);
        console.log("  registry:", registry);
        console.log("  withdrawer:", deployer);
        console.log("  validatorsToFlush: 16");
        console.log("  mintInterval: 86400");
        console.log("  depositsPerMint: 10");
        console.log("  zkPassportVerifier:", address(zkVerifier));
        console.log("  domain:", zkPassportDomain);
        console.log("  scope:", zkPassportScope);
        console.log("  skipBindCheck: true");
        console.log("  skipMerkleCheck: true");

        StakingAssetHandler.StakingAssetHandlerArgs memory args = StakingAssetHandler.StakingAssetHandlerArgs({
            owner: deployer,
            stakingAsset: stakingAsset,
            registry: IRegistry(registry),
            withdrawer: deployer,
            validatorsToFlush: 16,
            mintInterval: 60 * 60 * 24,
            depositsPerMint: 10,
            depositMerkleRoot: bytes32(0),
            zkPassportVerifier: ZKPassportVerifier(address(zkVerifier)),
            unhinged: new address[](1),
            domain: zkPassportDomain,
            scope: zkPassportScope,
            skipBindCheck: true,
            skipMerkleCheck: true
        });
        args.unhinged[0] = deployer;

        return (address(zkVerifier), address(new StakingAssetHandler(args)));
    }

    function wireContracts(address feeAsset, address stakingAsset, address feeAssetHandler, address stakingAssetHandler, address gse, address governance, address existingStakingAssetAddress) internal {
        if (feeAssetHandler != address(0) && existingStakingAssetAddress == address(0)) {
            console.log("--- Transaction: FeeAsset.addMinter ---");
            console.log("  to:", feeAsset);
            console.log("  minter:", feeAssetHandler);
            TestERC20(feeAsset).addMinter(feeAssetHandler);
        }
        if (stakingAssetHandler != address(0) && existingStakingAssetAddress == address(0)) {
            console.log("--- Transaction: StakingAsset.addMinter ---");
            console.log("  to:", stakingAsset);
            console.log("  minter:", stakingAssetHandler);
            TestERC20(stakingAsset).addMinter(stakingAssetHandler);
        }
        console.log("--- Transaction: GSE.setGovernance ---");
        console.log("  to:", gse);
        console.log("  governance:", governance);
        GSE(gse).setGovernance(Governance(governance));
    }

    function registerRollup(address registry, address gse, address rollup) internal {
        console.log("--- Transaction: Registry.addRollup ---");
        console.log("  to:", registry);
        console.log("  rollup:", rollup);
        Registry(registry).addRollup(IHaveVersion(rollup));

        console.log("--- Transaction: GSE.addRollup ---");
        console.log("  to:", gse);
        console.log("  rollup:", rollup);
        GSE(gse).addRollup(rollup);
    }

    function maybeFundRewardDistributor(address feeAsset, address rewardDistributor, bool shouldFund, address existingStakingAssetAddress, uint256 amount) internal {
        if (shouldFund && existingStakingAssetAddress == address(0)) {
            console.log("--- Transaction: FeeAsset.mint (RewardDistributor funding) ---");
            console.log("  to:", feeAsset);
            console.log("  recipient:", rewardDistributor);
            console.log("  amount:", amount);
            TestERC20(feeAsset).mint(rewardDistributor, amount);
        }
    }

    function handoverToGovernance(address feeAsset, address registry, address gse, address coinIssuer, address governance, address dateGatedRelayer, address existingStakingAssetAddress) internal {
        console.log("--- Transaction: Registry.transferOwnership ---");
        console.log("  to:", registry);
        console.log("  newOwner:", governance);
        Registry(registry).transferOwnership(governance);

        console.log("--- Transaction: GSE.transferOwnership ---");
        console.log("  to:", gse);
        console.log("  newOwner:", governance);
        GSE(gse).transferOwnership(governance);

        if (existingStakingAssetAddress == address(0)) {
            console.log("--- Transaction: FeeAsset.transferOwnership ---");
            console.log("  to:", feeAsset);
            console.log("  newOwner:", coinIssuer);
            TestERC20(feeAsset).transferOwnership(coinIssuer);

            console.log("--- Transaction: CoinIssuer.acceptTokenOwnership ---");
            console.log("  to:", coinIssuer);
            CoinIssuer(coinIssuer).acceptTokenOwnership();

            // Transfer ownership to the DateGatedRelayer (which is owned by Governance)
            console.log("--- Transaction: CoinIssuer.transferOwnership ---");
            console.log("  to:", coinIssuer);
            console.log("  newOwner:", dateGatedRelayer);
            CoinIssuer(coinIssuer).transferOwnership(dateGatedRelayer);
        }
    }

    function assertAccessControl(address feeAsset, address gse, address registry, address rewardDistributor, address coinIssuer, address governance, address dateGatedRelayer, address existingStakingAssetAddress) internal view {
        assertEq(Ownable(gse).owner(), governance, "invalid gse owner");
        assertEq(address(GSE(gse).getGovernance()), governance, "invalid gse governance");
        assertEq(Ownable(registry).owner(), governance, "invalid registry owner");
        assertEq(
            address(RewardDistributor(rewardDistributor).REGISTRY()),
            registry,
            "invalid reward distributor registry"
        );
        assertEq(Ownable(dateGatedRelayer).owner(), governance, "invalid date gated relayer owner");

        if (existingStakingAssetAddress == address(0)) {
            assertEq(Ownable(feeAsset).owner(), coinIssuer, "invalid fee asset owner");
            assertEq(Ownable(coinIssuer).owner(), dateGatedRelayer, "invalid coin issuer owner"); // Match TypeScript: ownership to DateGatedRelayer
        }
    }

    function addValidators(
        address rollup,
        address stakingAsset,
        CheatDepositArgs[] memory validators
    ) internal {
        if (validators.length == 0) {
            console.log("--- No validators to add ---");
            return;
        }

        // Deploy MultiAdder helper contract
        // MultiAdder needs: constructor(address _staking, address _owner)
        address multiAdder = address(new MultiAdder(rollup, deployer));
        console.log("--- MultiAdder deployed ---");
        console.log("  address:", multiAdder);

        // Mint staking tokens to MultiAdder
        uint256 activationThreshold = Rollup(rollup).getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * validators.length;

        console.log("--- Transaction: StakingAsset.mint (validator staking) ---");
        console.log("  to:", stakingAsset);
        console.log("  recipient:", multiAdder);
        console.log("  amount:", stakeNeeded);
        TestERC20(stakingAsset).mint(multiAdder, stakeNeeded);

        // Add validators in chunks (limited by stack depth and tx size)
        uint256 chunkSize = 16;
        console.log("--- Adding validators ---");
        console.log("  total validators:", validators.length);

        for (uint256 i = 0; i < validators.length; i += chunkSize) {
            uint256 end = i + chunkSize > validators.length ? validators.length : i + chunkSize;
            uint256 chunkLen = end - i;

            // Create chunk array
            CheatDepositArgs[] memory chunk = new CheatDepositArgs[](chunkLen);
            for (uint256 j = 0; j < chunkLen; j++) {
                chunk[j] = validators[i + j];
            }

            console.log("--- Transaction: MultiAdder.addValidators ---");
            console.log("  to:", multiAdder);
            console.log("  validators in chunk:", chunkLen);

            // Call MultiAdder.addValidators (doesn't flush yet, flush happens separately)
            MultiAdder(multiAdder).addValidators(chunk, 0);
        }

        // Flush validators from queue to active set
        console.log("--- Flushing validators from entry queue ---");
        uint256 flushChunkSize = 16;
        while (true) {
            uint256 queueLength = Rollup(rollup).getEntryQueueLength();
            if (queueLength == 0) {
                break;
            }

            uint256 availableFlushes = Rollup(rollup).getAvailableValidatorFlushes();
            if (availableFlushes == 0) {
                break;
            }

            Rollup(rollup).flushEntryQueue(flushChunkSize);
        }
        console.log("--- Validator initialization complete ---");
    }

    // Load initial validators from JSON config
    // Validators are passed with privateKey and publicKeyInG2 (G2 computed in TypeScript since no EVM precompile)
    // This function derives publicKeyInG1 and proofOfPossession from the privateKey
    // JSON format:
    // {
    //   "initialValidators": [
    //     {
    //       "attester": "0x...",
    //       "withdrawer": "0x...",
    //       "privateKey": "12345...",
    //       "publicKeyInG2": { "x0": "...", "x1": "...", "y0": "...", "y1": "..." }
    //     }
    //   ]
    // }
    function loadInitialValidators() internal view returns (CheatDepositArgs[] memory) {
        // Check if initialValidators array exists in config
        if (!vm.keyExistsJson(configJson, ".initialValidators")) {
            return new CheatDepositArgs[](0);
        }

        // Count array elements by checking if each index exists
        uint256 validatorCount = 0;
        while (true) {
            string memory testPath = string.concat(".initialValidators[", vm.toString(validatorCount), "]");
            if (!vm.keyExistsJson(configJson, testPath)) {
                break;
            }
            validatorCount++;
        }

        if (validatorCount == 0) {
            return new CheatDepositArgs[](0);
        }

        console.log("--- Loading initial validators from config ---");
        console.log("  validator count:", validatorCount);

        CheatDepositArgs[] memory validators = new CheatDepositArgs[](validatorCount);

        for (uint256 i = 0; i < validatorCount; i++) {
            string memory basePath = string.concat(".initialValidators[", vm.toString(i), "]");

            // Parse individual fields from JSON
            address attester = vm.parseJsonAddress(configJson, string.concat(basePath, ".attester"));
            address withdrawer = vm.parseJsonAddress(configJson, string.concat(basePath, ".withdrawer"));
            uint256 privateKey = vm.parseJsonUint(configJson, string.concat(basePath, ".privateKey"));

            // Parse G2 point fields
            G2Point memory publicKeyInG2 = G2Point({
                x0: vm.parseJsonUint(configJson, string.concat(basePath, ".publicKeyInG2.x0")),
                x1: vm.parseJsonUint(configJson, string.concat(basePath, ".publicKeyInG2.x1")),
                y0: vm.parseJsonUint(configJson, string.concat(basePath, ".publicKeyInG2.y0")),
                y1: vm.parseJsonUint(configJson, string.concat(basePath, ".publicKeyInG2.y1"))
            });

            // Derive G1 public key: pk1 = privateKey * G1
            G1Point memory publicKeyInG1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), privateKey);

            // Derive proof of possession: sigma = privateKey * hashToPoint(domain, pk1)
            G1Point memory digestPoint = BN254Lib.g1ToDigestPoint(publicKeyInG1);
            G1Point memory proofOfPossession = BN254Lib.g1Mul(digestPoint, privateKey);

            validators[i] = CheatDepositArgs({
                attester: attester,
                withdrawer: withdrawer,
                publicKeyInG1: publicKeyInG1,
                publicKeyInG2: publicKeyInG2,
                proofOfPossession: proofOfPossession
            });

            console.log("  validator", i, "attester:", validators[i].attester);
        }

        return validators;
    }

    // ============ Configuration Loading Functions ============

    function loadDeploymentOptions() internal {
        address existingAsset = _readAddress(".deployment.existingStakingAssetAddress", address(0));
        bool deployingNewAsset = existingAsset == address(0);

        config.deploymentOptions = DeploymentOptions({
            useMockVerifier: _readBool(".deployment.useMockVerifier", true),
            fundRewardDistributor: _readBool(".deployment.fundRewardDistributor", true),
            existingStakingAssetAddress: existingAsset,
            deployFeeAssetHandler: _readBool(".deployment.deployFeeAssetHandler", deployingNewAsset),
            deployStakingAssetHandler: _readBool(".deployment.deployStakingAssetHandler", deployingNewAsset)
        });
    }

    function loadCoinIssuerConfig() internal {
        config.coinIssuerConfig = CoinIssuerConfiguration({
            coinIssuerRate: 0.2e18
        });
    }

    function loadGseConfig() internal {
        // Match TypeScript DefaultL1ContractsConfig (config.ts lines 85-86)
        config.gseConfig = GseConfiguration({
            activationThreshold: _readUint(".gse.activationThreshold", 100e18),  // Match TS: 100e18
            ejectionThreshold: _readUint(".gse.ejectionThreshold", 50e18)        // Match TS: 50e18
        });
    }

    function loadGovernanceProposerConfig() internal {
        // Match TypeScript DefaultL1ContractsConfig (config.ts line 95)
        uint256 roundSize = _readUint(".governance.proposerRoundSize", 300);  // Match TS: 300, not 10!
        uint256 defaultQuorum = roundSize / 2 + 1;

        config.governanceProposerConfig = GovernanceProposerConfiguration({
            quorum: _readUint(".governance.proposerQuorum", defaultQuorum),
            roundSize: roundSize
        });
    }

    function loadGovernanceConfig() internal {
        // Get network-specific defaults, then allow JSON config to override
        (
            uint256 lockDelay,
            uint256 lockAmount,
            uint256 votingDelay,
            uint256 votingDuration,
            uint256 executionDelay,
            uint256 gracePeriod,
            uint256 quorum,
            uint256 requiredYeaMargin,
            uint256 minimumVotes
        ) = _getGovernanceConfigDefaults();

        config.governanceConfig = GovernanceConfiguration({
            proposeConfig: ProposeWithLockConfiguration({
                lockDelay: Timestamp.wrap(_readUint(".governance.proposeLockDelay", lockDelay)),
                lockAmount: _readUint(".governance.proposeLockAmount", lockAmount)
            }),
            votingDelay: Timestamp.wrap(_readUint(".governance.votingDelay", votingDelay)),
            votingDuration: Timestamp.wrap(_readUint(".governance.votingDuration", votingDuration)),
            executionDelay: Timestamp.wrap(_readUint(".governance.executionDelay", executionDelay)),
            gracePeriod: Timestamp.wrap(_readUint(".governance.gracePeriod", gracePeriod)),
            quorum: _readUint(".governance.quorum", quorum),
            requiredYeaMargin: _readUint(".governance.requiredYeaMargin", requiredYeaMargin),
            minimumVotes: _readUint(".governance.minimumVotes", minimumVotes)
        });
    }

    function loadGenesisConfig() internal {
        config.genesisConfig = GenesisConfiguration({
            vkTreeRoot: bytes32(_readUint(".genesis.vkTreeRoot", 0)),
            protocolContractsHash: bytes32(_readUint(".genesis.protocolContractsHash", 0)),
            genesisArchiveRoot: bytes32(_readUint(".genesis.genesisArchiveRoot", 0))
        });
    }

    function loadZkPassportConfig() internal {
        config.zkPassportConfig = ZkPassportConfiguration({
            domain: _readString(".zkPassport.domain", "sequencer.alpha-testnet.aztec.network"),
            scope: _readString(".zkPassport.scope", "personhood")
        });
    }

    function loadTimingConfig() internal {
        config.timingConfig = RollupTimingConfiguration({
            aztecSlotDuration: _readUint(".timing.aztecSlotDuration", 36),
            aztecEpochDuration: _readUint(".timing.aztecEpochDuration", 32),
            targetCommitteeSize: _readUint(".timing.targetCommitteeSize", 48)
        });
    }

    function loadValidatorSetConfig() internal {
        config.validatorSetConfig = ValidatorSetConfiguration({
            lagInEpochsForValidatorSet: _readUint(".validatorSet.lagInEpochsForValidatorSet", 2),
            lagInEpochsForRandao: _readUint(".validatorSet.lagInEpochsForRandao", 2),
            aztecProofSubmissionEpochs: _readUint(".validatorSet.aztecProofSubmissionEpochs", 1)
        });
    }

    function loadSlashingConfig() internal {
        SlasherFlavor flavor = _parseSlasherFlavor(_readString(".slashing.flavor", "tally"));
        uint256 roundSizeInEpochs = _readUint(".slashing.roundSizeInEpochs", 4);
        uint256 defaultRoundSize = roundSizeInEpochs * config.timingConfig.aztecEpochDuration;
        uint256 roundSize = _readUint(".slashing.roundSize", defaultRoundSize);
        uint256 defaultQuorum = roundSize / 2 + 1;
        uint256 defaultOffset = flavor == SlasherFlavor.TALLY ? 2 : 0;

        config.slashingConfig = SlashingConfiguration({
            flavor: flavor,
            roundSize: roundSize,
            quorum: _readUint(".slashing.quorum", defaultQuorum),
            lifetimeInRounds: _readUint(".slashing.lifetimeInRounds", 5),
            executionDelayInRounds: _readUint(".slashing.executionDelayInRounds", 0),
            offsetInRounds: _readUint(".slashing.offsetInRounds", defaultOffset),
            disableDuration: _readUint(".slashing.disableDuration", 5 days),
            vetoer: _readAddress(".slashing.vetoer", address(0)),
            slashAmounts: [
                _readUint(".slashing.amountSmall", 10e18),
                _readUint(".slashing.amountMedium", 20e18),
                _readUint(".slashing.amountLarge", 50e18)
            ]
        });
    }

    function loadFeeConfig() internal {
        config.feeConfig = FeeConfiguration({
            manaTarget: _readUint(".fee.manaTarget", 100_000_000),
            exitDelaySeconds: _readUint(".fee.exitDelaySeconds", 2 days),
            provingCostPerMana: _readUint(".fee.provingCostPerMana", 100),
            localEjectionThreshold: _readUint(".fee.localEjectionThreshold", 98e18)
        });
    }

    function loadRewardConfig() internal {
        (uint16 sequencerBps, uint96 checkpointReward) = _getRewardConfigDefaults();
        config.rewardConfig = RewardConfiguration({
            sequencerBps: _readUint(".reward.sequencerBps", sequencerBps),
            checkpointReward: _readUint(".reward.checkpointReward", checkpointReward)
        });
    }

    function loadStakingQueueConfig() internal {
        (uint64 bootstrapValidatorSetSize, uint64 bootstrapFlushSize, uint64 normalFlushSizeMin, uint64 normalFlushSizeQuotient, uint64 maxQueueFlushSize) = _getEntryQueueConfigDefaults();
        config.stakingQueueConfig = StakingQueueConfiguration({
            bootstrapValidatorSetSize: _readUint(".stakingQueue.bootstrapValidatorSetSize", bootstrapValidatorSetSize),
            bootstrapFlushSize: _readUint(".stakingQueue.bootstrapFlushSize", bootstrapFlushSize),
            normalFlushSizeMin: _readUint(".stakingQueue.normalFlushSizeMin", normalFlushSizeMin),
            normalFlushSizeQuotient: _readUint(".stakingQueue.normalFlushSizeQuotient", normalFlushSizeQuotient),
            maxQueueFlushSize: _readUint(".stakingQueue.maxQueueFlushSize", maxQueueFlushSize)
        });
    }

    function loadRewardDistributorFunding() internal {
        // Funding calculation from deploy_l1_contracts.ts:493
        // const funding = checkpointReward * 200000n;
        uint256 defaultFunding = config.rewardConfig.checkpointReward * 200_000;
        config.rewardDistributorFunding = _readUint(".deployment.rewardDistributorFunding", defaultFunding);
    }

    function buildRollupConfiguration(IRewardDistributor rewardDistributor) internal view returns (RollupConfigInput memory rollupConfig) {
        rollupConfig.aztecSlotDuration = config.timingConfig.aztecSlotDuration;
        rollupConfig.aztecEpochDuration = config.timingConfig.aztecEpochDuration;
        rollupConfig.targetCommitteeSize = config.timingConfig.targetCommitteeSize;

        rollupConfig.lagInEpochsForValidatorSet = config.validatorSetConfig.lagInEpochsForValidatorSet;
        rollupConfig.lagInEpochsForRandao = config.validatorSetConfig.lagInEpochsForRandao;
        rollupConfig.aztecProofSubmissionEpochs = config.validatorSetConfig.aztecProofSubmissionEpochs;

        rollupConfig.slasherFlavor = config.slashingConfig.flavor;
        rollupConfig.slashingRoundSize = config.slashingConfig.roundSize;
        rollupConfig.slashingQuorum = config.slashingConfig.quorum;
        rollupConfig.slashingLifetimeInRounds = config.slashingConfig.lifetimeInRounds;
        rollupConfig.slashingExecutionDelayInRounds = config.slashingConfig.executionDelayInRounds;
        rollupConfig.slashingOffsetInRounds = config.slashingConfig.offsetInRounds;
        rollupConfig.slashingDisableDuration = config.slashingConfig.disableDuration;
        rollupConfig.slashingVetoer = config.slashingConfig.vetoer;
        rollupConfig.slashAmounts = config.slashingConfig.slashAmounts;

        rollupConfig.manaTarget = config.feeConfig.manaTarget;
        rollupConfig.exitDelaySeconds = config.feeConfig.exitDelaySeconds;
        rollupConfig.provingCostPerMana = EthValue.wrap(config.feeConfig.provingCostPerMana);
        rollupConfig.localEjectionThreshold = config.feeConfig.localEjectionThreshold;

        rollupConfig.version = 0;
        rollupConfig.rewardConfig = _buildRewardConfig(rewardDistributor);
        rollupConfig.rewardBoostConfig = _buildRewardBoostConfig();
        rollupConfig.stakingQueueConfig = _buildStakingQueueConfig();
        rollupConfig.earliestRewardsClaimableTimestamp = Timestamp.wrap(config.earliestRewardsClaimableTimestamp);
    }

    function _buildRewardConfig(IRewardDistributor rewardDistributor) private view returns (RewardConfig memory) {
        return RewardConfig({
            rewardDistributor: rewardDistributor,
            sequencerBps: Bps.wrap(uint16(config.rewardConfig.sequencerBps)),
            booster: IBoosterCore(address(0)),
            checkpointReward: uint96(config.rewardConfig.checkpointReward)
        });
    }

    function _buildRewardBoostConfig() private pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
    }

    function _buildStakingQueueConfig() private view returns (StakingQueueConfig memory) {
        return StakingQueueConfig({
            bootstrapValidatorSetSize: uint64(config.stakingQueueConfig.bootstrapValidatorSetSize),
            bootstrapFlushSize: uint64(config.stakingQueueConfig.bootstrapFlushSize),
            normalFlushSizeMin: uint64(config.stakingQueueConfig.normalFlushSizeMin),
            normalFlushSizeQuotient: uint64(config.stakingQueueConfig.normalFlushSizeQuotient),
            maxQueueFlushSize: uint64(config.stakingQueueConfig.maxQueueFlushSize)
        });
    }

    // ============ Network-Specific Config Helpers ============

    function _getEntryQueueConfigDefaults() private view returns (uint64, uint64, uint64, uint64, uint64) {
        bytes32 networkHash = keccak256(bytes(config.networkName));

        // local, devnet, next-net: LocalEntryQueueConfig
        if (networkHash == keccak256(bytes("local")) ||
            networkHash == keccak256(bytes("devnet")) ||
            networkHash == keccak256(bytes("next-net"))) {
            return (0, 0, 48, 2, 48);
        }

        // staging-public: StagingPublicEntryQueueConfig
        if (networkHash == keccak256(bytes("staging-public"))) {
            return (48, 48, 1, 2475, 32);
        }

        // testnet: TestnetEntryQueueConfig
        if (networkHash == keccak256(bytes("testnet"))) {
            return (256, 256, 4, 2048, 8);
        }

        // staging-ignition: StagingIgnitionEntryQueueConfig
        if (networkHash == keccak256(bytes("staging-ignition"))) {
            return (48, 48, 1, 2048, 24);
        }

        // mainnet: MainnetEntryQueueConfig
        if (networkHash == keccak256(bytes("mainnet"))) {
            return (1000, 1000, 1, 2048, 8);
        }

        // Default to local config
        return (0, 0, 48, 2, 48);
    }

    function _getRewardConfigDefaults() private view returns (uint16 sequencerBps, uint96 checkpointReward) {
        bytes32 networkHash = keccak256(bytes(config.networkName));

        // mainnet: MainnetRewardConfig
        if (networkHash == keccak256(bytes("mainnet"))) {
            return (7000, 400e18);
        }

        // All others: DefaultRewardConfig
        return (8000, 500e18);
    }

    function _getGovernanceConfigDefaults() private view returns (
        uint256 lockDelay,
        uint256 lockAmount,
        uint256 votingDelay,
        uint256 votingDuration,
        uint256 executionDelay,
        uint256 gracePeriod,
        uint256 quorum,
        uint256 requiredYeaMargin,
        uint256 minimumVotes
    ) {
        bytes32 networkHash = keccak256(bytes(config.networkName));

        // local, next-net, devnet: LocalGovernanceConfiguration
        if (networkHash == keccak256(bytes("local")) ||
            networkHash == keccak256(bytes("next-net")) ||
            networkHash == keccak256(bytes("devnet"))) {
            return (
                60 * 60 * 24 * 30,  // lockDelay
                1e24,               // lockAmount
                60,                 // votingDelay
                60 * 60,            // votingDuration
                60,                 // executionDelay
                60 * 60 * 24 * 7,   // gracePeriod
                0.1e18,             // quorum (10%)
                0.04e18,            // requiredYeaMargin (4%)
                400e18              // minimumVotes
            );
        }

        // staging-public: StagingPublicGovernanceConfiguration
        if (networkHash == keccak256(bytes("staging-public"))) {
            return (
                60 * 60 * 24 * 30,  // lockDelay
                100e18 * 100,       // lockAmount (activationThreshold * 100)
                60,                 // votingDelay
                60 * 60,            // votingDuration
                60,                 // executionDelay
                60 * 60 * 24 * 7,   // gracePeriod
                0.3e18,             // quorum (30%)
                0.04e18,            // requiredYeaMargin (4%)
                50_000e18 * 200     // minimumVotes (ejectionThreshold * 200)
            );
        }

        // testnet: TestnetGovernanceConfiguration
        if (networkHash == keccak256(bytes("testnet"))) {
            return (
                10 * 365 * 24 * 60 * 60,  // lockDelay
                1250 * 200_000e18,        // lockAmount
                12 * 60 * 60,             // votingDelay (12 hours)
                1 * 24 * 60 * 60,         // votingDuration (1 day)
                12 * 60 * 60,             // executionDelay (12 hours)
                1 * 24 * 60 * 60,         // gracePeriod (1 day)
                0.2e18,                   // quorum (20%)
                0.1e18,                   // requiredYeaMargin (10%)
                100 * 200_000e18          // minimumVotes
            );
        }

        // staging-ignition: StagingIgnitionGovernanceConfiguration
        if (networkHash == keccak256(bytes("staging-ignition"))) {
            return (
                10 * 365 * 24 * 60 * 60,  // lockDelay
                1250 * 200_000e18,        // lockAmount
                7 * 24 * 60 * 60,         // votingDelay
                7 * 24 * 60 * 60,         // votingDuration
                30 * 24 * 60 * 60,        // executionDelay
                7 * 24 * 60 * 60,         // gracePeriod
                0.2e18,                   // quorum (20%)
                0.1e18,                   // requiredYeaMargin (10%)
                1250 * 200_000e18         // minimumVotes
            );
        }

        // mainnet: MainnetGovernanceConfiguration
        if (networkHash == keccak256(bytes("mainnet"))) {
            return (
                90 * 24 * 60 * 60,        // lockDelay
                258_750_000e18,           // lockAmount
                3 * 24 * 60 * 60,         // votingDelay
                7 * 24 * 60 * 60,         // votingDuration
                7 * 24 * 60 * 60,         // executionDelay
                7 * 24 * 60 * 60,         // gracePeriod
                0.2e18,                   // quorum (20%)
                0.33e18,                  // requiredYeaMargin (33%)
                1000 * 200_000e18         // minimumVotes
            );
        }

        // Default to local config
        return (
            60 * 60 * 24 * 30,  // lockDelay
            1e24,               // lockAmount
            60,                 // votingDelay
            60 * 60,            // votingDuration
            60,                 // executionDelay
            60 * 60 * 24 * 7,   // gracePeriod
            0.1e18,             // quorum (10%)
            0.04e18,            // requiredYeaMargin (4%)
            400e18              // minimumVotes
        );
    }

    // ============ JSON Parsing Helpers ============

    function _readUint(string memory path, uint256 defaultValue) private view returns (uint256) {
        if (bytes(configJson).length == 0) return defaultValue;
        try vm.parseJsonUint(configJson, path) returns (uint256 value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _readBool(string memory path, bool defaultValue) private view returns (bool) {
        if (bytes(configJson).length == 0) return defaultValue;
        try vm.parseJsonBool(configJson, path) returns (bool value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _readAddress(string memory path, address defaultValue) private view returns (address) {
        if (bytes(configJson).length == 0) return defaultValue;
        try vm.parseJsonAddress(configJson, path) returns (address value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _readString(string memory path, string memory defaultValue) private view returns (string memory) {
        if (bytes(configJson).length == 0) return defaultValue;
        try vm.parseJsonString(configJson, path) returns (string memory value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _parseSlasherFlavor(string memory flavor) private pure returns (SlasherFlavor) {
        if (keccak256(bytes(flavor)) == keccak256(bytes("empire"))) return SlasherFlavor.EMPIRE;
        if (keccak256(bytes(flavor)) == keccak256(bytes("tally"))) return SlasherFlavor.TALLY;
        return SlasherFlavor.NONE;
    }
}
