// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollupCore, RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {CompressedTempBlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {
  CommitteeAttestations, SignatureLib, Signature
} from "@aztec/shared/libraries/SignatureLib.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";

library InvalidateLib {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using ChainTipsLib for CompressedChainTips;
  using SignatureLib for CommitteeAttestations;
  using MessageHashUtils for bytes32;
  using CompressedTimeMath for CompressedSlot;

  /**
   * @notice Invalidates a block with a bad attestation signature
   * @dev Anyone can call this function to remove blocks with invalid attestations
   * @dev No rebate is provided for calling this function
   * @param _blockNumber The block number to invalidate
   * @param _attestations The attestations that are claimed to be invalid
   * @param _committee The committee members for the epoch
   * @param _invalidIndex The index of the invalid attestation in the committee
   */
  function invalidateBadAttestation(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee,
    uint256 _invalidIndex
  ) internal {
    (bytes32 digest,) = _validateInvalidationInputs(_blockNumber, _attestations, _committee);

    // Verify that the attestation at invalidIndex is actually invalid
    // Check if there's a signature at the invalid index
    if (_attestations.isSignature(_invalidIndex)) {
      // Extract the signature and verify it does NOT match the expected committee member at the given index
      Signature memory signature = _attestations.getSignature(_invalidIndex);
      address recovered = ECDSA.recover(digest, signature.v, signature.r, signature.s);

      // The signature is invalid if the recovered address doesn't match the committee member
      require(recovered != _committee[_invalidIndex], Errors.Rollup__AttestationsAreValid());
    } else {
      // If it's an address attestation, we need to ensure it's marked as invalid
      // This would typically mean the address doesn't match what's expected
      // For now, we'll revert as address attestations are assumed valid
      revert Errors.Rollup__AttestationsAreValid();
    }

    _invalidateBlock(_blockNumber);
  }

  /**
   * @notice Invalidates a block with insufficient attestations
   * @dev Anyone can call this function to remove blocks with insufficient attestations
   * @dev No rebate is provided for calling this function
   * @param _blockNumber The block number to invalidate
   * @param _attestations The attestations that are claimed to be insufficient
   * @param _committee The committee members for the epoch
   */
  function invalidateInsufficientAttestations(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) internal {
    (, uint256 committeeSize) = _validateInvalidationInputs(_blockNumber, _attestations, _committee);

    uint256 signatureCount = 0;
    for (uint256 i = 0; i < committeeSize; ++i) {
      if (_attestations.isSignature(i)) {
        signatureCount++;
      }
    }

    // Calculate required threshold (2/3 + 1)
    uint256 requiredSignatures = (committeeSize << 1) / 3 + 1; // committeeSize * 2 / 3 + 1

    // Ensure the number of valid signatures is actually insufficient
    require(
      signatureCount < requiredSignatures,
      Errors.ValidatorSelection__InsufficientAttestations(requiredSignatures, signatureCount)
    );

    _invalidateBlock(_blockNumber);
  }

  /**
   * @notice Common validation logic for invalidation functions. Verifies that the block is in the pending chain,
   *         that the attestations match the stored hash, and that the committee commitment is valid.
   * @param _blockNumber The block number to validate
   * @param _attestations The attestations to validate
   * @param _committee The committee members for the epoch
   * @return digest Digest of the payload that was signed by the committee
   * @return committeeSize The size of the committee
   */
  function _validateInvalidationInputs(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) private returns (bytes32, uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();

    // Block must be in the pending chain
    require(
      _blockNumber <= rollupStore.tips.getPendingBlockNumber(),
      Errors.Rollup__BlockNotInPendingChain()
    );

    // But not yet proven
    require(
      _blockNumber > rollupStore.tips.getProvenBlockNumber(), Errors.Rollup__BlockAlreadyProven()
    );

    // Get the stored block data
    CompressedTempBlockLog storage blockLog = STFLib.getStorageTempBlockLog(_blockNumber);

    // Verify that the provided attestations match the stored hash
    bytes32 providedAttestationsHash = keccak256(abi.encode(_attestations));
    require(
      providedAttestationsHash == blockLog.attestationsHash, Errors.Rollup__InvalidAttestations()
    );

    // Get the epoch for the block's slot to verify committee
    Epoch epoch = blockLog.slotNumber.decompress().epochFromSlot();

    // Get and verify the committee commitment
    (bytes32 committeeCommitment, uint256 committeeSize) =
      ValidatorSelectionLib.getCommitteeCommitmentAt(epoch);
    bytes32 providedCommitteeCommitment = keccak256(abi.encode(_committee));
    require(
      committeeCommitment == providedCommitteeCommitment,
      Errors.ValidatorSelection__InvalidCommitteeCommitment(
        providedCommitteeCommitment, committeeCommitment
      )
    );

    // Get the digest of the payload that was signed by the committee
    bytes32 digest = blockLog.payloadDigest.toEthSignedMessageHash();

    return (digest, committeeSize);
  }

  /**
   * @notice Invalidates a block by resetting the pending block number to the one immediately before it.
   * @param _blockNumber The block number to invalidate
   */
  function _invalidateBlock(uint256 _blockNumber) private {
    RollupStore storage rollupStore = STFLib.getStorage();
    rollupStore.tips = rollupStore.tips.updatePendingBlockNumber(_blockNumber - 1);
    emit IRollupCore.BlockInvalidated(_blockNumber);
  }
}
