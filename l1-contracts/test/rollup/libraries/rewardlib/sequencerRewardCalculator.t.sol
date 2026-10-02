// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {TestBase} from "@test/base/Base.sol";
import {RewardLibWrapper} from "./RewardLibWrapper.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {SubmitEpochRootProofArgs, ProvenCheckpointFees} from "@aztec/core/interfaces/IRollup.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {MAX_SEQUENCER_REWARD_PER_CHECKPOINT} from "@aztec/core/libraries/rollup/SequencerRewardCalculatorLib.sol";
import {Epoch, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {
  ListCalculator,
  RawReturnCalculator,
  RevertingCalculator,
  GasBurningCalculator,
  ReturnBombCalculator,
  StateModifyingCalculator,
  TableCalculator
} from "@test/mock/SequencerRewardCalculatorMocks.sol";

/// @notice Reward distribution with a sequencer reward calculator, through RewardLib.handleRewardsAndFees.
/// @dev Every expectation comes from an oracle written here: `_legacy` is the reward split of a rollup without a
///      calculator, `_calculated` the split the AZIP specifies for an accepted response.
contract SequencerRewardCalculatorTest is TestBase {
  uint256 internal constant COMMITTEE_SIZE = 48;
  Epoch internal constant EPOCH = Epoch.wrap(0);

  RewardLibWrapper internal wrapper;
  IERC20 internal feeAsset;
  uint256 internal checkpointReward;
  uint256 internal sequencerBps;
  address[] internal committee;

  SubmitEpochRootProofArgs internal args;

  struct Outcome {
    uint256[] sequencerRewards;
    uint256 proverRewards;
    uint256 claimed;
  }

  struct FeeExpectation {
    uint256[] sequencer;
    uint256 prover;
    uint256 protocol;
    uint256 fees;
  }

  function test_ZeroCalculatorMatchesLegacy(uint8 _count, uint96 _checkpointReward, uint32 _bps, uint256 _balance)
    external
  {
    uint256 n = bound(_count, 1, 32);
    _deploy(_checkpointReward, _bps);
    uint256 balance = _fund(_balance, n);
    assertEq(wrapper.getSequencerRewardCalculator(), address(0));

    Outcome memory outcome = _prove(n, committee);
    _assertOutcome(outcome, _legacy(n, balance));
  }

  function test_EmptyCommitteeSkipsTheCalculator(uint8 _count, uint96 _checkpointReward, uint32 _bps, uint256 _balance)
    external
  {
    uint256 n = bound(_count, 1, 32);
    _deploy(_checkpointReward, _bps);
    uint256 balance = _fund(_balance, n);
    address calculator = address(new ListCalculator(_values(n, 1)));
    wrapper.setSequencerRewardCalculator(calculator);

    vm.expectCall(calculator, "", 0);
    Outcome memory outcome = _prove(n, new address[](0));
    _assertOutcome(outcome, _legacy(n, balance));
  }

  function test_DefaultCalculatorMatchesZeroCalculator(uint8 _count, uint96 _checkpointReward, uint32 _bps) external {
    uint256 n = bound(_count, 1, 32);
    _deploy(_checkpointReward, _bps);
    uint256 balance = _fund(type(uint256).max, n);
    wrapper.setSequencerRewardCalculator(address(new TableCalculator()));

    Outcome memory outcome = _prove(n, committee);
    _assertOutcome(outcome, _legacy(n, balance));
  }

  function test_DefaultCalculatorMatchesZeroCalculatorUnderShortfall(
    uint8 _count,
    uint64 _checkpointRewardInTokens,
    uint32 _bps,
    uint256 _balance
  ) external {
    // With a whole-token checkpoint reward, `checkpointReward * sequencerBps` divides by 10_000, and the
    // proportional scaling of the default rounds exactly like the even split of the original path.
    uint256 n = bound(_count, 1, 32);
    _deploy(uint96(bound(_checkpointRewardInTokens, 1, 10_000)) * 1e18, _bps);
    uint256 balance = bound(_balance, 0, n * checkpointReward - 1);
    deal(address(feeAsset), address(wrapper.rewardDistributor()), balance);
    wrapper.setSequencerRewardCalculator(address(new TableCalculator()));

    Outcome memory outcome = _prove(n, committee);
    _assertOutcome(outcome, _legacy(n, balance));
  }

  function test_PaysBelowEqualAndAboveTheDefault() external {
    _deploy(100e18, 7000);
    uint256 defaultReward = 70e18;
    uint256[] memory values = new uint256[](7);
    values[0] = 0;
    values[1] = defaultReward / 2;
    values[2] = defaultReward;
    values[3] = defaultReward + 1;
    values[4] = 2 * checkpointReward;
    values[5] = 1000 * checkpointReward;
    values[6] = MAX_SEQUENCER_REWARD_PER_CHECKPOINT;
    uint256 balance = _fund(type(uint256).max, values.length);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(values)));

    Outcome memory outcome = _prove(values.length, committee);
    Outcome memory expected = _calculated(values, balance);
    _assertOutcome(outcome, expected);

    // Paid exactly, premiums included: there is no clamp below MAX_SEQUENCER_REWARD_PER_CHECKPOINT.
    assertEq(outcome.sequencerRewards, values, "values not paid exactly");
    // Without a shortfall, the prover share does not depend on the calculator.
    assertEq(outcome.proverRewards, values.length * (checkpointReward - defaultReward), "prover share");
    // Only the desired draw is claimed.
    uint256 desired = values.length * (checkpointReward - defaultReward);
    for (uint256 i = 0; i < values.length; i++) {
      desired += values[i];
    }
    assertEq(outcome.claimed, desired, "claimed more than desired");
  }

  function test_PremiumsUpToMaxArePaidInFull() external {
    _deploy(500e18, 7000);
    uint256 n = 32;
    uint256[] memory values = new uint256[](n);
    for (uint256 i = 0; i < n; i++) {
      values[i] = MAX_SEQUENCER_REWARD_PER_CHECKPOINT;
    }
    // Exactly the desired draw: no shortfall and nothing left over.
    uint256 balance = n * (checkpointReward - 350e18) + n * MAX_SEQUENCER_REWARD_PER_CHECKPOINT;
    deal(address(feeAsset), address(wrapper.rewardDistributor()), balance);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(values)));

    Outcome memory outcome = _prove(n, committee);
    assertEq(outcome.sequencerRewards, values);
    assertEq(outcome.proverRewards, n * 150e18);
    assertEq(outcome.claimed, balance);
    assertEq(feeAsset.balanceOf(address(wrapper.rewardDistributor())), 0);
  }

  function test_BelowDefaultRewardsLeaveTheDifferenceInTheDistributor() external {
    _deploy(100e18, 7000);
    uint256 n = 4;
    uint256 balance = _fund(type(uint256).max, n);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(new uint256[](n))));

    Outcome memory outcome = _prove(n, committee);
    assertEq(outcome.proverRewards, n * 30e18);
    assertEq(outcome.claimed, n * 30e18);
    assertEq(feeAsset.balanceOf(address(wrapper.rewardDistributor())), balance - n * 30e18);
  }

  function test_RevertingCalculatorPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(address(new RevertingCalculator(0)), _balance);
  }

  function test_RevertBombingCalculatorPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(address(new RevertingCalculator(512 * 1024)), _balance);
  }

  function test_GasBurningCalculatorPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(address(new GasBurningCalculator()), _balance);
  }

  function test_ReturnBombingCalculatorPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(address(new ReturnBombCalculator(512 * 1024)), _balance);
  }

  function test_TooLittleDataPaysDefaults(uint256 _balance) external {
    bytes memory response = abi.encode(new uint256[](4));
    assembly {
      mstore(response, sub(mload(response), 1))
    }
    _assertFallsBackToLegacy(address(new RawReturnCalculator(response)), _balance);
  }

  function test_TooMuchDataPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(
      address(new RawReturnCalculator(bytes.concat(abi.encode(new uint256[](4)), hex"00"))), _balance
    );
  }

  function test_WrongOffsetPaysDefaults(uint256 _balance) external {
    bytes memory response = abi.encode(new uint256[](4));
    assembly {
      mstore(add(response, 0x20), 0x40)
    }
    _assertFallsBackToLegacy(address(new RawReturnCalculator(response)), _balance);
  }

  function test_WrongLengthPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(address(new ListCalculator(new uint256[](3))), _balance);
  }

  function test_ValueAboveMaxPaysDefaults(uint256 _balance) external {
    uint256[] memory values = _values(4, 1);
    values[2] = MAX_SEQUENCER_REWARD_PER_CHECKPOINT + 1;
    _assertFallsBackToLegacy(address(new ListCalculator(values)), _balance);
  }

  function test_OverflowingValuesPayDefaults(uint256 _balance) external {
    uint256[] memory values = new uint256[](4);
    for (uint256 i = 0; i < values.length; i++) {
      values[i] = type(uint256).max;
    }
    _assertFallsBackToLegacy(address(new ListCalculator(values)), _balance);
  }

  function test_StateModifyingCalculatorPaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(address(new StateModifyingCalculator()), _balance);
  }

  function test_CalculatorWithoutCodePaysDefaults(uint256 _balance) external {
    _assertFallsBackToLegacy(makeAddr("eoa"), _balance);
  }

  function test_FailedCalculatorKeepsTheOriginalShortfallRounding() external {
    // 3 wei checkpoint reward, 50% split and 2 wei available: the original path pays the sequencer 1 and the prover
    // 1, where scaling a 1 wei default by 2/3 would pay the sequencer 0.
    _deploy(3, 5000);
    deal(address(feeAsset), address(wrapper.rewardDistributor()), 2);
    wrapper.setSequencerRewardCalculator(address(new RevertingCalculator(0)));

    Outcome memory outcome = _prove(1, committee);
    assertEq(outcome.sequencerRewards[0], 1);
    assertEq(outcome.proverRewards, 1);
    assertEq(outcome.claimed, 2);
  }

  function test_DefaultReturningCalculatorRoundsProportionallyUnderShortfall() external {
    // The inputs of test_FailedCalculatorKeepsTheOriginalShortfallRounding with an accepted response equal to the
    // 1 wei default: the response is scaled by 2/3 and rounds down, so the sequencer gets 1 wei less than on the
    // default path. Only a shortfall with `checkpointReward * sequencerBps` not a multiple of 10_000 does this.
    _deploy(3, 5000);
    deal(address(feeAsset), address(wrapper.rewardDistributor()), 2);
    wrapper.setSequencerRewardCalculator(address(new TableCalculator()));

    Outcome memory outcome = _prove(1, committee);
    assertEq(outcome.sequencerRewards[0], 0);
    assertEq(outcome.proverRewards, 2);
    assertEq(outcome.claimed, 2);
  }

  function test_UnderShortfallTheProverShareDependsOnTheCalculator() external {
    // Reward 100 wei with a 50 wei default and 100 wei available: returning the default pays the prover its full
    // 50 wei share, while returning 150 wei makes the desired draw 200 wei and scales both shares by half.
    uint256[] memory values = new uint256[](1);
    uint256[2] memory rewards = [uint256(50), 150];
    uint256[2] memory proverShares = [uint256(50), 25];
    for (uint256 i = 0; i < 2; i++) {
      _deploy(100, 5000);
      deal(address(feeAsset), address(wrapper.rewardDistributor()), 100);
      values[0] = rewards[i];
      wrapper.setSequencerRewardCalculator(address(new ListCalculator(values)));

      Outcome memory outcome = _prove(1, committee);
      assertEq(outcome.proverRewards, proverShares[i], "prover share");
      assertEq(outcome.sequencerRewards[0], 100 - proverShares[i], "sequencer reward");
    }
  }

  /// @dev Checkpoint rewards and fees together, over several checkpoints with distinct coinbases and nonzero
  ///      protocol, prover and sequencer fees, on every reward path. `_mode` picks no calculator, a failing one, an
  ///      accepted response, or an accepted response under a shortfall; `_extend` proves the epoch as a prefix
  ///      followed by an extension, with the proven prefix sent compactly if `_compact`.
  function test_FeesAndRewardsAcrossCheckpoints(
    uint8 _mode,
    bool _extend,
    bool _compact,
    uint256 _seed,
    uint256 _balance
  ) external {
    uint256 n = 8;
    uint256 mode = bound(_mode, 0, 3);
    _deploy(100e18, 7000);
    _setHeaders(n);
    FeeExpectation memory e = _setCheckpointFees(n, _seed);

    uint256[] memory values = _values(n, _seed);
    ListCalculator calculator;
    if (mode == 1) {
      wrapper.setSequencerRewardCalculator(address(new RevertingCalculator(0)));
    } else if (mode >= 2) {
      calculator = new ListCalculator(values);
      wrapper.setSequencerRewardCalculator(address(calculator));
    }

    uint256 balance;
    if (mode == 2) {
      balance = _fund(type(uint256).max, n);
    } else if (mode == 3) {
      balance = bound(_balance, 0, _calculated(values, type(uint256).max).claimed - 1);
      deal(address(feeAsset), address(wrapper.rewardDistributor()), balance);
    } else {
      balance = _fund(_balance, n);
    }

    address recipient = makeAddr("protocolFeeRecipient");
    wrapper.updateProtocolFeeRecipient(recipient);

    uint256 remaining = balance;
    if (_extend) {
      remaining = _proveSegment(0, 3, values, calculator, _compact, remaining, e);
      remaining = _proveSegment(3, n, values, calculator, _compact, remaining, e);
    } else {
      remaining = _proveSegment(0, n, values, calculator, _compact, remaining, e);
    }

    for (uint256 i = 0; i < n; i++) {
      assertEq(wrapper.getSequencerRewards(_coinbase(i)), e.sequencer[i], "sequencer rewards and fees");
    }
    assertEq(wrapper.getCollectiveProverRewardsForEpoch(EPOCH), e.prover, "prover rewards and fees");
    assertEq(feeAsset.balanceOf(recipient), e.protocol, "protocol fees");
    assertEq(feeAsset.balanceOf(address(wrapper.feePortal())), 0, "fees claimed from the portal");
    assertEq(feeAsset.balanceOf(address(wrapper.rewardDistributor())), remaining, "rewards claimed");
    assertEq(feeAsset.balanceOf(address(wrapper)), balance - remaining + e.fees - e.protocol, "held by the rollup");
  }

  function test_PassesTheProposerOfEveryCheckpoint() external {
    _deploy(100e18, 7000);
    uint256 n = 32;
    _fund(type(uint256).max, n);
    TableCalculator calculator = new TableCalculator();
    wrapper.setSequencerRewardCalculator(address(calculator));

    address[] memory proposers = new address[](n);
    for (uint256 i = 0; i < n; i++) {
      proposers[i] = committee[wrapper.getProposerIndex(EPOCH, Slot.wrap(i), COMMITTEE_SIZE)];
    }
    vm.expectCall(
      address(calculator),
      abi.encodeCall(ISequencerRewardCalculator.getSequencerRewards, (EPOCH, proposers, 70e18, 100e18)),
      1
    );
    _prove(n, committee);
  }

  function test_RepeatedProposersArePassedOncePerCheckpoint() external {
    _deploy(100e18, 7000);
    uint256 n = 5;
    _fund(type(uint256).max, n);
    address[] memory single = new address[](1);
    single[0] = makeAddr("onlyProposer");
    uint256[] memory values = _values(n, 1);
    ListCalculator calculator = new ListCalculator(values);
    wrapper.setSequencerRewardCalculator(address(calculator));

    address[] memory proposers = new address[](n);
    for (uint256 i = 0; i < n; i++) {
      proposers[i] = single[0];
    }
    vm.expectCall(
      address(calculator),
      abi.encodeCall(ISequencerRewardCalculator.getSequencerRewards, (EPOCH, proposers, 70e18, 100e18)),
      1
    );
    Outcome memory outcome = _prove(n, single);
    // Each checkpoint receives the value the calculator returned for its own entry.
    assertEq(outcome.sequencerRewards, values);
  }

  function test_PartialEpochExtensionPassesOnlyTheNewCheckpoints(bool _compact) external {
    _deploy(100e18, 7000);
    _fund(type(uint256).max, 5);
    TableCalculator calculator = new TableCalculator();
    wrapper.setSequencerRewardCalculator(address(calculator));
    _setHeaders(5);
    _addFeeHeaders(4);

    args.end = 1;
    args.args.proverId = makeAddr("prover0");
    _submitPrefix(2, 0);
    assertEq(wrapper.getLongestProvenLength(EPOCH), 2);

    // The extension pays checkpoints 2..4 only; the already-proven prefix is either sent compactly or in full.
    address[] memory proposers = new address[](3);
    for (uint256 i = 0; i < 3; i++) {
      proposers[i] = committee[wrapper.getProposerIndex(EPOCH, Slot.wrap(i + 2), COMMITTEE_SIZE)];
    }
    vm.expectCall(
      address(calculator),
      abi.encodeCall(ISequencerRewardCalculator.getSequencerRewards, (EPOCH, proposers, 70e18, 100e18)),
      1
    );
    args.end = 4;
    args.args.proverId = makeAddr("prover1");
    _submitPrefix(5, _compact ? 2 : 0);
    assertEq(wrapper.getLongestProvenLength(EPOCH), 5);
  }

  function test_ShortfallScalesSequencerRewardsProportionally(uint256 _seed, uint8 _count, uint256 _balance) external {
    uint256 n = bound(_count, 1, 32);
    _deploy(500e18, 7000);
    uint256[] memory values = _values(n, _seed);
    uint256 desired = n * 150e18;
    for (uint256 i = 0; i < n; i++) {
      desired += values[i];
    }
    uint256 balance = bound(_balance, 0, desired - 1);
    deal(address(feeAsset), address(wrapper.rewardDistributor()), balance);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(values)));

    Outcome memory outcome = _prove(n, committee);
    _assertOutcome(outcome, _calculated(values, balance));
    assertEq(outcome.claimed, balance, "claims everything available");
  }

  function test_NothingDesiredDoesNotClaimOrDivide() external {
    _deploy(100e18, 10_000);
    uint256 n = 3;
    uint256 balance = _fund(type(uint256).max, n);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(new uint256[](n))));

    Outcome memory outcome = _prove(n, committee);
    assertEq(outcome.claimed, 0);
    assertEq(outcome.proverRewards, 0);
    assertEq(outcome.sequencerRewards, new uint256[](n));
    assertEq(feeAsset.balanceOf(address(wrapper.rewardDistributor())), balance);
  }

  function test_EmptyDistributorPaysNothing() external {
    _deploy(100e18, 7000);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(_values(4, 3))));

    Outcome memory outcome = _prove(4, committee);
    assertEq(outcome.claimed, 0);
    assertEq(outcome.proverRewards, 0);
    assertEq(outcome.sequencerRewards, new uint256[](4));
  }

  function test_FuzzDistributionInvariants(
    uint8 _count,
    uint96 _checkpointReward,
    uint32 _bps,
    uint256 _seed,
    uint256 _balance
  ) external {
    uint256 n = bound(_count, 1, 32);
    _deploy(_checkpointReward, _bps);
    uint256[] memory values = _values(n, _seed);
    uint256 balance = _fund(_balance, n);
    wrapper.setSequencerRewardCalculator(address(new ListCalculator(values)));

    Outcome memory outcome = _prove(n, committee);
    Outcome memory expected = _calculated(values, balance);
    _assertOutcome(outcome, expected);

    uint256 sequencerTotal = 0;
    for (uint256 i = 0; i < n; i++) {
      sequencerTotal += outcome.sequencerRewards[i];
    }
    assertEq(sequencerTotal + outcome.proverRewards, outcome.claimed, "claimed is fully distributed");

    uint256 defaultReward = checkpointReward * sequencerBps / 10_000;
    uint256 desired = n * (checkpointReward - defaultReward);
    for (uint256 i = 0; i < n; i++) {
      desired += values[i];
    }
    assertEq(outcome.claimed, desired < balance ? desired : balance, "claims the desired draw");
    if (balance >= desired) {
      assertEq(outcome.sequencerRewards, values, "no shortfall: values paid exactly");
      assertEq(outcome.proverRewards, n * (checkpointReward - defaultReward), "no shortfall: prover share");
    }
  }

  // ---------------------------------------------------------------------------------------------------------------

  function _assertFallsBackToLegacy(address _calculator, uint256 _balance) internal {
    uint256 n = 4;
    _deploy(100e18, 7000);
    uint256 balance = _fund(_balance, n);
    wrapper.setSequencerRewardCalculator(_calculator);

    Outcome memory outcome = _prove(n, committee);
    _assertOutcome(outcome, _legacy(n, balance));
  }

  function _deploy(uint256 _checkpointReward, uint256 _bps) internal {
    checkpointReward = bound(_checkpointReward, 0, 10_000e18);
    sequencerBps = bound(_bps, 0, 10_000);
    feeAsset = IERC20(address(new TestERC20("test", "TEST", address(this))));
    // forge-lint: disable-next-line(unsafe-typecast)
    wrapper = new RewardLibWrapper(feeAsset, uint96(checkpointReward), uint32(sequencerBps));
    delete committee;
    for (uint256 i = 0; i < COMMITTEE_SIZE; i++) {
      committee.push(address(uint160(uint256(keccak256(abi.encode("attester", i))))));
    }
  }

  /// @dev Funds the distributor with a balance anywhere from nothing to well above `_checkpoints` full rewards.
  function _fund(uint256 _balance, uint256 _checkpoints) internal returns (uint256 balance) {
    uint256 cap = (_checkpoints + 1) * (checkpointReward + 32 * MAX_SEQUENCER_REWARD_PER_CHECKPOINT);
    balance = bound(_balance, 0, cap);
    deal(address(feeAsset), address(wrapper.rewardDistributor()), balance);
  }

  /// @dev Proves checkpoints `[_from, _to)` on top of a proven `[0, _from)`, adding the expected checkpoint rewards to
  ///      `_e`. A zero `_calculator` means the default split. Returns what is left in the distributor.
  function _proveSegment(
    uint256 _from,
    uint256 _to,
    uint256[] memory _values,
    ListCalculator _calculator,
    bool _compact,
    uint256 _remaining,
    FeeExpectation memory _e
  ) internal returns (uint256) {
    Outcome memory expected;
    if (address(_calculator) != address(0)) {
      uint256[] memory slice = new uint256[](_to - _from);
      for (uint256 i = _from; i < _to; i++) {
        slice[i - _from] = _values[i];
      }
      _calculator.setValues(slice);
      expected = _calculated(slice, _remaining);
    } else {
      expected = _legacy(_to - _from, _remaining);
    }
    _e.prover += expected.proverRewards;
    for (uint256 i = _from; i < _to; i++) {
      _e.sequencer[i] += expected.sequencerRewards[i - _from];
    }

    args.end = _to - 1;
    args.args.proverId = makeAddr(_from == 0 ? "prover0" : "prover1");
    _submitPrefix(_to, _compact ? _from : 0);
    return _remaining - expected.claimed;
  }

  /// @dev Gives every checkpoint a nonzero fee and checkpoints `1.._count - 1` nonzero mana, protocol fee and prover
  ///      cost, sometimes enough to cap the prover fee at what the protocol fee leaves; checkpoint 0 keeps the zeroed
  ///      genesis fee header, so all of its fee goes to its sequencer. Funds the fee portal with every fee and
  ///      returns the fee split of each checkpoint, computed here.
  function _setCheckpointFees(uint256 _count, uint256 _seed) internal returns (FeeExpectation memory e) {
    e.sequencer = new uint256[](_count);
    for (uint256 i = 0; i < _count; i++) {
      uint256 r = uint256(keccak256(abi.encode(_seed, "fees", i)));
      uint256 fee;
      if (i == 0) {
        fee = 1 + r % 1e24;
      } else {
        uint256 manaUsed = 1 + r % type(uint32).max;
        uint256 protocolFeePerMana = 1 + (r >> 32) % 2 ** 40;
        uint256 proverCost = 1 + (r >> 80) % 2 ** 62;
        wrapper.addFeeHeader(
          FeeHeader({
            excessMana: 0,
            manaUsed: manaUsed,
            ethPerFeeAsset: 0,
            protocolFee: protocolFeePerMana,
            proverCost: proverCost
          })
        );
        uint256 protocolFee = protocolFeePerMana * manaUsed;
        fee = protocolFee + (r >> 160) % (2 * manaUsed * proverCost + 1);
        uint256 proverFee = manaUsed * proverCost < fee - protocolFee ? manaUsed * proverCost : fee - protocolFee;
        e.protocol += protocolFee;
        e.prover += proverFee;
        e.sequencer[i] = fee - protocolFee - proverFee;
      }
      if (i == 0) {
        e.sequencer[i] = fee;
      }
      args.headers[i].accumulatedFees = fee;
      e.fees += fee;
    }
    deal(address(feeAsset), address(wrapper.feePortal()), e.fees);
  }

  function _setHeaders(uint256 _count) internal {
    delete args.headers;
    for (uint256 i = 0; i < _count; i++) {
      args.headers.push();
      args.headers[i].coinbase = _coinbase(i);
      args.headers[i].slotNumber = Slot.wrap(i);
    }
  }

  function _addFeeHeaders(uint256 _count) internal {
    FeeHeader memory feeHeader =
      FeeHeader({excessMana: 0, manaUsed: 0, ethPerFeeAsset: 0, protocolFee: 0, proverCost: 0});
    for (uint256 i = 0; i < _count; i++) {
      wrapper.addFeeHeader(feeHeader);
    }
  }

  function _prove(uint256 _count, address[] memory _committee) internal returns (Outcome memory outcome) {
    _setHeaders(_count);
    _addFeeHeaders(_count - 1);
    args.start = 0;
    args.end = _count - 1;
    args.args.proverId = makeAddr("prover");

    uint256 distributorBefore = feeAsset.balanceOf(address(wrapper.rewardDistributor()));
    _submit(_committee);

    outcome.sequencerRewards = new uint256[](_count);
    for (uint256 i = 0; i < _count; i++) {
      outcome.sequencerRewards[i] = wrapper.getSequencerRewards(_coinbase(i));
    }
    outcome.proverRewards = wrapper.getCollectiveProverRewardsForEpoch(EPOCH);
    outcome.claimed = distributorBefore - feeAsset.balanceOf(address(wrapper.rewardDistributor()));
    assertEq(feeAsset.balanceOf(address(wrapper)), outcome.claimed, "claimed tokens held by the rollup");
  }

  function _submit(address[] memory _committee) internal {
    wrapper.handleRewardsAndFees(args, EPOCH, _committee);
  }

  /// @dev Submits checkpoints `[0, _length)`, sending the first `_prefix` of them compactly.
  function _submitPrefix(uint256 _length, uint256 _prefix) internal {
    SubmitEpochRootProofArgs memory submission = args;
    submission.provenCheckpointFees = new ProvenCheckpointFees[](_prefix);
    for (uint256 i = 0; i < _prefix; i++) {
      submission.provenCheckpointFees[i] =
        ProvenCheckpointFees({coinbase: args.headers[i].coinbase, accumulatedFees: 0});
    }
    submission.headers = new ProposedHeader[](_length - _prefix);
    for (uint256 i = 0; i < submission.headers.length; i++) {
      submission.headers[i] = args.headers[_prefix + i];
    }
    wrapper.handleRewardsAndFees(submission, EPOCH, committee);
  }

  function _assertOutcome(Outcome memory _outcome, Outcome memory _expected) internal pure {
    assertEq(_outcome.sequencerRewards, _expected.sequencerRewards, "sequencer rewards");
    assertEq(_outcome.proverRewards, _expected.proverRewards, "prover rewards");
    assertEq(_outcome.claimed, _expected.claimed, "claimed");
  }

  /// @dev The reward split of a rollup without a calculator.
  function _legacy(uint256 _n, uint256 _balance) internal view returns (Outcome memory expected) {
    uint256 desired = _n * checkpointReward;
    expected.claimed = desired < _balance ? desired : _balance;
    uint256 sequencerTotal = expected.claimed * sequencerBps / 10_000;
    uint256 perCheckpoint = sequencerTotal / _n;
    expected.sequencerRewards = new uint256[](_n);
    for (uint256 i = 0; i < _n; i++) {
      expected.sequencerRewards[i] = perCheckpoint;
    }
    expected.proverRewards = expected.claimed - perCheckpoint * _n;
  }

  /// @dev The reward split the AZIP specifies for an accepted calculator response.
  function _calculated(uint256[] memory _rewards, uint256 _balance) internal view returns (Outcome memory expected) {
    uint256 n = _rewards.length;
    uint256 defaultReward = checkpointReward * sequencerBps / 10_000;
    uint256 desired = n * (checkpointReward - defaultReward);
    for (uint256 i = 0; i < n; i++) {
      desired += _rewards[i];
    }
    expected.claimed = desired < _balance ? desired : _balance;
    expected.sequencerRewards = new uint256[](n);
    uint256 sequencerTotal = 0;
    for (uint256 i = 0; i < n; i++) {
      expected.sequencerRewards[i] = expected.claimed < desired ? _rewards[i] * expected.claimed / desired : _rewards[i];
      sequencerTotal += expected.sequencerRewards[i];
    }
    expected.proverRewards = expected.claimed - sequencerTotal;
  }

  /// @dev Pseudo-random rewards up to MAX_SEQUENCER_REWARD_PER_CHECKPOINT, with zeros and defaults mixed in.
  function _values(uint256 _n, uint256 _seed) internal view returns (uint256[] memory values) {
    values = new uint256[](_n);
    uint256 defaultReward = checkpointReward * sequencerBps / 10_000;
    for (uint256 i = 0; i < _n; i++) {
      uint256 r = uint256(keccak256(abi.encode(_seed, i)));
      if (r % 5 == 0) {
        values[i] = 0;
      } else if (r % 5 == 1) {
        values[i] = defaultReward;
      } else if (r % 5 == 2) {
        values[i] = MAX_SEQUENCER_REWARD_PER_CHECKPOINT;
      } else {
        values[i] = (r >> 8) % (4 * checkpointReward + 1);
      }
    }
  }

  function _coinbase(uint256 _i) internal pure returns (address) {
    // forge-lint: disable-next-line(unsafe-typecast)
    return address(uint160(0xc0ffee0000 + _i));
  }
}
