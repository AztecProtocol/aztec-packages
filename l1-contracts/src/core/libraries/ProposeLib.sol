// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {OracleInput} from "@aztec/core/libraries/FeeMath.sol";

struct ProposeArgs {
  bytes32 archive;
  bytes32 blockHash;
  OracleInput oracleInput;
  bytes header;
  bytes32[] txHashes;
}

library ProposeLib {
  function digest(ProposeArgs memory _args) internal pure returns (bytes32) {
    return keccak256(abi.encode(SignatureLib.SignatureDomainSeperator.blockAttestation, _args));
  }
}
