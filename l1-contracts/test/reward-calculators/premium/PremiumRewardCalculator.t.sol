// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Ownable} from "@oz/access/Ownable.sol";
import {Clones} from "@oz/proxy/Clones.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {MAX_SEQUENCER_REWARD_PER_CHECKPOINT} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {IATP, IATPStaker} from "@test/reward-calculators/IATP.sol";
import {
  IPremiumATP,
  IPremiumATPFactory,
  IPremiumATPStaker,
  IStakingRegistry
} from "@test/reward-calculators/premium/IPremiumATP.sol";
import {PremiumATP} from "@test/reward-calculators/premium/PremiumATP.sol";
import {PremiumATPFactory} from "@test/reward-calculators/premium/PremiumATPFactory.sol";
import {PremiumATPRegistry} from "@test/reward-calculators/premium/PremiumATPRegistry.sol";
import {PremiumATPStaker} from "@test/reward-calculators/premium/PremiumATPStaker.sol";
import {PremiumRewardCalculator} from "@test/reward-calculators/premium/PremiumRewardCalculator.sol";
import {FakeWithdrawer, ProbeTarget} from "@test/reward-calculators/premium/mocks/PremiumMocks.sol";
import {PremiumUnitBase} from "@test/reward-calculators/premium/PremiumUnitBase.sol";
import {FakeGSE} from "@test/reward-calculators/mocks/FakeGSE.sol";

/**
 * @notice Unit tests of the reference premium calculator: configuration, the lookup rules, one test per way of
 *         collecting a premium without an allocation-backed deposit, and griefing at every probe.
 */
contract PremiumRewardCalculatorTest is PremiumUnitBase {
  enum Probe {
    GetATP,
    GetRegistry,
    IsATP,
    GetStaker,
    IsAttester
  }

  struct ProbeChain {
    address attester;
    ProbeTarget withdrawer;
    ProbeTarget atp;
    ProbeTarget source;
    address registry;
  }

  uint256 internal chainCount;

  // Construction and configuration

  function test_Constructor() external view {
    assertEq(address(calculator.GSE()), address(gse));
    assertEq(calculator.owner(), governance);
    assertEq(calculator.PROBE_GAS(), 10_000);
  }

  function test_RevertWhen_GSEHasNoCode() external {
    address gseWithoutCode = makeAddr("gse");
    vm.expectRevert(
      abi.encodeWithSelector(PremiumRewardCalculator.PremiumRewardCalculator__InvalidGSE.selector, gseWithoutCode)
    );
    new PremiumRewardCalculator(IGSE(gseWithoutCode), governance);
  }

  function test_RevertWhen_OwnerIsZero() external {
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
    new PremiumRewardCalculator(IGSE(address(gse)), address(0));
  }

  function test_RevertWhen_NonOwnerSetsARegistryReward(address _caller) external {
    vm.assume(_caller != governance);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    calculator.setRegistryReward(makeAddr("other"), PREMIUM, address(factory));
  }

  function test_RevertWhen_NonOwnerRemovesARegistryReward(address _caller) external {
    vm.assume(_caller != governance);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    calculator.removeRegistryReward(address(registry));
  }

  function test_RevertWhen_RegistryIsZero() external {
    vm.expectRevert(PremiumRewardCalculator.PremiumRewardCalculator__ZeroRegistry.selector);
    vm.prank(governance);
    calculator.setRegistryReward(address(0), PREMIUM, address(factory));
  }

  function test_RevertWhen_RewardIsAboveTheRollupBound() external {
    uint96 tooHigh = uint96(MAX_SEQUENCER_REWARD_PER_CHECKPOINT + 1);
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumRewardCalculator.PremiumRewardCalculator__RewardAboveMaximum.selector,
        tooHigh,
        MAX_SEQUENCER_REWARD_PER_CHECKPOINT
      )
    );
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), tooHigh, address(factory));
  }

  function test_RevertWhen_ProvenanceSourceHasNoCode() external {
    address source = makeAddr("source");
    vm.expectRevert(
      abi.encodeWithSelector(PremiumRewardCalculator.PremiumRewardCalculator__InvalidProvenanceSource.selector, source)
    );
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), PREMIUM, source);
  }

  function test_RevertWhen_ProvenanceSourceIsBoundToAnotherGSE() external {
    PremiumRewardCalculator otherCalculator = new PremiumRewardCalculator(IGSE(address(new FakeGSE())), governance);
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumRewardCalculator.PremiumRewardCalculator__ProvenanceSourceOnAnotherGSE.selector,
        address(factory),
        address(gse)
      )
    );
    vm.prank(governance);
    otherCalculator.setRegistryReward(address(registry), PREMIUM, address(factory));
  }

  function test_RevertWhen_ProvenanceSourceReportsNoGSE() external {
    ProbeTarget source = new ProbeTarget();
    vm.expectRevert(
      abi.encodeWithSelector(
        PremiumRewardCalculator.PremiumRewardCalculator__ProvenanceSourceOnAnotherGSE.selector,
        address(source),
        address(0)
      )
    );
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), PREMIUM, address(source));
  }

  function test_RevertWhen_RemovingAnUnknownRegistry() external {
    address other = makeAddr("other");
    vm.expectRevert(
      abi.encodeWithSelector(PremiumRewardCalculator.PremiumRewardCalculator__UnknownRegistry.selector, other)
    );
    vm.prank(governance);
    calculator.removeRegistryReward(other);
  }

  function test_SetRegistryReward(address _registry, uint96 _reward, bool _withSource) external {
    vm.assume(_registry != address(0));
    _reward = uint96(bound(_reward, 0, MAX_SEQUENCER_REWARD_PER_CHECKPOINT));
    address source = _withSource ? address(factory) : address(0);
    vm.expectEmit(true, true, true, true, address(calculator));
    emit PremiumRewardCalculator.RegistryRewardSet(_registry, _reward, source);
    vm.prank(governance);
    calculator.setRegistryReward(_registry, _reward, source);

    (bool exists, uint96 reward, address provenanceSource) = calculator.getRegistryReward(_registry);
    assertTrue(exists);
    assertEq(reward, _reward);
    assertEq(provenanceSource, source);
  }

  function test_RemoveRegistryReward() external {
    (, PremiumATPStaker staker) = _position();
    address attester = _stake(staker);
    assertEq(_rewardOf(attester), PREMIUM);

    vm.expectEmit(true, true, true, true, address(calculator));
    emit PremiumRewardCalculator.RegistryRewardRemoved(address(registry));
    vm.prank(governance);
    calculator.removeRegistryReward(address(registry));

    (bool exists, uint96 reward, address source) = calculator.getRegistryReward(address(registry));
    assertFalse(exists);
    assertEq(reward, 0);
    assertEq(source, address(0));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  // Lookup rules

  function test_GenuinePositionEarnsThePremium() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position();
    address attester = _stake(staker);
    assertEq(_rewardOf(attester), PREMIUM);
    assertTrue(calculator.isAuthenticated(attester, address(staker), address(atp), address(factory)));
  }

  function test_EveryAttesterOfAPositionEarnsThePremium() external {
    (, PremiumATPStaker staker) = _position();
    address[] memory proposers = new address[](4);
    for (uint256 i = 0; i < 4; i++) {
      proposers[i] = _stake(staker);
    }
    uint256[] memory rewards = _rewardsOf(proposers);
    for (uint256 i = 0; i < 4; i++) {
      assertEq(rewards[i], PREMIUM);
    }
  }

  function test_PremiumWithoutAProvenanceSourcePaysTheDefault() external {
    (, PremiumATPStaker staker) = _position();
    address attester = _stake(staker);
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), PREMIUM, address(0));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_ReductionIsPaidWithoutAuthentication() external {
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), REDUCED, address(factory));
    (PremiumATP atp,) = _position();
    // A withdrawer that only claims to belong to the registry gets the reduction: it can only lower its own reward.
    address attester = _newAttester();
    gse.setWithdrawer(attester, address(new FakeWithdrawer(address(atp))));
    assertEq(_rewardOf(attester), REDUCED);
  }

  function test_ZeroRewardIsPaid() external {
    (, PremiumATPStaker staker) = _position();
    address attester = _stake(staker);
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), 0, address(0));
    assertEq(_rewardOf(attester), 0);
  }

  function test_EntryEqualToTheDefaultPaysTheDefault() external {
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), uint96(DEFAULT_REWARD), address(0));
    (PremiumATP atp,) = _position();
    address attester = _newAttester();
    gse.setWithdrawer(attester, address(new FakeWithdrawer(address(atp))));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_LoweringTheDefaultNeverMakesAnUnauthenticatedEntryAPremium(uint256 _defaultReward) external {
    _defaultReward = bound(_defaultReward, 0, REDUCED - 1);
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), REDUCED, address(0));
    (, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);
    assertEq(_rewardOf(genuine, _defaultReward), _defaultReward);
  }

  function test_LoweringTheDefaultTurnsAnEntryIntoAnAuthenticatedPremium(uint256 _defaultReward) external {
    _defaultReward = bound(_defaultReward, 0, REDUCED - 1);
    vm.prank(governance);
    calculator.setRegistryReward(address(registry), REDUCED, address(factory));
    (PremiumATP atp, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);
    address forged = _newAttester();
    gse.setWithdrawer(forged, address(new FakeWithdrawer(address(atp))));

    // Above the default, the entry is a reduction and anyone claiming the registry gets it.
    assertEq(_rewardOf(genuine), REDUCED);
    assertEq(_rewardOf(forged), REDUCED);
    // Below it, the same entry is a premium and only the genuine position earns it.
    assertEq(_rewardOf(genuine, _defaultReward), REDUCED);
    assertEq(_rewardOf(forged, _defaultReward), _defaultReward);
  }

  function test_UnregisteredAttesterEarnsTheDefault() external view {
    assertEq(_rewardOf(address(0xbeef)), DEFAULT_REWARD);
  }

  function test_UnknownRegistryEarnsTheDefault() external {
    (PremiumATPRegistry otherRegistry, PremiumATPFactory otherFactory) = _deployFactory(foundation);
    (, PremiumATPStaker staker) = _position(otherFactory, ALLOCATION);
    address attester = _stake(staker);
    assertEq(otherFactory.getRegistry(), address(otherRegistry));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_PositionAsWithdrawerEarnsTheDefault() external {
    (PremiumATP atp,) = _position();
    address attester = _newAttester();
    gse.setWithdrawer(attester, address(atp));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_FactoryAsWithdrawerEarnsTheDefault() external {
    address attester = _newAttester();
    gse.setWithdrawer(attester, address(factory));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_EmptyProposers() external view {
    assertEq(_rewardsOf(new address[](0)).length, 0);
  }

  // Attack: a withdrawer that points at someone else's genuine position.

  function test_FakeWithdrawerPointingAtAGenuinePositionEarnsTheDefault() external {
    (PremiumATP atp, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);
    address forged = _newAttester();
    FakeWithdrawer fake = new FakeWithdrawer(address(atp));
    gse.setWithdrawer(forged, address(fake));

    assertEq(IATP(IATPStaker(address(fake)).getATP()).getRegistry(), address(registry));
    assertTrue(factory.isATP(address(atp)));
    assertTrue(IPremiumATPStaker(address(fake)).isAttester(forged));
    assertFalse(calculator.isAuthenticated(forged, address(fake), address(atp), address(factory)));

    address[] memory proposers = new address[](2);
    proposers[0] = forged;
    proposers[1] = genuine;
    uint256[] memory rewards = _rewardsOf(proposers);
    assertEq(rewards[0], DEFAULT_REWARD);
    assertEq(rewards[1], PREMIUM);
  }

  function test_StakerCloneBindsToWhoeverInitializesIt() external {
    (PremiumATP atp,) = _position();
    PremiumATPStaker rogue = PremiumATPStaker(Clones.clone(address(factory.getStakerImplementation())));
    vm.prank(attacker);
    rogue.initialize();
    assertEq(rogue.getATP(), attacker);

    address attester = _newAttester();
    gse.setWithdrawer(attester, address(rogue));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
    assertTrue(atp.getStaker() != address(rogue));
  }

  // Attack: a position that the factory did not create.

  function test_PositionFromAnAttackerImplementationEarnsTheDefault() external {
    // The attacker deploys the genuine position code itself, so it may initialize clones of it, and gives the clone
    // a huge allocation funded with liquid tokens. Everything answers like a genuine position except the factory.
    vm.startPrank(attacker);
    PremiumATP implementation = new PremiumATP(registry, token, address(factory.getStakerImplementation()));
    PremiumATP clone = PremiumATP(Clones.clone(address(implementation)));
    clone.initialize(attacker, 100 * THRESHOLD);
    clone.updateStakerOperator(attacker);
    vm.stopPrank();
    token.mint(address(clone), 100 * THRESHOLD);

    PremiumATPStaker staker = PremiumATPStaker(clone.getStaker());
    address attester = _newAttester();
    vm.prank(attacker);
    staker.stake(1, attester, BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false);
    gse.setWithdrawer(attester, address(staker));

    assertEq(clone.getRegistry(), address(registry));
    assertEq(staker.getATP(), address(clone));
    assertTrue(staker.isAttester(attester));
    assertFalse(factory.isATP(address(clone)));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_PositionFromAnAttackerFactoryOfTheSameRegistryEarnsTheDefault() external {
    PremiumATPFactory attackerFactory = new PremiumATPFactory(
      attacker, token, registry, IRegistry(address(rollupRegistry)), IGSE(address(gse)), IStakingRegistry(address(0))
    );
    (PremiumATP atp, PremiumATPStaker staker) = _position(attackerFactory, 100 * THRESHOLD);
    address attester = _stake(staker);

    assertEq(atp.getRegistry(), address(registry));
    assertTrue(attackerFactory.isATP(address(atp)));
    assertFalse(factory.isATP(address(atp)));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_CloneOfTheGenuineImplementationCannotBeInitialized(address _caller) external {
    vm.assume(_caller != address(factory));
    PremiumATP clone = PremiumATP(Clones.clone(address(factory.getATPImplementation())));
    vm.expectRevert(abi.encodeWithSelector(PremiumATP.PremiumATP__NotFactory.selector, _caller));
    vm.prank(_caller);
    clone.initialize(_caller, ALLOCATION);
  }

  // Attack: liquid stake that names a genuine staker as its withdrawer.

  function test_LiquidDepositNamingAGenuineStakerEarnsTheDefault() external {
    (, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);
    address liquid = _newAttester();
    gse.setWithdrawer(liquid, address(staker));

    address[] memory proposers = new address[](2);
    proposers[0] = liquid;
    proposers[1] = genuine;
    uint256[] memory rewards = _rewardsOf(proposers);
    assertEq(rewards[0], DEFAULT_REWARD);
    assertEq(rewards[1], PREMIUM);
  }

  // Attack: confusing a cache keyed by registry or position. The cache is per attester, so the order of genuine and
  // forged proposers sharing a registry, position or staker does not matter.

  function test_GenuineThenForgedProposersOfTheSameRegistry() external {
    _assertCacheIsPerAttester(true);
  }

  function test_ForgedThenGenuineProposersOfTheSameRegistry() external {
    _assertCacheIsPerAttester(false);
  }

  function _assertCacheIsPerAttester(bool _genuineFirst) internal {
    (PremiumATP atp, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);

    // Same position, fake withdrawer.
    address viaFakeWithdrawer = _newAttester();
    gse.setWithdrawer(viaFakeWithdrawer, address(new FakeWithdrawer(address(atp))));
    // Same staker, liquid deposit.
    address viaGenuineStaker = _newAttester();
    gse.setWithdrawer(viaGenuineStaker, address(staker));
    // Same registry, position from another factory.
    PremiumATPFactory attackerFactory = new PremiumATPFactory(
      attacker, token, registry, IRegistry(address(rollupRegistry)), IGSE(address(gse)), IStakingRegistry(address(0))
    );
    (, PremiumATPStaker forgedStaker) = _position(attackerFactory, ALLOCATION);
    address viaForgedPosition = _stake(forgedStaker);

    address[] memory forged = new address[](3);
    forged[0] = viaFakeWithdrawer;
    forged[1] = viaGenuineStaker;
    forged[2] = viaForgedPosition;

    address[] memory proposers = new address[](8);
    for (uint256 i = 0; i < 8; i++) {
      bool genuineSlot = _genuineFirst ? i % 2 == 0 : i % 2 == 1;
      proposers[i] = genuineSlot ? genuine : forged[(i / 2) % 3];
    }
    uint256[] memory rewards = _rewardsOf(proposers);
    for (uint256 i = 0; i < 8; i++) {
      assertEq(rewards[i], proposers[i] == genuine ? PREMIUM : DEFAULT_REWARD);
    }
  }

  // A genuine staker of another registry is paid that registry's entry, never this one's.

  function test_GenuineStakerOfAnotherRegistry() external {
    (PremiumATPRegistry otherRegistry, PremiumATPFactory otherFactory) = _deployFactory(foundation);
    (, PremiumATPStaker otherStaker) = _position(otherFactory, ALLOCATION);
    address other = _stake(otherStaker);
    (, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);

    address[] memory proposers = new address[](2);
    proposers[0] = other;
    proposers[1] = genuine;

    // No entry: the default.
    uint256[] memory rewards = _rewardsOf(proposers);
    assertEq(rewards[0], DEFAULT_REWARD);
    assertEq(rewards[1], PREMIUM);

    // Its own reduction.
    vm.prank(governance);
    calculator.setRegistryReward(address(otherRegistry), REDUCED, address(0));
    rewards = _rewardsOf(proposers);
    assertEq(rewards[0], REDUCED);
    assertEq(rewards[1], PREMIUM);

    // Its own premium, authenticated against its own factory.
    vm.prank(governance);
    calculator.setRegistryReward(address(otherRegistry), PREMIUM + 1, address(otherFactory));
    rewards = _rewardsOf(proposers);
    assertEq(rewards[0], PREMIUM + 1);
    assertEq(rewards[1], PREMIUM);

    // A premium paired with the wrong factory authenticates nothing.
    vm.prank(governance);
    calculator.setRegistryReward(address(otherRegistry), PREMIUM + 1, address(factory));
    rewards = _rewardsOf(proposers);
    assertEq(rewards[0], DEFAULT_REWARD);
    assertEq(rewards[1], PREMIUM);
  }

  function test_ReleasedAttesterEarnsTheDefault() external {
    (, PremiumATPStaker staker) = _position();
    address attester = _stake(staker);
    assertEq(_rewardOf(attester), PREMIUM);
    vm.prank(operator);
    staker.release(attester);
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  // Caching and output shape

  function test_RepeatedProposersAreResolvedOnce() external {
    (, PremiumATPStaker staker) = _position();
    address a = _stake(staker);
    address b = _stake(staker);
    address[] memory proposers = new address[](6);
    proposers[0] = a;
    proposers[1] = b;
    proposers[2] = a;
    proposers[3] = a;
    proposers[4] = b;
    proposers[5] = a;

    vm.expectCall(address(gse), abi.encodeCall(IGSE.getWithdrawer, (a)), 1);
    vm.expectCall(address(gse), abi.encodeCall(IGSE.getWithdrawer, (b)), 1);
    vm.expectCall(address(staker), abi.encodeCall(IPremiumATPStaker.isAttester, (a)), 1);
    vm.expectCall(address(staker), abi.encodeCall(IPremiumATPStaker.isAttester, (b)), 1);
    uint256[] memory rewards = _rewardsOf(proposers);
    for (uint256 i = 0; i < 6; i++) {
      assertEq(rewards[i], PREMIUM);
    }
  }

  function test_OutputFollowsTheProposers(uint256 _seed) external {
    (, PremiumATPStaker staker) = _position();
    address[4] memory pool;
    uint256[4] memory expected;
    pool[0] = _stake(staker);
    expected[0] = PREMIUM;
    pool[1] = _newAttester();
    gse.setWithdrawer(pool[1], address(staker));
    expected[1] = DEFAULT_REWARD;
    pool[2] = _stake(staker);
    expected[2] = PREMIUM;
    pool[3] = _newAttester();
    expected[3] = DEFAULT_REWARD;

    uint256 n = bound(_seed, 1, 32);
    address[] memory proposers = new address[](n);
    for (uint256 i = 0; i < n; i++) {
      proposers[i] = pool[uint256(keccak256(abi.encode(_seed, i))) % 4];
    }
    uint256[] memory rewards = _rewardsOf(proposers);
    assertEq(rewards.length, n);
    for (uint256 i = 0; i < n; i++) {
      for (uint256 k = 0; k < 4; k++) {
        if (proposers[i] == pool[k]) {
          assertEq(rewards[i], expected[k]);
        }
      }
    }
  }

  // Griefing: each of the five probes made hostile on its own, behind probes that answer well. Every case pays the
  // default without reverting, and a genuine proposer in the same call still earns its premium.

  function test_ScriptedChainEarnsThePremium() external {
    ProbeChain memory chain = _scriptedChain();
    assertEq(_rewardOf(chain.attester), PREMIUM);
  }

  function test_HostileGetATPProbe() external {
    _assertHostileProbe(Probe.GetATP);
  }

  function test_HostileGetRegistryProbe() external {
    _assertHostileProbe(Probe.GetRegistry);
  }

  function test_HostileIsATPProbe() external {
    _assertHostileProbe(Probe.IsATP);
  }

  function test_HostileGetStakerProbe() external {
    _assertHostileProbe(Probe.GetStaker);
  }

  function test_HostileIsAttesterProbe() external {
    _assertHostileProbe(Probe.IsAttester);
  }

  function test_WithdrawerWithoutCodeEarnsTheDefault() external {
    address attester = _newAttester();
    gse.setWithdrawer(attester, makeAddr("eoa withdrawer"));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_PositionWithoutCodeEarnsTheDefault() external {
    address attester = _newAttester();
    gse.setWithdrawer(attester, address(new FakeWithdrawer(makeAddr("eoa position"))));
    assertEq(_rewardOf(attester), DEFAULT_REWARD);
  }

  function test_ExpensiveButWellFormedAnswersArePaid() external {
    // Burning almost the whole stipend is not a failure: the answers are checked, not the cost.
    ProbeChain memory chain = _scriptedChain();
    chain.withdrawer.expensive(IATPStaker.getATP.selector, uint256(uint160(address(chain.atp))));
    chain.atp.expensive(IATP.getRegistry.selector, uint256(uint160(chain.registry)));
    chain.source.expensive(IPremiumATPFactory.isATP.selector, 1);
    chain.atp.expensive(IPremiumATP.getStaker.selector, uint256(uint160(address(chain.withdrawer))));
    chain.withdrawer.expensive(IPremiumATPStaker.isAttester.selector, 1);
    assertEq(_rewardOf(chain.attester), PREMIUM);
  }

  function test_FuzzScriptedProbesNeverRevertAndPayPremiumsOnlyToWellFormedChains(
    uint8[5] memory _modes,
    uint256[5] memory _words,
    uint16[5] memory _sizes
  ) external {
    ProbeChain memory chain = _scriptedChain();
    bool wellFormed = true;
    for (uint256 p = 0; p < 5; p++) {
      ProbeTarget.Mode mode = ProbeTarget.Mode(bound(_modes[p], 0, 5));
      (ProbeTarget target, bytes4 selector) = _probeTarget(chain, Probe(p));
      if ((mode == ProbeTarget.Mode.Answer || mode == ProbeTarget.Mode.Expensive) && _words[p] % 2 == 0) {
        // Keep the scripted answer half of the time, so that fully well-formed chains are exercised too.
        target.setResponse(selector, mode, _expectedWord(chain, Probe(p)), 32);
        continue;
      }
      uint256 size = mode == ProbeTarget.Mode.ReturnSize ? _sizes[p] : 32;
      target.setResponse(selector, mode, _words[p], size);
      wellFormed = wellFormed && _isWellFormed(chain, Probe(p), mode, _words[p], size);
    }
    (, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);
    address[] memory proposers = new address[](2);
    proposers[0] = chain.attester;
    proposers[1] = genuine;
    uint256[] memory rewards = _rewardsOf(proposers);
    assertEq(rewards[0], wellFormed ? PREMIUM : DEFAULT_REWARD);
    assertEq(rewards[1], PREMIUM);
  }

  function _assertHostileProbe(Probe _probe) internal {
    (, PremiumATPStaker staker) = _position();
    address genuine = _stake(staker);

    uint256 caseCount = 15;
    for (uint256 c = 0; c < caseCount; c++) {
      ProbeChain memory chain = _scriptedChain();
      (ProbeTarget target, bytes4 selector) = _probeTarget(chain, _probe);
      uint256 expected = _expectedWord(chain, _probe);
      bool isBool = _probe == Probe.IsATP || _probe == Probe.IsAttester;
      if (c == 0) {
        target.setResponse(selector, ProbeTarget.Mode.Revert, expected, 32);
      } else if (c == 1) {
        target.setResponse(selector, ProbeTarget.Mode.Unset, 0, 0);
      } else if (c == 2) {
        target.setResponse(selector, ProbeTarget.Mode.Burn, 0, 0);
      } else if (c <= 6) {
        uint256[4] memory sizes = [uint256(0), 31, 33, 64];
        target.setResponse(selector, ProbeTarget.Mode.ReturnSize, expected, sizes[c - 3]);
      } else if (c == 7) {
        // Oversized return data within the stipend: the call succeeds and is rejected for its size alone.
        target.setResponse(selector, ProbeTarget.Mode.ReturnSize, expected, SUCCESSFUL_RETURN_BOMB_SIZE);
        (bool success, uint256 size) = _rawProbe(address(target), selector, calculator.PROBE_GAS());
        assertTrue(success, "the oversized return must fit the probe stipend");
        assertEq(size, SUCCESSFUL_RETURN_BOMB_SIZE, "oversized return data size");
      } else if (c <= 9) {
        // Return bombs too large to expand memory for within the stipend: the probe runs out of gas.
        target.setResponse(selector, ProbeTarget.Mode.ReturnSize, expected, c == 8 ? 64 * 1024 : 1024 * 1024);
        (bool success,) = _rawProbe(address(target), selector, calculator.PROBE_GAS());
        assertFalse(success, "the return bomb must run out of the probe stipend");
      } else if (c == 10) {
        // Dirty: upper bits set on an address, a non-canonical bool.
        target.setResponse(selector, ProbeTarget.Mode.Answer, isBool ? 2 : expected | (1 << 160), 32);
      } else if (c == 11) {
        target.setResponse(selector, ProbeTarget.Mode.Answer, isBool ? 1 << 255 | 1 : expected | (1 << 255), 32);
      } else if (c == 12) {
        // Well formed but wrong: false, or zero.
        target.setResponse(selector, ProbeTarget.Mode.Answer, 0, 32);
      } else if (c == 13) {
        // Well formed but wrong: another contract.
        target.setResponse(selector, ProbeTarget.Mode.Answer, isBool ? 0 : uint256(uint160(address(staker))), 32);
      } else {
        // Expensive and wrong.
        target.setResponse(selector, ProbeTarget.Mode.Expensive, isBool ? 0 : uint256(uint160(attacker)), 32);
      }

      address[] memory proposers = new address[](3);
      proposers[0] = chain.attester;
      proposers[1] = genuine;
      proposers[2] = chain.attester;
      uint256[] memory rewards = _rewardsOf(proposers);
      assertEq(rewards[0], DEFAULT_REWARD, string.concat("hostile case ", vm.toString(c)));
      assertEq(rewards[1], PREMIUM, string.concat("genuine, case ", vm.toString(c)));
      assertEq(rewards[2], DEFAULT_REWARD, string.concat("repeated, case ", vm.toString(c)));
    }
  }

  /// @dev A withdrawer, position and provenance source that answer every probe like a genuine position, for a
  ///      registry of their own with a premium entry.
  function _scriptedChain() internal returns (ProbeChain memory chain) {
    chainCount++;
    chain.attester = _newAttester();
    chain.withdrawer = new ProbeTarget();
    chain.atp = new ProbeTarget();
    chain.source = new ProbeTarget();
    chain.registry = makeAddr(string.concat("scripted registry ", vm.toString(chainCount)));

    chain.withdrawer.answer(IATPStaker.getATP.selector, address(chain.atp));
    chain.atp.answer(IATP.getRegistry.selector, chain.registry);
    chain.source.answer(IPremiumATPFactory.isATP.selector, true);
    chain.atp.answer(IPremiumATP.getStaker.selector, address(chain.withdrawer));
    chain.withdrawer.answer(IPremiumATPStaker.isAttester.selector, true);
    chain.source.answer(IPremiumATPFactory.getGSE.selector, address(gse));

    gse.setWithdrawer(chain.attester, address(chain.withdrawer));
    vm.prank(governance);
    calculator.setRegistryReward(chain.registry, PREMIUM, address(chain.source));
  }

  function _probeTarget(ProbeChain memory _chain, Probe _probe) internal pure returns (ProbeTarget, bytes4) {
    if (_probe == Probe.GetATP) {
      return (_chain.withdrawer, IATPStaker.getATP.selector);
    }
    if (_probe == Probe.GetRegistry) {
      return (_chain.atp, IATP.getRegistry.selector);
    }
    if (_probe == Probe.IsATP) {
      return (_chain.source, IPremiumATPFactory.isATP.selector);
    }
    if (_probe == Probe.GetStaker) {
      return (_chain.atp, IPremiumATP.getStaker.selector);
    }
    return (_chain.withdrawer, IPremiumATPStaker.isAttester.selector);
  }

  function _expectedWord(ProbeChain memory _chain, Probe _probe) internal pure returns (uint256) {
    if (_probe == Probe.GetATP) {
      return uint256(uint160(address(_chain.atp)));
    }
    if (_probe == Probe.GetRegistry) {
      return uint256(uint160(_chain.registry));
    }
    if (_probe == Probe.GetStaker) {
      return uint256(uint160(address(_chain.withdrawer)));
    }
    return 1;
  }

  function _isWellFormed(ProbeChain memory _chain, Probe _probe, ProbeTarget.Mode _mode, uint256 _word, uint256 _size)
    internal
    pure
    returns (bool)
  {
    bool answers = _mode == ProbeTarget.Mode.Answer || _mode == ProbeTarget.Mode.Expensive
      || (_mode == ProbeTarget.Mode.ReturnSize && _size == 32);
    return answers && _word == _expectedWord(_chain, _probe);
  }
}
