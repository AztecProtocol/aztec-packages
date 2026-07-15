// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLibBase} from "./RewardLibBase.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract BurnOnTransferERC20 is TestERC20 {
  uint256 public constant BURN_BPS = 1000;

  constructor() TestERC20("burn", "BURN", msg.sender) {}

  function _update(address _from, address _to, uint256 _value) internal override {
    if (_from != address(0) && _to != address(0) && _value > 0) {
      uint256 burnAmount = _value * BURN_BPS / 10_000;
      super._update(_from, address(0), burnAmount);
      super._update(_from, _to, _value - burnAmount);
    } else {
      super._update(_from, _to, _value);
    }
  }
}

contract HandleRewardsTest is RewardLibBase {
  function test_GivenRewardDistributorDeliversLessThanRequested() external {
    // it reverts before recording checkpoint reward liabilities
    feeAsset = IERC20(address(new BurnOnTransferERC20()));
    uint96 requestedReward = 400e18;
    uint256 burnBps = BurnOnTransferERC20(address(feeAsset)).BURN_BPS();

    _prepare(requestedReward, 7000);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.RewardLib__InvalidFeeAssetTransfer.selector,
        uint256(requestedReward),
        uint256(requestedReward) * (10_000 - burnBps) / 10_000
      )
    );
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
  }

  function test_GivenFeePortalDeliversLessThanRequested() external {
    // it reverts before recording fee-backed reward liabilities
    feeAsset = IERC20(address(new BurnOnTransferERC20()));
    uint256 burnBps = BurnOnTransferERC20(address(feeAsset)).BURN_BPS();

    _prepare(0, 7000);

    uint256 requestedFees = 100e18;
    deal(address(feeAsset), address(wrapper.feePortal()), requestedFees);
    _setHeaders(1, sequencer, requestedFees);
    _addFeeHeaders(1);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.RewardLib__InvalidFeeAssetTransfer.selector, requestedFees, requestedFees * (10_000 - burnBps) / 10_000
      )
    );
    wrapper.handleRewardsAndFees(args, Epoch.wrap(0));
  }

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
    _setHeaders(2, sequencer);
    _addFeeHeaders(1);

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
    _setHeaders(checkpointCount, sequencer);
    _addFeeHeaders(checkpointCount - 1);

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
