// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering
// solhint-disable func-param-name-leading-underscore

import {ProofVerificationParams} from "@zkpassport/Types.sol";
import {ZKPassportHelper} from "@zkpassport/ZKPassportHelper.sol";

interface IZKPassportVerifier {
  function verify(ProofVerificationParams calldata params) external returns (bool, bytes32, ZKPassportHelper);
  function verifyScopes(bytes32[] calldata publicInputs, string calldata domain, string calldata scope)
    external
    returns (bool);
}

// A mock zk passport verifier that returns an incrementing unique identifier (nullifier) - for happy case tests
contract MockZKPassportVerifier is IZKPassportVerifier {
  uint256 public uniqueIdentifier = 1;

  function verify(ProofVerificationParams calldata) external view returns (bool, bytes32, ZKPassportHelper) {
    return (true, bytes32(uniqueIdentifier), ZKPassportHelper(address(0)));
  }

  function verifyScopes(bytes32[] calldata, string calldata, string calldata) external pure returns (bool) {
    return true;
  }

  function incrementUniqueIdentifier() external {
    uniqueIdentifier++;
  }
}
