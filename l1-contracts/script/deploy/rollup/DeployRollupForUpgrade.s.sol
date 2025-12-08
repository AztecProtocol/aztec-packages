// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order, max-states-count, gas-small-strings, comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";

import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {Rollup} from "@aztec/core/Rollup.sol";

import {CoinIssuer, IMintableERC20} from "@aztec/governance/CoinIssuer.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";

import {FeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {MockZKPassportVerifier, IZKPassportVerifier} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {DateGatedRelayer} from "@aztec/periphery/DateGatedRelayer.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";

import {ZKPassportVerifier} from "@zkpassport/ZKPassportVerifier.sol";

import {HonkVerifier} from "../../../generated/HonkVerifier.sol";

import {DeploymentConfiguration} from "./DeploymentConfiguration.sol";
import {RollupConfiguration} from "./RollupConfiguration.sol";
import {
    CoinIssuerConfiguration,
    DeploymentOptions,
    GovernanceProposerConfiguration,
    GseConfiguration,
    ZkPassportConfiguration
} from "./IDeploymentConfiguration.sol";
/**
 * @title DeployRollupForUpgrade
 * @notice Deploy a new Rollup contract for upgrading an existing Aztec deployment.
 *
 * This script deploys only:
 *   - Verifier (Mock or Real HonkVerifier)
 *   - Rollup contract
 *   - SlashFactory
 *
 * It uses existing infrastructure contracts passed via environment variables:
 *   - REGISTRY_ADDRESS
 *   - GSE_ADDRESS
 *   - GOVERNANCE_ADDRESS
 *   - FEE_ASSET_ADDRESS
 *   - STAKING_ASSET_ADDRESS
 *
 * After deployment, it optionally:
 *   - Registers the new Rollup in Registry/GSE (if deployer is owner)
 *   - Funds the FeeJuicePortal (if FUND_FEE_JUICE_PORTAL=true)
 *
 * Usage:
 *   REGISTRY_ADDRESS=0x... \
 *   GSE_ADDRESS=0x... \
 *   GOVERNANCE_ADDRESS=0x... \
 *   FEE_ASSET_ADDRESS=0x... \
 *   STAKING_ASSET_ADDRESS=0x... \
 *   forge script script/deploy/rollup/DeployRollupForUpgrade.s.sol:DeployRollupForUpgrade \
 *     --sig "run(string)" "./upgrade-output.json" \
 *     --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast -vvv
 *
 * See DeploymentConfiguration.sol for rollup configuration variables (genesis, timing, slashing, etc.)
 */
contract DeployRollupForUpgrade is Script, Test {
    // ============ Input Structures ============

    /// @notice Input configuration for rollup and governance infrastructure
    struct L1ContractsInput {
        Registry registry;
        GSE gseContract;
        Governance governance;
        IERC20 feeAsset;
        IERC20 stakingAsset;
        RewardDistributor rewardDistributor;
    }

    // ============ Deployed Rollup Contracts ============

    /// @notice Newly deployed rollup-specific contracts
    IERC20 public feeAsset;
    IERC20 public stakingAsset;
    GSE public gseContract;
    Registry public registry;
    RewardDistributor public rewardDistributor;
    CoinIssuer public coinIssuer;
    GovernanceProposer public governanceProposer;
    Governance public governance;
    IVerifier public verifier;
    Rollup public rollup;
    SlashFactory public slashFactory;
    DateGatedRelayer public dateGatedRelayer;
    FeeAssetHandler public feeAssetHandler;
    IZKPassportVerifier public mockZkPassportVerifier;
    StakingAssetHandler public stakingAssetHandler;

    /// @notice Address performing the deployment
    address public deployer;
    /// @notice Rollup configuration component (for rollup-specific settings)
    RollupConfiguration public rollupConfig;

    /// @notice Initialize deployer address from environment variable or msg.sender
    function setUp() public virtual {
        deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);
    }

    /// @notice Deploy with env var config, write addresses to output file
    /// @param _outputPath Path to write deployment output JSON
    function run(string memory _outputPath) public {
        rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        vm.startBroadcast(deployer);
        _deploy();
        vm.stopBroadcast();

        // Write deployed addresses to output file for TypeScript to read
        _writeDeploymentOutput(_outputPath);
    }

    /// @notice Deploy without output file (for backwards compatibility)
    function run() public {
        rollupConfig = new RollupConfiguration();
        rollupConfig.loadConfig();

        vm.startBroadcast(deployer);
        _deploy();
        vm.stopBroadcast();
    }

    /// @notice Execute the full deployment sequence
    function _deploy() internal {
        // Validate configuration before deployment
        rollupConfig.validateConfig();

        // On a test network, we deploy assets.
        _maybeDeployAssets();
        // CORE CONTRACTS
        _deployCoinIssuer();
        _deployGSE();
        _deployRegistry();
        _deployGovernanceProposer();
        _deployGovernance();
        _deployVerifier();
        _deployRollup();
        _deploySlashFactory();
        _deployDateGatedRelayer();
        // OPTIONAL FEE ASSET FUNDING (testnets only)
        _maybeMintInitialFeeAsset();
        // CHEATCODE CONTRACTS (testnets only)
        _maybeDeployFeeAssetHandler();
        _maybeDeployStakingAssetHandler();
        // POST-DEPLOY SETUP
        _registerRollup();
        _maybeAddInitialValidators();
        _maybeFundRewardDistributor();
        _handoverToGovernance();
        _assertAccessControl();
    }

    /// @notice Deploy fee and staking assets on test networks
    function _maybeDeployAssets() internal {
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        if (opts.existingStakingAssetAddress != address(0)) {
            stakingAsset = IERC20(opts.existingStakingAssetAddress);
            feeAsset = IERC20(opts.existingStakingAssetAddress);
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
        CoinIssuerConfiguration memory coinConfig = rollupConfig.getCoinIssuerConfiguration();
        coinIssuer = new CoinIssuer(
            IMintableERC20(address(feeAsset)),
            coinConfig.coinIssuerRate,
            deployer
        );
    }

    /// @notice Deploy fee asset handler on test chains
    function _maybeDeployFeeAssetHandler() internal {
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        // Deploy on test chains only (when we control the staking asset)
        if (opts.existingStakingAssetAddress == address(0)) {
            feeAssetHandler = new FeeAssetHandler(deployer, address(feeAsset), 1000e18);
            TestERC20(address(feeAsset)).addMinter(address(feeAssetHandler));
        }
    }

    /// @notice Deploy GSE contract
    function _deployGSE() internal {
        GseConfiguration memory gseConfig = rollupConfig.getGseConfiguration();
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
        GovernanceProposerConfiguration memory govPropConfig = rollupConfig.getGovernanceProposerConfiguration();
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
            rollupConfig.getGovernanceConfiguration()
        );
        gseContract.setGovernance(governance);
    }

    /// @notice Deploy proof verifier (mock or real)
    function _deployVerifier() internal {
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        if (!opts.realVerifier) {
            verifier = new MockVerifier();
        } else {
            verifier = IVerifier(address(new HonkVerifier()));
        }
    }

    /// @notice Deploy main rollup contract
    function _deployRollup() internal {
        GenesisState memory genesisState = rollupConfig.getGenesisState();
        RollupConfigInput memory rollupConfigInput = rollupConfig.getRollupConfiguration(
            IRewardDistributor(address(rewardDistributor))
        );

        rollup = new Rollup(
            feeAsset,
            stakingAsset,
            gseContract,
            verifier,
            address(governance),
            genesisState,
            rollupConfigInput
        );
    }

    /// @notice Deploy slash factory contract
    function _deploySlashFactory() internal {
        slashFactory = new SlashFactory(rollup);
    }

    /// @notice Optionally mint initial fee assets to the fee asset portal
    /// @dev Only mints on test networks where we control the fee asset
    function _maybeMintInitialFeeAsset() internal {
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        // Only mint on test chains (when we control the fee asset)
        if (opts.existingStakingAssetAddress == address(0)) {
            // Default: mint 100 FeeJuice tokens to portal, can be overridden via env var
            uint256 initialFeeAssetAmount = vm.envOr("INITIAL_FEE_ASSET_AMOUNT", uint256(100e18));
            if (initialFeeAssetAmount > 0) {
                address feeAssetPortal = address(rollup.getFeeAssetPortal());
                TestERC20(address(feeAsset)).mint(feeAssetPortal, initialFeeAssetAmount);
            }
        }
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

            ZkPassportConfiguration memory zkConfig = rollupConfig.getZkPassportConfiguration();
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

    /// @notice Register rollup with registry and GSE
    function _registerRollup() internal {
        registry.addRollup(rollup);
        gseContract.addRollup(address(rollup));
    }

    /// @notice Add initial validators to the rollup
    function _maybeAddInitialValidators() internal {
        CheatDepositArgs[] memory initialValidators = rollupConfig.parseValidators();
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        // Testnets only.
        if (initialValidators.length == 0 || opts.existingStakingAssetAddress != address(0)) {
            return;
        }

        MultiAdder multiAdder = new MultiAdder(address(rollup), deployer);

        uint256 activationThreshold = rollup.getActivationThreshold();
        uint256 stakeNeeded = activationThreshold * initialValidators.length;
        TestERC20(address(stakingAsset)).mint(address(multiAdder), stakeNeeded);

        uint256 chunkSize = 16;
        for (uint256 i = 0; i < initialValidators.length; i += chunkSize) {
            uint256 end = i + chunkSize > initialValidators.length ? initialValidators.length : i + chunkSize;
            uint256 chunkLen = end - i;

            CheatDepositArgs[] memory chunk = new CheatDepositArgs[](chunkLen);
            for (uint256 j = 0; j < chunkLen; ++j) {
                chunk[j] = initialValidators[i + j];
            }

            multiAdder.addValidators(chunk, 0);
        }

        uint256 flushChunkSize = 16;
        while (true) {
            uint256 queueLength = rollup.getEntryQueueLength();
            if (queueLength == 0) break;

            uint256 availableFlushes = rollup.getAvailableValidatorFlushes();
            if (availableFlushes == 0) break;

            rollup.flushEntryQueue(flushChunkSize);
        }
    }

    /// @notice Fund reward distributor on test networks
    function _maybeFundRewardDistributor() internal {
        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        if (opts.fundRewardDistributor && opts.existingStakingAssetAddress == address(0)) {
            uint256 funding = rollupConfig.getRewardDistributorFunding();
            TestERC20(address(feeAsset)).mint(address(rewardDistributor), funding);
        }
    }

    /// @notice Transfer ownership of contracts to governance
    function _handoverToGovernance() internal {
        registry.transferOwnership(address(governance));
        gseContract.transferOwnership(address(governance));

        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        if (opts.existingStakingAssetAddress == address(0)) {
            Ownable(address(feeAsset)).transferOwnership(address(coinIssuer));
            coinIssuer.acceptTokenOwnership();
            coinIssuer.transferOwnership(address(dateGatedRelayer));
        }
    }

    /// @notice Write deployed contract addresses to JSON output file
    /// @param _outputPath Path where to write the output JSON
    function _writeDeploymentOutput(string memory _outputPath) internal {
        string memory json = "deployment";
        vm.serializeAddress(json, "rollupAddress", address(rollup));
        vm.serializeAddress(json, "registryAddress", address(registry));
        vm.serializeAddress(json, "feeAssetAddress", address(feeAsset));
        vm.serializeAddress(json, "stakingAssetAddress", address(stakingAsset));
        vm.serializeAddress(json, "gseAddress", address(gseContract));
        vm.serializeAddress(json, "rewardDistributorAddress", address(rewardDistributor));
        vm.serializeAddress(json, "coinIssuerAddress", address(coinIssuer));
        vm.serializeAddress(json, "governanceProposerAddress", address(governanceProposer));
        vm.serializeAddress(json, "governanceAddress", address(governance));
        vm.serializeAddress(json, "verifierAddress", address(verifier));
        vm.serializeAddress(json, "slashFactoryAddress", address(slashFactory));
        vm.serializeAddress(json, "feeAssetHandlerAddress", address(feeAssetHandler));
        vm.serializeAddress(json, "stakingAssetHandlerAddress", address(stakingAssetHandler));
        vm.serializeAddress(json, "zkPassportVerifierAddress", address(mockZkPassportVerifier));
        // Query addresses from Rollup contract (these are set during Rollup deployment)
        vm.serializeAddress(json, "inboxAddress", address(rollup.getInbox()));
        vm.serializeAddress(json, "outboxAddress", address(rollup.getOutbox()));
        vm.serializeAddress(json, "feeAssetPortalAddress", address(rollup.getFeeAssetPortal()));
        string memory finalJson = vm.serializeUint(json, "rollupVersion", rollup.getVersion());
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

        DeploymentOptions memory opts = rollupConfig.getContractOptions();
        if (opts.existingStakingAssetAddress == address(0)) {
            assertEq(TestERC20(address(feeAsset)).owner(), address(coinIssuer), "invalid fee asset owner");
            assertEq(coinIssuer.owner(), address(dateGatedRelayer), "invalid coin issuer owner");
        }
    }
    // Legacy TypeScript test reference preserved for documentation.
    // Tests have been ported to test/script/DeployL1ContractsScript.t.sol
//     import { times } from '@aztec/foundation/collection';
// import { SecretValue, getActiveNetworkName } from '@aztec/foundation/config';
// import { EthAddress } from '@aztec/foundation/eth-address';
// import { Fr } from '@aztec/foundation/fields';
// import { type Logger, createLogger } from '@aztec/foundation/log';
// import { retryUntil } from '@aztec/foundation/retry';
// import { MockVerifierAbi, MockVerifierBytecode, TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

// import type { Hex } from 'viem';
// import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

// import { createEthereumChain } from './chain.js';
// import { createExtendedL1Client } from './client.js';
// import { DefaultL1ContractsConfig } from './config.js';
// import { FeeJuiceContract } from './contracts/fee_juice.js';
// import { GovernanceContract } from './contracts/governance.js';
// import { GSEContract } from './contracts/gse.js';
// import { RegistryContract } from './contracts/registry.js';
// import { RollupContract } from './contracts/rollup.js';
// import {
//   type DeployL1ContractsArgs,
//   type Operator,
//   deployL1Contract,
//   deployL1Contracts,
// } from './deploy_l1_contracts.js';
// import { startAnvil } from './test/start_anvil.js';
// import type { ExtendedViemWalletClient } from './types.js';

// describe('deploy_l1_contracts', () => {
//   let privateKey: PrivateKeyAccount;
//   let logger: Logger;

//   let vkTreeRoot: Fr;
//   let protocolContractsHash: Fr;
//   let genesisArchiveRoot: Fr;
//   let initialValidators: Operator[];

//   // Use these environment variables to run against a live node. Eg to test against spartan's eth-devnet:
//   // BLOCK_TIME=1 spartan/aztec-network/eth-devnet/run-locally.sh
//   // LOG_LEVEL=verbose L1_RPC_URL=http://localhost:8545 L1_CHAIN_ID=1337 yarn test deploy_l1_contracts
//   const chainId = process.env.L1_CHAIN_ID ? parseInt(process.env.L1_CHAIN_ID, 10) : 31337;

//   let rpcUrl = process.env.L1_RPC_URL;
//   let client: ExtendedViemWalletClient;
//   let stop: () => Promise<void> = () => Promise.resolve();

//   beforeAll(async () => {
//     logger = createLogger('ethereum:test:deploy_l1_contracts');
//     privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
//     vkTreeRoot = Fr.random();
//     protocolContractsHash = Fr.random();
//     genesisArchiveRoot = Fr.random();

//     initialValidators = times(3, () => ({
//       attester: EthAddress.random(),
//       withdrawer: EthAddress.random(),
//       bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
//     }));

//     if (!rpcUrl) {
//       ({ stop, rpcUrl } = await startAnvil({ port: 8546 }));
//     }

//     client = createExtendedL1Client([rpcUrl], privateKey, createEthereumChain([rpcUrl], chainId).chainInfo);
//   });

//   afterAll(async () => {
//     if (stop) {
//       try {
//         await stop();
//       } catch (err) {
//         createLogger('ethereum:cleanup').error(`Error during cleanup`, err);
//       }
//     }
//   });

//   const deploy = (args: Partial<DeployL1ContractsArgs> = {}) =>
//     deployL1Contracts(
//       [rpcUrl!],
//       privateKey,
//       createEthereumChain([rpcUrl!], chainId).chainInfo,
//       logger,
//       {
//         ...DefaultL1ContractsConfig,
//         salt: undefined,
//         vkTreeRoot,
//         protocolContractsHash,
//         genesisArchiveRoot,
//         realVerifier: false,
//         ...args,
//       },
//       { checkIntervalMs: 100, priorityFeeBumpPercentage: 0 },
//       false,
//     );

//   const getRollup = (deployed: Awaited<ReturnType<typeof deploy>>) =>
//     new RollupContract(deployed.l1Client, deployed.l1ContractAddresses.rollupAddress);

//   const checkRollupDeploy = async (deployed: Awaited<ReturnType<typeof deploy>>) => {
//     const rollup = getRollup(deployed);
//     expect(await rollup.getEpochDuration()).toEqual(BigInt(DefaultL1ContractsConfig.aztecEpochDuration));
//     return rollup;
//   };

//   it('deploys without salt', async () => {
//     const deployed = await deploy();
//     await checkRollupDeploy(deployed);
//   });

//   it('deploys using an existing external token for fee and staking', async () => {
//     const { address: externalTokenAddress } = await deployL1Contract(client, TestERC20Abi, TestERC20Bytecode as Hex, [
//       'TEST',
//       'TEST',
//       client.account.address,
//     ]);

//     await new FeeJuiceContract(externalTokenAddress, client).mint(client.account.address, 1n * 10n ** 18n);

//     const deployed = await deploy({ existingTokenAddress: externalTokenAddress });

//     await checkRollupDeploy(deployed);

//     expect(deployed.l1ContractAddresses.feeJuiceAddress).toEqual(externalTokenAddress);
//     expect(deployed.l1ContractAddresses.stakingAssetAddress).toEqual(externalTokenAddress);

//     expect(deployed.l1ContractAddresses.feeAssetHandlerAddress).toBeUndefined();
//     expect(deployed.l1ContractAddresses.stakingAssetHandlerAddress).toBeUndefined();

//     // Ownership of the external token should remain with the deployer, not CoinIssuer
//     expect(await getOwner(deployed.l1ContractAddresses.feeJuiceAddress)).toEqual(
//       EthAddress.fromString(client.account.address),
//     );
//   });

//   it('fails when deploying with an address that has no contract code', async () => {
//     const randomAddress = EthAddress.random();
//     await expect(deploy({ existingTokenAddress: randomAddress })).rejects.toThrow(
//       `No contract code found at provided token address ${randomAddress.toString()}`,
//     );
//   });

//   it('fails when deploying with a non-ERC20 contract address', async () => {
//     // Deploy a MockVerifier contract (has code but no ERC20 methods)
//     const { address: nonTokenAddress } = await deployL1Contract(
//       client,
//       MockVerifierAbi,
//       MockVerifierBytecode as Hex,
//       [],
//     );

//     await expect(deploy({ existingTokenAddress: nonTokenAddress })).rejects.toThrow(
//       `Address ${nonTokenAddress.toString()} does not appear to implement ERC20 view methods`,
//     );
//   });

//   it('fails when deploying with both initialValidators and existingTokenAddress', async () => {
//     const { address: externalTokenAddress } = await deployL1Contract(client, TestERC20Abi, TestERC20Bytecode as Hex, [
//       'TEST',
//       'TEST',
//       client.account.address,
//     ]);

//     await expect(deploy({ existingTokenAddress: externalTokenAddress, initialValidators })).rejects.toThrow(
//       'Cannot deploy with both initialValidators and existingTokenAddress',
//     );
//   });

//   it('deploys initializing validators', async () => {
//     const deployed = await deploy({ initialValidators });
//     const rollup = await checkRollupDeploy(deployed);
//     await Promise.all(
//       initialValidators.map(async validator => {
//         await retryUntil(
//           async () => {
//             const view = await rollup.getAttesterView(validator.attester);
//             return view.status > 0;
//           },
//           `attester ${validator.attester} is attesting`,
//           DefaultL1ContractsConfig.ethereumSlotDuration * 3,
//           1,
//         );
//       }),
//     );
//   });

//   it('deploys with salt on different addresses', async () => {
//     const first = await deploy({ salt: 42 });
//     const second = await deploy({ salt: 43 });

//     expect(first.l1ContractAddresses).not.toEqual(second.l1ContractAddresses);
//     await checkRollupDeploy(first);
//     await checkRollupDeploy(second);
//   });

//   it('deploys twice with salt on same addresses', async () => {
//     const first = await deploy({ salt: 44 });
//     const second = await deploy({ salt: 44 });

//     expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);
//     await checkRollupDeploy(first);
//   });

//   it('deploys twice with salt on same addresses initializing validators', async () => {
//     const first = await deploy({ salt: 44, initialValidators });
//     const second = await deploy({ salt: 44, initialValidators });

//     expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);

//     const rollup = getRollup(first);
//     for (const validator of initialValidators) {
//       await retryUntil(
//         async () => {
//           const view = await rollup.getAttesterView(validator.attester);
//           return view.status > 0;
//         },
//         'attester is attesting',
//         DefaultL1ContractsConfig.ethereumSlotDuration * 3,
//         1,
//       );
//     }
//   });

//   it('deploys and adds 48 initialValidators', async () => {
//     // Adds 48 validators. Note, that not all 48 validators is necessarily added in the active set, some might be in the entry queue
//     const initialValidators = times(48, () => {
//       const addr = EthAddress.random();
//       const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
//       return { attester: addr, withdrawer: addr, bn254SecretKey };
//     });

//     const info = await deploy({
//       initialValidators,
//       aztecTargetCommitteeSize: initialValidators.length,
//     });

//     const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);
//     expect((await rollup.getActiveAttesterCount()) + (await rollup.getEntryQueueLength())).toEqual(
//       BigInt(initialValidators.length),
//     );
//   });

//   it('deploys and flushes 48 initialValidators', async () => {
//     // Adds 48 validators. We will repeatedly flush during the same epoch up till the the bootstrap flush size.
//     const initialValidators = times(48, () => {
//       const addr = EthAddress.random();
//       const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
//       return { attester: addr, withdrawer: addr, bn254SecretKey };
//     });

//     // Use the `staging-public` network (48 bootstrap set size with 48 bootstrap flush)
//     process.env.NETWORK = 'staging-public';
//     const info = await deploy({
//       initialValidators,
//       aztecTargetCommitteeSize: initialValidators.length,
//     });
//     process.env.NETWORK = '';

//     const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);

//     expect(await rollup.getEntryQueueLength()).toEqual(0n);
//     expect(await rollup.getActiveAttesterCount()).toEqual(BigInt(initialValidators.length));
//   });

//   it('deploys validators and flushes up to maxQueueFlushSize', async () => {
//     // Determine flush cap from active network configuration
//     const networkName = getActiveNetworkName();
//     const { maxQueueFlushSize } = getEntryQueueConfig(networkName);

//     // We will repeatedly flush during the same epoch up till the limit.
//     const totalValidators = Number(48);
//     const initialValidators = times(totalValidators, () => {
//       const addr = EthAddress.random();
//       const bn254SecretKey = new SecretValue(Fr.random().toBigInt());
//       return { attester: addr, withdrawer: addr, bn254SecretKey };
//     });

//     const info = await deploy({
//       initialValidators,
//       aztecTargetCommitteeSize: initialValidators.length,
//     });
//     const rollup = new RollupContract(client, info.l1ContractAddresses.rollupAddress);

//     expect(await rollup.getEntryQueueLength()).toEqual(BigInt(totalValidators) - maxQueueFlushSize);
//     expect(await rollup.getActiveAttesterCount()).toEqual(maxQueueFlushSize);
//   });

//   it('ensure governance is the owner', async () => {
//     // Runs the deployment script and checks if we have handed over things correctly to the governance.

//     const deployment = await deployL1Contracts(
//       [rpcUrl!],
//       privateKey,
//       createEthereumChain([rpcUrl!], chainId).chainInfo,
//       logger,
//       {
//         ...DefaultL1ContractsConfig,
//         salt: undefined,
//         vkTreeRoot,
//         protocolContractsHash,
//         genesisArchiveRoot,
//         realVerifier: false,
//       },
//       { checkIntervalMs: 100, priorityFeeBumpPercentage: 0 },
//     );

//     const governance = new GovernanceContract(deployment.l1ContractAddresses.governanceAddress, client);
//     const registry = new RegistryContract(client, deployment.l1ContractAddresses.registryAddress);
//     const rollup = new RollupContract(client, deployment.l1ContractAddresses.rollupAddress);
//     const gse = new GSEContract(client, await rollup.getGSE());
//     const dateGatedRelayerAddress = deployment.l1ContractAddresses.dateGatedRelayerAddress!;

//     // Checking the shared
//     expect(await registry.getOwner()).toEqual(governance.address);
//     expect(await gse.getOwner()).toEqual(governance.address);
//     expect(await gse.getGovernance()).toEqual(governance.address);
//     expect(await getOwner(deployment.l1ContractAddresses.rewardDistributorAddress, 'REGISTRY')).toEqual(
//       registry.address,
//     );

//     // The coin issuer should be owned by governance, but indirectly through the date gated relayer
//     expect(await getOwner(deployment.l1ContractAddresses.coinIssuerAddress)).toEqual(dateGatedRelayerAddress);
//     expect(await getOwner(dateGatedRelayerAddress)).toEqual(governance.address);

//     expect(await getOwner(deployment.l1ContractAddresses.feeJuiceAddress)).toEqual(
//       deployment.l1ContractAddresses.coinIssuerAddress,
//     );

//     // The rollup contract should be owned by the governance contract as well.
//     expect(await getOwner(EthAddress.fromString(rollup.address))).toEqual(governance.address);

//     // Make sure that the fee asset handler is the minter of the fee asset.
//     expect(
//       await isMinter(
//         deployment.l1ContractAddresses.feeJuiceAddress,
//         deployment.l1ContractAddresses.feeAssetHandlerAddress!,
//       ),
//     ).toBeTruthy();
//   });

//   const isContract = async (address: EthAddress) => {
//     const bytecode = await client.getBytecode({ address: address.toString() });
//     return bytecode !== undefined && bytecode !== '0x';
//   };

//   const getOwner = async (address: EthAddress, name: string = 'owner') => {
//     if (!(await isContract(address))) {
//       throw new Error(`Address ${address} have no bytecode, is it deployed?`);
//     }
//     return EthAddress.fromString(
//       await client.readContract({
//         address: address.toString(),
//         abi: [
//           {
//             name: name,
//             type: 'function',
//             inputs: [],
//             outputs: [{ type: 'address' }],
//             stateMutability: 'view',
//           },
//         ],
//         functionName: name,
//       }),
//     );
//   };

//   const isMinter = async (address: EthAddress, minter: EthAddress) => {
//     if (!(await isContract(address))) {
//       throw new Error(`Address ${address} have no bytecode, is it deployed?`);
//     }
//     return await client.readContract({
//       address: address.toString(),
//       abi: [
//         {
//           name: 'minters',
//           type: 'function',
//           inputs: [{ type: 'address' }],
//           outputs: [{ type: 'bool' }],
//           stateMutability: 'view',
//         },
//       ],
//       functionName: 'minters',
//       args: [minter.toString()],
//     });
//   };
// });

}
