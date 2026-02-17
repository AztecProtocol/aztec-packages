// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {SubmitEpochRootProofArgs, PublicInputArgs, IRollupCore, RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {CompressedTempCheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {AttestationLib, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {RewardLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

/**
 * @title EpochProofLib
 * @author Aztec Labs
 * @notice Core library responsible for epoch proof submission and verification in the Aztec rollup.
 *
 * @dev This library implements epoch proof verification, which advances the proven chain tip.
 *      - Epoch boundary validation and proof deadline enforcement
 *      - Attestation verification for the last checkpoint in the proven range (which may be a partial epoch)
 *      - Validity proof verification using the configured verifier
 *      - Blob commitment validation and batched blob proof verification
 *      - Public input assembly and validation for the root rollup circuit
 *      - Proven chain tip advancement and reward distribution
 *
 *      Integration with RollupCore:
 *      The submitEpochRootProof() function is the main entry point called from RollupCore.submitEpochRootProof().
 *      It serves as the mechanism by which provers can finalize epochs, advancing the proven chain tip and
 *      triggering reward distribution. This is a critical operation that moves checkpoints from "pending" to "proven"
 *      status.
 *
 *      Attestation Verification:
 *      Before accepting an epoch proof, this library verifies the attestations for the end checkpoint of the proof.
 *      This ensures that the committee has properly validated the final state of the proof. Note that this is
 *      equivalent to verifying the attestations for every prior checkpoint, since the committee should not attest
 *      to a checkpoint unless its ancestors are also valid and have been attested to. This step checks that the
 *      committee have agreed on the same output state of the proven range. For honest nodes, this is done by
 *      re-executing the transactions in the proven range and matching the state root, effectively acting as training
 *      wheels for the proving of public executions (i.e., the AVM).
 *
 *      Proof Submission Window:
 *      Epochs have a configurable proof submission deadline measured in epochs after the epoch's completion.
 *      This prevents indefinite delays in proof submission while allowing reasonable time for proof generation.
 *      If no proof is submitted within the deadline, checkpoints are pruned to maintain chain liveness.
 *
 *      Blob Integration:
 *      The library validates batched blob proofs using EIP-4844's point evaluation precompile and ensures
 *      blob commitments match the claimed rollup data. This provides data availability guarantees while
 *      leveraging Ethereum's native blob storage for cost efficiency.
 */
library EpochProofLib {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;
  using FeeHeaderLib for CompressedFeeHeader;
  using SafeCast for uint256;
  using ChainTipsLib for CompressedChainTips;
  using AttestationLib for CommitteeAttestations;
  using CompressedTimeMath for CompressedSlot;

  /**
   * @notice Submit a validity proof for an epoch's state transitions, advancing the proven chain tip
   *
   * @dev This is the main entry point for epoch finalization. It performs comprehensive validation
   *      of the epoch proof including attestation verification, archive root validation, blob proof
   *      verification, and validity proof verification. Upon success, advances the proven chain tip and
   *      distributes rewards to the prover and validators.
   *
   *      The function will automatically prune unproven checkpoints if the pruning window has expired.
   *
   * @dev Events Emitted:
   *      - L2ProofVerified: When proof verification succeeds and proven tip advances
   *
   * @dev Errors Thrown:
   *      - Rollup__InvalidProof: validity proof verification failed
   *      - Rollup__InvalidPreviousArchive: Previous archive root mismatch
   *      - Rollup__InvalidArchive: End archive root mismatch
   *      - Rollup__InvalidAttestations: Attestation verification failed for last checkpoint
   *      - Rollup__StartAndEndNotSameEpoch: Proof spans multiple epochs
   *      - Rollup__PastDeadline: Proof submitted after deadline
   *      - Rollup__InvalidFirstEpochProof: Invalid first epoch proof structure
   *      - Rollup__StartIsNotFirstCheckpointOfEpoch: Start checkpoint is not epoch boundary
   *      - Rollup__StartIsNotBuildingOnProven: Start checkpoint doesn't build on proven chain
   *      - Rollup__TooManyCheckpointsInEpoch: Epoch exceeds maximum checkpoint count
   *      - Rollup__InvalidBlobProof: Batched blob proof verification failed
   *
   * @param _args The epoch proof submission arguments containing:
   *              - start: First checkpoint number in the epoch (inclusive)
   *              - end: Last checkpoint number in the epoch (inclusive)
   *              - args: Public inputs (previousArchive, endArchive, endTimestamp, proverId)
   *              - fees: Fee distribution array (recipient-value pairs)
   *              - attestations: Committee attestations for the last checkpoint in the epoch
   *              - blobInputs: Batched blob data for EIP-4844 point evaluation precompile
   *              - proof: The validity proof bytes for the root rollup circuit
   */
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) internal {
    if (STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp))) {
      STFLib.prune();
    }

    Epoch endEpoch = assertAcceptable(_args.start, _args.end);

    // Verify attestations for the last checkpoint in the epoch
    // -> This serves as training wheels for the public part of the system (proving systems used in public and AVM)
    // ensuring committee agreement on the epoch's validity alongside the cryptographic proof verification below.
    verifyLastCheckpointAttestationsAndOutHash(_args.end, _args.attestations, _args.args.outHash);

    require(verifyEpochRootProof(_args), Errors.Rollup__InvalidProof());

    RollupStore storage rollupStore = STFLib.getStorage();

    // Advance the proven block number and insert the out hash if the chain is extended.
    if (_args.end > rollupStore.tips.getProven()) {
      rollupStore.tips = rollupStore.tips.updateProven(_args.end);

      // Handle L2->L1 message processing.
      // The circuit outputs an empty out hash tree root if the epoch contains no messages.
      // Since the out hash tree is append-only, with the first checkpoint at index 0, the second at index 1, and so on,
      // a partial epoch cannot produce a non-empty out hash and later revert to an empty one as more checkpoints are
      // included. Therefore, it is safe to skip insertion when the out hash is empty.
      if (_args.args.outHash != bytes32(Constants.EMPTY_EPOCH_OUT_HASH)) {
        // Insert L2->L1 messages root into outbox for consumption.
        rollupStore.config.outbox.insert(endEpoch, _args.args.outHash);
      }
    }

    RewardLib.handleRewardsAndFees(_args, endEpoch);

    emit IRollupCore.L2ProofVerified(_args.end, _args.args.proverId);
  }

  /**
   * @notice Returns the computed public inputs for the given epoch proof.
   *
   * @dev Useful for debugging and testing. Allows submitter to compare their
   * own public inputs used for generating the proof vs the ones assembled
   * by this contract when verifying it.
   *
   * @param  _start - The start of the epoch (inclusive)
   * @param  _end - The end of the epoch (inclusive)
   * @param  _args - Array of public inputs to the proof (previousArchive, endArchive, endTimestamp, outHash, proverId)
   * @param  _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   * @param _blobPublicInputs- The blob public inputs for the proof
   */
  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs
  ) internal view returns (bytes32[] memory) {
    RollupStore storage rollupStore = STFLib.getStorage();

    {
      // We do it this way to provide better error messages than passing along the storage values
      {
        bytes32 expectedPreviousArchive = rollupStore.archives[_start - 1];
        require(
          expectedPreviousArchive == _args.previousArchive,
          Errors.Rollup__InvalidPreviousArchive(expectedPreviousArchive, _args.previousArchive)
        );
      }

      {
        bytes32 expectedEndArchive = rollupStore.archives[_end];
        require(
          expectedEndArchive == _args.endArchive, Errors.Rollup__InvalidArchive(expectedEndArchive, _args.endArchive)
        );
      }
    }

    bytes32[] memory publicInputs = new bytes32[](Constants.ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH);

    // Structure of the root rollup public inputs we need to reassemble:
    //
    // struct RootRollupPublicInputs {
    //   previous_archive_root: Field,
    //   end_archive_root: Field,
    //   out_hash: Field,
    //   checkpointHeaderHashes: [Field; Constants.MAX_CHECKPOINTS_PER_EPOCH],
    //   fees: [FeeRecipient; Constants.MAX_CHECKPOINTS_PER_EPOCH],
    //   chain_id: Field,
    //   version: Field,
    //   vk_tree_root: Field,
    //   protocol_contracts_hash: Field,
    //   prover_id: Field,
    //   blob_public_inputs: FinalBlobAccumulator,
    // }
    {
      // previous_archive.root: the previous archive tree root
      publicInputs[0] = _args.previousArchive;

      // end_archive.root: the new archive tree root
      publicInputs[1] = _args.endArchive;

      publicInputs[2] = _args.outHash;
    }

    uint256 numCheckpoints = _end - _start + 1;

    for (uint256 i = 0; i < numCheckpoints; i++) {
      publicInputs[3 + i] = STFLib.getHeaderHash(_start + i);
    }

    uint256 offset = 3 + Constants.MAX_CHECKPOINTS_PER_EPOCH;

    uint256 feesLength = Constants.MAX_CHECKPOINTS_PER_EPOCH * 2;
    // fees[2n to 2n + 1]: a fee element, which contains of a recipient and a value
    for (uint256 i = 0; i < feesLength; i++) {
      publicInputs[offset + i] = _fees[i];
    }
    offset += feesLength;

    publicInputs[offset] = bytes32(block.chainid);
    offset += 1;

    publicInputs[offset] = bytes32(uint256(rollupStore.config.version));
    offset += 1;

    // vk_tree_root
    publicInputs[offset] = rollupStore.config.vkTreeRoot;
    offset += 1;

    // protocol_contracts_hash
    publicInputs[offset] = rollupStore.config.protocolContractsHash;
    offset += 1;

    // prover_id: id of current epoch's prover
    publicInputs[offset] = addressToField(_args.proverId);
    offset += 1;

    // FinalBlobAccumulatorPublicInputs:
    // The blob public inputs do not require the versioned hash of the batched commitment, which is stored in
    // _blobPublicInputs[0:32]
    // or the KZG opening 'proof' (commitment Q) stored in _blobPublicInputs[144:]. They are used in
    // validateBatchedBlob().
    // See BlobLib.sol -> validateBatchedBlob() and calculateBlobCommitmentsHash() for documentation on the below blob
    // related inputs.

    // blobCommitmentsHash
    publicInputs[offset] = STFLib.getBlobCommitmentsHash(_end);
    offset += 1;

    // z
    publicInputs[offset] = bytes32(_blobPublicInputs[32:64]);
    offset += 1;

    // y
    (publicInputs[offset], publicInputs[offset + 1], publicInputs[offset + 2]) =
      bytes32ToBigNum(bytes32(_blobPublicInputs[64:96]));
    offset += 3;

    // To fit into 2 fields, the commitment is split into 31 and 17 byte numbers
    // See yarn-project/foundation/src/blob/index.ts -> commitmentToFields()
    // TODO: The below left pads, possibly inefficiently
    // c[0]
    publicInputs[offset] = bytes32(uint256(uint248(bytes31((_blobPublicInputs[96:127])))));
    // c[1]
    publicInputs[offset + 1] = bytes32(uint256(uint136(bytes17((_blobPublicInputs[127:144])))));

    return publicInputs;
  }

  /**
   * @notice Verifies committee attestations for the last checkpoint in the epoch before accepting the epoch proof
   *
   * @dev This verification ensures that the committee has properly validated the final state of the epoch
   *      before the proof can be accepted. The function validates that:
   *      1. The provided attestations match the stored attestation hash for the checkpoint
   *      2. The attestations have valid signatures from committee members
   *      3. The attestations meet the required threshold (2/3+ of committee)
   *
   *      For escape hatch epochs, attestation verification is skipped since there is no committee
   *      involvement - only the designated escape hatch proposer can propose blocks.
   *
   * @dev Errors Thrown:
   *      - Rollup__InvalidAttestations: Provided attestations don't match stored hash or fail validation
   *
   * @param _endCheckpointNumber The last checkpoint number in the epoch to verify attestations for
   * @param _attestations The committee attestations containing signatures and validator information
   */
  function verifyLastCheckpointAttestationsAndOutHash(
    uint256 _endCheckpointNumber,
    CommitteeAttestations memory _attestations,
    bytes32 _outHash
  ) private {
    // Get the stored attestation hash and payload digest for the last checkpoint
    CompressedTempCheckpointLog storage checkpointLog = STFLib.getStorageTempCheckpointLog(_endCheckpointNumber);

    // Verify that the out hash matches the stored value
    // The stored out hash is part of the payloadDigest that was attested to.
    require(checkpointLog.outHash == _outHash, Errors.Rollup__InvalidOutHash(checkpointLog.outHash, _outHash));

    // Verify that the provided attestations match the stored hash
    bytes32 providedAttestationsHash = keccak256(abi.encode(_attestations));
    require(providedAttestationsHash == checkpointLog.attestationsHash, Errors.Rollup__InvalidAttestations());

    // Get the epoch for the last checkpoint
    Epoch epoch = STFLib.getEpochForCheckpoint(_endCheckpointNumber);

    // Check if this is an escape hatch epoch - skip attestation verification if so
    // since escape hatch blocks are proposed without committee attestations.
    // Uses epoch-stable lookup so proof verification uses the escape hatch that was
    // active when the epoch started, not whatever is currently configured.
    {
      IEscapeHatch escapeHatch = ValidatorSelectionLib.getEscapeHatchForEpoch(epoch);
      if (address(escapeHatch) != address(0)) {
        (bool isOpen,) = escapeHatch.isHatchOpen(epoch);
        if (isOpen) {
          // Skip attestation verification for escape hatch epochs
          return;
        }
      }
    }

    ValidatorSelectionLib.verifyAttestations(epoch, _attestations, checkpointLog.payloadDigest);
  }

  /**
   * @notice Validates that an epoch proof submission meets all acceptance criteria
   *
   * @dev Performs comprehensive validation of epoch boundaries, timing constraints, and chain state:
   *      - Ensures start and end checkpoints are in the same epoch
   *      - Verifies proof is submitted within the deadline window
   *      - Confirms start checkpoint is the first checkpoint of its epoch
   *      - Validates start checkpoint builds on the proven chain
   *      - Checks epoch doesn't exceed maximum checkpoint count
   *
   * @dev Errors Thrown:
   *      - Rollup__StartAndEndNotSameEpoch: Start and end checkpoints in different epochs
   *      - Rollup__PastDeadline: Proof submitted after deadline
   *      - Rollup__InvalidFirstEpochProof: Invalid structure for first epoch proof
   *      - Rollup__StartIsNotFirstCheckpointOfEpoch: Start checkpoint is not at epoch boundary
   *      - Rollup__StartIsNotBuildingOnProven: Start checkpoint doesn't build on proven chain
   *      - Rollup__TooManyCheckpointsInEpoch: Epoch exceeds maximum allowed checkpoints
   *
   * @param _start The first checkpoint number in the epoch (inclusive)
   * @param _end The last checkpoint number in the epoch (inclusive)
   * @return The epoch number that the proof covers
   */
  function assertAcceptable(uint256 _start, uint256 _end) private view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();

    Epoch startEpoch = STFLib.getEpochForCheckpoint(_start);
    // This also checks for existence of the checkpoint.
    Epoch endEpoch = STFLib.getEpochForCheckpoint(_end);

    require(startEpoch == endEpoch, Errors.Rollup__StartAndEndNotSameEpoch(startEpoch, endEpoch));

    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();

    require(
      startEpoch.isAcceptingProofsAtEpoch(currentEpoch),
      Errors.Rollup__PastDeadline(startEpoch.toDeadlineEpoch(), currentEpoch)
    );

    // By making sure that the previous checkpoint is in another epoch, we know that we were
    // at the start.
    Epoch parentEpoch = STFLib.getEpochForCheckpoint(_start - 1);

    require(startEpoch > Epoch.wrap(0) || _start == 1, Errors.Rollup__InvalidFirstEpochProof());

    bool isStartOfEpoch = _start == 1 || parentEpoch <= startEpoch - Epoch.wrap(1);
    require(isStartOfEpoch, Errors.Rollup__StartIsNotFirstCheckpointOfEpoch());

    bool isStartBuildingOnProven = _start - 1 <= rollupStore.tips.getProven();
    require(isStartBuildingOnProven, Errors.Rollup__StartIsNotBuildingOnProven());

    bool claimedNumCheckpointsInEpoch = _end - _start + 1 <= Constants.MAX_CHECKPOINTS_PER_EPOCH;
    require(
      claimedNumCheckpointsInEpoch,
      Errors.Rollup__TooManyCheckpointsInEpoch(Constants.MAX_CHECKPOINTS_PER_EPOCH, _end - _start)
    );

    return endEpoch;
  }

  /**
   * @notice Verifies the validity proof and batched blob proof for an epoch
   *
   * @dev Performs the core cryptographic verification by:
   *      1. Validating the batched blob proof using EIP-4844 point evaluation precompile
   *      2. Assembling the public inputs for the root rollup circuit
   *      3. Verifying the validity proof against the assembled public inputs using the configured verifier
   *
   * @dev Errors Thrown:
   *      - Rollup__InvalidBlobProof: Batched blob proof verification failed
   *      - Rollup__InvalidProof: validity proof verification failed
   *      - Rollup__InvalidPreviousArchive: Previous archive root mismatch in public inputs
   *      - Rollup__InvalidArchive: End archive root mismatch in public inputs
   *
   * @param _args The epoch proof submission arguments containing proof data and public inputs
   * @return True if both blob proof and validity proof verification succeed
   */
  function verifyEpochRootProof(SubmitEpochRootProofArgs calldata _args) private view returns (bool) {
    RollupStore storage rollupStore = STFLib.getStorage();

    BlobLib.validateBatchedBlob(_args.blobInputs);

    bytes32[] memory publicInputs =
      getEpochProofPublicInputs(_args.start, _args.end, _args.args, _args.fees, _args.blobInputs);

    require(rollupStore.config.epochProofVerifier.verify(_args.proof, publicInputs), Errors.Rollup__InvalidProof());

    return true;
  }

  /**
   * @notice Converts a BLS12 field element from bytes32 to a nr BigNum type
   *
   * @dev The nr bignum type for BLS12 fields is encoded as 3 nr fields - see blob_public_inputs.ts:
   *      firstLimb = last 15 bytes;
   *      secondLimb = bytes 2 -> 17;
   *      thirdLimb = first 2 bytes;
   *      Used when verifying epoch proofs to gather blob specific public inputs.
   * @param _input - The field in bytes32
   */
  function bytes32ToBigNum(bytes32 _input)
    private
    pure
    returns (bytes32 firstLimb, bytes32 secondLimb, bytes32 thirdLimb)
  {
    firstLimb = bytes32(uint256(uint120(bytes15(_input << 136))));
    secondLimb = bytes32(uint256(uint120(bytes15(_input << 16))));
    thirdLimb = bytes32(uint256(uint16(bytes2(_input))));
  }

  /**
   * @notice Converts an Ethereum address to a field element for circuit public inputs
   *
   * @dev Addresses are 20 bytes (160 bits) and need to be converted to 32-byte field elements
   *      for use as public inputs in the rollup circuits. The conversion zero-pads the address
   *      to fit the field element format.
   *
   * @param _a The Ethereum address to convert
   * @return The address as a bytes32 field element
   */
  function addressToField(address _a) private pure returns (bytes32) {
    return bytes32(uint256(uint160(_a)));
  }
}
