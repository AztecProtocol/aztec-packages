// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

library EIP712Lib {
  struct EIP712Domain {
    string name;
    string version;
  }

  bytes32 public constant EIP712DOMAIN_TYPEHASH =
    keccak256("EIP712Domain(string name,string version)");

  bytes32 public constant DOMAIN_SEPARATOR =
    0xa5a70ffb22bda94bb24c78bd9ec602157f08294910e13b891f0f17910c9ebe1f;
  // hash(EIP712Lib.EIP712Domain({name: "Aztec Rollup", version: "1"}));

  function hash(EIP712Domain memory eip712Domain) internal pure returns (bytes32) {
    return keccak256(
      abi.encode(
        EIP712DOMAIN_TYPEHASH,
        keccak256(bytes(eip712Domain.name)),
        keccak256(bytes(eip712Domain.version))
      )
    );
  }
}
