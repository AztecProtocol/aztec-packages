// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ISlasher, SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {EmpireSlashingProposer} from "@aztec/core/slashing/EmpireSlashingProposer.sol";
import {ConsensusSlashingProposer} from "@aztec/core/slashing/ConsensusSlashingProposer.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

contract Slasher is ISlasher {
  address public immutable PROPOSER;
  address public immutable VETOER;

  mapping(address payload => bool vetoed) public vetoedPayloads;

  error Slasher__SlashFailed(address target, bytes data, bytes returnData);
  error Slasher__CallerNotProposer(address caller, address proposer);
  error Slasher__CallerNotVetoer(address caller, address vetoer);
  error Slasher__PayloadVetoed(address payload);

  constructor(
    address _rollup,
    address _vetoer,
    SlasherFlavor _flavor,
    uint256 _quorumSize,
    uint256 _roundSize,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds,
    uint256 _slashingUnit,
    uint256 _committeeSize,
    uint256 _epochDuration
  ) {
    VETOER = _vetoer;
    PROPOSER = _flavor == SlasherFlavor.CONSENSUS
      ? address(
        new ConsensusSlashingProposer(
          _rollup,
          this,
          _quorumSize,
          _roundSize,
          _lifetimeInRounds,
          _executionDelayInRounds,
          _slashingUnit,
          _committeeSize,
          _epochDuration
        )
      )
      : address(
        new EmpireSlashingProposer(_rollup, this, _quorumSize, _roundSize, _lifetimeInRounds, _executionDelayInRounds)
      );
  }

  function vetoPayload(IPayload _payload) external override(ISlasher) returns (bool) {
    require(msg.sender == VETOER, Slasher__CallerNotVetoer(msg.sender, VETOER));
    vetoedPayloads[address(_payload)] = true;
    emit VetoedPayload(address(_payload));
    return true;
  }

  function slash(IPayload _payload) external override(ISlasher) returns (bool) {
    require(msg.sender == PROPOSER, Slasher__CallerNotProposer(msg.sender, PROPOSER));

    require(!vetoedPayloads[address(_payload)], Slasher__PayloadVetoed(address(_payload)));

    IPayload.Action[] memory actions = _payload.getActions();

    for (uint256 i = 0; i < actions.length; i++) {
      (bool success, bytes memory returnData) = actions[i].target.call(actions[i].data);
      require(success, Slasher__SlashFailed(actions[i].target, actions[i].data, returnData));
    }

    return true;
  }
}
