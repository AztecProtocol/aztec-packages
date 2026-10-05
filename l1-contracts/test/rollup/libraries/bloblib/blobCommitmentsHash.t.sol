// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {BlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";

/**
 * @notice Checks that the blob commitments hash binds which checkpoint proposal each blob was attached to.
 *
 * @dev L1 folds the KZG commitments of every blob attached to each `propose` call into one hash per epoch, and the
 *      epoch proof is only accepted if the rollup circuits computed the same hash from the blobs they proved. The
 *      circuits split an epoch's blobs into checkpoints by each checkpoint's own data. Nodes rebuild each checkpoint
 *      only from the blobs attached to its own proposal. So if L1's hash depended only on the order of the epoch's
 *      blobs, a proposer could attach one checkpoint's last blob to the next checkpoint's proposal instead. Every
 *      L1 check would still pass and the epoch could still be proven, but no node could decode either checkpoint.
 *      Once the epoch is proven it is never pruned, so every node would stop syncing there.
 *
 *      The hash therefore includes a flag on the first blob of each proposal, and the circuits flag the first blob of
 *      each checkpoint they prove. This test proposes the same three blobs split two ways and checks that only the
 *      split the circuits proved matches their hash.
 */
contract BlobCommitmentsHashTest is Test {
  // Generated from labs/yarn-project/blob-lib/src/blob_batching.test.ts; run it with AZTEC_GENERATE_TEST_DATA=1 to
  // rewrite them, then forge fmt. C_0, C_1 and C_2 are the compressed KZG commitments of three blobs, the same ones
  // test_commitments_hash_binds_checkpoint_boundaries in the blob circuits crate uses. PROVEN_BLOB_COMMITMENTS_HASH is
  // the blob commitments hash the rollup circuits compute, and the epoch proof exposes, for a checkpoint whose data
  // spans [C_0, C_1] followed by one with [C_2].
  bytes internal constant C_0 =
    hex"b715705504cd781b65efd4f539e321e4d17adfebfabcadc58a67da75e8c3ee4a09c1c8bbec58d7e25cc840d31e1a0361";
  bytes internal constant C_1 =
    hex"aac039001f300677e564710b67c3ef2b1f469d649e59ee9920f46f5f586bc9f6cbab3ed5948aa3d00fe77b1b2876ecd7";
  bytes internal constant C_2 =
    hex"8d4847308ba7a7145cd3d90a7801a23f0f6bba75b7a0c3065ee47dd17fa801cbcb2d936449435dd85db10daa4a93572a";
  bytes32 internal constant PROVEN_BLOB_COMMITMENTS_HASH =
    0x00c2e3fd7e66a854ce9341649163496ca99c94794099e4bfe1bf084374f34f9a;

  // The epoch proof's blobCommitmentsHash public input comes from this hash, so proposals that attach the same blobs
  // but move C_1 into the second checkpoint must not match what the circuits proved.
  function test_ShiftedSplitDoesNotMatchTheCircuits() public pure {
    assertEq(_hashProposals(_blobs(C_0, C_1), _blobs(C_2)), PROVEN_BLOB_COMMITMENTS_HASH);
    assertNotEq(_hashProposals(_blobs(C_0), _blobs(C_1, C_2)), PROVEN_BLOB_COMMITMENTS_HASH);
  }

  function _hashProposals(bytes[] memory _first, bytes[] memory _second) internal pure returns (bytes32) {
    bytes32 afterFirst = BlobLib.calculateBlobCommitmentsHash(bytes32(0), _first, true);
    return BlobLib.calculateBlobCommitmentsHash(afterFirst, _second, false);
  }

  function _blobs(bytes memory _a) internal pure returns (bytes[] memory blobs) {
    blobs = new bytes[](1);
    blobs[0] = _a;
  }

  function _blobs(bytes memory _a, bytes memory _b) internal pure returns (bytes[] memory blobs) {
    blobs = new bytes[](2);
    blobs[0] = _a;
    blobs[1] = _b;
  }
}
