// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title FieldLib
 * @author Aztec Labs
 * @notice Helpers for validating that values stored on L1 are valid BN254 scalar field elements.
 * @dev Off-chain components decode several L1 storage slots into `Fr`. A value `>=` the field modulus throws on
 *      conversion and would brick honest archivers' L1 sync, so such values are rejected at write time.
 */
library FieldLib {
  /// @notice Reverts with `Rollup__FieldElementOutOfRange` unless `_value` is a valid field element (`< Constants.P`).
  function requireValidFieldElement(bytes32 _value) internal pure {
    require(uint256(_value) < Constants.P, Errors.Rollup__FieldElementOutOfRange(_value));
  }
}
