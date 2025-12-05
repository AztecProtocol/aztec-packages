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
        if (existingStakingAssetAddress != address(0)) {
            return (existingStakingAssetAddress, existingStakingAssetAddress);
        }
        TestERC20 asset = new TestERC20("Fee Asset", "FEE", deployer);
        asset.mint(deployer, 1_000_000_000e18);
        return (address(asset), address(asset));
    }

    function deployCoinIssuer(address feeAsset, uint256 coinIssuerRate) internal returns (address) {
        return address(new CoinIssuer(IMintableERC20(feeAsset), coinIssuerRate, deployer));
    }

    function maybeDeployFeeAssetHandler(address feeAsset, bool shouldDeploy) internal returns (address) {
        if (!shouldDeploy) {
            return address(0);
        }
        return address(new FeeAssetHandler(deployer, feeAsset, 1000e18));
    }

    function deployGSE(address stakingAsset, uint256 activationThreshold, uint256 ejectionThreshold) internal returns (address) {
        return address(new GSE(deployer, IERC20(stakingAsset), activationThreshold, ejectionThreshold));
    }

    function deployRegistry(address feeAsset) internal returns (address registry, address rewardDistributor) {
        Registry reg = new Registry(deployer, IERC20(feeAsset));
        return (address(reg), address(reg.getRewardDistributor()));
    }

    function deployGovernanceProposer(address registry, address gse, uint256 quorum, uint256 roundSize) internal returns (address) {
        return address(new GovernanceProposer(
            Registry(registry), GSE(gse), quorum, roundSize
        ));
    }

    function deployGovernance(address stakingAsset, address govProposer, address gse, GovernanceConfiguration memory config) internal returns (address) {
        return address(new Governance(
            IERC20(stakingAsset), govProposer, gse, config
        ));
    }

    function deployVerifier(bool useMockVerifier) internal returns (address) {
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
        return address(new SlashFactory(Rollup(rollup)));
    }

    function deployDateGatedRelayer(address governance) internal returns (address) {
        return address(new DateGatedRelayer(governance, 1798761600));
    }

    function maybeDeployStakingAssetHandler(address stakingAsset, address registry, bool shouldDeploy, string memory zkPassportDomain, string memory zkPassportScope) internal returns (address mockVerifier, address handler) {
        if (!shouldDeploy) {
            return (address(0), address(0));
        }

        MockZKPassportVerifier zkVerifier = new MockZKPassportVerifier();

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
            TestERC20(feeAsset).addMinter(feeAssetHandler);
        }
        if (stakingAssetHandler != address(0) && existingStakingAssetAddress == address(0)) {
            TestERC20(stakingAsset).addMinter(stakingAssetHandler);
        }
        GSE(gse).setGovernance(Governance(governance));
    }

    function registerRollup(address registry, address gse, address rollup) internal {
        Registry(registry).addRollup(IHaveVersion(rollup));
        GSE(gse).addRollup(rollup);
    }

    function maybeFundRewardDistributor(address feeAsset, address rewardDistributor, bool shouldFund, address existingStakingAssetAddress, uint256 amount) internal {
        if (shouldFund && existingStakingAssetAddress == address(0)) {
            TestERC20(feeAsset).mint(rewardDistributor, amount);
        }
    }

    function handoverToGovernance(address feeAsset, address registry, address gse, address coinIssuer, address governance, address dateGatedRelayer, address existingStakingAssetAddress) internal {
        Registry(registry).transferOwnership(governance);
        GSE(gse).transferOwnership(governance);

        if (existingStakingAssetAddress == address(0)) {
            TestERC20(feeAsset).transferOwnership(coinIssuer);
            CoinIssuer(coinIssuer).acceptTokenOwnership();
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
            assertEq(Ownable(coinIssuer).owner(), dateGatedRelayer, "invalid coin issuer owner");
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
        gseConfig = GseConfiguration({
            activationThreshold: _readUint(".gse.activationThreshold", 100_000e18),
            ejectionThreshold: _readUint(".gse.ejectionThreshold", 50_000e18)
        });
    }

    function loadGovernanceProposerConfig() internal {
        uint256 roundSize = _readUint(".governance.proposerRoundSize", 10);
        uint256 defaultQuorum = roundSize / 2 + 1;

        govProposerConfig = GovernanceProposerConfiguration({
            quorum: _readUint(".governance.proposerQuorum", defaultQuorum),
            roundSize: roundSize
        });
    }

    function loadGovernanceConfig() internal {
        governanceConfig = GovernanceConfiguration({
            proposeConfig: ProposeWithLockConfiguration({
                lockDelay: Timestamp.wrap(_readUint(".governance.proposeLockDelay", 90 days)),
                lockAmount: _readUint(".governance.proposeLockAmount", 10_000_000e18)
            }),
            votingDelay: Timestamp.wrap(_readUint(".governance.votingDelay", 1 days)),
            votingDuration: Timestamp.wrap(_readUint(".governance.votingDuration", 7 days)),
            executionDelay: Timestamp.wrap(_readUint(".governance.executionDelay", 1 days)),
            gracePeriod: Timestamp.wrap(_readUint(".governance.gracePeriod", 7 days)),
            quorum: _readUint(".governance.quorum", 0.1e18),
            requiredYeaMargin: _readUint(".governance.requiredYeaMargin", 0.5e18),
            minimumVotes: _readUint(".governance.minimumVotes", 100_000e18)
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
        rewardDistributorFunding = _readUint(".deployment.rewardDistributorFunding", 50_000_000e18);
    }

    function buildRollupConfiguration(IRewardDistributor rewardDistributor) internal view returns (RollupConfigInput memory config) {
        config.aztecSlotDuration = _readUint(".timing.aztecSlotDuration", 36);
        config.aztecEpochDuration = _readUint(".timing.aztecEpochDuration", 32);
        config.targetCommitteeSize = _readUint(".timing.targetCommitteeSize", 0);

        config.lagInEpochsForValidatorSet = _readUint(".validatorSet.lagInEpochsForValidatorSet", 3);
        config.lagInEpochsForRandao = _readUint(".validatorSet.lagInEpochsForRandao", 2);
        config.aztecProofSubmissionEpochs = _readUint(".validatorSet.aztecProofSubmissionEpochs", 2);

        config.slasherFlavor = _parseSlasherFlavor(_readString(".slashing.flavor", "none"));

        uint256 roundSizeInEpochs = _readUint(".slashing.roundSizeInEpochs", 4);
        uint256 defaultRoundSize = roundSizeInEpochs * config.aztecEpochDuration;
        config.slashingRoundSize = _readUint(".slashing.roundSize", defaultRoundSize);

        uint256 defaultQuorum = config.slashingRoundSize / 2 + 1;
        config.slashingQuorum = _readUint(".slashing.quorum", defaultQuorum);

        config.slashingLifetimeInRounds = _readUint(".slashing.lifetimeInRounds", 5);
        config.slashingExecutionDelayInRounds = _readUint(".slashing.executionDelayInRounds", 0);

        uint256 defaultOffset = config.slasherFlavor == SlasherFlavor.TALLY ? 2 : 0;
        config.slashingOffsetInRounds = _readUint(".slashing.offsetInRounds", defaultOffset);

        config.slashingDisableDuration = _readUint(".slashing.disableDuration", 5 days);
        config.slashingVetoer = _readAddress(".slashing.vetoer", address(0));
        config.slashAmounts = [
            _readUint(".slashing.amountSmall", 10_000e18),
            _readUint(".slashing.amountMedium", 10_000e18),
            _readUint(".slashing.amountLarge", 10_000e18)
        ];

        config.manaTarget = _readUint(".fee.manaTarget", 100_000_000);
        config.exitDelaySeconds = _readUint(".fee.exitDelaySeconds", 4 days);
        config.provingCostPerMana = EthValue.wrap(_readUint(".fee.provingCostPerMana", 0));
        config.localEjectionThreshold = _readUint(".fee.localEjectionThreshold", 96_000e18);

        config.version = 0;
        config.rewardConfig = _buildRewardConfig(rewardDistributor);
        config.rewardBoostConfig = _buildRewardBoostConfig();
        config.stakingQueueConfig = _buildStakingQueueConfig();
        config.earliestRewardsClaimableTimestamp = Timestamp.wrap(block.timestamp + 90 days);
    }

    function _buildRewardConfig(IRewardDistributor rewardDistributor) private view returns (RewardConfig memory) {
        return RewardConfig({
            rewardDistributor: rewardDistributor,
            sequencerBps: Bps.wrap(uint16(_readUint(".reward.sequencerBps", 5000))),
            booster: IBoosterCore(address(0)),
            checkpointReward: uint96(_readUint(".reward.checkpointReward", 50e18))
        });
    }

    function _buildRewardBoostConfig() private pure returns (RewardBoostConfig memory) {
        return RewardBoostConfig({increment: 125_000, maxScore: 15_000_000, a: 1000, minimum: 100_000, k: 1_000_000});
    }

    function _buildStakingQueueConfig() private view returns (StakingQueueConfig memory) {
        return StakingQueueConfig({
            bootstrapValidatorSetSize: uint64(_readUint(".stakingQueue.bootstrapValidatorSetSize", 48)),
            bootstrapFlushSize: uint64(_readUint(".stakingQueue.bootstrapFlushSize", 8)),
            normalFlushSizeMin: uint64(_readUint(".stakingQueue.normalFlushSizeMin", 1)),
            normalFlushSizeQuotient: uint64(_readUint(".stakingQueue.normalFlushSizeQuotient", 2048)),
            maxQueueFlushSize: uint64(_readUint(".stakingQueue.maxQueueFlushSize", 8))
        });
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
