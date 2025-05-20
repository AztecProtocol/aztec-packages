// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ISlashFactory} from "./interfaces/ISlashFactory.sol";

/**
 * @notice Payload to slash a specified list of validators for specified amounts and offenses.
 */
contract SlashPayload is IPayload {
  IValidatorSelection public immutable VALIDATOR_SELECTION;

  address[] public validators;
  uint256[] public amounts;
  uint256[] public offenses;

  constructor(
    address[] memory _validators,
    IValidatorSelection _validatorSelection,
    uint256[] memory _amounts
  ) {
    if (_validators.length != _amounts.length) {
      revert ISlashFactory.SlashPayloadAmountsLengthMismatch(_validators.length, _amounts.length);
    }

    validators = _validators;
    VALIDATOR_SELECTION = _validatorSelection;
    amounts = _amounts;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory actions = new IPayload.Action[](validators.length);

    for (uint256 i = 0; i < validators.length; i++) {
      actions[i] = IPayload.Action({
        target: address(VALIDATOR_SELECTION),
        data: abi.encodeWithSelector(IStakingCore.slash.selector, validators[i], amounts[i])
      });
    }
    return actions;
  }
}
