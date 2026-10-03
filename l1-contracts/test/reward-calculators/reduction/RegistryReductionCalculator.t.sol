// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {RegistryReductionCalculator} from "@test/reward-calculators/reduction/RegistryReductionCalculator.sol";
import {FakeGSE} from "@test/reward-calculators/mocks/FakeGSE.sol";
import {
  MockATP,
  MockATPStaker,
  MockATPStakerImplementation,
  deployMockATPStaker,
  deployMainnetShapedATPStaker,
  RevertingAddressGetter,
  VariableReturnDataAddressGetter,
  DirtyAddressGetter,
  GasBurningAddressGetter,
  ExpensiveAddressGetter,
  RawReturnGetter
} from "@test/reward-calculators/mocks/ATPMocks.sol";

/// @notice Unit tests of the reference registry reduction calculator.
contract RegistryReductionCalculatorTest is Test {
  uint256 internal constant DEFAULT_REWARD = 50e18;
  uint256 internal constant CHECKPOINT_REWARD = 100e18;
  uint96 internal constant REDUCED_REWARD = 10e18;
  Epoch internal constant EPOCH = Epoch.wrap(3);

  address internal owner = makeAddr("owner");
  address internal registry = makeAddr("registry");
  address internal otherRegistry = makeAddr("other registry");

  FakeGSE internal gse;
  RegistryReductionCalculator internal calculator;
  uint256 internal attesterCount;

  function setUp() public {
    gse = new FakeGSE();
    calculator = new RegistryReductionCalculator(IGSE(address(gse)), owner);
    vm.prank(owner);
    calculator.setRegistryReward(registry, REDUCED_REWARD);
  }

  // Construction and configuration

  function test_Constructor() external view {
    assertEq(address(calculator.GSE()), address(gse));
    assertEq(calculator.owner(), owner);
    assertEq(calculator.PROBE_GAS(), 20_000);
  }

  function test_RevertWhen_GSEHasNoCode() external {
    address gseWithoutCode = makeAddr("gse");
    vm.expectRevert(
      abi.encodeWithSelector(
        RegistryReductionCalculator.RegistryReductionCalculator__InvalidGSE.selector, gseWithoutCode
      )
    );
    new RegistryReductionCalculator(IGSE(gseWithoutCode), owner);
  }

  function test_RevertWhen_OwnerIsZero() external {
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
    new RegistryReductionCalculator(IGSE(address(gse)), address(0));
  }

  function test_RevertWhen_NonOwnerSetsARegistryReward(address _caller) external {
    vm.assume(_caller != owner);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    calculator.setRegistryReward(otherRegistry, 1);
  }

  function test_RevertWhen_NonOwnerRemovesARegistryReward(address _caller) external {
    vm.assume(_caller != owner);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    calculator.removeRegistryReward(registry);
  }

  function test_RevertWhen_RegistryIsZero() external {
    vm.expectRevert(RegistryReductionCalculator.RegistryReductionCalculator__ZeroRegistry.selector);
    vm.prank(owner);
    calculator.setRegistryReward(address(0), 1);
  }

  function test_RevertWhen_RemovingAnUnknownRegistry() external {
    vm.expectRevert(
      abi.encodeWithSelector(
        RegistryReductionCalculator.RegistryReductionCalculator__UnknownRegistry.selector, otherRegistry
      )
    );
    vm.prank(owner);
    calculator.removeRegistryReward(otherRegistry);
  }

  function test_SetRegistryReward(address _registry, uint96 _reward) external {
    vm.assume(_registry != address(0));
    vm.expectEmit(true, true, true, true, address(calculator));
    emit RegistryReductionCalculator.RegistryRewardSet(_registry, _reward);
    vm.prank(owner);
    calculator.setRegistryReward(_registry, _reward);

    (bool exists, uint96 reward) = calculator.getRegistryReward(_registry);
    assertTrue(exists);
    assertEq(reward, _reward);
  }

  function test_SetRegistryRewardOverwrites() external {
    address attester = _stakeThrough(registry);
    vm.prank(owner);
    calculator.setRegistryReward(registry, 20e18);
    assertEq(_rewardOf(attester), 20e18);
  }

  function test_RemoveRegistryReward() external {
    address attester = _stakeThrough(registry);
    assertEq(_rewardOf(attester), REDUCED_REWARD);

    vm.expectEmit(true, true, true, true, address(calculator));
    emit RegistryReductionCalculator.RegistryRewardRemoved(registry);
    vm.prank(owner);
    calculator.removeRegistryReward(registry);

    (bool exists, uint96 reward) = calculator.getRegistryReward(registry);
    assertFalse(exists);
    assertEq(reward, 0);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_GetRegistryRewardOfUnknownRegistry() external view {
    (bool exists, uint96 reward) = calculator.getRegistryReward(otherRegistry);
    assertFalse(exists);
    assertEq(reward, 0);
  }

  // Resolution

  function test_MatchingRegistryPaysTheEntry() external {
    assertEq(_rewardOf(_stakeThrough(registry)), REDUCED_REWARD);
  }

  function test_MainnetShapedPositionPaysTheEntry() external {
    // EIP-1167 clone ATP with an immutable registry, ERC1967 proxy staker with the ATP in storage.
    (address staker, address atp) =
      deployMainnetShapedATPStaker(new MockATP(registry), address(new MockATPStakerImplementation()));
    assertEq(IATPStaker(staker).getATP(), atp);
    assertEq(IATP(atp).getRegistry(), registry);
    address attester = _attesterWithWithdrawer(staker);

    (bool resolved, address resolvedRegistry) = calculator.resolveRegistry(attester);
    assertTrue(resolved);
    assertEq(resolvedRegistry, registry);
    assertEq(_rewardOf(attester), REDUCED_REWARD);
  }

  function test_UnknownRegistryPaysTheDefault() external {
    address attester = _stakeThrough(otherRegistry);
    (bool resolved, address resolvedRegistry) = calculator.resolveRegistry(attester);
    assertTrue(resolved);
    assertEq(resolvedRegistry, otherRegistry);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_ZeroEntryPaysZero() external {
    vm.prank(owner);
    calculator.setRegistryReward(registry, 0);
    assertEq(_rewardOf(_stakeThrough(registry)), 0);
  }

  function test_EntryAtOrAboveTheDefaultPaysTheDefault() external {
    address attester = _stakeThrough(registry);
    uint96[3] memory entries = [uint96(DEFAULT_REWARD), uint96(DEFAULT_REWARD + 1), type(uint96).max];
    for (uint256 i = 0; i < entries.length; i++) {
      vm.prank(owner);
      calculator.setRegistryReward(registry, entries[i]);
      assertEq(_rewardOf(attester), DEFAULT_REWARD);
    }
  }

  function test_CapFollowsTheDefault() external {
    // The cap is applied when the reward is computed, so lowering the default never makes the entry a premium.
    address attester = _stakeThrough(registry);
    assertEq(_rewardOf(attester, 50e18), REDUCED_REWARD);
    assertEq(_rewardOf(attester, REDUCED_REWARD), REDUCED_REWARD);
    assertEq(_rewardOf(attester, 4e18), 4e18);
    assertEq(_rewardOf(attester, 0), 0);
    assertEq(_rewardOf(attester, 1_000_000e18), REDUCED_REWARD);
  }

  function test_FuzzNeverPaysMoreThanTheDefault(uint256 _defaultReward, uint96 _entry, bool _listed) external {
    vm.prank(owner);
    calculator.setRegistryReward(registry, _entry);
    address attester = _stakeThrough(_listed ? registry : otherRegistry);
    uint256 expected = _listed ? (_entry < _defaultReward ? _entry : _defaultReward) : _defaultReward;
    assertEq(_rewardOf(attester, _defaultReward), expected);
  }

  function test_UnregisteredAttesterPaysTheDefault() external {
    // The GSE returns a zero withdrawer for an attester it does not know.
    _assertDefault(makeAddr("unknown attester"));
  }

  function test_EOAWithdrawerPaysTheDefault() external {
    _assertDefault(_attesterWithWithdrawer(makeAddr("eoa")));
  }

  function test_PrecompileWithdrawerPaysTheDefault() external {
    _assertDefault(_attesterWithWithdrawer(address(3)));
  }

  function test_ATPAsWithdrawerPaysTheDefault() external {
    // An ATP answers `getRegistry()` but not `getATP()`, so it is not a staker.
    _assertDefault(_attesterWithWithdrawer(address(new MockATP(registry))));
  }

  function test_ZeroATPPaysTheDefault() external {
    _assertDefault(_attesterWithWithdrawer(address(new MockATPStaker(address(0)))));
  }

  function test_EOAATPPaysTheDefault() external {
    _assertDefault(_attesterWithWithdrawer(address(new MockATPStaker(makeAddr("eoa")))));
  }

  function test_ZeroRegistryPaysTheDefault() external {
    _assertDefault(_stakeThrough(address(0)));
  }

  function test_FailingWithdrawerPaysTheDefault() external {
    address[] memory getters = _failingGetters();
    for (uint256 i = 0; i < getters.length; i++) {
      _assertDefault(_attesterWithWithdrawer(getters[i]));
    }
  }

  function test_FailingATPPaysTheDefault() external {
    address[] memory getters = _failingGetters();
    for (uint256 i = 0; i < getters.length; i++) {
      _assertDefault(_attesterWithWithdrawer(address(new MockATPStaker(getters[i]))));
    }
  }

  function test_FuzzMalformedWithdrawerAnswer(bytes memory _response, bool _reverts) external {
    address atp = address(new MockATP(registry));
    bool wellFormed = !_reverts && keccak256(_response) == keccak256(abi.encode(atp));
    address attester = _attesterWithWithdrawer(address(new RawReturnGetter(_response, _reverts)));
    assertEq(_rewardOf(attester), wellFormed ? REDUCED_REWARD : DEFAULT_REWARD);
  }

  function test_FuzzMalformedATPAnswer(bytes memory _response, bool _reverts) external {
    bool wellFormed = !_reverts && keccak256(_response) == keccak256(abi.encode(registry));
    address atp = address(new RawReturnGetter(_response, _reverts));
    address attester = _attesterWithWithdrawer(address(new MockATPStaker(atp)));
    assertEq(_rewardOf(attester), wellFormed ? REDUCED_REWARD : DEFAULT_REWARD);
  }

  function test_WellFormedAnswersThroughRawGettersPayTheEntry() external {
    // The fuzz tests above rarely hit the well-formed case; pin it.
    address atp = address(new RawReturnGetter(abi.encode(registry), false));
    address withdrawer = address(new RawReturnGetter(abi.encode(atp), false));
    assertEq(_rewardOf(_attesterWithWithdrawer(withdrawer)), REDUCED_REWARD);
  }

  function test_ExpensiveSuccessfulProbesPayTheEntry() external {
    // Probes that spend all but a few hundred gas of their stipend still resolve.
    address atp = address(new ExpensiveAddressGetter(registry));
    address withdrawer = address(new ExpensiveAddressGetter(atp));
    assertEq(_rewardOf(_attesterWithWithdrawer(withdrawer)), REDUCED_REWARD);
  }

  // Batching

  function test_EmptyProposers() external view {
    uint256[] memory rewards =
      calculator.getSequencerRewards(EPOCH, new address[](0), DEFAULT_REWARD, CHECKPOINT_REWARD);
    assertEq(rewards.length, 0);
  }

  function test_OutputHasOneRewardPerProposerInOrder() external {
    vm.prank(owner);
    calculator.setRegistryReward(otherRegistry, 20e18);
    address reduced = _stakeThrough(registry);
    address otherReduced = _stakeThrough(otherRegistry);
    address unlisted = _stakeThrough(makeAddr("unlisted registry"));
    address failing = _attesterWithWithdrawer(address(new GasBurningAddressGetter()));

    address[] memory proposers = new address[](7);
    proposers[0] = unlisted;
    proposers[1] = reduced;
    proposers[2] = failing;
    proposers[3] = otherReduced;
    proposers[4] = reduced;
    proposers[5] = unlisted;
    proposers[6] = otherReduced;
    uint256[] memory expected = new uint256[](7);
    expected[0] = DEFAULT_REWARD;
    expected[1] = REDUCED_REWARD;
    expected[2] = DEFAULT_REWARD;
    expected[3] = 20e18;
    expected[4] = REDUCED_REWARD;
    expected[5] = DEFAULT_REWARD;
    expected[6] = 20e18;

    assertEq(calculator.getSequencerRewards(EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD), expected);
  }

  function test_FuzzOutputMatchesPerProposerLookups(uint256 _seed, uint8 _count) external {
    uint256 n = bound(_count, 1, 32);
    address[6] memory pool = [
      _stakeThrough(registry),
      _stakeThrough(otherRegistry),
      _stakeThrough(registry),
      _attesterWithWithdrawer(address(new DirtyAddressGetter())),
      makeAddr("unknown attester"),
      _attesterWithWithdrawer(address(new MockATPStaker(address(new VariableReturnDataAddressGetter(33)))))
    ];
    address[] memory proposers = new address[](n);
    uint256[] memory expected = new uint256[](n);
    for (uint256 i = 0; i < n; i++) {
      proposers[i] = pool[uint256(keccak256(abi.encode(_seed, i))) % pool.length];
      expected[i] = _rewardOf(proposers[i]);
    }
    assertEq(calculator.getSequencerRewards(EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD), expected);
  }

  function test_RepeatedProposersAreResolvedOnce() external {
    (MockATPStaker staker, MockATP atp) = deployMockATPStaker(registry);
    address attester = _attesterWithWithdrawer(address(staker));
    address other = _stakeThrough(otherRegistry);

    address[] memory proposers = new address[](5);
    proposers[0] = attester;
    proposers[1] = other;
    proposers[2] = attester;
    proposers[3] = attester;
    proposers[4] = other;

    vm.expectCall(address(gse), abi.encodeCall(FakeGSE.getWithdrawer, (attester)), 1);
    vm.expectCall(address(gse), abi.encodeCall(FakeGSE.getWithdrawer, (other)), 1);
    vm.expectCall(address(staker), abi.encodeWithSelector(IATPStaker.getATP.selector), 1);
    vm.expectCall(address(atp), abi.encodeWithSelector(IATP.getRegistry.selector), 1);
    uint256[] memory rewards = calculator.getSequencerRewards(EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);

    assertEq(rewards.length, 5);
    assertEq(rewards[0], REDUCED_REWARD);
    assertEq(rewards[1], DEFAULT_REWARD);
    assertEq(rewards[2], REDUCED_REWARD);
    assertEq(rewards[3], REDUCED_REWARD);
    assertEq(rewards[4], DEFAULT_REWARD);
  }

  function test_AttestersSharingAStakerAreBothReduced() external {
    // The cache is per attester, so each attester is resolved on its own even when the withdrawer is shared.
    (MockATPStaker staker,) = deployMockATPStaker(registry);
    address[] memory proposers = new address[](2);
    proposers[0] = _attesterWithWithdrawer(address(staker));
    proposers[1] = _attesterWithWithdrawer(address(staker));

    vm.expectCall(address(staker), abi.encodeWithSelector(IATPStaker.getATP.selector), 2);
    uint256[] memory rewards = calculator.getSequencerRewards(EPOCH, proposers, DEFAULT_REWARD, CHECKPOINT_REWARD);
    assertEq(rewards[0], REDUCED_REWARD);
    assertEq(rewards[1], REDUCED_REWARD);
  }

  function test_IgnoresTheCallerEpochAndCheckpointReward(address _caller, uint256 _epoch, uint256 _checkpointReward)
    external
  {
    address[] memory proposers = new address[](2);
    proposers[0] = _stakeThrough(registry);
    proposers[1] = _stakeThrough(otherRegistry);
    vm.prank(_caller);
    uint256[] memory rewards =
      calculator.getSequencerRewards(Epoch.wrap(_epoch), proposers, DEFAULT_REWARD, _checkpointReward);
    assertEq(rewards[0], REDUCED_REWARD);
    assertEq(rewards[1], DEFAULT_REWARD);
  }

  function test_LookupsReflectTheCurrentWithdrawer() external {
    address attester = _stakeThrough(registry);
    assertEq(_rewardOf(attester), REDUCED_REWARD);
    (MockATPStaker staker,) = deployMockATPStaker(otherRegistry);
    gse.setWithdrawer(attester, address(staker));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  // Helpers

  function _failingGetters() internal returns (address[] memory getters) {
    getters = new address[](8);
    getters[0] = address(new RevertingAddressGetter());
    getters[1] = address(new VariableReturnDataAddressGetter(0));
    getters[2] = address(new VariableReturnDataAddressGetter(31));
    getters[3] = address(new VariableReturnDataAddressGetter(33));
    getters[4] = address(new DirtyAddressGetter());
    getters[5] = address(new GasBurningAddressGetter());
    getters[6] = address(new VariableReturnDataAddressGetter(64 * 1024));
    getters[7] = address(new VariableReturnDataAddressGetter(1024 * 1024));
  }

  function _stakeThrough(address _registry) internal returns (address attester) {
    (MockATPStaker staker,) = deployMockATPStaker(_registry);
    attester = _attesterWithWithdrawer(address(staker));
  }

  function _attesterWithWithdrawer(address _withdrawer) internal returns (address attester) {
    attester = address(uint160(uint256(keccak256(abi.encode("attester", ++attesterCount)))));
    gse.setWithdrawer(attester, _withdrawer);
  }

  function _assertDefault(address _attester) internal view {
    (bool resolved, address resolvedRegistry) = calculator.resolveRegistry(_attester);
    assertFalse(resolved, "resolved");
    assertEq(resolvedRegistry, address(0));
    assertEq(_rewardOf(_attester), DEFAULT_REWARD, "not the default");
  }

  function _rewardOf(address _attester) internal view returns (uint256) {
    return _rewardOf(_attester, DEFAULT_REWARD);
  }

  function _rewardOf(address _attester, uint256 _defaultReward) internal view returns (uint256) {
    address[] memory proposers = new address[](1);
    proposers[0] = _attester;
    uint256[] memory rewards = calculator.getSequencerRewards(EPOCH, proposers, _defaultReward, CHECKPOINT_REWARD);
    assertEq(rewards.length, 1);
    return rewards[0];
  }
}
