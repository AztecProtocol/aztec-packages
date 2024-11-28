// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

library BlobLib {
  /**
   * @notice  Validate a blob.
   * Input bytes:
   * input[:32]     - versioned_hash
   * input[32:64]   - z
   * input[64:96]   - y
   * input[96:144]  - commitment C
   * input[144:192] - proof (a commitment to the quotient polynomial q(X))
   *  - This can be relaxed to happen at the time of `submitProof` instead
   * @notice Apparently there is no guarantee that the blobs will be processed in the order sent
   * so the use of blobhash(_blobNumber) may fail in production
   * @param _blobInput - The above bytes to verify a blob
   */
  function validateBlob(bytes calldata _blobInput, uint256 _blobNumber, bool _checkBlob)
    internal
    view
    returns (bytes32 blobHash)
  {
    if (!_checkBlob) {
      return bytes32(_blobInput[0:32]);
    }
    assembly {
      blobHash := blobhash(_blobNumber)
    }
    require(blobHash == bytes32(_blobInput[0:32]), Errors.Rollup__InvalidBlobHash(blobHash));

    // Staticcall the point eval precompile https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile :
    (bool success,) = address(0x0a).staticcall(_blobInput);
    require(success, Errors.Rollup__InvalidBlobProof(blobHash));
  }

  /**
   * @notice  Validate an L2 block's blobs and return the hashed blobHashes and public inputs.
   * Input bytes:
   * input[:1] - num blobs in block
   * input[1:] - 192 * num blobs of the above _blobInput
   * @param _blobsInput - The above bytes to verify a blob
   */
  function validateBlobs(bytes calldata _blobsInput, bool _checkBlob)
    internal
    view
    returns (bytes32 blobsHash, bytes32 blobPublicInputsHash)
  {
    // We cannot input the incorrect number of blobs below, as the blobsHash
    // and epoch proof verification will fail.
    uint8 numBlobs = uint8(_blobsInput[0]);
    bytes32[] memory blobHashes = new bytes32[](numBlobs);
    bytes memory blobPublicInputs;
    for (uint256 i = 0; i < numBlobs; i++) {
      // Add 1 for the numBlobs prefix
      uint256 blobInputStart = i * 192 + 1;
      // Since an invalid blob hash here would fail the consensus checks of
      // the header, the `blobInput` is implicitly accepted by consensus as well.
      blobHashes[i] = validateBlob(_blobsInput[blobInputStart:blobInputStart + 192], i, _checkBlob);
      // We want to extract the 112 bytes we use for public inputs:
      //  * input[32:64]   - z
      //  * input[64:96]   - y
      //  * input[96:144]  - commitment C
      // Out of 192 bytes per blob.
      blobPublicInputs =
        abi.encodePacked(blobPublicInputs, _blobsInput[blobInputStart + 32:blobInputStart + 144]);
    }
    // Return the hash of all z, y, and Cs, so we can use them in proof verification later
    blobPublicInputsHash = sha256(blobPublicInputs);
    // Hash the EVM blob hashes for the block header
    blobsHash = Hash.sha256ToField(abi.encodePacked(blobHashes));
  }

  /**
   * @notice  Converts a BLS12 field element from bytes32 to a nr BigNum type
   * The nr bignum type for BLS12 fields is encoded as 3 nr fields - see blob_public_inputs.ts:
   * firstLimb = last 15 bytes;
   * secondLimb = bytes 2 -> 17;
   * thirdLimb = first 2 bytes;
   * Used when verifying epoch proofs to gather public inputs.
   * @param _input - The field in bytes32
   */
  function bytes32ToBigNum(bytes32 _input)
    internal
    pure
    returns (bytes32 firstLimb, bytes32 secondLimb, bytes32 thirdLimb)
  {
    firstLimb = bytes32(uint256(uint120(bytes15(_input << 136))));
    secondLimb = bytes32(uint256(uint120(bytes15(_input << 16))));
    thirdLimb = bytes32(uint256(uint16(bytes2(_input))));
  }
}
