// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ISlashFactory} from "./interfaces/ISlashFactory.sol";
import {SlashPayload} from "./SlashPayload.sol";

contract SlashFactory is ISlashFactory {
  IValidatorSelection public immutable VALIDATOR_SELECTION;

  constructor(IValidatorSelection _validatorSelection) {
    VALIDATOR_SELECTION = _validatorSelection;
  }

  function createSlashPayload(
    address[] memory _validators,
    uint96[] memory _amounts,
    uint256[] memory _offenses
  ) external override(ISlashFactory) returns (IPayload) {
    require(
      _validators.length == _amounts.length,
      ISlashFactory.SlashPayloadAmountsLengthMismatch(_validators.length, _amounts.length)
    );
    require(
      _validators.length == _offenses.length,
      ISlashFactory.SlashPayloadOffensesLengthMismatch(_validators.length, _offenses.length)
    );

    (address predictedAddress, bytes32 salt, bool isDeployed) =
      getAddressAndIsDeployed(_validators, _amounts);

    if (isDeployed) {
      return IPayload(predictedAddress);
    }

    // _offenses are not used in the SlashPayload constructor, only in the event.
    SlashPayload payload = new SlashPayload{salt: salt}(_validators, _amounts, VALIDATOR_SELECTION);

    emit SlashPayloadCreated(address(payload), _validators, _amounts, _offenses);
    return IPayload(address(payload));
  }

  function getAddressAndIsDeployed(address[] memory _validators, uint96[] memory _amounts)
    public
    view
    override(ISlashFactory)
    returns (address, bytes32, bool)
  {
    (address predictedAddress, bytes32 salt) = _computeSlashPayloadAddress(_validators, _amounts);
    bool isDeployed = predictedAddress.code.length > 0;
    return (predictedAddress, salt, isDeployed);
  }

  function _computeSlashPayloadAddress(address[] memory _validators, uint96[] memory _amounts)
    internal
    view
    returns (address, bytes32)
  {
    bytes32 salt = keccak256(abi.encodePacked(_validators, _amounts));

    bytes memory constructorArgs = abi.encode(_validators, _amounts, VALIDATOR_SELECTION);
    bytes32 creationCodeHash =
      keccak256(abi.encodePacked(type(SlashPayload).creationCode, constructorArgs));

    return (
      address(
        uint160(
          uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, creationCodeHash)))
        )
      ),
      salt
    );
  }
}
