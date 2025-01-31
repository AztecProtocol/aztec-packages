// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";

struct Signature {
  bool isEmpty;
  uint8 v;
  bytes32 r;
  bytes32 s;
}

library SignatureLib {
  /**
   * @notice The domain separator for the signatures
   */
  enum SignatureDomainSeparator {
    blockProposal,
    blockAttestation
  }

  /**
   * @notice Verified a signature, throws if the signature is invalid or empty
   *
   * @param _signature - The signature to verify
   * @param _signer - The expected signer of the signature
   * @param _digest - The digest that was signed
   */
  function verify(Signature memory _signature, address _signer, bytes32 _digest) internal pure {
    require(!_signature.isEmpty, Errors.SignatureLib__CannotVerifyEmpty());
    address recovered = ecrecover(_digest, _signature.v, _signature.r, _signature.s);
    require(_signer == recovered, Errors.SignatureLib__InvalidSignature(_signer, recovered));
  }

  function toBytes(Signature memory _signature) internal pure returns (bytes memory) {
    return abi.encodePacked(_signature.r, _signature.s, _signature.v);
  }
}
