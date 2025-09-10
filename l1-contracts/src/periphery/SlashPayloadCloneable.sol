// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * @notice Cloneable SlashPayload implementation that fetches arguments from immutable storage
 * @dev This contract is deployed once as an implementation and then cloned for each slash payload
 * Using EIP-1167 minimal proxy pattern with immutable arguments to save gas on deployment
 * @dev This contract can be further optimized by NOT storing the actions as immutables, and instead
 * store them in transient storage in the main contract, and just storing the round number here. Then,
 * when actions are requested, we just call back into the proposer and return them. Note that we cannot
 * just compute them on the fly on the proposer, since we need the committees to be provided as calldata.
 */
contract SlashPayloadCloneable is IPayload {
  using Clones for address;

  /**
   * @notice Get the actions to execute for this slash payload
   * @return actions Array of actions to slash validators
   */
  function getActions() external view override(IPayload) returns (IPayload.Action[] memory actions) {
    (address validatorSelection, address[] memory validators, uint96[] memory amounts) = _getImmutableArgs();

    actions = new IPayload.Action[](validators.length);

    for (uint256 i = 0; i < validators.length; i++) {
      actions[i] = IPayload.Action({
        target: validatorSelection,
        data: abi.encodeWithSelector(IStakingCore.slash.selector, validators[i], amounts[i])
      });
    }
  }

  /**
   * @notice Get the URI for this payload
   * @return The URI string
   */
  function getURI() external pure override(IPayload) returns (string memory) {
    return "SlashPayload";
  }

  /**
   * @notice Decode the immutable arguments stored in the clone's bytecode
   * @return validatorSelection The address of the validator selection contract
   * @return validators Array of validator addresses to slash
   * @return amounts Array of amounts to slash for each validator
   */
  function _getImmutableArgs()
    private
    view
    returns (address validatorSelection, address[] memory validators, uint96[] memory amounts)
  {
    // Fetch immutable args from clone's bytecode
    bytes memory args = Clones.fetchCloneArgs(address(this));

    // Decode the arguments
    // Layout: [validatorSelection(20 bytes)][arrayLength(32 bytes)][validators+amounts array data]
    assembly {
      // Read validator selection address (first 20 bytes)
      validatorSelection := shr(96, mload(add(args, 0x20)))

      // Read array length (next 32 bytes after the address)
      let arrayLen := mload(add(args, 0x34))

      // Allocate memory for validators array
      validators := mload(0x40)
      mstore(validators, arrayLen)
      let validatorsData := add(validators, 0x20)

      // Allocate memory for amounts array
      amounts := add(validatorsData, mul(arrayLen, 0x20))
      mstore(amounts, arrayLen)
      let amountsData := add(amounts, 0x20)

      // Update free memory pointer
      mstore(0x40, add(amountsData, mul(arrayLen, 0x20)))

      // Copy validator addresses and amounts
      let srcPtr := add(args, 0x54) // Start after validatorSelection + arrayLength

      for { let i := 0 } lt(i, arrayLen) { i := add(i, 1) } {
        // Read validator address (20 bytes)
        let validator := shr(96, mload(srcPtr))
        mstore(add(validatorsData, mul(i, 0x20)), validator)
        srcPtr := add(srcPtr, 0x14)

        // Read amount (12 bytes for uint96)
        let amount := shr(160, mload(srcPtr))
        mstore(add(amountsData, mul(i, 0x20)), amount)
        srcPtr := add(srcPtr, 0x0c)
      }
    }
  }
}
