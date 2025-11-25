// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {RewardLibWrapper, FakeFeePortal} from "./RewardLibWrapper.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Math} from "@oz/utils/math/Math.sol";

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

    args.fees = _fees(1, sequencer);

    args.args.proverId = prover;

    _;
  }

  function _fees(uint256 _count, address _sequencer) internal pure returns (bytes32[] memory) {
    return _fees(_count, _sequencer, 0);
  }

  function _fees(uint256 _count, address _sequencer, uint256 _amount) internal pure returns (bytes32[] memory) {
    bytes32[] memory fees = new bytes32[](_count * 2);
    for (uint256 i = 0; i < _count; i++) {
      fees[i * 2] = bytes32(uint256(uint160(bytes20(_sequencer))));
      fees[i * 2 + 1] = bytes32(uint256(_amount));
    }
    return fees;
  }
}
