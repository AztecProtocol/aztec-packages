// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {Signature, SignatureLib} from "@aztec/shared/libraries/SignatureLib.sol";

/**
 * @notice The domain separator for the signatures
 */
enum SignatureDomainSeparator {
  blockProposal,
  blockAttestation
}

// A committee attestation can be made up of a signature and an address.
// Committee members that have attested will produce a signature, and if they have not attested, the signature will be
// empty and an address provided.
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

library AttestationLib {
  using SignatureLib for Signature;

  uint256 private constant SIGNATURE_LENGTH = 65; // v (1) + r (32) + s (32)
  uint256 private constant ADDRESS_LENGTH = 20;

  /**
   * @notice Checks if the given CommitteeAttestations is empty
   * @param _attestations - The committee attestations
   * @return True if the committee attestations are empty, false otherwise
   */
  function isEmpty(CommitteeAttestations memory _attestations) internal pure returns (bool) {
    return _attestations.signatureIndices.length == 0 && _attestations.signaturesOrAddresses.length == 0;
  }

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
  function isSignature(CommitteeAttestations memory _attestations, uint256 _index) internal pure returns (bool) {
    uint256 byteIndex = _index / 8;
    uint256 shift = 7 - (_index % 8);
    return (uint8(_attestations.signatureIndices[byteIndex]) >> shift) & 1 == 1;
  }

  /**
   * @notice Gets the signature at the given index
   * @param _attestations - The committee attestations
   * @param _index - The index of the signature to get
   */
  function getSignature(CommitteeAttestations memory _attestations, uint256 _index)
    internal
    pure
    returns (Signature memory)
  {
    bytes memory signaturesOrAddresses = _attestations.signaturesOrAddresses;
    require(isSignature(_attestations, _index), "Not a signature at this index");

    uint256 dataPtr;
    assembly {
      // Skip length
      dataPtr := add(signaturesOrAddresses, 0x20)
    }

    // Move to the start of the signature
    for (uint256 i = 0; i < _index; ++i) {
      dataPtr += isSignature(_attestations, i) ? SIGNATURE_LENGTH : ADDRESS_LENGTH;
    }

    uint8 v;
    bytes32 r;
    bytes32 s;

    assembly {
      v := byte(0, mload(dataPtr))
      dataPtr := add(dataPtr, 1)
      r := mload(dataPtr)
      dataPtr := add(dataPtr, 32)
      s := mload(dataPtr)
    }
    return Signature({v: v, r: r, s: s});
  }

  /**
   * @notice Gets the address at the given index
   * @param _attestations - The committee attestations
   * @param _index - The index of the address to get
   */
  function getAddress(CommitteeAttestations memory _attestations, uint256 _index) internal pure returns (address) {
    bytes memory signaturesOrAddresses = _attestations.signaturesOrAddresses;
    require(!isSignature(_attestations, _index), "A signature at this index");

    uint256 dataPtr;
    assembly {
      // Skip length
      dataPtr := add(signaturesOrAddresses, 0x20)
    }

    // Move to the start of the signature
    for (uint256 i = 0; i < _index; ++i) {
      dataPtr += isSignature(_attestations, i) ? SIGNATURE_LENGTH : ADDRESS_LENGTH;
    }

    address addr;
    assembly {
      addr := shr(96, mload(dataPtr))
    }

    return addr;
  }

  /**
   * Recovers the committee from the addresses in the attestations and signers.
   *
   * @param _attestations - The committee attestations
   * @param _signers The addresses of the committee members that signed the attestations. Provided in order to not have
   * to recover them from their attestations' signatures (and hence save gas). The addresses of the non-signing
   * committee members are directly included in the attestations.
   * @param _length - The number of addresses to return, should match the number of committee members
   * @return The addresses of the committee members.
   */
  function reconstructCommitteeFromSigners(
    CommitteeAttestations memory _attestations,
    address[] memory _signers,
    uint256 _length
  ) internal pure returns (address[] memory) {
    bytes memory signaturesOrAddresses = _attestations.signaturesOrAddresses;
    bytes memory signatureIndices = _attestations.signatureIndices;
    address[] memory addresses = new address[](_length);

    uint256 signersIndex;
    uint256 dataPtr;
    uint256 currentByte;
    uint256 bitMask;

    assembly {
      // Skip length
      dataPtr := add(signaturesOrAddresses, 0x20)
    }

    for (uint256 i = 0; i < _length; ++i) {
      // Load new byte every 8 iterations
      if (i % 8 == 0) {
        uint256 byteIndex = i / 8;
        currentByte = uint8(signatureIndices[byteIndex]);
        bitMask = 128; // 0b10000000
      }

      bool isSignatureFlag = (currentByte & bitMask) != 0;
      bitMask >>= 1;

      if (isSignatureFlag) {
        dataPtr += SIGNATURE_LENGTH;
        addresses[i] = _signers[signersIndex];
        signersIndex++;
      } else {
        address addr;
        assembly {
          addr := shr(96, mload(dataPtr))
          dataPtr := add(dataPtr, 20)
        }
        addresses[i] = addr;
      }
    }

    return addresses;
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
