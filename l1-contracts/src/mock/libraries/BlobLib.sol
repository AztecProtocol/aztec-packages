// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlobLib as CoreBlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";

/**
 * @title BlobLib - Blob Management and Validation Library
 * @author Aztec Labs
 * @notice Core library for handling blob operations, validation, and commitment management in the Aztec rollup.
 *
 * @dev This library provides functionality for managing blobs:
 *      - Blob hash retrieval and validation against EIP-4844 specifications
 *      - Blob commitment verification and batched blob proof validation
 *      - Blob base fee retrieval for transaction cost calculations
 *      - Accumulated blob commitments hash calculation for epoch proofs
 *
 *      VM_ADDRESS:
 *      The VM_ADDRESS (0x7109709ECfa91a80626fF3989D68f67F5b1DD12D) is a special address used to detect
 *      when the contract is running in a Foundry test environment. This address is derived from
 *      keccak256("hevm cheat code") and corresponds to Foundry's VM contract that provides testing utilities.
 *      When VM_ADDRESS.code.length > 0, it indicates we' dre in a test environment, allowing the library to:
 *      - Use Foundry's getBlobBaseFee() cheatcode instead of block.blobbasefee
 *      - Use Foundry's getBlobhashes() cheatcode instead of the blobhash() opcode
 *      This enables comprehensive testing of blob functionality without requiring actual blob transactions.
 *
 *      Blob Validation Flow:
 *      1. validateBlobs() processes checkpoint blob data, extracting commitments and validating against real blobs
 *      2. calculateBlobCommitmentsHash() accumulates commitments across an epoch for rollup circuit validation
 *      3. validateBatchedBlob() verifies batched blob proofs using the EIP-4844 point evaluation precompile
 *      4. calculateBlobHash() computes versioned hashes from commitments following EIP-4844 specification
 */
library BlobLib {
  address public constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
  uint256 internal constant VERSIONED_HASH_VERSION_KZG =
    0x0100000000000000000000000000000000000000000000000000000000000000; // 0x01 << 248 to be used in blobHashCheck

  /**
   * @notice  Get the blob base fee
   *
   * @dev     If we are in a foundry test, we use the cheatcode to get the blob base fee.
   *          Otherwise, we use the `block.blobbasefee`
   *
   * @return uint256 - The blob base fee
   */
  function getBlobBaseFee() internal view returns (uint256) {
    // During forge script broadcasts, the VM cheatcode may not work properly
    // (e.g., when broadcasting to anvil). In that case, we return a default value of 1
    // to allow deployment to proceed. This is acceptable for e2e testing purposes.
    // Lasse approved of this kludge to prevent being unable to deploy non-production
    // contracts in Forge without this.
    bool isAnvilTestChain = block.chainid == 31_337;
    if (isAnvilTestChain && VM_ADDRESS.code.length > 0) {
      // Use low-level staticcall to handle both reverts and empty returns
      (bool success, bytes memory data) = VM_ADDRESS.staticcall(abi.encodeWithSignature("getBlobBaseFee()"));
      if (success && data.length >= 32) {
        return abi.decode(data, (uint256));
      }
      // During broadcast to anvil, the cheatcode returns empty data. Return a sensible default.
      return 1;
    }
    return CoreBlobLib.getBlobBaseFee();
  }

  /**
   * @notice  Get the blob hash
   *
   * @dev     If we are in a foundry test, we use the cheatcode to get the blob hashes
   *          Otherwise, we use the `blobhash` function in assembly
   *
   *          During forge script broadcasts, the VM cheatcode may not work properly.
   *          In that case, we return bytes32(0) to allow deployment to proceed.
   *
   * @return blobHash - The blob hash
   */
  function getBlobHash(uint256 _index) internal view returns (bytes32 blobHash) {
    // See comment above about anvil broadcasts for reasoning here.
    bool isAnvilTestChain = block.chainid == 31_337;
    if (isAnvilTestChain && VM_ADDRESS.code.length > 0) {
      // Use low-level staticcall to handle both reverts and empty returns
      (bool success, bytes memory data) = VM_ADDRESS.staticcall(abi.encodeWithSignature("getBlobhashes()"));
      if (success && data.length >= 32) {
        bytes32[] memory blobHashes = abi.decode(data, (bytes32[]));
        if (_index < blobHashes.length) {
          return blobHashes[_index];
        }
      }
      // During broadcast to anvil, the cheatcode returns empty data or no blob hashes exist
      return bytes32(0);
    }
    return CoreBlobLib.getBlobHash(_index);
  }

  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    internal
    view
    returns (bytes32[] memory blobHashes, bytes32 blobsHashesCommitment, bytes[] memory blobCommitments)
  {
    return CoreBlobLib.validateBlobs(_blobsInput, _checkBlob);
  }

  function validateBatchedBlob(bytes calldata _blobInput) internal view returns (bool success) {
    return CoreBlobLib.validateBatchedBlob(_blobInput);
  }

  function calculateBlobCommitmentsHash(
    bytes32 _previousBlobCommitmentsHash,
    bytes[] memory _blobCommitments,
    bool _isFirstCheckpointOfEpoch
  ) internal pure returns (bytes32 currentBlobCommitmentsHash) {
    return CoreBlobLib.calculateBlobCommitmentsHash(
      _previousBlobCommitmentsHash, _blobCommitments, _isFirstCheckpointOfEpoch
    );
  }

  function calculateBlobHash(bytes memory _blobCommitment) internal pure returns (bytes32) {
    return CoreBlobLib.calculateBlobHash(_blobCommitment);
  }
}
