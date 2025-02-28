// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

library Converter {
  function addressToField(address _a) internal pure returns (bytes32) {
    return bytes32(uint256(uint160(_a)));
  }

  function fieldToAddress(bytes32 _f) internal pure returns (address) {
    return address(uint160(uint256(_f)));
  }
}
