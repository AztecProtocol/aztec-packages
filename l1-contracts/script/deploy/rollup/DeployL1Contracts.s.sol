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

    address public deployer;
    string internal configJson;
    string internal networkName;

    // Configuration objects
    DeploymentOptions internal deployOpts;
    CoinIssuerConfiguration internal coinIssuerConfig;
    GseConfiguration internal gseConfig;
    GovernanceProposerConfiguration internal govProposerConfig;
    GovernanceConfiguration internal governanceConfig;
    GenesisConfiguration internal genesisConfig;
    ZkPassportConfiguration internal zkPassportConfig;
    uint256 internal rewardDistributorFunding;

    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    function run(string memory _configJson) public {
        configJson = _configJson;
        // Read networkName from config, default to "local"
        // Valid values: local, devnet, next-net, staging-public, testnet, staging-ignition, mainnet
        networkName = _readString(".deployment.networkName", "local");
        loadDeploymentOptions();
        loadCoinIssuerConfig();
        loadGseConfig();
        loadGovernanceProposerConfig();
        loadGovernanceConfig();
        loadGenesisConfig();
        loadZkPassportConfig();
        loadRewardDistributorFunding();

        vm.startBroadcast(deployer);
        deployAztecContracts();
        vm.stopBroadcast();
    }

    function run() public {
        run("");
    }

    function deployAztecContracts() public {
        console.log("=== Deploying Aztec L1 Contracts ===");
        console.log("Deployer:", deployer);

        (address feeAsset, address stakingAsset) = maybeDeployAssets(deployOpts.existingStakingAssetAddress);
        console.log("FeeAsset:", feeAsset);
        console.log("StakingAsset:", stakingAsset);

        address coinIssuer = deployCoinIssuer(feeAsset, coinIssuerConfig.coinIssuerRate);
        console.log("CoinIssuer:", coinIssuer);

        address feeAssetHandler = maybeDeployFeeAssetHandler(feeAsset, deployOpts.deployFeeAssetHandler);
        if (feeAssetHandler != address(0)) {
            console.log("FeeAssetHandler:", feeAssetHandler);
        }

        (address gse, address registry, address rewardDistributor) = deployGovernanceInfrastructure(feeAsset, stakingAsset);
        (address governance) = deployGovernanceContracts(stakingAsset, registry, gse);

        deployRollupAndSetup(feeAsset, stakingAsset, feeAssetHandler, gse, registry, rewardDistributor, coinIssuer, governance);
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
        address rollup = deployRollupInfrastructure(feeAsset, stakingAsset, gse, governance, rewardDistributor);

        address dateGatedRelayer = deployDateGatedRelayer(governance);
        console.log("DateGatedRelayer:", dateGatedRelayer);

        (address mockZKPassportVerifier, address stakingAssetHandler) = maybeDeployStakingAssetHandler(stakingAsset, registry, deployOpts.deployStakingAssetHandler, zkPassportConfig.domain, zkPassportConfig.scope);
        if (stakingAssetHandler != address(0)) {
            console.log("MockZKPassportVerifier:", mockZKPassportVerifier);
            console.log("StakingAssetHandler:", stakingAssetHandler);
        }

        // Setup and finalize
        wireContracts(feeAsset, stakingAsset, feeAssetHandler, stakingAssetHandler, gse, governance, deployOpts.existingStakingAssetAddress);
        registerRollup(registry, gse, rollup);
        maybeFundRewardDistributor(feeAsset, rewardDistributor, deployOpts.fundRewardDistributor, deployOpts.existingStakingAssetAddress, rewardDistributorFunding);
        handoverToGovernance(feeAsset, registry, gse, coinIssuer, governance, dateGatedRelayer, deployOpts.existingStakingAssetAddress);
        assertAccessControl(feeAsset, gse, registry, rewardDistributor, coinIssuer, governance, dateGatedRelayer, deployOpts.existingStakingAssetAddress);
    }

    function deployAssetInfrastructure(address feeAsset) internal returns (address coinIssuer, address feeAssetHandler) {
        coinIssuer = deployCoinIssuer(feeAsset, coinIssuerConfig.coinIssuerRate);
        console.log("CoinIssuer:", coinIssuer);

        feeAssetHandler = maybeDeployFeeAssetHandler(feeAsset, deployOpts.deployFeeAssetHandler);
        if (feeAssetHandler != address(0)) {
            console.log("FeeAssetHandler:", feeAssetHandler);
        }

        return (coinIssuer, feeAssetHandler);
    }

    function deployGovernanceInfrastructure(address feeAsset, address stakingAsset) internal returns (address gse, address registry, address rewardDistributor) {
        gse = deployGSE(stakingAsset, gseConfig.activationThreshold, gseConfig.ejectionThreshold);
        console.log("GSE:", gse);

        (registry, rewardDistributor) = deployRegistry(feeAsset);
        console.log("Registry:", registry);
        console.log("RewardDistributor:", rewardDistributor);

        return (gse, registry, rewardDistributor);
    }

    function deployGovernanceContracts(address stakingAsset, address registry, address gse) internal returns (address governance) {
        address governanceProposer = deployGovernanceProposer(registry, gse, govProposerConfig.quorum, govProposerConfig.roundSize);
        console.log("GovernanceProposer:", governanceProposer);

        governance = deployGovernance(stakingAsset, governanceProposer, gse, governanceConfig);
        console.log("Governance:", governance);

        return (governance);
    }

    function deployRollupInfrastructure(address feeAsset, address stakingAsset, address gse, address governance, address rewardDistributor) internal returns (address rollup) {
        address verifier = deployVerifier(deployOpts.useMockVerifier);
        console.log("Verifier:", verifier);

        rollup = deployRollup(feeAsset, stakingAsset, gse, verifier, governance, rewardDistributor);
        console.log("Rollup:", rollup);

        address slashFactory = deploySlashFactory(rollup);
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

    function deployGovernance(address stakingAsset, address govProposer, address gse, GovernanceConfiguration memory config) internal returns (address) {
        console.log("--- Governance constructor args ---");
        console.log("  stakingAsset:", stakingAsset);
        console.log("  govProposer:", govProposer);
        console.log("  gse:", gse);
        console.log("  config.proposeConfig.lockDelay:", Timestamp.unwrap(config.proposeConfig.lockDelay));
        console.log("  config.proposeConfig.lockAmount:", config.proposeConfig.lockAmount);
        console.log("  config.votingDelay:", Timestamp.unwrap(config.votingDelay));
        console.log("  config.votingDuration:", Timestamp.unwrap(config.votingDuration));
        console.log("  config.executionDelay:", Timestamp.unwrap(config.executionDelay));
        console.log("  config.gracePeriod:", Timestamp.unwrap(config.gracePeriod));
        console.log("  config.quorum:", config.quorum);
        console.log("  config.requiredYeaMargin:", config.requiredYeaMargin);
        console.log("  config.minimumVotes:", config.minimumVotes);
        return address(new Governance(
            IERC20(stakingAsset), govProposer, gse, config
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
            vkTreeRoot: genesisConfig.vkTreeRoot,
            protocolContractsHash: genesisConfig.protocolContractsHash,
            genesisArchiveRoot: genesisConfig.genesisArchiveRoot
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

    // ============ Configuration Loading Functions ============

    function loadDeploymentOptions() internal {
        address existingAsset = _readAddress(".deployment.existingStakingAssetAddress", address(0));
        bool deployingNewAsset = existingAsset == address(0);

        deployOpts = DeploymentOptions({
            useMockVerifier: _readBool(".deployment.useMockVerifier", true),
            fundRewardDistributor: _readBool(".deployment.fundRewardDistributor", true),
            existingStakingAssetAddress: existingAsset,
            deployFeeAssetHandler: _readBool(".deployment.deployFeeAssetHandler", deployingNewAsset),
            deployStakingAssetHandler: _readBool(".deployment.deployStakingAssetHandler", deployingNewAsset)
        });
    }

    function loadCoinIssuerConfig() internal {
        coinIssuerConfig = CoinIssuerConfiguration({
            coinIssuerRate: 0.2e18
        });
    }

    function loadGseConfig() internal {
        // Match TypeScript DefaultL1ContractsConfig (config.ts lines 85-86)
        gseConfig = GseConfiguration({
            activationThreshold: _readUint(".gse.activationThreshold", 100e18),  // Match TS: 100e18
            ejectionThreshold: _readUint(".gse.ejectionThreshold", 50e18)        // Match TS: 50e18
        });
    }

    function loadGovernanceProposerConfig() internal {
        // Match TypeScript DefaultL1ContractsConfig (config.ts line 95)
        uint256 roundSize = _readUint(".governance.proposerRoundSize", 300);  // Match TS: 300, not 10!
        uint256 defaultQuorum = roundSize / 2 + 1;

        govProposerConfig = GovernanceProposerConfiguration({
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

        governanceConfig = GovernanceConfiguration({
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
        genesisConfig = GenesisConfiguration({
            vkTreeRoot: bytes32(_readUint(".genesis.vkTreeRoot", 0)),
            protocolContractsHash: bytes32(_readUint(".genesis.protocolContractsHash", 0)),
            genesisArchiveRoot: bytes32(_readUint(".genesis.genesisArchiveRoot", 0))
        });
    }

    function loadZkPassportConfig() internal {
        zkPassportConfig = ZkPassportConfiguration({
            domain: _readString(".zkPassport.domain", "sequencer.alpha-testnet.aztec.network"),
            scope: _readString(".zkPassport.scope", "personhood")
        });
    }

    function loadRewardDistributorFunding() internal {
        // Funding calculation from deploy_l1_contracts.ts:493
        // const funding = checkpointReward * 200000n;
        (,uint96 checkpointReward) = _getRewardConfigDefaults();
        uint256 defaultFunding = uint256(checkpointReward) * 200_000;
        rewardDistributorFunding = _readUint(".deployment.rewardDistributorFunding", defaultFunding);
    }

    function buildRollupConfiguration(IRewardDistributor rewardDistributor) internal view returns (RollupConfigInput memory config) {
        // Match TypeScript DefaultL1ContractsConfig (config.ts lines 77-102)
        config.aztecSlotDuration = _readUint(".timing.aztecSlotDuration", 36);
        config.aztecEpochDuration = _readUint(".timing.aztecEpochDuration", 32);
        config.targetCommitteeSize = _readUint(".timing.targetCommitteeSize", 48);  // Match TS DefaultL1ContractsConfig

        config.lagInEpochsForValidatorSet = _readUint(".validatorSet.lagInEpochsForValidatorSet", 2);  // Match TS: 2, not 3
        config.lagInEpochsForRandao = _readUint(".validatorSet.lagInEpochsForRandao", 2);
        config.aztecProofSubmissionEpochs = _readUint(".validatorSet.aztecProofSubmissionEpochs", 1);  // Match TS: 1, not 2

        config.slasherFlavor = _parseSlasherFlavor(_readString(".slashing.flavor", "tally"));  // Match TS: 'tally', not 'none'

        uint256 roundSizeInEpochs = _readUint(".slashing.roundSizeInEpochs", 4);
        uint256 defaultRoundSize = roundSizeInEpochs * config.aztecEpochDuration;
        config.slashingRoundSize = _readUint(".slashing.roundSize", defaultRoundSize);

        uint256 defaultQuorum = config.slashingRoundSize / 2 + 1;
        config.slashingQuorum = _readUint(".slashing.quorum", defaultQuorum);

        config.slashingLifetimeInRounds = _readUint(".slashing.lifetimeInRounds", 5);
        config.slashingExecutionDelayInRounds = _readUint(".slashing.executionDelayInRounds", 0);

        // Match TS: slashingOffsetInRounds = 2 (config.ts line 100)
        uint256 defaultOffset = config.slasherFlavor == SlasherFlavor.TALLY ? 2 : 0;
        config.slashingOffsetInRounds = _readUint(".slashing.offsetInRounds", defaultOffset);

        config.slashingDisableDuration = _readUint(".slashing.disableDuration", 5 days);
        config.slashingVetoer = _readAddress(".slashing.vetoer", address(0));

        // Match TS DefaultL1ContractsConfig (config.ts lines 88-90)
        config.slashAmounts = [
            _readUint(".slashing.amountSmall", 10e18),    // Match TS: 10e18
            _readUint(".slashing.amountMedium", 20e18),   // Match TS: 20e18
            _readUint(".slashing.amountLarge", 50e18)     // Match TS: 50e18
        ];

        config.manaTarget = _readUint(".fee.manaTarget", 100_000_000);  // Match TS: BigInt(100e6)
        config.exitDelaySeconds = _readUint(".fee.exitDelaySeconds", 2 days);  // Match TS: 2 * 24 * 60 * 60
        config.provingCostPerMana = EthValue.wrap(_readUint(".fee.provingCostPerMana", 100));  // Match TS: BigInt(100)
        config.localEjectionThreshold = _readUint(".fee.localEjectionThreshold", 98e18);  // Match TS: 98e18

        config.version = 0;
        config.rewardConfig = _buildRewardConfig(rewardDistributor);
        config.rewardBoostConfig = _buildRewardBoostConfig();
        config.stakingQueueConfig = _buildStakingQueueConfig();
        config.earliestRewardsClaimableTimestamp = Timestamp.wrap(block.timestamp + 90 days);
    }

    function _buildRewardConfig(IRewardDistributor rewardDistributor) private view returns (RewardConfig memory) {
        // Get network-specific defaults, then allow JSON config to override
        (uint16 sequencerBps, uint96 checkpointReward) = _getRewardConfigDefaults();

        return RewardConfig({
            rewardDistributor: rewardDistributor,
            sequencerBps: Bps.wrap(uint16(_readUint(".reward.sequencerBps", sequencerBps))),
            booster: IBoosterCore(address(0)),
            checkpointReward: uint96(_readUint(".reward.checkpointReward", checkpointReward))
        });
    }

    function _buildRewardBoostConfig() private pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
    }

    function _buildStakingQueueConfig() private view returns (StakingQueueConfig memory) {
        // Get network-specific defaults, then allow JSON config to override
        (uint64 bootstrapValidatorSetSize, uint64 bootstrapFlushSize, uint64 normalFlushSizeMin, uint64 normalFlushSizeQuotient, uint64 maxQueueFlushSize) = _getEntryQueueConfigDefaults();

        return StakingQueueConfig({
            bootstrapValidatorSetSize: uint64(_readUint(".stakingQueue.bootstrapValidatorSetSize", bootstrapValidatorSetSize)),
            bootstrapFlushSize: uint64(_readUint(".stakingQueue.bootstrapFlushSize", bootstrapFlushSize)),
            normalFlushSizeMin: uint64(_readUint(".stakingQueue.normalFlushSizeMin", normalFlushSizeMin)),
            normalFlushSizeQuotient: uint64(_readUint(".stakingQueue.normalFlushSizeQuotient", normalFlushSizeQuotient)),
            maxQueueFlushSize: uint64(_readUint(".stakingQueue.maxQueueFlushSize", maxQueueFlushSize))
        });
    }

    // ============ Network-Specific Config Helpers ============

    function _getEntryQueueConfigDefaults() private view returns (uint64, uint64, uint64, uint64, uint64) {
        bytes32 networkHash = keccak256(bytes(networkName));

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
        bytes32 networkHash = keccak256(bytes(networkName));

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
        bytes32 networkHash = keccak256(bytes(networkName));

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
