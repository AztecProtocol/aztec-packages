// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {
  CommitteeAttestation,
  CommitteeAttestations,
  SIGNATURE_LENGTH,
  ADDRESS_LENGTH
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Signature, SignatureLib} from "@aztec/shared/libraries/SignatureLib.sol";

library AttestationLibHelper {
  using SignatureLib for Signature;

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
      if (!_attestations[i].signature.isEmpty()) {
        totalDataSize += SIGNATURE_LENGTH;
      } else {
        totalDataSize += ADDRESS_LENGTH;
      }
    }

    bytes memory signaturesOrAddresses = new bytes(totalDataSize);
    uint256 dataIndex = 0;

    // Pack the data
    for (uint256 i = 0; i < length; i++) {
      bool hasSignature = !_attestations[i].signature.isEmpty();

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
        dataIndex += ADDRESS_LENGTH;
      }
    }

    return CommitteeAttestations({signatureIndices: signatureIndices, signaturesOrAddresses: signaturesOrAddresses});
  }
}
