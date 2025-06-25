// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Vm} from "forge-std/Vm.sol";

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
    if (VM_ADDRESS.code.length > 0) {
      return Vm(VM_ADDRESS).getBlobBaseFee();
    }
    return block.blobbasefee;
  }

  /**
   * @notice  Get the blob hash
   *
   * @dev     If we are in a foundry test, we use the cheatcode to get the blob hashes
   *          Otherwise, we use the `blobhash` function in assembly
   *
   * @return blobHash - The blob hash
   */
  function getBlobHash(uint256 _index) internal view returns (bytes32 blobHash) {
    if (VM_ADDRESS.code.length > 0) {
      // We know that this one is ABHORRENT. But it should not exists, and only will
      // be hit in testing.
      bytes32[] memory blobHashes = Vm(VM_ADDRESS).getBlobhashes();
      if (_index < blobHashes.length) {
        return blobHashes[_index];
      }
      return bytes32(0);
    }

    assembly {
      blobHash := blobhash(_index)
    }
  }

  /**
   * @notice  Validate an L2 block's blobs and return the blobHashes, the hashed blobHashes, and blob commitments.
   *
   *          We assume that the Aztec related blobs will be first in the propose transaction, additional blobs can be at the end.
   *
   * Input bytes:
   * input[0] - num blobs in block
   * input[1:] - blob commitments (48 bytes * num blobs in block)
   * @param _blobsInput - The above bytes to verify our input blob commitments match real blobs
   * @param _checkBlob - Whether to skip blob related checks. Hardcoded to true (See RollupCore.sol -> checkBlob), exists only to be overriden in tests.
   * Returns for proposal:
   * @return blobHashes - All of the blob hashes included in this block, to be emitted in L2BlockProposed event.
   * @return blobsHashesCommitment - A hash of all blob hashes in this block, to be included in the block header. See comment at the end of this fn for more info.
   * @return blobCommitments - All of the blob commitments included in this block, to be stored then validated against those used in the rollup in epoch proof verification.
   */
  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    internal
    view
    returns (
      bytes32[] memory blobHashes,
      bytes32 blobsHashesCommitment,
      bytes[] memory blobCommitments
    )
  {
    // We cannot input the incorrect number of blobs below, as the blobsHash
    // and epoch proof verification will fail.
    uint8 numBlobs = uint8(_blobsInput[0]);
    blobHashes = new bytes32[](numBlobs);
    blobCommitments = new bytes[](numBlobs);
    bytes32 blobHash;
    // Add 1 for the numBlobs prefix
    uint256 blobInputStart = 1;
    for (uint256 i = 0; i < numBlobs; i++) {
      // Commitments = arrays of bytes48 compressed points
      blobCommitments[i] = abi.encodePacked(
        _blobsInput[blobInputStart:blobInputStart + Constants.BLS12_POINT_COMPRESSED_BYTES]
      );
      blobInputStart += Constants.BLS12_POINT_COMPRESSED_BYTES;

      bytes32 blobHashCheck = calculateBlobHash(blobCommitments[i]);
      if (_checkBlob) {
        blobHash = getBlobHash(i);
        // The below check ensures that our injected blobCommitments indeed match the real
        // blobs submitted with this block. They are then used in the blobCommitmentsHash (see below).
        require(blobHash == blobHashCheck, Errors.Rollup__InvalidBlobHash(blobHash, blobHashCheck));
      } else {
        blobHash = blobHashCheck;
      }
      blobHashes[i] = blobHash;
    }
    // Hash the EVM blob hashes for the block header
    // TODO(#13430): The below blobsHashesCommitment known as blobsHash elsewhere in the code. The name blobsHashesCommitment is confusingly similar to blobCommitmentsHash
    // which are different values:
    // - blobsHash := sha256([blobhash_0, ..., blobhash_m]) = a hash of all blob hashes in a block with m+1 blobs inserted into the header, exists so a user can cross check blobs.
    // - blobCommitmentsHash := sha256( ...sha256(sha256(C_0), C_1) ... C_n) = iteratively calculated hash of all blob commitments in an epoch with n+1 blobs (see calculateBlobCommitmentsHash()),
    //   exists so we can validate injected commitments to the rollup circuits correspond to the correct real blobs.
    // We may be able to combine these values e.g. blobCommitmentsHash := sha256( ...sha256(sha256(blobshash_0), blobshash_1) ... blobshash_l) for an epoch with l+1 blocks.
    blobsHashesCommitment = Hash.sha256ToField(abi.encodePacked(blobHashes));
  }

  /**
   * @notice  Validate a batched blob.
   * Input bytes:
   * input[:32]     - versioned_hash - NB for a batched blob, this is simply the versioned hash of the batched commitment
   * input[32:64]   - z = poseidon2( ...poseidon2(poseidon2(z_0, z_1), z_2) ... z_n)
   * input[64:96]   - y = y_0 + gamma * y_1 + gamma^2 * y_2 + ... + gamma^n * y_n
   * input[96:144]  - commitment C = C_0 + gamma * C_1 + gamma^2 * C_2 + ... + gamma^n * C_n
   * input[144:192] - proof (a commitment to the quotient polynomial q(X)) = Q_0 + gamma * Q_1 + gamma^2 * Q_2 + ... + gamma^n * Q_n
   * @param _blobInput - The above bytes to verify a batched blob
   *
   * If this function passes where the values of z, y, and C are valid public inputs to the final epoch root proof, then
   * we know that the data in each blob of the epoch corresponds to the tx effects of all our proven txs in the epoch.
   *
   * The rollup circuits calculate each z_i and y_i as above, so if this function passes but they do not match the values from the
   * circuit, then proof verification will fail.
   *
   * Each commitment C_i is injected into the circuits and their correctness is validated using the blobCommitmentsHash, as
   * explained below in calculateBlobCommitmentsHash().
   *
   */
  function validateBatchedBlob(bytes calldata _blobInput) internal view returns (bool success) {
    // Staticcall the point eval precompile https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile :
    (success,) = address(0x0a).staticcall(_blobInput);
    require(success, Errors.Rollup__InvalidBlobProof(bytes32(_blobInput[0:32])));
  }

  /**
   * @notice  Calculate the current state of the blobCommitmentsHash. Called for each new proposed block.
   * @param _previousblobCommitmentsHash - The previous block's blobCommitmentsHash.
   * @param _blobCommitments - The commitments corresponding to this block's blobs.
   * @param _isFirstBlockOfEpoch - Whether this block is the first of an epoch (see below).
   *
   * The blobCommitmentsHash is an accumulated value calculated in the rollup circuits as:
   *    blobCommitmentsHash_i := sha256(blobCommitmentsHash_(i - 1), C_i)
   * for each blob commitment C_i in an epoch. For the first blob in the epoch (i = 0):
   *    blobCommitmentsHash_i := sha256(C_0)
   * which is why we require _isFirstBlockOfEpoch here.
   *
   * Each blob commitment is injected into the rollup circuits and we rely on the L1 contracts to validate
   * these commitments correspond to real blobs. The input _blobCommitments below come from validateBlobs()
   * so we know they are valid commitments here.
   *
   * We recalculate the same blobCommitmentsHash (which encompasses all claimed blobs in the epoch)
   * as in the rollup circuits, then use the final value as a public input to the root rollup proof
   * verification in EpochProofLib.sol.
   *
   * If the proof verifies, we know that the injected commitments used in the rollup circuits match
   * the real commitments to L1 blobs.
   *
   */
  function calculateBlobCommitmentsHash(
    bytes32 _previousblobCommitmentsHash,
    bytes[] memory _blobCommitments,
    bool _isFirstBlockOfEpoch
  ) internal pure returns (bytes32 currentblobCommitmentsHash) {
    uint256 i = 0;
    currentblobCommitmentsHash = _previousblobCommitmentsHash;
    // If we are at the first block of an epoch, we reinitialise the blobCommitmentsHash.
    // Blob commitments are collected and proven per root rollup proof => per epoch.
    if (_isFirstBlockOfEpoch) {
      // Initialise the blobCommitmentsHash
      currentblobCommitmentsHash = Hash.sha256ToField(abi.encodePacked(_blobCommitments[i++]));
    }
    for (i; i < _blobCommitments.length; i++) {
      currentblobCommitmentsHash =
        Hash.sha256ToField(abi.encodePacked(currentblobCommitmentsHash, _blobCommitments[i]));
    }
  }

  /**
   * @notice  Calculate the expected blob hash given a blob commitment
   * @dev TODO(#14646): Use kzg_to_versioned_hash & VERSIONED_HASH_VERSION_KZG
   * Until we use an external kzg_to_versioned_hash(), calculating it here:
   * EIP-4844 spec blobhash is 32 bytes: [version, ...sha256(commitment)[1:32]]
   * The version = VERSIONED_HASH_VERSION_KZG, currently 0x01.
   * @param _blobCommitment - The 48 byte blob commitment
   * @return bytes32 - The blob hash
   */
  function calculateBlobHash(bytes memory _blobCommitment) internal pure returns (bytes32) {
    return bytes32(
      (
        uint256(sha256(_blobCommitment))
          & 0x00FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
      ) | VERSIONED_HASH_VERSION_KZG
    );
  }
}
