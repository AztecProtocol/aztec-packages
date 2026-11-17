// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {BlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract BatchedBlobWrapper {
  function validateBatchedBlob(bytes calldata _blobInput) external view returns (bool) {
    return BlobLib.validateBatchedBlob(_blobInput);
  }
}

/**
 * @notice Checks the batched blob opening the rollup circuits output against the point evaluation precompile.
 *
 * @dev Each checkpoint's blobs are opened at that checkpoint's own challenge z_k, and the epoch proof exposes
 *      D = sum_k alpha_k * (C_k - y_k * G + z_k * Q_k) and E = sum_k alpha_k * Q_k. The precompile, called with
 *      z = y = 0, checks e(D, [1]) == e(E, [s]).
 */
contract BatchedBlobOpeningTest is Test {
  // D and E output by test_two_checkpoints_batched in the blob circuits crate: a checkpoint with blobs [C_0, C_1]
  // followed by a checkpoint with [C_2], each opened at its own z. The KZG proofs Q_k are generated, and the pairing
  // checked independently, by noir-projects/fnd/noir-protocol-circuits/crates/blob/scripts/kzg_batch_fixtures.py.
  bytes internal constant D =
    hex"8379778e41802374175a2df22b8e4af30cb7dbb5b59dd696fdb9bb71236f9c2d4135aa4a844166d4f02630f8b2c7eac6";
  bytes internal constant E =
    hex"960e2e961dd06398352fdf430f32b19577de6461968e7e7db20bcc525ac832fb8f1b602235312d64d6befe8472551713";

  BatchedBlobWrapper internal wrapper;

  function setUp() public {
    wrapper = new BatchedBlobWrapper();
  }

  function test_BatchedOpeningOfTwoCheckpointsVerifies() public {
    uint256 gasBefore = gasleft();
    assertTrue(wrapper.validateBatchedBlob(_blobInput(D, bytes32(0), bytes32(0), E)));
    emit log_named_uint("validateBatchedBlob gas", gasBefore - gasleft());
  }

  function test_RevertWhen_ProofIsWrong() public {
    bytes memory input = _blobInput(D, bytes32(0), bytes32(0), D);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidBlobProof.selector, _versionedHash(D)));
    wrapper.validateBatchedBlob(input);
  }

  // A nonzero z or y would change the equation the precompile checks, so they must be zero.
  function test_RevertWhen_ZIsNotZero() public {
    bytes memory input = _blobInput(D, bytes32(uint256(1)), bytes32(0), E);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidBlobProof.selector, _versionedHash(D)));
    wrapper.validateBatchedBlob(input);
  }

  function test_RevertWhen_YIsNotZero() public {
    bytes memory input = _blobInput(D, bytes32(0), bytes32(uint256(1)), E);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidBlobProof.selector, _versionedHash(D)));
    wrapper.validateBatchedBlob(input);
  }

  function _blobInput(bytes memory _commitment, bytes32 _z, bytes32 _y, bytes memory _proof)
    internal
    pure
    returns (bytes memory)
  {
    return abi.encodePacked(_versionedHash(_commitment), _z, _y, _commitment, _proof);
  }

  function _versionedHash(bytes memory _commitment) internal pure returns (bytes32) {
    return (sha256(_commitment) & ~bytes32(uint256(0xff) << 248)) | bytes32(uint256(0x01) << 248);
  }
}
