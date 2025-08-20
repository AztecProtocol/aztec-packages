// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ISlasher} from "@aztec/core/interfaces/ISlasher.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

contract Slasher is ISlasher {
  address public immutable GOVERNANCE;
  address public immutable VETOER;
  // solhint-disable-next-line var-name-mixedcase
  address public PROPOSER;

  mapping(address payload => bool vetoed) public vetoedPayloads;

  error Slasher__SlashFailed(address target, bytes data, bytes returnData);
  error Slasher__CallerNotAuthorizedToSlash(address caller);
  error Slasher__CallerNotVetoer(address caller, address vetoer);
  error Slasher__PayloadVetoed(address payload);
  error Slasher__AlreadyInitialized();
  error Slasher__ProposerZeroAddress();

  constructor(address _vetoer, address _governance) {
    GOVERNANCE = _governance;
    VETOER = _vetoer;
  }

  // solhint-disable-next-line comprehensive-interface
  function initializeProposer(address _proposer) external {
    require(PROPOSER == address(0), Slasher__AlreadyInitialized());
    require(_proposer != address(0), Slasher__ProposerZeroAddress());
    PROPOSER = _proposer;
  }

  function vetoPayload(IPayload _payload) external override(ISlasher) returns (bool) {
    require(msg.sender == VETOER, Slasher__CallerNotVetoer(msg.sender, VETOER));
    vetoedPayloads[address(_payload)] = true;
    emit VetoedPayload(address(_payload));
    return true;
  }

  function slash(IPayload _payload) external override(ISlasher) returns (bool) {
    require(msg.sender == PROPOSER || msg.sender == GOVERNANCE, Slasher__CallerNotAuthorizedToSlash(msg.sender));
    require(!vetoedPayloads[address(_payload)], Slasher__PayloadVetoed(address(_payload)));

    IPayload.Action[] memory actions = _payload.getActions();
    for (uint256 i = 0; i < actions.length; i++) {
      (bool success, bytes memory returnData) = actions[i].target.call(actions[i].data);
      require(success, Slasher__SlashFailed(actions[i].target, actions[i].data, returnData));
    }

    return true;
  }
}
