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
  ISlashFactory.Offender[] public offenders;

  constructor(
    address[] memory _validators,
    uint96[] memory _amounts,
    IValidatorSelection _validatorSelection
  ) {
    for (uint256 i = 0; i < _validators.length; i++) {
      offenders.push(ISlashFactory.Offender({validator: _validators[i], amount: _amounts[i]}));
    }
    VALIDATOR_SELECTION = _validatorSelection;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory actions = new IPayload.Action[](offenders.length);

    for (uint256 i = 0; i < offenders.length; i++) {
      actions[i] = IPayload.Action({
        target: address(VALIDATOR_SELECTION),
        data: abi.encodeWithSelector(
          IStakingCore.slash.selector, offenders[i].validator, offenders[i].amount
        )
      });
    }
    return actions;
  }
}
