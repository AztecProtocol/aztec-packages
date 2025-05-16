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
    uint256[] memory _amounts,
    uint256[] memory _offences
  ) external override(ISlashFactory) returns (IPayload) {
    require(
      _validators.length == _amounts.length,
      ISlashFactory.SlashPayloadAmountsLengthMismatch(_validators.length, _amounts.length)
    );
    require(
      _validators.length == _offences.length,
      ISlashFactory.SlashPayloadOffencesLengthMismatch(_validators.length, _offences.length)
    );

    (address predictedAddress, bool isDeployed) =
      getAddressAndIsDeployed(_validators, _amounts, _offences);

    if (isDeployed) {
      return IPayload(predictedAddress);
    }

    // Use a salt so that validators don't create many payloads for the same slash.
    bytes32 salt = keccak256(abi.encodePacked(_validators, _amounts, _offences));

    // Don't need to pass _offences as they are not used in the payload.
    SlashPayload payload = new SlashPayload{salt: salt}(_validators, VALIDATOR_SELECTION, _amounts);

    emit SlashPayloadCreated(address(payload), _validators, _amounts, _offences);
    return IPayload(address(payload));
  }

  function getAddressAndIsDeployed(
    address[] memory _validators,
    uint256[] memory _amounts,
    uint256[] memory _offences
  ) public view override(ISlashFactory) returns (address, bool) {
    address predictedAddress = _computeSlashPayloadAddress(_validators, _amounts, _offences);
    bool isDeployed = predictedAddress.code.length > 0;
    return (predictedAddress, isDeployed);
  }

  function _computeSlashPayloadAddress(
    address[] memory _validators,
    uint256[] memory _amounts,
    uint256[] memory _offences
  ) internal view returns (address) {
    bytes32 salt = keccak256(abi.encodePacked(_validators, _amounts, _offences));

    bytes memory constructorArgs = abi.encode(_validators, VALIDATOR_SELECTION, _amounts);
    bytes32 creationCodeHash =
      keccak256(abi.encodePacked(type(SlashPayload).creationCode, constructorArgs));

    return address(
      uint160(
        uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, creationCodeHash)))
      )
    );
  }
}
