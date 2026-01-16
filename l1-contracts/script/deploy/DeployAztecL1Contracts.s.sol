// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order, max-states-count, gas-small-strings, comprehensive-interface
pragma solidity >=0.8.27;

import {Script} from "forge-std/Script.sol";
import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

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
import {
  MockZKPassportVerifier,
  IZKPassportVerifier
} from "@aztec/mock/staking_asset_handler/MockZKPassportVerifier.sol";
import {StakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {DateGatedRelayer} from "@aztec/periphery/DateGatedRelayer.sol";

import {ZKPassportRootVerifier as ZKPassportVerifier} from "@zkpassport/ZKPassportRootVerifier.sol";

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
  DeployAztecL1ContractsOutput internal _output;

  /// @notice Get deployment output
  function output() external view returns (DeployAztecL1ContractsOutput memory) {
    return _output;
  }

  /// @notice Address performing the deployment
  address public deployer;
  /// @notice Deployment configuration loaded from environment
  IDeploymentConfiguration public config;

  /// @notice Deploy with env var config, write addresses to stdout
  function run() public {
    config = new DeploymentConfiguration();
    config.loadConfig();
    // DEPLOYER_ADDRESS env var is intended only for tests.
    deployer = vm.envOr("DEPLOYER_ADDRESS", msg.sender);

    vm.startBroadcast(deployer);
    _deploy();
    vm.stopBroadcast();

    // Write deployed addresses to stdout for TypeScript to read
    _writeDeploymentOutput();
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
    // Before handing over to governance, deploy our initial canonical rollup.
    _deployRollup();
    _handoverToGovernance();
    _assertAccessControl();
  }

  /// @notice Deploy fee and staking assets on test networks
  function _maybeDeployAssets() internal {
    address existingToken = config.existingTokenAddress();
    if (existingToken != address(0)) {
      _output.stakingAsset = IERC20(existingToken);
      _output.feeAsset = IERC20(existingToken);
    } else {
      TestERC20 stakingAssetLocal = new TestERC20("Staking", "STK", deployer);
      TestERC20 feeAssetLocal = new TestERC20("FeeJuice", "FEE", deployer);
      feeAssetLocal.mint(deployer, 1e18);
      _output.stakingAsset = stakingAssetLocal;
      _output.feeAsset = feeAssetLocal;
    }
  }

  /// @notice Deploy coin issuer contract
  function _deployCoinIssuer() internal {
    CoinIssuerConfiguration memory coinConfig = config.getCoinIssuerConfiguration();
    _output.coinIssuer = new CoinIssuer(IMintableERC20(address(_output.feeAsset)), coinConfig.coinIssuerRate, deployer);
  }

  /// @notice Deploy fee asset handler on test chains
  function _maybeDeployFeeAssetHandler() internal {
    // Deploy on test chains only (when we control the staking asset)
    if (config.existingTokenAddress() == address(0)) {
      _output.feeAssetHandler = new FeeAssetHandler(deployer, address(_output.feeAsset), 1000e18);
      TestERC20(address(_output.feeAsset)).addMinter(address(_output.feeAssetHandler));
    }
  }

  /// @notice Deploy GSE contract
  function _deployGSE() internal {
    GseConfiguration memory gseConfig = config.getGseConfiguration();
    _output.gse = new GSE(deployer, _output.stakingAsset, gseConfig.activationThreshold, gseConfig.ejectionThreshold);
  }

  /// @notice Deploy registry and reward distributor
  function _deployRegistry() internal {
    _output.registry = new Registry(deployer, _output.feeAsset);
    _output.rewardDistributor = RewardDistributor(address(_output.registry.getRewardDistributor()));
  }

  /// @notice Deploy governance proposer contract
  function _deployGovernanceProposer() internal {
    GovernanceProposerConfiguration memory govPropConfig = config.getGovernanceProposerConfiguration();
    _output.governanceProposer =
      new GovernanceProposer(_output.registry, _output.gse, govPropConfig.quorum, govPropConfig.roundSize);
  }

  /// @notice Deploy governance contract
  function _deployGovernance() internal {
    // The protocol lets anyone deposit into governance.
    // There are no plans to use a different beneficiary, although the option
    // is available in the governance constructor.
    address governanceBeneficiary = address(0);
    _output.governance = new Governance(
      _output.stakingAsset,
      address(_output.governanceProposer),
      governanceBeneficiary,
      config.getGovernanceConfiguration()
    );
    _output.gse.setGovernance(_output.governance);
  }

  /// @notice Deploy rollup and related contracts via DeployRollupLib
  function _deployRollup() internal {
    _output.rollup = DeployRollupLib.deployRollup(_getRollupAddressInput(), config.rollupConfig());
  }

  /// @notice Build RollupAddressInput from deployed contracts
  function _getRollupAddressInput() internal view returns (RollupAddressInput memory) {
    return RollupAddressInput({
      deployer: deployer,
      registry: _output.registry,
      gse: _output.gse,
      governance: _output.governance,
      feeAsset: _output.feeAsset,
      stakingAsset: _output.stakingAsset,
      rewardDistributor: _output.rewardDistributor
    });
  }

  /// @notice Deploy date gated relayer contract
  function _deployDateGatedRelayer() internal {
    _output.dateGatedRelayer = new DateGatedRelayer(address(_output.governance), 1_798_761_600);
  }

  /// @notice Deploy staking asset handler on sepolia/anvil
  function _maybeDeployStakingAssetHandler() internal {
    // Only deploy on sepolia and anvil (not devnet etc.)
    bool isSepoliaTestChain = block.chainid == 11_155_111;
    bool isAnvilTestChain = block.chainid == 31_337;
    if (isSepoliaTestChain || isAnvilTestChain) {
      address zkPassportVerifier;

      if (isSepoliaTestChain) {
        // Sepolia - use deployed ZK Passport verifier
        // Address from lib/circuits/src/solidity/deployments/deployment-11155111.json
        zkPassportVerifier = 0x3101Bad9eA5fACadA5554844a1a88F7Fe48D4DE0;
      } else {
        // Anvil - deploy mock verifier
        _output.mockZkPassportVerifier = IZKPassportVerifier(address(new MockZKPassportVerifier()));
        zkPassportVerifier = address(_output.mockZkPassportVerifier);
      }

      ZkPassportConfiguration memory zkConfig = config.getZkPassportConfiguration();
      address[] memory unhinged = new address[](1);
      address AMIN = 0x3b218d0F26d15B36C715cB06c949210a0d630637;
      unhinged[0] = AMIN; // isUnhinged

      _output.stakingAssetHandler = new StakingAssetHandler(
        StakingAssetHandler.StakingAssetHandlerArgs({
          owner: deployer,
          stakingAsset: address(_output.stakingAsset),
          registry: _output.registry,
          faucetAmount: 1_000_000 * 1e18, // 1M STK
          zkPassportVerifier: ZKPassportVerifier(zkPassportVerifier),
          unhinged: unhinged,
          // Scopes
          domain: zkConfig.domain,
          scope: zkConfig.scope,
          skipBindCheck: !isSepoliaTestChain // Only skip bind check with mock verifier
        })
      );
      // Fund the staking asset handler faucet with tokens
      TestERC20(address(_output.stakingAsset))
        .mint(
          address(_output.stakingAssetHandler),
          100_000_000_000 * 1e18 // 100B STK (enough for 100K claims)
        );
    }
  }

  /// @notice Fund reward distributor on test networks
  function _maybeFundRewardDistributor() internal {
    // If we deployed test assets, fund.
    if (config.existingTokenAddress() == address(0)) {
      uint256 funding = config.getRewardDistributorFunding();
      if (funding > 0) {
        TestERC20(address(_output.feeAsset)).mint(address(_output.rewardDistributor), funding);
      }
    }
  }

  /// @notice Transfer ownership of contracts to governance
  function _handoverToGovernance() internal {
    _output.registry.transferOwnership(address(_output.governance));
    _output.gse.transferOwnership(address(_output.governance));

    // If we deployed assets, set them free.
    if (config.existingTokenAddress() == address(0)) {
      Ownable(address(_output.feeAsset)).transferOwnership(address(_output.coinIssuer));
      _output.coinIssuer.acceptTokenOwnership();
      _output.coinIssuer.transferOwnership(address(_output.dateGatedRelayer));
    }
  }

  /// @notice Write deployed contract addresses to stdout as JSON
  function _writeDeploymentOutput() internal {
    string memory json = "deployment";
    // Non-rollup addresses
    vm.serializeAddress(json, "registryAddress", address(_output.registry));
    vm.serializeAddress(json, "feeAssetAddress", address(_output.feeAsset));
    vm.serializeAddress(json, "stakingAssetAddress", address(_output.stakingAsset));
    vm.serializeAddress(json, "gseAddress", address(_output.gse));
    vm.serializeAddress(json, "dateGatedRelayerAddress", address(_output.dateGatedRelayer));
    vm.serializeAddress(json, "rewardDistributorAddress", address(_output.rewardDistributor));
    vm.serializeAddress(json, "coinIssuerAddress", address(_output.coinIssuer));
    vm.serializeAddress(json, "governanceProposerAddress", address(_output.governanceProposer));
    vm.serializeAddress(json, "governanceAddress", address(_output.governance));
    vm.serializeAddress(json, "feeAssetHandlerAddress", address(_output.feeAssetHandler));
    vm.serializeAddress(json, "stakingAssetHandlerAddress", address(_output.stakingAssetHandler));
    vm.serializeAddress(json, "zkPassportVerifierAddress", address(_output.mockZkPassportVerifier));
    // Rollup-related addresses
    string memory finalJson = DeployRollupLib.writeRollupAddressesToJson(vm, json, _output.rollup);
    console.log("JSON DEPLOY RESULT:", finalJson);
  }

  /// @notice Verify access control is correctly set up
  function _assertAccessControl() internal view {
    assertEq(_output.gse.owner(), address(_output.governance), "invalid gse owner");
    assertEq(address(_output.gse.getGovernance()), address(_output.governance), "invalid gse governance");
    assertEq(_output.registry.owner(), address(_output.governance), "invalid registry owner");
    assertEq(
      Governance(_output.registry.getGovernance()).governanceProposer(),
      address(_output.governanceProposer),
      "invalid governance proposer"
    );

    assertEq(
      address(_output.rewardDistributor.REGISTRY()), address(_output.registry), "invalid reward distributor registry"
    );
    assertEq(_output.dateGatedRelayer.owner(), address(_output.governance), "invalid date gated relayer owner");

    if (config.existingTokenAddress() == address(0)) {
      assertEq(TestERC20(address(_output.feeAsset)).owner(), address(_output.coinIssuer), "invalid fee asset owner");
      assertEq(_output.coinIssuer.owner(), address(_output.dateGatedRelayer), "invalid coin issuer owner");
    }
  }
}
