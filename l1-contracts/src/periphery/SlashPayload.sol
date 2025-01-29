// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStakingInner} from "@aztec/core/interfaces/IStaking.sol";
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

  constructor(Epoch _epoch, IValidatorSelection _validatorSelection, uint256 _amount) {
    EPOCH = _epoch;
    VALIDATOR_SELECTION = _validatorSelection;
    AMOUNT = _amount;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    address[] memory attesters = IValidatorSelection(VALIDATOR_SELECTION).getEpochCommittee(EPOCH);
    IPayload.Action[] memory actions = new IPayload.Action[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      actions[i] = IPayload.Action({
        target: address(VALIDATOR_SELECTION),
        data: abi.encodeWithSelector(IStakingInner.slash.selector, attesters[i], AMOUNT)
      });
    }

    return actions;
  }
}
