// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLibBase} from "./RewardLibBase.sol";
import {RewardLibWrapper, FakeFeePortal} from "./RewardLibWrapper.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Math} from "@oz/utils/math/Math.sol";

contract HandleRewardsTest is RewardLibBase {
  function test_GivenProverHasAlreadySubmitted() external prepare(400e18, 7000) {
    // it reverts with {Rollup__ProverHaveAlreadySubmitted}
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProverHaveAlreadySubmitted.selector, prover, Epoch.wrap(0)));
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
  }

  modifier givenProverHasNotSubmitted() {
    _;
  }

  function test_WhenLengthLELongestProven() external prepare(400e18, 7000) givenProverHasNotSubmitted {
    // it store the prover shares
    // it store summed shares

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));

    args.args.proverId = makeAddr("prover2");

    assertFalse(wrapper.getHasSubmitted(Epoch.wrap(0), 1, args.args.proverId));

    vm.record();
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));

    (, bytes32[] memory writes) = vm.accesses(address(wrapper));

    assertEq(writes.length, 2);
    assertGt(wrapper.getProverShares(Epoch.wrap(0), 1, args.args.proverId), 0);
    assertGt(wrapper.getSummedShares(Epoch.wrap(0), 1), 0);
  }

  modifier whenLengthGTLongestProven() {
    _;
  }

  function test_GivenCallerNEQCanonicalRollup()
    external
    prepare(400e18, 7000)
    givenProverHasNotSubmitted
    whenLengthGTLongestProven
  {
    // it store the prover shares
    // it store summed shares
    // it store longestProvenLength

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
    assertEq(wrapper.getLongestProvenLength(Epoch.wrap(0)), 1);

    wrapper.nukeRewardDistributor();

    args.args.proverId = makeAddr("prover2");
    args.end = args.start + 1;
    args.fees = _fees(2, sequencer);

    vm.record();
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
    (, bytes32[] memory writes) = vm.accesses(address(wrapper));

    assertEq(writes.length, 3);
    assertGt(wrapper.getProverShares(Epoch.wrap(0), 2, args.args.proverId), 0);
    assertGt(wrapper.getSummedShares(Epoch.wrap(0), 2), 0);
    assertEq(wrapper.getLongestProvenLength(Epoch.wrap(0)), 2);
  }

  function test_GivenCallerEQCanonicalRollup(uint96 _checkpointReward, uint32 _sequencerBps)
    external
    prepare(_checkpointReward, _sequencerBps)
    givenProverHasNotSubmitted
    whenLengthGTLongestProven
  {
    // it store the prover shares
    // it store summed shares
    // it store updated prover rewards
    // it store updated sequencer reward balance
    // it store longestProvenLength

    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
    assertEq(wrapper.getLongestProvenLength(Epoch.wrap(0)), 1);

    uint256 checkpointCount = 32;

    args.args.proverId = makeAddr("prover2");
    args.end = args.start + checkpointCount - 1;
    args.fees = _fees(checkpointCount, sequencer);

    uint256 initialSequencerRewards = wrapper.getSequencerRewards(sequencer);
    uint256 initialProverRewards = wrapper.getCollectiveProverRewardsForEpoch(Epoch.wrap(0));

    uint256 totalRewards =
      Math.min(checkpointReward * (checkpointCount - 1), feeAsset.balanceOf(address(wrapper.rewardDistributor())));

    vm.record();
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
    (, bytes32[] memory writes) = vm.accesses(address(wrapper));

    uint256 sequencerRewards = totalRewards * sequencerBps / 10_000;
    uint256 sequencerRewardsPerBlock = sequencerRewards / (checkpointCount - 1);
    uint256 proverRewards = totalRewards - sequencerRewards; // no dust
    uint256 dust = sequencerRewards - (sequencerRewardsPerBlock * (checkpointCount - 1));

    uint256 size = 3;

    if (sequencerRewardsPerBlock > 0) {
      size += (checkpointCount - 1); // the first was already updated, this is 30 repeat writes for 100 gas each.
    }

    if (proverRewards > 0) {
      size += 1;
    }

    assertEq(writes.length, size, "writes.length");
    assertGt(wrapper.getProverShares(Epoch.wrap(0), checkpointCount, args.args.proverId), 0, "prover shares");
    assertGt(wrapper.getSummedShares(Epoch.wrap(0), checkpointCount), 0, "summed shares");
    assertEq(wrapper.getLongestProvenLength(Epoch.wrap(0)), checkpointCount, "longest proven length");

    assertEq(
      wrapper.getSequencerRewards(sequencer),
      initialSequencerRewards + sequencerRewardsPerBlock * (checkpointCount - 1),
      "sequencer rewards"
    );
    assertEq(
      wrapper.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)),
      initialProverRewards + proverRewards + dust,
      "prover rewards"
    );
  }
}
