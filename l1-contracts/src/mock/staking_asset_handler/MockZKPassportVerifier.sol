// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering
// solhint-disable func-param-name-leading-underscore

import {ProofVerificationParams} from "@zkpassport/ZKPassportVerifier.sol";

interface IZKPassportVerifier {
  function verifyProof(ProofVerificationParams calldata params) external returns (bool, bytes32);
  function verifyScopes(
    bytes32[] calldata publicInputs,
    string calldata scope,
    string calldata subscope
  ) external returns (bool);
}

// A mock zk passport verifier that returns an incrementing unique identifier (nullifier) - for happy case tests
contract MockZKPassportVerifier is IZKPassportVerifier {
  uint256 public uniqueIdentifier = 1;

  function verifyProof(ProofVerificationParams calldata) external view returns (bool, bytes32) {
    return (true, bytes32(uniqueIdentifier));
  }

  function verifyScopes(bytes32[] calldata, string calldata, string calldata)
    external
    pure
    returns (bool)
  {
    return true;
  }

  function incrementUniqueIdentifier() external {
    uniqueIdentifier++;
  }
}
