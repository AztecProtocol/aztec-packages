// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {RewardLibWrapper, FakeFeePortal} from "./RewardLibWrapper.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";

contract RewardLibBase is TestBase {
  uint96 internal checkpointReward;
  uint32 internal sequencerBps;
  FakeFeePortal internal feePortal;
  RewardLibWrapper internal wrapper;
  IERC20 internal feeAsset;

  address internal prover = makeAddr("prover");
  address internal sequencer = makeAddr("sequencer");

  SubmitEpochRootProofArgs internal args;

  modifier prepare(uint96 _checkpointReward, uint32 _sequencerBps) {
    checkpointReward = uint96(_bound(_checkpointReward, 0, 10_000e18));
    sequencerBps = uint32(_bound(_sequencerBps, 0, 10_000));
    feeAsset = IERC20(address(new TestERC20("test", "TEST", address(this))));
    wrapper = new RewardLibWrapper(feeAsset, checkpointReward, sequencerBps);
    feePortal = wrapper.feePortal();

    deal(address(feeAsset), address(wrapper.rewardDistributor()), checkpointReward * 300);
    deal(address(feeAsset), address(wrapper.feePortal()), checkpointReward * 100);

    _setHeaders(1, sequencer);

    args.args.proverId = prover;

    _;
  }

  function _setHeaders(uint256 _count, address _sequencer) internal {
    _setHeaders(_count, _sequencer, 0);
  }

  function _setHeaders(uint256 _count, address _sequencer, uint256 _amount) internal {
    delete args.headers;
    for (uint256 i = 0; i < _count; i++) {
      args.headers.push();
      args.headers[i].coinbase = _sequencer;
      args.headers[i].accumulatedFees = _amount;
    }
  }

  function _addFeeHeaders(uint256 _count) internal {
    // These tests call RewardLib directly instead of going through proposal, so seed the temp checkpoint
    // logs that proposal would normally write before handleRewardsAndFees reads them.
    FeeHeader memory feeHeader =
      FeeHeader({excessMana: 0, manaUsed: 0, ethPerFeeAsset: 0, congestionCost: 0, proverCost: 0});

    for (uint256 i = 0; i < _count; i++) {
      wrapper.addFeeHeader(feeHeader);
    }
  }
}
