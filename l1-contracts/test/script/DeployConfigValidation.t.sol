// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {DeployRollupForUpgrade} from "../../script/deploy/DeployRollupForUpgrade.s.sol";
import {DeployRollupLib, RollupAddressInput} from "../../script/deploy/DeployRollupLib.sol";
import {RollupConfiguration} from "../../script/deploy/RollupConfiguration.sol";
import {GenesisState, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract RollupConfigurationHarness is RollupConfiguration {
  function requireGenesisState(GenesisState memory _genesisState) external pure {
    _requireGenesisState(_genesisState);
  }

  function requireNetworkMatchesChain(string memory _networkName, uint256 _chainId) external pure {
    _requireNetworkMatchesChain(_networkName, _chainId);
  }
}

contract DeployRollupForUpgradeHarness is DeployRollupForUpgrade {
  function requireRegistryHasCode(Registry _registry) external view {
    _requireRegistryHasCode(_registry);
  }
}

contract DeployRollupLibHarness {
  function validateRollupConfig(RollupAddressInput memory _input, RollupConfigInput memory _config) external view {
    DeployRollupLib.validateRollupConfig(_input, _config);
  }
}

/// @dev Only the asset binding is consulted by the deployer's checks.
contract GseAssetStub {
  IERC20 public immutable ASSET;

  constructor(IERC20 _asset) {
    ASSET = _asset;
  }
}

/**
 * @title DeployConfigValidationTest
 * @notice The env-driven deployer refuses configuration that the Rollup constructor would accept but that leaves
 *         the deployed instance unusable or mis-bound. The checks are exercised on values built in the test; the
 *         suite never writes environment variables, because forge runs tests in parallel and the process
 *         environment is shared with the other script tests.
 */
contract DeployConfigValidationTest is Test {
  RollupConfigurationHarness internal configuration;
  DeployRollupLibHarness internal lib;
  RollupAddressInput internal input;
  IRewardDistributor internal rewardDistributor = IRewardDistributor(makeAddr("rewardDistributor"));
  IERC20 internal stakingAsset = IERC20(makeAddr("stakingAsset"));

  function setUp() public {
    configuration = new RollupConfigurationHarness();
    lib = new DeployRollupLibHarness();
    input = RollupAddressInput({
      deployer: address(this),
      registry: Registry(makeAddr("registry")),
      gse: GSE(address(new GseAssetStub(stakingAsset))),
      governance: Governance(makeAddr("governance")),
      feeAsset: IERC20(makeAddr("feeAsset")),
      stakingAsset: stakingAsset,
      rewardDistributor: rewardDistributor
    });
  }

  /// @dev The mainnet timing and slashing values; the fields the deployer does not check are left zeroed.
  function _baseConfig() internal view returns (RollupConfigInput memory config) {
    config.ethereumSlotDuration = 12;
    config.aztecSlotDuration = 72;
    config.aztecEpochDuration = 32;
    config.targetCommitteeSize = 48;
    config.lagInEpochsForValidatorSet = 2;
    config.lagInEpochsForRandao = 1;
    config.exitDelaySeconds = 345_600;
    config.slashAmounts = [uint256(2000e18), 5000e18, 5000e18];
    config.rewardConfig = RewardConfig({
      rewardDistributor: rewardDistributor,
      sequencerBps: Bps.wrap(7000),
      booster: IBoosterCore(address(0)),
      checkpointReward: 500e18
    });
  }

  function _validGenesis() internal pure returns (GenesisState memory) {
    return GenesisState({
      vkTreeRoot: bytes32(uint256(keccak256("vk_tree_root")) >> 8),
      protocolContractsHash: bytes32(uint256(keccak256("protocol_contracts_hash")) >> 8),
      genesisArchiveRoot: bytes32(uint256(keccak256("genesis_archive_root")) >> 8)
    });
  }

  function _expectInvalid(RollupConfigInput memory _config, string memory _reason) internal {
    vm.expectRevert(bytes(_reason));
    lib.validateRollupConfig(input, _config);
  }

  function test_BaselineIsValid() public view {
    lib.validateRollupConfig(input, _baseConfig());
    configuration.requireGenesisState(_validGenesis());
  }

  function test_RealVerifierUnlessDisabled() public view {
    assertTrue(configuration.useRealVerifier());
  }

  function test_RevertWhenGenesisRootUnset() public {
    GenesisState memory genesisState = _validGenesis();
    genesisState.vkTreeRoot = bytes32(0);
    vm.expectRevert(bytes("RollupConfiguration: VK_TREE_ROOT is unset"));
    configuration.requireGenesisState(genesisState);
  }

  function test_RevertWhenProtocolContractsHashUnset() public {
    GenesisState memory genesisState = _validGenesis();
    genesisState.protocolContractsHash = bytes32(0);
    vm.expectRevert(bytes("RollupConfiguration: PROTOCOL_CONTRACTS_HASH is unset"));
    configuration.requireGenesisState(genesisState);
  }

  function test_RevertWhenGenesisArchiveRootUnset() public {
    GenesisState memory genesisState = _validGenesis();
    genesisState.genesisArchiveRoot = bytes32(0);
    vm.expectRevert(bytes("RollupConfiguration: GENESIS_ARCHIVE_ROOT is unset"));
    configuration.requireGenesisState(genesisState);
  }

  function test_NetworkAndChainIdMustAgree() public {
    configuration.requireNetworkMatchesChain("mainnet", 1);
    configuration.requireNetworkMatchesChain("testnet", 11_155_111);
    configuration.requireNetworkMatchesChain("local", 31_337);

    vm.expectRevert(bytes("RollupConfiguration: chain id 1 requires NETWORK=mainnet"));
    configuration.requireNetworkMatchesChain("testnet", 1);

    vm.expectRevert(bytes("RollupConfiguration: NETWORK=mainnet requires chain id 1"));
    configuration.requireNetworkMatchesChain("mainnet", 11_155_111);
  }

  function test_RevertWhenRegistryHasNoCode() public {
    DeployRollupForUpgradeHarness upgrade = new DeployRollupForUpgradeHarness();
    vm.expectRevert(bytes("DeployRollupForUpgrade: REGISTRY_ADDRESS has no code on this chain"));
    upgrade.requireRegistryHasCode(Registry(makeAddr("not-a-registry")));
  }

  function test_ZeroCommitteeSizeIsAllowed() public view {
    RollupConfigInput memory config = _baseConfig();
    config.targetCommitteeSize = 0;
    lib.validateRollupConfig(input, config);
  }

  function test_LongEpochIsAllowed() public view {
    RollupConfigInput memory config = _baseConfig();
    config.aztecEpochDuration = 1000;
    lib.validateRollupConfig(input, config);
  }

  function test_RevertWhenExitDelayZero() public {
    RollupConfigInput memory config = _baseConfig();
    config.exitDelaySeconds = 0;
    _expectInvalid(config, "DeployRollupLib: exitDelaySeconds is zero");
  }

  function test_RevertWhenDurationsZero() public {
    RollupConfigInput memory config = _baseConfig();
    config.ethereumSlotDuration = 0;
    _expectInvalid(config, "DeployRollupLib: ethereumSlotDuration is zero");

    config = _baseConfig();
    config.aztecSlotDuration = 0;
    _expectInvalid(config, "DeployRollupLib: aztecSlotDuration is zero");

    config = _baseConfig();
    config.aztecEpochDuration = 0;
    _expectInvalid(config, "DeployRollupLib: aztecEpochDuration is zero");
  }

  function test_RevertWhenEpochSecondsOverflowUint32() public {
    RollupConfigInput memory config = _baseConfig();
    // 32 checkpoints of 2^27 seconds is exactly 2^32 seconds.
    config.aztecSlotDuration = uint256(1) << 27;
    _expectInvalid(config, "DeployRollupLib: epoch duration in seconds overflows uint32");
  }

  function test_RevertWhenRandaoLagZero() public {
    RollupConfigInput memory config = _baseConfig();
    config.lagInEpochsForRandao = 0;
    _expectInvalid(config, "DeployRollupLib: lagInEpochsForRandao is zero");
  }

  function test_RevertWhenValidatorSetLagBelowRandaoLag() public {
    RollupConfigInput memory config = _baseConfig();
    config.lagInEpochsForRandao = 2;
    config.lagInEpochsForValidatorSet = 1;
    _expectInvalid(config, "DeployRollupLib: lagInEpochsForValidatorSet below lagInEpochsForRandao");
  }

  function test_RevertWhenLagSecondsOverflowUint32() public {
    RollupConfigInput memory config = _baseConfig();
    // 2304 seconds per epoch (72 x 32); 1_864_136 epochs of lag is just over 2^32 seconds.
    config.lagInEpochsForValidatorSet = 1_864_136;
    _expectInvalid(config, "DeployRollupLib: lag in seconds overflows uint32");
  }

  function test_RevertWhenSlashAmountExceedsUint96() public {
    RollupConfigInput memory config = _baseConfig();
    config.slashAmounts[2] = uint256(type(uint96).max) + 1;
    _expectInvalid(config, "DeployRollupLib: slash amount exceeds uint96");
  }

  function test_RevertWhenRewardDistributorZero() public {
    RollupConfigInput memory config = _baseConfig();
    config.rewardConfig.rewardDistributor = IRewardDistributor(address(0));
    _expectInvalid(config, "DeployRollupLib: rewardDistributor is zero");
  }

  function test_RevertWhenStakingAssetIsNotGseAsset() public {
    RollupAddressInput memory other = input;
    other.stakingAsset = IERC20(makeAddr("other-asset"));
    RollupConfigInput memory config = _baseConfig();
    vm.expectRevert(bytes("DeployRollupLib: stakingAsset is not GSE.ASSET()"));
    lib.validateRollupConfig(other, config);
  }
}
