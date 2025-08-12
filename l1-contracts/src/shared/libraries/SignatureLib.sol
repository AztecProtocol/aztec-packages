// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";

// Signature
struct Signature {
  uint8 v;
  bytes32 r;
  bytes32 s;
}

error SignatureLib__InvalidSignature(address, address);

library SignatureLib {
  /**
   * @notice Verifies a signature, throws if the signature is invalid or empty
   *
   * @param _signature - The signature to verify
   * @param _signer - The expected signer of the signature
   * @param _digest - The digest that was signed
   */
  function verify(Signature memory _signature, address _signer, bytes32 _digest) internal pure returns (bool) {
    address recovered = ECDSA.recover(_digest, _signature.v, _signature.r, _signature.s);
    require(_signer == recovered, SignatureLib__InvalidSignature(_signer, recovered));
    return true;
  }

  function isEmpty(Signature memory _signature) internal pure returns (bool) {
    return _signature.v == 0;
  }
}
