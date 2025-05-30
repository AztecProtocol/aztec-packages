// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Vm} from "forge-std/Vm.sol";

library BlobLib {
  address public constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));

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
   * @notice  Validate an L2 block's blobs and return the hashed blobHashes and public inputs.
   * Input bytes:
   * input[:1] - num blobs in block
   * input[1:] - blob commitments (48 bytes * num blobs in block)
   * @param _blobsInput - The above bytes to verify our input blob commitments match real blobs
   */
  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    internal
    view
    returns (
      // All of the blob hashes included in this blob
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

      // TODO(MW): Use kzg_to_versioned_hash & VERSIONED_HASH_VERSION_KZG
      // Using bytes32 array to force bytes into memory
      bytes32[1] memory blobHashCheck = [sha256(blobCommitments[i])];
      assembly {
        mstore8(blobHashCheck, 0x01)
      }
      if (_checkBlob) {
        assembly {
          blobHash := blobhash(i)
        }
        require(
          blobHash == blobHashCheck[0], Errors.Rollup__InvalidBlobHash(blobHash, blobHashCheck[0])
        );
      } else {
        blobHash = blobHashCheck[0];
      }
      blobHashes[i] = blobHash;
    }
    // Hash the EVM blob hashes for the block header
    blobsHashesCommitment = Hash.sha256ToField(abi.encodePacked(blobHashes));
  }

  /**
   * @notice  Validate a batched blob.
   * Input bytes:
   * input[:32]     - versioned_hash - NB for a batched blob, this is simply the versioned hash of the batched commitment
   * input[32:64]   - z = poseidon2( ...poseidon2(poseidon2(z_0, z_1), z_2) ... z_n)
   * input[64:96]   - y = y_0 + gamma * y_1 + gamma^2 * y_2 + ... + gamma^n * y_n
   * input[96:144]  - commitment C = C_0 + gamma * C_1 + gamma^2 * C_2 + ... + gamma^n * C_n
   * input[144:192] - proof (a commitment to the quotient polynomial q(X)) = Q_0 + gamma * C_1 + gamma^2 * C_2 + ... + gamma^n * C_n
   * @param _blobInput - The above bytes to verify a batched blob
   */
  function validateBatchedBlob(bytes calldata _blobInput) internal view returns (bool success) {
    // Staticcall the point eval precompile https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile :
    (success,) = address(0x0a).staticcall(_blobInput);
    require(success, Errors.Rollup__InvalidBlobProof(bytes32(_blobInput[0:32])));
  }
}
