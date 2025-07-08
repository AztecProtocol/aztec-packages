// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";

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

struct CommitteeAttestations {
  // bitmap of which indices are signatures
  bytes signatureIndices;
  // tightly packed signatures and addresses
  bytes signaturesOrAddresses;
}

error SignatureLib__InvalidSignature(address, address);

library SignatureLib {
  /**
   * @notice Checks if the given index in the CommitteeAttestations is a signature
   * @param _attestations - The committee attestations
   * @param _index - The index to check
   * @return True if the index is a signature, false otherwise
   *
   * @dev The signatureIndices is a bitmap of which indices are signatures.
   * The index is a signature if the bit at the index is 1.
   * The index is an address if the bit at the index is 0.
   *
   * See its use over in ValidatorSelectionLib.sol
   */
  function isSignature(CommitteeAttestations memory _attestations, uint256 _index)
    internal
    pure
    returns (bool)
  {
    uint256 byteIndex = _index / 8;
    uint256 shift = 7 - (_index % 8);
    return (uint8(_attestations.signatureIndices[byteIndex]) >> shift) & 1 == 1;
  }

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
    address recovered = ECDSA.recover(_digest, _signature.v, _signature.r, _signature.s);
    require(_signer == recovered, SignatureLib__InvalidSignature(_signer, recovered));
    return true;
  }

  function isEmpty(Signature memory _signature) internal pure returns (bool) {
    return _signature.v == 0;
  }

  /**
   * @notice Converts an array of CommitteeAttestation into packed CommitteeAttestations format
   * @param _attestations Array of individual committee attestations
   * @return Packed committee attestations with bitmap and tightly packed data
   */
  function packAttestations(CommitteeAttestation[] memory _attestations)
    internal
    pure
    returns (CommitteeAttestations memory)
  {
    uint256 length = _attestations.length;

    // Calculate bitmap size (1 bit per attestation, rounded up to nearest byte)
    uint256 bitmapSize = (length + 7) / 8;
    bytes memory signatureIndices = new bytes(bitmapSize);

    // Calculate total size needed for packed data
    uint256 totalDataSize = 0;
    for (uint256 i = 0; i < length; i++) {
      if (!isEmpty(_attestations[i].signature)) {
        totalDataSize += 65; // v (1) + r (32) + s (32)
      } else {
        totalDataSize += 20; // address only
      }
    }

    bytes memory signaturesOrAddresses = new bytes(totalDataSize);
    uint256 dataIndex = 0;

    // Pack the data
    for (uint256 i = 0; i < length; i++) {
      bool hasSignature = !isEmpty(_attestations[i].signature);

      // Set bit in bitmap
      if (hasSignature) {
        uint256 byteIndex = i / 8;
        uint256 bitIndex = 7 - (i % 8);
        signatureIndices[byteIndex] |= bytes1(uint8(1 << bitIndex));

        // Pack signature: v + r + s
        signaturesOrAddresses[dataIndex] = bytes1(_attestations[i].signature.v);
        dataIndex++;

        // Pack r
        bytes32 r = _attestations[i].signature.r;
        assembly {
          mstore(add(add(signaturesOrAddresses, 0x20), dataIndex), r)
        }
        dataIndex += 32;

        // Pack s
        bytes32 s = _attestations[i].signature.s;
        assembly {
          mstore(add(add(signaturesOrAddresses, 0x20), dataIndex), s)
        }
        dataIndex += 32;
      } else {
        // Pack address only
        address addr = _attestations[i].addr;
        assembly {
          // Store address in the next 20 bytes
          let dataPtr := add(add(signaturesOrAddresses, 0x20), dataIndex)
          mstore(dataPtr, shl(96, addr))
        }
        dataIndex += 20;
      }
    }

    return CommitteeAttestations({
      signatureIndices: signatureIndices,
      signaturesOrAddresses: signaturesOrAddresses
    });
  }
}
