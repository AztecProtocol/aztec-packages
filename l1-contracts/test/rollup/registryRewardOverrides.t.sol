// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {RollupCore} from "@aztec/core/RollupCore.sol";
import {
  GenesisState,
  RollupConfigInput,
  RegistryRewardOverride,
  MAX_REGISTRY_REWARD_OVERRIDES
} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {MAXIMUM_COMMITTEE_SIZE} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Bps, MutableRewardConfig, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {RewardExtLib} from "@aztec/core/libraries/rollup/RewardExtLib.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {RollupBuilder, Config as BuilderConfig} from "@test/builder/RollupBuilder.sol";

contract RegistryRewardOverridesRollupHarness is RollupCore {
  constructor(
    TestERC20 _token,
    GSE _gse,
    IVerifier _verifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) RollupCore(_token, _token, _gse, _verifier, _governance, _genesisState, _config) {}

  function getRegistryRewardOverrides()
    external
    view
    returns (RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides)
  {
    return _getRegistryRewardOverrides();
  }

  function getRewardConfig() external view returns (RewardConfig memory) {
    return RewardExtLib.getRewardConfig();
  }
}

contract RegistryRewardOverridesTest is Test {
  TestERC20 internal token;
  GSE internal gse;
  GenesisState internal genesisState;
  IVerifier internal verifier;
  RollupBuilder internal builder;

  function setUp() public {
    builder = new RollupBuilder(address(this));
    builder.deploy();
    BuilderConfig memory config = builder.getConfig();

    token = config.testERC20;
    gse = config.gse;
    genesisState = config.genesisState;
    verifier = new MockVerifier();
  }

  function test_exposesConfiguredRegistryRewardOverrides() external {
    RegistryRewardOverride memory saleOverride =
      RegistryRewardOverride({registry: makeAddr("saleRegistry"), sequencerReward: 10e18});
    RegistryRewardOverride memory genesisOverride =
      RegistryRewardOverride({registry: makeAddr("genesisRegistry"), sequencerReward: 0});

    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.registryRewardOverrides[0] = saleOverride;
    config.registryRewardOverrides[1] = genesisOverride;

    RegistryRewardOverridesRollupHarness rollup = _deploy(config);
    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory actual = rollup.getRegistryRewardOverrides();

    assertEq(actual[0].registry, saleOverride.registry);
    assertEq(actual[0].sequencerReward, saleOverride.sequencerReward);
    assertEq(actual[1].registry, genesisOverride.registry);
    assertEq(actual[1].sequencerReward, genesisOverride.sequencerReward);
  }

  function test_revertsWhenRegistryRewardOverridesContainDuplicateRegistry() external {
    address registry = makeAddr("registry");
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.registryRewardOverrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 10e18});
    config.registryRewardOverrides[1] = RegistryRewardOverride({registry: registry, sequencerReward: 5e18});

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardLib__DuplicateRegistryRewardOverride.selector, registry));
    _deploy(config);
  }

  function test_revertsWhenRegistryRewardOverrideExceedsDefaultSequencerReward() external {
    address registry = makeAddr("registry");
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    uint256 defaultSequencerReward = 25e18;
    uint96 overrideReward = uint96(defaultSequencerReward + 1);
    config.registryRewardOverrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: overrideReward});

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.RewardLib__RegistryRewardOverrideAboveDefault.selector, registry, overrideReward, defaultSequencerReward
      )
    );
    _deploy(config);
  }

  function test_revertsWhenZeroRegistryHasNonZeroReward() external {
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.registryRewardOverrides[0] = RegistryRewardOverride({registry: address(0), sequencerReward: 1});

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardLib__InvalidRegistryRewardOverride.selector, address(0), 1));
    _deploy(config);
  }

  function test_deploysWhenTargetCommitteeSizeIsMaximum() external {
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.targetCommitteeSize = MAXIMUM_COMMITTEE_SIZE;

    _deploy(config);
  }

  function test_revertsWhenTargetCommitteeSizeExceedsMaximum() external {
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.targetCommitteeSize = MAXIMUM_COMMITTEE_SIZE + 1;

    vm.expectRevert();
    _deploy(config);
  }

  function test_rewardConfigUpdateAllowsDefaultRewardBelowOverride() external {
    address registry = makeAddr("registry");
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.registryRewardOverrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 10e18});
    RegistryRewardOverridesRollupHarness rollup = _deploy(config);

    MutableRewardConfig memory updated = MutableRewardConfig({sequencerBps: Bps.wrap(5000), checkpointReward: 10e18});

    rollup.setRewardConfig(updated);

    assertEq(rollup.getRewardConfig().checkpointReward, updated.checkpointReward);
  }

  function test_rewardConfigUpdateAllowsOverrideAtDefaultRewardBoundary() external {
    address registry = makeAddr("registry");
    RollupConfigInput memory config = builder.getConfig().rollupConfigInput;
    config.registryRewardOverrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 10e18});
    RegistryRewardOverridesRollupHarness rollup = _deploy(config);

    MutableRewardConfig memory updated = MutableRewardConfig({sequencerBps: Bps.wrap(5000), checkpointReward: 20e18});
    rollup.setRewardConfig(updated);

    assertEq(rollup.getRewardConfig().checkpointReward, updated.checkpointReward);
  }

  function _deploy(RollupConfigInput memory _config) internal returns (RegistryRewardOverridesRollupHarness) {
    return new RegistryRewardOverridesRollupHarness(token, gse, verifier, address(this), genesisState, _config);
  }
}
