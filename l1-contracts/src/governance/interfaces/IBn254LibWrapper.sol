// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

interface IBn254LibWrapper {
  function proofOfPossession(
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) external view returns (bool);

  function g1ToDigestPoint(G1Point memory pk1) external view returns (G1Point memory);
}
