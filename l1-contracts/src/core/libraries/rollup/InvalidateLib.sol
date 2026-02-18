// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IRollupCore, RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {CompressedTempCheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
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
 * @notice Library responsible for handling the invalidation of checkpoints with incorrect attestations in the Aztec
 * rollup.
 *
 * @dev This library implements the invalidation mechanism that allows anyone to remove invalid checkpoints from the
 *      pending chain. An invalid checkpoint is one without proper attestations.
 *
 *      The invalidation system addresses two main types of attestation failures:
 *      1. Bad attestation signatures: When committee members provide invalid signatures
 *      2. Insufficient attestations: When a checkpoint doesn't meet the required >2/3 committee threshold
 *
 *      Key invariants:
 *      - Only pending (unproven) checkpoints can be invalidated
 *      - Checkpoint must exist in the pending chain (between proven tip and pending tip)
 *      - Invalid checkpoints and all subsequent checkpoints are removed from the pending chain
 *
 *      Security model:
 *      - Anyone can call invalidation functions (permissionless)
 *      - No economic incentive (rebate) is provided for calling these functions
 *      - Expected to be called by next proposer, then committee members, then any validator as fallback
 *      - Invalidation reverts the pending chain tip to the checkpoint immediately before the invalid one
 *
 *      Integration with the rollup system:
 *      - Works with STFLib for storage access and chain state management
 *      - Uses ValidatorSelectionLib to verify committee commitments
 *      - Validates against TempCheckpointLog storage for checkpoint metadata
 *      - Emits CheckpointInvalidated events via IRollupCore interface
 *
 *      This invalidation mechanism ensures that even though attestations are not fully validated onchain
 *      during checkpoint proposal (to save gas), invalid attestations can be challenged and removed after the fact,
 *      maintaining the security of the rollup while optimizing for efficient checkpoint production.
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
   * @notice Invalidates a checkpoint containing an invalid attestation
   * @dev Anyone can call this function to remove checkpoints with invalid attestations.
   *
   *      There are two cases where an individual attestation might be invalid:
   *      1. The attestation is a signature that does not recover to the address from the committee
   *      2. The attestation is an address, that does not match the address from the committee
   *
   *      Upon successful validation of the invalid attestation, the checkpoint and all subsequent pending
   *      checkpoints are removed from the chain by resetting the pending tip to the previous valid checkpoint.
   *
   *      No economic rebate is provided for calling this function.
   *
   * @param _checkpointNumber The checkpoint number to invalidate (must be in pending chain)
   * @param _attestations The attestations that were submitted with the checkpoint (must match stored hash)
   * @param _committee The committee members for the checkpoint's epoch (must match stored computed commitment)
   * @param _invalidIndex The index in the committee/attestations array of the invalid attestation
   *
   * @custom:reverts Errors.Rollup__CheckpointNotInPendingChain If checkpoint number is beyond pending tip
   * @custom:reverts Errors.Rollup__CheckpointAlreadyProven If checkpoint number is already proven
   * @custom:reverts Errors.Rollup__InvalidAttestations If provided attestations don't match stored hash
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment If committee doesn't match stored commitment
   * @custom:reverts Rollup__InvalidAttestationIndex if the _invalidIndex is beyond the committee
   * @custom:reverts Errors.Rollup__AttestationsAreValid If the attestation at invalidIndex is actually valid
   */
  function invalidateBadAttestation(
    uint256 _checkpointNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee,
    uint256 _invalidIndex
  ) internal {
    (bytes32 digest, uint256 committeeSize) = _validateInvalidationInputs(_checkpointNumber, _attestations, _committee);
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

    _invalidateCheckpoint(_checkpointNumber);
  }

  /**
   * @notice Invalidates a checkpoint that doesn't meet the required >2/3 committee attestation threshold
   * @dev Anyone can call this function to remove checkpoints with insufficient valid attestations.
   *
   *      The function counts the number of signature attestations (as opposed to address attestations) and
   *      compares against the required threshold of (committeeSize * 2 / 3) + 1. If insufficient signatures
   *      are present, the checkpoint and all subsequent pending checkpoints are removed from the chain.
   *
   *      No economic rebate is provided for calling this function.
   *
   * @param _checkpointNumber The checkpoint number to invalidate (must be in pending chain)
   * @param _attestations The attestations that were submitted with the checkpoint (must match stored hash)
   * @param _committee The committee members for the checkpoint's epoch (must match stored commitment)
   *
   * @custom:reverts Errors.Rollup__CheckpointNotInPendingChain If checkpoint number is beyond pending tip
   * @custom:reverts Errors.Rollup__CheckpointAlreadyProven If checkpoint number is already proven
   * @custom:reverts Errors.Rollup__InvalidAttestations If provided attestations don't match stored hash
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment If committee doesn't match stored commitment
   * @custom:reverts Errors.ValidatorSelection__InsufficientAttestations If the attestations actually meet the threshold
   */
  function invalidateInsufficientAttestations(
    uint256 _checkpointNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) internal {
    (, uint256 committeeSize) = _validateInvalidationInputs(_checkpointNumber, _attestations, _committee);

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

    _invalidateCheckpoint(_checkpointNumber);
  }

  /**
   * @notice Common validation logic shared by all invalidation functions
   * @dev Performs validation checks to ensure invalidation calls are legitimate and target valid checkpoints.
   *      This function establishes the foundation for all invalidation operations by verifying:
   *
   *      1. Checkpoint existence and state: The target checkpoint must be in the pending chain (after the proven tip
   *         but not beyond the pending tip). Proven checkpoints cannot be invalidated as they are final.
   *
   *      2. Attestation integrity: The provided attestations must exactly match the hash stored when the
   *         checkpoint was originally proposed. This prevents manipulation of attestation data.
   *
   *      3. Committee authenticity: The provided committee addresses must match the commitment stored for
   *         the checkpoint's epoch. This ensures invalidation is based on the actual committee that should have
   *         attested to the checkpoint.
   *
   *      4. Signature context: Computes the digest that committee members were expected to sign, enabling
   *         proper signature verification in calling functions.
   *
   * @param _checkpointNumber The checkpoint number being validated for invalidation
   * @param _attestations The attestations provided for validation
   * @param _committee The committee members for the checkpoint's epoch
   * @return digest The payload digest that committee members signed
   * @return committeeSize The number of committee members for the epoch
   *
   * @custom:reverts Errors.Rollup__CheckpointNotInPendingChain If checkpoint is beyond the current pending tip
   * @custom:reverts Errors.Rollup__CheckpointAlreadyProven If checkpoint has already been proven and is final
   * @custom:reverts Errors.Rollup__InvalidAttestations If attestations hash doesn't match stored value
   * @custom:reverts Errors.ValidatorSelection__InvalidCommitteeCommitment If committee hash doesn't match stored
   * commitment
   */
  function _validateInvalidationInputs(
    uint256 _checkpointNumber,
    CommitteeAttestations memory _attestations,
    address[] memory _committee
  ) private returns (bytes32, uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();

    // Checkpoint must be in the pending chain
    require(_checkpointNumber <= rollupStore.tips.getPending(), Errors.Rollup__CheckpointNotInPendingChain());

    // But not yet proven
    require(_checkpointNumber > rollupStore.tips.getProven(), Errors.Rollup__CheckpointAlreadyProven());

    // Get the stored checkpoint data
    CompressedTempCheckpointLog storage checkpointLog = STFLib.getStorageTempCheckpointLog(_checkpointNumber);

    // Verify that the provided attestations match the stored hash
    bytes32 providedAttestationsHash = keccak256(abi.encode(_attestations));
    require(providedAttestationsHash == checkpointLog.attestationsHash, Errors.Rollup__InvalidAttestations());

    // Get the epoch for the checkpoint's slot to verify committee
    Epoch epoch = checkpointLog.slotNumber.decompress().epochFromSlot();

    // Check if this is an escape hatch epoch - escape hatch checkpoints cannot be invalidated
    // since they have no committee attestations by design.
    // Uses epoch-stable lookup so invalidation rules use the escape hatch that was
    // active when the epoch started, not whatever is currently configured.
    {
      IEscapeHatch escapeHatch = ValidatorSelectionLib.getEscapeHatchForEpoch(epoch);
      if (address(escapeHatch) != address(0)) {
        (bool isOpen,) = escapeHatch.isHatchOpen(epoch);
        require(!isOpen, Errors.Rollup__CannotInvalidateEscapeHatch());
      }
    }

    // Get and verify the committee commitment
    (bytes32 committeeCommitment, uint256 committeeSize) = ValidatorSelectionLib.getCommitteeCommitmentAt(epoch);
    bytes32 providedCommitteeCommitment = keccak256(abi.encode(_committee));
    require(
      committeeCommitment == providedCommitteeCommitment,
      Errors.ValidatorSelection__InvalidCommitteeCommitment(providedCommitteeCommitment, committeeCommitment)
    );

    // Get the digest of the payload that was signed by the committee
    bytes32 digest = checkpointLog.payloadDigest.toEthSignedMessageHash();

    return (digest, committeeSize);
  }

  /**
   * @notice Helper that invalidates a checkpoint by rolling back the pending chain to the previous valid checkpoint
   * @dev This function implements the core invalidation logic by updating the chain tips to remove
   *      the invalid checkpoint and all subsequent checkpoints from the pending chain. The rollback is atomic
   *      and immediately takes effect, preventing any further operations on the invalidated checkpoints.
   *
   *      The invalidation works by:
   *      1. Setting the pending checkpoint number to (_checkpointNumber - 1)
   *      2. Emitting a CheckpointInvalidated event for external observers
   *
   *      This approach ensures that when the next valid checkpoint is proposed, it will build on the
   *      last remaining valid checkpoint, effectively removing the invalid checkpoint and any checkpoints that
   *      were built on top of it.
   *
   *      Note: This function does not clean up the storage for invalidated checkpoints (archive roots,
   *      temp checkpoint logs, etc.) as they may be overwritten by future valid checkpoints at the same numbers.
   *
   * @param _checkpointNumber The checkpoint number to invalidate
   */
  function _invalidateCheckpoint(uint256 _checkpointNumber) private {
    RollupStore storage rollupStore = STFLib.getStorage();
    rollupStore.tips = rollupStore.tips.updatePending(_checkpointNumber - 1);
    emit IRollupCore.CheckpointInvalidated(_checkpointNumber);
  }
}
