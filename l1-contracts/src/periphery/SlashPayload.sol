// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

/**
 * @notice The simplest payload that you can find, slash all attesters for an epoch.
 */
contract SlashPayload is IPayload {
  Epoch public immutable EPOCH;
  IValidatorSelection public immutable ValidatorSelection;
  uint256 public immutable AMOUNT;

  constructor(Epoch _epoch, IValidatorSelection _ValidatorSelection, uint256 _amount) {
    EPOCH = _epoch;
    ValidatorSelection = _ValidatorSelection;
    AMOUNT = _amount;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    address[] memory attesters = IValidatorSelection(ValidatorSelection).getEpochCommittee(EPOCH);
    IPayload.Action[] memory actions = new IPayload.Action[](attesters.length);

    for (uint256 i = 0; i < attesters.length; i++) {
      actions[i] = IPayload.Action({
        target: address(ValidatorSelection),
        data: abi.encodeWithSelector(IStaking.slash.selector, attesters[i], AMOUNT)
      });
    }

    return actions;
  }
}
