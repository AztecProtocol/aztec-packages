// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ILeonidas} from "@aztec/core/interfaces/ILeonidas.sol";
import {Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ISlashFactory} from "./interfaces/ISlashFactory.sol";
import {SlashPayload} from "./SlashPayload.sol";

contract SlashFactory is ISlashFactory {
  ILeonidas public immutable LEONIDAS;

  constructor(ILeonidas _leonidas) {
    LEONIDAS = _leonidas;
  }

  function createSlashPayload(Epoch _epoch, uint256 _amount)
    external
    override(ISlashFactory)
    returns (IPayload)
  {
    (address predictedAddress, bool isDeployed) = getAddressAndIsDeployed(_epoch, _amount);

    if (isDeployed) {
      return IPayload(predictedAddress);
    }

    SlashPayload payload =
      new SlashPayload{salt: bytes32(Epoch.unwrap(_epoch))}(_epoch, LEONIDAS, _amount);

    emit SlashPayloadCreated(address(payload), _epoch, _amount);
    return IPayload(address(payload));
  }

  function getAddressAndIsDeployed(Epoch _epoch, uint256 _amount)
    public
    view
    override(ISlashFactory)
    returns (address, bool)
  {
    address predictedAddress = _computeSlashPayloadAddress(_epoch, _amount);
    bool isDeployed = predictedAddress.code.length > 0;
    return (predictedAddress, isDeployed);
  }

  function _computeSlashPayloadAddress(Epoch _epoch, uint256 _amount)
    internal
    view
    returns (address)
  {
    bytes32 salt = bytes32(Epoch.unwrap(_epoch));
    return address(
      uint160(
        uint256(
          keccak256(
            abi.encodePacked(
              bytes1(0xff),
              address(this),
              salt,
              keccak256(
                abi.encodePacked(
                  type(SlashPayload).creationCode, abi.encode(_epoch, LEONIDAS, _amount)
                )
              )
            )
          )
        )
      )
    );
  }
}
