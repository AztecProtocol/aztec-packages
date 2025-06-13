// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

/**
 * @notice The domain separator for the signatures
 */
enum SignatureDomainSeparator {
  blockProposal,
  blockAttestation
}

// Attestation Signature
struct Signature {
  uint8 v;
  bytes32 r;
  bytes32 s;
}

// A committee attestation can be made up of a signature and an address.
// Committee members that have attested will produce a signature, and if they have not attested, the signature will be empty and
// an address provided.
struct CommitteeAttestation {
  address addr;
  Signature signature;
}

error SignatureLib__InvalidSignature(address, address);

library SignatureLib {
  /**
   * @notice Verified a signature, throws if the signature is invalid or empty
   *
   * @param _signature - The signature to verify
   * @param _signer - The expected signer of the signature
   * @param _digest - The digest that was signed
   */
  function verify(Signature memory _signature, address _signer, bytes32 _digest)
    internal
    pure
    returns (bool)
  {
    address recovered = ecrecover(_digest, _signature.v, _signature.r, _signature.s);
    require(_signer == recovered, SignatureLib__InvalidSignature(_signer, recovered));
    return true;
  }

  function toBytes(Signature memory _signature) internal pure returns (bytes memory) {
    return abi.encodePacked(_signature.r, _signature.s, _signature.v);
  }

  function isEmpty(Signature memory _signature) internal pure returns (bool) {
    return _signature.v == 0;
  }
}
