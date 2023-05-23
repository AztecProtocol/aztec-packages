// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title Mock verifier
 * @author Aztec Labs
 * @notice Will assume that everything is valid proofs
 */
contract MockVerifier {
  /**
   * @notice A mock verification function that always return true
   * @param - The proof bytes, which are ignored
   * @param - The public inputs, which are ignored
   * @return True always
   */
  function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
    return true;
  }

  /**
   * @notice Get the verification key hash for the verifier
   * @return The verification key hash - In this case the bytes32 of "Im a mock"
   */
  function getVerificationKeyHash() public pure returns (bytes32) {
    return bytes32("Im a mock");
  }
}
