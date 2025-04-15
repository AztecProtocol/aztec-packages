// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

/**
 * @notice The simplest payload that you can find, slash all attesters for an epoch.
 */
contract SlashPayload is IPayload {
  Epoch public immutable EPOCH;
  IValidatorSelection public immutable VALIDATOR_SELECTION;
  uint256 public immutable AMOUNT;

  address[] public attesters;

  constructor(Epoch _epoch, IValidatorSelection _validatorSelection, uint256 _amount) {
    EPOCH = _epoch;
    VALIDATOR_SELECTION = _validatorSelection;
    AMOUNT = _amount;

    address[] memory attesters_ = IValidatorSelection(VALIDATOR_SELECTION).getEpochCommittee(EPOCH);
    for (uint256 i = 0; i < attesters_.length; i++) {
      attesters.push(attesters_[i]);
    }
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory actions = new IPayload.Action[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      actions[i] = IPayload.Action({
        target: address(VALIDATOR_SELECTION),
        data: abi.encodeWithSelector(IStakingCore.slash.selector, attesters[i], AMOUNT)
      });
    }

    return actions;
  }
}
