// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollupCore, RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {CompressedTempBlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Signature, AttestationLib, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";

/**
 * @title InvalidateLib
 * @author Aztec Labs
 * @notice Library responsible for handling the invalidation of L2 blocks with incorrect attestations in the Aztec
 * rollup.
 *
 * @dev This library implements the invalidation mechanism that allows anyone to remove invalid blocks from the
 *      pending chain. An invalid block is one without proper attestations.
 *
 *      The invalidation system addresses two main types of attestation failures:
 *      1. Bad attestation signatures: When committee members provide invalid signatures
 *      2. Insufficient attestations: When a block doesn't meet the required >2/3 committee threshold
 *
 *      Key invariants:
 *      - Only pending (unproven) blocks can be invalidated
 *      - Block must exist in the pending chain (between proven tip and pending tip)
 *      - Invalid blocks and all subsequent blocks are removed from the pending chain
 *
 *      Security model:
 *      - Anyone can call invalidation functions (permissionless)
 *      - No economic incentive (rebate) is provided for calling these functions
 *      - Expected to be called by next proposer, then committee members, then any validator as fallback
 *      - Invalidation reverts the pending chain tip to the block immediately before the invalid one
 *
 *      Integration with the rollup system:
 *      - Works with STFLib for storage access and chain state management
 *      - Uses ValidatorSelectionLib to verify committee commitments
 *      - Validates against TempBlockLog storage for block metadata
 *      - Emits BlockInvalidated events via IRollupCore interface
 *
 *      This invalidation mechanism ensures that even though attestations are not fully validated onchain
 *      during block proposal (to save gas), invalid attestations can be challenged and removed after the fact,
 *      maintaining the security of the rollup while optimizing for efficient block production.
 *
 *      Note that attestations are validated during the proof submission, but not at every propose call.
 */
library InvalidateLib {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using ChainTipsLib for CompressedChainTips;
  using AttestationLib for CommitteeAttestations;
  using MessageHashUtils for bytes32;
  using CompressedTimeMath for CompressedSlot;

  /**
   * @notice Invalidates a block containing an invalid attestation
   * @dev Anyone can call this function to remove blocks with invalid attestations.
   *
   *      There are two cases where an individual attestation might be invalid:
   *      1. The attestation is a signature that does not recover to the address from the committee
   *      2. The attestation is an address, that does not match the address from the committee
   *
   *      Upon successful validation of the invalid attestation, the block and all subsequent pending
   *      blocks are removed from the chain by resetting the pending tip to the previous valid block.
   *
   *      No economic rebate is provided for calling this function.
   *
   * @param _blockNumber The L2 block number to invalidate (must be in pending chain)
   * @param _attestations The attestations that were submitted with the block (must match stored hash)
   * @param _committee The committee members for the block's epoch (must match stored computed commitment)
   * @param _invalidIndex The index in the committee/attestations array of the invalid attestation
   *
   * @custom:reverts Errors.Rollup__BlockNotInPendingChain If block number is beyond pending tip
   * @custom:reverts Errors.Rollup__BlockAlreadyProven If block number is already proven
   * @custom:reverts Errors.Rollup__InvalidAttestations If provided attestations don't match stored hash
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment If committee doesn't match stored commitment
   * @custom:reverts Rollup__InvalidAttestationIndex if the _invalidIndex is beyond the committee
   * @custom:reverts Errors.Rollup__AttestationsAreValid If the attestation at invalidIndex is actually valid
   */
  function invalidateBadAttestation(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee,
    uint256 _invalidIndex
  ) internal {
    (bytes32 digest, uint256 committeeSize) = _validateInvalidationInputs(_blockNumber, _attestations, _committee);
    require(_invalidIndex < committeeSize, Errors.Rollup__InvalidAttestationIndex());

    address recovered;

    // Verify that the attestation at invalidIndex does not match the the expected attestation
    // i.e., either recover the address directly from the attestations if no signature
    // or recover the address from the signature if there is a signature.
    // Then take the recovered address and check it against the committee
    if (!_attestations.isSignature(_invalidIndex)) {
      recovered = _attestations.getAddress(_invalidIndex);
    } else {
      Signature memory signature = _attestations.getSignature(_invalidIndex);
      // We use `tryRecover` instead of `recover` since we want improper signatures to return `address(0)` rather than
      // revert. Since `address(0)` is not allowed as an attester, this will cause the recovered address to not match
      // the committee data.
      (recovered,,) = ECDSA.tryRecover(digest, signature.v, signature.r, signature.s);
    }

    require(recovered != _committee[_invalidIndex], Errors.Rollup__AttestationsAreValid());

    _invalidateBlock(_blockNumber);
  }

  /**
   * @notice Invalidates a block that doesn't meet the required >2/3 committee attestation threshold
   * @dev Anyone can call this function to remove blocks with insufficient valid attestations.
   *
   *      The function counts the number of signature attestations (as opposed to address attestations) and
   *      compares against the required threshold of (committeeSize * 2 / 3) + 1. If insufficient signatures
   *      are present, the block and all subsequent pending blocks are removed from the chain.
   *
   *      No economic rebate is provided for calling this function.
   *
   * @param _blockNumber The L2 block number to invalidate (must be in pending chain)
   * @param _attestations The attestations that were submitted with the block (must match stored hash)
   * @param _committee The committee members for the block's epoch (must match stored commitment)
   *
   * @custom:reverts Errors.Rollup__BlockNotInPendingChain If block number is beyond pending tip
   * @custom:reverts Errors.Rollup__BlockAlreadyProven If block number is already proven
   * @custom:reverts Errors.Rollup__InvalidAttestations If provided attestations don't match stored hash
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment If committee doesn't match stored commitment
   * @custom:reverts Errors.ValidatorSelection__InsufficientAttestations If the attestations actually meet the threshold
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
   * @notice Common validation logic shared by all invalidation functions
   * @dev Performs validation checks to ensure invalidation calls are legitimate and target valid blocks.
   *      This function establishes the foundation for all invalidation operations by verifying:
   *
   *      1. Block existence and state: The target block must be in the pending chain (after the proven tip
   *         but not beyond the pending tip). Proven blocks cannot be invalidated as they are final.
   *
   *      2. Attestation integrity: The provided attestations must exactly match the hash stored when the
   *         block was originally proposed. This prevents manipulation of attestation data.
   *
   *      3. Committee authenticity: The provided committee addresses must match the commitment stored for
   *         the block's epoch. This ensures invalidation is based on the actual committee that should have
   *         attested to the block.
   *
   *      4. Signature context: Computes the digest that committee members were expected to sign, enabling
   *         proper signature verification in calling functions.
   *
   * @param _blockNumber The L2 block number being validated for invalidation
   * @param _attestations The attestations provided for validation
   * @param _committee The committee members for the block's epoch
   * @return digest The payload digest that committee members signed
   * @return committeeSize The number of committee members for the epoch
   *
   * @custom:reverts Errors.Rollup__BlockNotInPendingChain If block is beyond the current pending tip
   * @custom:reverts Errors.Rollup__BlockAlreadyProven If block has already been proven and is final
   * @custom:reverts Errors.Rollup__InvalidAttestations If attestations hash doesn't match stored value
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment If committee hash doesn't match stored
   * commitment
   */
  function _validateInvalidationInputs(
    uint256 _blockNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) private returns (bytes32, uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();

    // Block must be in the pending chain
    require(_blockNumber <= rollupStore.tips.getPendingBlockNumber(), Errors.Rollup__BlockNotInPendingChain());

    // But not yet proven
    require(_blockNumber > rollupStore.tips.getProvenBlockNumber(), Errors.Rollup__BlockAlreadyProven());

    // Get the stored block data
    CompressedTempBlockLog storage blockLog = STFLib.getStorageTempBlockLog(_blockNumber);

    // Verify that the provided attestations match the stored hash
    bytes32 providedAttestationsHash = keccak256(abi.encode(_attestations));
    require(providedAttestationsHash == blockLog.attestationsHash, Errors.Rollup__InvalidAttestations());

    // Get the epoch for the block's slot to verify committee
    Epoch epoch = blockLog.slotNumber.decompress().epochFromSlot();

    // Get and verify the committee commitment
    (bytes32 committeeCommitment, uint256 committeeSize) = ValidatorSelectionLib.getCommitteeCommitmentAt(epoch);
    bytes32 providedCommitteeCommitment = keccak256(abi.encode(_committee));
    require(
      committeeCommitment == providedCommitteeCommitment,
      Errors.ValidatorSelection__InvalidCommitteeCommitment(providedCommitteeCommitment, committeeCommitment)
    );

    // Get the digest of the payload that was signed by the committee
    bytes32 digest = blockLog.payloadDigest.toEthSignedMessageHash();

    return (digest, committeeSize);
  }

  /**
   * @notice Helper that invalidates a block by rolling back the pending chain to the previous valid block
   * @dev This function implements the core invalidation logic by updating the chain tips to remove
   *      the invalid block and all subsequent blocks from the pending chain. The rollback is atomic
   *      and immediately takes effect, preventing any further operations on the invalidated blocks.
   *
   *      The invalidation works by:
   *      1. Setting the pending block number to (_blockNumber - 1)
   *      2. Emitting a BlockInvalidated event for external observers
   *
   *      This approach ensures that when the next valid block is proposed, it will build on the
   *      last remaining valid block, effectively removing the invalid block and any blocks that
   *      were built on top of it.
   *
   *      Note: This function does not clean up the storage for invalidated blocks (archive roots,
   *      temp block logs, etc.) as they may be overwritten by future valid blocks at the same numbers.
   *
   * @param _blockNumber The block number to invalidate
   */
  function _invalidateBlock(uint256 _blockNumber) private {
    RollupStore storage rollupStore = STFLib.getStorage();
    rollupStore.tips = rollupStore.tips.updatePendingBlockNumber(_blockNumber - 1);
    emit IRollupCore.BlockInvalidated(_blockNumber);
  }
}
