// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

interface IVerifier {
  function verify(bytes calldata _proof, bytes32[] calldata _publicInputs)
    external
    view
    returns (bool);
}
