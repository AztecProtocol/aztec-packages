// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity ^0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Signature, SignatureLib} from "@aztec/shared/libraries/SignatureLib.sol";

uint256 constant SIGNATURE_LENGTH = 65; // v (1) + r (32) + s (32)
uint256 constant ADDRESS_LENGTH = 20;

/**
 * @notice The domain separator for the signatures
 */
enum SignatureDomainSeparator {
  blockProposal,
  blockAttestation,
  attestationsAndSigners
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

  /**
   * @notice Checks if the given CommitteeAttestations is empty
   *          Wll return true if either component is empty as they are needed together.
   * @param _attestations - The committee attestations
   * @return True if the committee attestations are empty, false otherwise
   */
  function isEmpty(CommitteeAttestations memory _attestations) internal pure returns (bool) {
    return _attestations.signatureIndices.length == 0 || _attestations.signaturesOrAddresses.length == 0;
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
    require(isSignature(_attestations, _index), Errors.AttestationLib__NotASignatureAtIndex(_index));

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
    require(!isSignature(_attestations, _index), Errors.AttestationLib__NotAnAddressAtIndex(_index));

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
   * @custom:reverts SignatureIndicesSizeMismatch if the signature indices have a wrong size
   * @custom:reverts OutOfBounds throws if reading data beyond the `_attestations`
   * @custom:reverts SignaturesOrAddressesSizeMismatch if the signatures or addresses object has wrong size
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
    uint256 bitmapBytes = (_length + 7) / 8; // Round up to nearest byte
    require(
      bitmapBytes == _attestations.signatureIndices.length,
      Errors.AttestationLib__SignatureIndicesSizeMismatch(bitmapBytes, _attestations.signatureIndices.length)
    );

    // To get a ref that we can easily use with the assembly down below.
    bytes memory signaturesOrAddresses = _attestations.signaturesOrAddresses;
    address[] memory addresses = new address[](_length);

    uint256 signersIndex;
    uint256 dataPtr;
    uint256 currentByte;
    uint256 bitMask;

    assembly {
      // Skip length
      dataPtr := add(signaturesOrAddresses, 0x20)
    }
    uint256 offset = dataPtr;

    for (uint256 i = 0; i < _length; ++i) {
      // Load new byte every 8 iterations
      if (i % 8 == 0) {
        uint256 byteIndex = i / 8;
        currentByte = uint8(_attestations.signatureIndices[byteIndex]);
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

    // Ensure that the size of data provided actually matches what we expect
    uint256 sizeOfSignaturesAndAddresses =
      (signersIndex * SIGNATURE_LENGTH) + ((_length - signersIndex) * ADDRESS_LENGTH);
    require(
      sizeOfSignaturesAndAddresses == _attestations.signaturesOrAddresses.length,
      Errors.AttestationLib__SignaturesOrAddressesSizeMismatch(
        sizeOfSignaturesAndAddresses, _attestations.signaturesOrAddresses.length
      )
    );
    require(signersIndex == _signers.length, Errors.AttestationLib__SignersSizeMismatch(signersIndex, _signers.length));

    // Ensure that the reads were within the boundaries of the data, and that we have read all the data.
    // This check is an extra precaution. There are two cases, we we would end up with an invalid
    // read, and both should be covered by the above checks.
    // 1. If trying to read beyond the expected data, the bitmap must have more ones than signatures,
    // but this will make the the `sizeOfSignaturesAndAddresses` larger than passed data.
    // 2. If trying to read less than expected data, the bitmap must have fewer ones than signatures,
    // but this will make the the `sizeOfSignaturesAndAddresses` smaller than passed data.
    uint256 upperLimit = offset + _attestations.signaturesOrAddresses.length;
    require(dataPtr == upperLimit, Errors.AttestationLib__InvalidDataSize(dataPtr - offset, upperLimit - offset));

    return addresses;
  }

  function getAttestationsAndSignersDigest(CommitteeAttestations memory _attestations, address[] memory _signers)
    internal
    pure
    returns (bytes32)
  {
    return keccak256(abi.encode(SignatureDomainSeparator.attestationsAndSigners, _attestations, _signers));
  }
}
