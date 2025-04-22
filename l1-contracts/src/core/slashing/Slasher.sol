// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ISlasher} from "@aztec/core/interfaces/ISlasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

contract Slasher is ISlasher {
  SlashingProposer public immutable PROPOSER;

  event SlashFailed(address target, bytes data, bytes returnData);

  error Slasher__CallerNotProposer(address caller, address proposer); // 0x44c1f74f

  constructor(uint256 _n, uint256 _m) {
    PROPOSER = new SlashingProposer(msg.sender, this, _n, _m);
  }

  function slash(IPayload _payload) external override(ISlasher) returns (bool) {
    require(
      msg.sender == address(PROPOSER), Slasher__CallerNotProposer(msg.sender, address(PROPOSER))
    );

    IPayload.Action[] memory actions = _payload.getActions();

    for (uint256 i = 0; i < actions.length; i++) {
      // Allow failure of individual calls but emit the failure!
      (bool success, bytes memory returnData) = actions[i].target.call(actions[i].data);
      if (!success) {
        emit SlashFailed(actions[i].target, actions[i].data, returnData);
      }
    }

    return true;
  }
}
