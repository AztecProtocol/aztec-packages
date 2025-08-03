// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ISlasher} from "@aztec/core/interfaces/ISlasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

contract Slasher is ISlasher {
  SlashingProposer public immutable PROPOSER;
  address public immutable VETOER;

  mapping(address payload => bool vetoed) public vetoedPayloads;

  error Slasher__SlashFailed(address target, bytes data, bytes returnData);
  error Slasher__CallerNotProposer(address caller, address proposer);
  error Slasher__CallerNotVetoer(address caller, address vetoer);
  error Slasher__PayloadVetoed(address payload);

  constructor(
    uint256 _quorumSize,
    uint256 _roundSize,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds,
    address _vetoer
  ) {
    PROPOSER =
      new SlashingProposer(msg.sender, this, _quorumSize, _roundSize, _lifetimeInRounds, _executionDelayInRounds);
    VETOER = _vetoer;
  }

  function vetoPayload(IPayload _payload) external override(ISlasher) returns (bool) {
    require(msg.sender == VETOER, Slasher__CallerNotVetoer(msg.sender, VETOER));
    vetoedPayloads[address(_payload)] = true;
    return true;
  }

  function slash(IPayload _payload) external override(ISlasher) returns (bool) {
    require(msg.sender == address(PROPOSER), Slasher__CallerNotProposer(msg.sender, address(PROPOSER)));

    require(!vetoedPayloads[address(_payload)], Slasher__PayloadVetoed(address(_payload)));

    IPayload.Action[] memory actions = _payload.getActions();

    for (uint256 i = 0; i < actions.length; i++) {
      (bool success, bytes memory returnData) = actions[i].target.call(actions[i].data);
      require(success, Slasher__SlashFailed(actions[i].target, actions[i].data, returnData));
    }

    return true;
  }
}
