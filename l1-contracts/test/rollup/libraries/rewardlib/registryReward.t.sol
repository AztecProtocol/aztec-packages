// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLibBase} from "./RewardLibBase.sol";
import {
  IRegistryProvider,
  Bps,
  MutableRewardConfig,
  RegistryRewardOverride,
  MAX_REGISTRY_REWARD_OVERRIDES
} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Epoch, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {MAXIMUM_COMMITTEE_SIZE} from "@aztec/core/interfaces/IValidatorSelection.sol";

contract RewardRegistryProvider is IRegistryProvider {
  address internal immutable registry;

  constructor(address _registry) {
    registry = _registry;
  }

  function getRegistry() external view returns (address) {
    return registry;
  }
}

contract RegistryRewardTest is RewardLibBase {
  function test_WhenWithdrawerRegistryMatchesOverride() external prepare(100e18, 5000) {
    address attester = makeAddr("attester");
    address registry = makeAddr("registry");
    RewardRegistryProvider provider = new RewardRegistryProvider(registry);
    wrapper.setWithdrawer(attester, address(provider));

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[1] = RegistryRewardOverride({registry: registry, sequencerReward: 10e18});

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), _singletonCommittee(attester), overrides);

    _assertRewards(10e18, 50e18);
  }

  function test_WhenOverrideExceedsUpdatedDefaultReward_CapsAtDefault() external prepare(100e18, 5000) {
    address attester = makeAddr("attester");
    address registry = makeAddr("registry");
    RewardRegistryProvider provider = new RewardRegistryProvider(registry);
    wrapper.setWithdrawer(attester, address(provider));

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 40e18});

    wrapper.updateRewardConfig(MutableRewardConfig({sequencerBps: Bps.wrap(5000), checkpointReward: 60e18}));
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), _singletonCommittee(attester), overrides);

    _assertRewards(30e18, 30e18);
  }

  function test_WhenWithdrawerRegistryMatchesZeroRewardOverrideAcrossCheckpoints() external prepare(100e18, 5000) {
    address attester = makeAddr("attester");
    address registry = makeAddr("registry");
    RewardRegistryProvider provider = new RewardRegistryProvider(registry);
    wrapper.setWithdrawer(attester, address(provider));

    args.end = args.start + 1;
    _setHeaders(2, sequencer);
    _addFeeHeaders(1);

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 0});

    vm.expectCall(address(wrapper.gse()), abi.encodeWithSignature("getWithdrawer(address)", attester), 1);
    vm.expectCall(address(provider), abi.encodeWithSelector(IRegistryProvider.getRegistry.selector), 1);
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), _singletonCommittee(attester), overrides);

    _assertRewards(0, 100e18);
  }

  function test_WhenZeroRewardProposerAtIndex255Repeats_CachesReward() external prepare(100e18, 5000) {
    address registry = makeAddr("registry");
    RewardRegistryProvider provider = new RewardRegistryProvider(registry);

    address[] memory committee = new address[](MAXIMUM_COMMITTEE_SIZE);
    for (uint256 i = 0; i < committee.length; i++) {
      committee[i] = address(uint160(0x1000 + i));
    }
    committee[255] = makeAddr("attester255");
    wrapper.setWithdrawer(committee[255], address(provider));

    Slot firstSlot = _findSlotForProposerIndex(255, committee.length, 0);
    Slot secondSlot = _findSlotForProposerIndex(255, committee.length, Slot.unwrap(firstSlot) + 1);

    args.end = args.start + 1;
    _setHeaders(2, sequencer);
    _addFeeHeaders(1);
    args.headers[0].slotNumber = firstSlot;
    args.headers[1].slotNumber = secondSlot;

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 0});

    vm.expectCall(address(wrapper.gse()), abi.encodeWithSignature("getWithdrawer(address)", committee[255]), 1);
    vm.expectCall(address(provider), abi.encodeWithSelector(IRegistryProvider.getRegistry.selector), 1);
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), committee, overrides);

    _assertRewards(0, 100e18);
  }

  function test_WhenCommitteeMembersShareWithdrawer_AppliesOverrideToBoth() external prepare(100e18, 5000) {
    address registry = makeAddr("registry");
    RewardRegistryProvider provider = new RewardRegistryProvider(registry);
    address[] memory committee = new address[](2);
    committee[0] = makeAddr("attester0");
    committee[1] = makeAddr("attester1");
    wrapper.setWithdrawer(committee[0], address(provider));
    wrapper.setWithdrawer(committee[1], address(provider));

    args.end = args.start + 1;
    _setHeaders(2, sequencer);
    _addFeeHeaders(1);
    args.headers[0].slotNumber = Slot.wrap(0);

    uint256 firstProposerIndex = wrapper.getProposerIndex(Epoch.wrap(0), Slot.wrap(0), committee.length);
    bool foundDistinctProposer;
    // look for the first slot with the other attester
    for (uint256 slotNumber = 1; slotNumber < 256; slotNumber++) {
      Slot slot = Slot.wrap(slotNumber);
      if (wrapper.getProposerIndex(Epoch.wrap(0), slot, committee.length) != firstProposerIndex) {
        args.headers[1].slotNumber = slot;
        foundDistinctProposer = true;
        break;
      }
    }
    assertTrue(foundDistinctProposer);

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: registry, sequencerReward: 10e18});

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), committee, overrides);

    _assertRewards(20e18, 100e18);
  }

  function test_WhenWithdrawerRegistryDoesNotMatchOverride() external prepare(100e18, 5000) {
    address attester = makeAddr("attester");
    RewardRegistryProvider provider = new RewardRegistryProvider(makeAddr("unknownRegistry"));
    wrapper.setWithdrawer(attester, address(provider));

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: makeAddr("configuredRegistry"), sequencerReward: 10e18});

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), _singletonCommittee(attester), overrides);

    // the override was 10e18 so we check the reward was not the overriden value
    _assertRewards(50e18, 50e18);
  }

  function test_WhenWithdrawerDoesNotRespondWithRegistry() external prepare(100e18, 5000) {
    address attester = makeAddr("attester");
    wrapper.setWithdrawer(attester, makeAddr("eoaWithdrawer"));

    RegistryRewardOverride[MAX_REGISTRY_REWARD_OVERRIDES] memory overrides;
    overrides[0] = RegistryRewardOverride({registry: makeAddr("configuredRegistry"), sequencerReward: 10e18});

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0), _singletonCommittee(attester), overrides);

    _assertRewards(50e18, 50e18);
  }

  function _singletonCommittee(address _attester) internal pure returns (address[] memory committee) {
    committee = new address[](1);
    committee[0] = _attester;
  }

  function _findSlotForProposerIndex(uint256 _targetIndex, uint256 _committeeSize, uint256 _from)
    internal
    view
    returns (Slot)
  {
    for (uint256 slotNumber = _from; slotNumber < _from + 10_000; slotNumber++) {
      Slot slot = Slot.wrap(slotNumber);
      if (wrapper.getProposerIndex(Epoch.wrap(0), slot, _committeeSize) == _targetIndex) {
        return slot;
      }
    }

    revert("proposer index not found");
  }

  function _assertRewards(uint256 _sequencerReward, uint256 _proverReward) internal view {
    assertEq(wrapper.getSequencerRewards(sequencer), _sequencerReward);
    assertEq(wrapper.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)), _proverReward);
  }
}
