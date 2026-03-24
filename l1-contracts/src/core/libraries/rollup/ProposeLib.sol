// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {IEconomicsCore} from "@aztec/core/interfaces/IEconomicsCore.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {RollupStore, IRollupCore, CheckpointHeaderValidationFlags} from "@aztec/core/interfaces/IRollup.sol";
import {TempCheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {SignatureDomainSeparator, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {OracleInput, ProposalFeeParameters} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {ProposedHeader, ProposedHeaderLib} from "./ProposedHeaderLib.sol";
import {STFLib} from "./STFLib.sol";

struct ProposeArgs {
  bytes32 archive;
  OracleInput oracleInput;
  ProposedHeader header;
}

struct ProposePayload {
  bytes32 archive;
  OracleInput oracleInput;
  bytes32 headerHash;
}

struct InterimProposeValues {
  ProposedHeader header;
  bytes32[] blobHashes;
  bytes32 blobsHashesCommitment;
  bytes[] blobCommitments;
  bytes32 inHash;
  bytes32 headerHash;
  bytes32 attestationsHash;
  bytes32 payloadDigest;
  Epoch currentEpoch;
  bool isFirstCheckpointOfEpoch;
  bool isEscapeHatch;
  address escapeHatchProposer;
  IEscapeHatch escapeHatch;
  IEconomicsCore economics;
}

/**
 * @param header - The proposed checkpoint header
 * @param digest - The digest that signatures signed
 * @param currentTime - The time of execution
 * @param blobsHashesCommitment - The blobs hash for this checkpoint, provided for simpler future simulation
 * @param flags - Flags specific to the execution, whether certain checks should be skipped
 */
struct ValidateHeaderArgs {
  ProposedHeader header;
  bytes32 digest;
  uint256 manaLimit;
  uint256 manaMinFee;
  bytes32 blobsHashesCommitment;
  CheckpointHeaderValidationFlags flags;
}

/**
 * @title ProposeLib
 * @author Aztec Labs
 * @notice Library responsible for handling the checkpoint proposal flow in the Aztec rollup.
 *
 * @dev This library implements the core checkpoint proposal mechanism that allows designated proposers to submit
 *      new checkpoints to extend the rollup chain. It orchestrates the entire proposal process including:
 *      - Blob validation and commitment calculation
 *      - Header validation against chain state and timing constraints
 *      - Validator selection and proposer verification
 *      - Fee calculation and mana consumption tracking
 *      - State transitions and archive updates
 *      - L1 to L2 message processing via the Inbox
 *
 *      The proposal flow operates within Aztec's time-based model where:
 *      - Each slot has a designated proposer selected from the validator set
 *      - checkpoints must be proposed in the correct time slot and build on the current chain tip
 *      - Proposers must provide valid attestations from committee members
 *      - All state transitions are atomically applied upon successful validation
 *
 *      Key functions:
 *      - `propose`: Main entry point called from `RollupCore.propose`.
 *         Handles the complete checkpoint proposal process from validation to state updates.
 *      - `validateHeader`: Validates checkpoint header against chain state, timing, and fee requirements.
 *         Called internally from `propose`, and externally from `RollupCore.validateHeaderWithAttestations`,
 *         used by proposers to ensure the header is valid before submitting the tx.
 *
 *      Dependencies on other main libraries:
 *      - STFLib: State Transition Function library for chain state management, pruning, and storage access
 *      - Economics: Runtime hook for proposal pricing, fee snapshots, and settlement
 *      - ValidatorSelectionLib: Validator and committee management for epoch setup and proposer verification
 *      - BlobLib: Blob commitment validation and hash calculation for data availability
 *      - ProposedHeaderLib: checkpoint header hashing and validation utilities
 *
 *      Security considerations:
 *      - Only the designated proposer for the current slot can propose a checkpoint, enforced by
 *        validating the proposer validator signature among attestations. All other attestations are not
 *        verified on chain until time of proof submission.
 *      - Each checkpoint must built on the immediate previous one, ensuring no forks. This is enforced by checking
 *        the last archive root and checkpoint numbers. If the previous checkpoint is invalid, the proposer is expected
 *        to first invalidate it.
 *      - Blob commitments are validated, to ensure that the values provided correctly match the actual blobs published
 */
library ProposeLib {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using CompressedTimeMath for CompressedSlot;
  using ChainTipsLib for CompressedChainTips;
  using Checkpoints for Checkpoints.Trace160;

  /**
   * @notice  Publishes a new checkpoint to the pending chain.
   * @dev     Handles a proposed checkpoint, validates it, and updates rollup state adding it to the pending chain.
   *          Orchestrates blob validation, header validation, proposer verification, fee calculations, and state
   *          transitions. Automatically prunes unproven checkpoints if the proof submission window has passed.
   *
   *          Validations performed:
   *          - Blob commitments against provided blob data: Errors.Rollup__InvalidBlobHash,
   *            Errors.Rollup__InvalidBlobProof
   *          - Checkpoint header validations (see validateHeader function for details)
   *          - Proposer signature is valid for designated slot proposer:
   *            Errors.ValidatorSelection__MissingProposerSignature
   *          - Inbox hash matches expected value: Errors.Rollup__InvalidInHash
   *
   *          Validations NOT performed:
   *          - Committee attestations (only proposer signature verified)
   *          - Transaction validity and state root computation (done at proof submission via a validity proof)
   *
   *          State changes:
   *          - Increment pending checkpoint number
   *          - Store archive root for the new checkpoint number
   *          - Store checkpoint metadata in circular storage (TempCheckpointLog)
   *          - Update L1 gas fee oracle
   *          - Consume inbox messages
   *          - Setup epoch for validator selection (first block of the epoch)
   *
   * @param _args - The arguments to propose the checkpoint
   * @param _attestations - Committee attestations in a packed format:
   *        - Contains an array of length equal to the committee size
   *        - At position `i`: if committee member `i` attested, contains their signature over the digest;
   *          if not, contains their address
   *        - Includes a bitmap indicating whether position `i` contains a signature (true) or address (false)
   *        - This format allows reconstructing the committee commitment (hash of all committee addresses)
   *          by either recovering addresses from signatures or using the addresses
   * @param _signers - Addresses of the signers in the attestations:
   *        - Must match the addresses that would be recovered from signatures in _attestations
   *        - Same length as the number of signatures in _attestations
   *        - Used to verify that the proposer is one of the committee members by allowing cheap reconstruction of the
   *          commitment
   *        - Allows computing committee commitment without expensive signature recovery onchain thus saving gas
   *        - Nodes must validate actual signatures offchain when downloading checkpoints
   * @param _blobsInput - The bytes to verify our input blob commitments match real blobs:
   *        - input[:1] - num blobs in checkpoint
   *        - input[1:] - blob commitments (48 bytes * num blobs in checkpoint)
   * @param _checkBlob - Whether to skip blob related checks. Hardcoded to true in RollupCore, exists only to be
   *          overridden in tests
   */
  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestations memory _attestations,
    address[] memory _signers,
    Signature calldata _attestationsAndSignersSignature,
    bytes calldata _blobsInput,
    bool _checkBlob
  ) internal {
    RollupStore storage rollupStore = STFLib.getStorage();

    // Prune unproven checkpoints if the proof submission window has passed
    if (STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp))) {
      STFLib.prune();
    }

    // Keep intermediate values in memory to avoid stack too deep errors
    InterimProposeValues memory v;

    // Validate blob commitments against actual blob data and extract hashes
    // TODO(#13430): The below blobsHashesCommitment known as blobsHash elsewhere in the code. The name is confusingly
    // similar to blobCommitmentsHash, see comment in BlobLib.sol -> validateBlobs().
    (v.blobHashes, v.blobsHashesCommitment, v.blobCommitments) = BlobLib.validateBlobs(_blobsInput, _checkBlob);

    v.header = _args.header;

    // Compute header hash for computing the payload digest
    v.headerHash = ProposedHeaderLib.hash(v.header);

    // Compute current epoch and check escape hatch BEFORE setupEpoch.
    // Uses epoch-stable lookup so mid-epoch governance changes don't affect current epoch proposals.
    v.currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    v.economics = IEconomicsCore(
      address(
        rollupStore.economicsCheckpoints.upperLookupRecent(uint96(Timestamp.unwrap(v.currentEpoch.toTimestamp())))
      )
    );
    v.economics.updateL1GasFeeOracle();
    v.escapeHatch = ValidatorSelectionLib.getEscapeHatchForEpoch(v.currentEpoch);
    if (address(v.escapeHatch) != address(0)) {
      (v.isEscapeHatch, v.escapeHatchProposer) = v.escapeHatch.isHatchOpen(v.currentEpoch);
    }

    // Setup epoch by sampling the committee for the current epoch and setting the seed for the one after the next.
    // This is a no-op if the epoch is already set up, so it only gets executed by the first checkpoint of the epoch.
    // Skip during escape hatch to allow proposals even with insufficient validators for committee formation.
    if (!v.isEscapeHatch) {
      ValidatorSelectionLib.setupEpoch(v.currentEpoch);
    }

    ProposalFeeParameters memory proposalFees = v.economics
      .getProposalFeeParameters(
        STFLib.getEffectivePendingCheckpointNumber(Timestamp.wrap(block.timestamp)),
        Timestamp.wrap(block.timestamp),
        true
      );

    // Create payload digest signed by the committee members
    v.payloadDigest =
      digest(ProposePayload({archive: _args.archive, oracleInput: _args.oracleInput, headerHash: v.headerHash}));

    // Validate checkpoint header
    validateHeader(
      ValidateHeaderArgs({
        header: v.header,
        digest: v.payloadDigest,
        manaLimit: proposalFees.manaLimit,
        manaMinFee: proposalFees.manaMinFee,
        blobsHashesCommitment: v.blobsHashesCommitment,
        flags: CheckpointHeaderValidationFlags({ignoreDA: false})
      })
    );

    if (v.isEscapeHatch) {
      // During escape hatch, only the designated proposer can propose
      require(
        msg.sender == v.escapeHatchProposer,
        Errors.Rollup__InvalidEscapeHatchProposer(v.escapeHatchProposer, msg.sender)
      );
    } else {
      // Verify that the proposer is the correct one for this slot by checking their signature in the attestations
      ValidatorSelectionLib.verifyProposer(
        v.header.slotNumber,
        v.currentEpoch,
        _attestations,
        _signers,
        v.payloadDigest,
        _attestationsAndSignersSignature,
        true
      );
    }
    CompressedChainTips tips = rollupStore.tips;

    // Increment checkpoint number and update chain tips
    uint256 checkpointNumber = tips.getPending() + 1;
    tips = tips.updatePending(checkpointNumber);

    // Calculate accumulated blob commitments hash for this checkpoint
    // Blob commitments are collected and proven per root rollup proof (per epoch),
    // so we need to know whether we are at the epoch start:
    v.isFirstCheckpointOfEpoch =
      v.currentEpoch > STFLib.getEpochForCheckpoint(checkpointNumber - 1) || checkpointNumber == 1;
    bytes32 blobCommitmentsHash = BlobLib.calculateBlobCommitmentsHash(
      STFLib.getBlobCommitmentsHash(checkpointNumber - 1), v.blobCommitments, v.isFirstCheckpointOfEpoch
    );

    // Hash attestations for storage in checkpoint log
    // Compute attestationsHash from the attestations
    v.attestationsHash = keccak256(abi.encode(_attestations));

    // Commit state changes: update chain tips and store checkpoint data
    rollupStore.tips = tips;
    rollupStore.archives[checkpointNumber] = _args.archive;
    STFLib.addTempCheckpointLog(
      TempCheckpointLog({
        headerHash: v.headerHash,
        blobCommitmentsHash: blobCommitmentsHash,
        outHash: v.header.outHash,
        attestationsHash: v.attestationsHash,
        payloadDigest: v.payloadDigest,
        slotNumber: v.header.slotNumber
      })
    );
    v.economics
      .recordCheckpoint({
        _checkpointNumber: checkpointNumber,
        _feeAssetPriceModifier: _args.oracleInput.feeAssetPriceModifier,
        _manaUsed: v.header.totalManaUsed,
        _congestionCost: proposalFees.feeComponents.congestionCost,
        _proverCost: proposalFees.feeComponents.proverCost
      });

    // Consume pending L1->L2 messages and validate against header commitment.
    // @note  The checkpoint number here will always be >=1 as the genesis checkpoint is at 0
    v.inHash = rollupStore.config.inbox.consume(checkpointNumber);
    require(v.header.inHash == v.inHash, Errors.Rollup__InvalidInHash(v.inHash, v.header.inHash));

    {
      bytes32 archive = _args.archive;
      if (v.isEscapeHatch) {
        v.escapeHatch.updateSubmittedArchive(v.escapeHatchProposer, uint128(checkpointNumber), archive);
      }

      // Emit event for external listeners. Nodes rely on this event to update their state.
      emit IRollupCore.CheckpointProposed(checkpointNumber, archive, v.blobHashes, v.payloadDigest, v.attestationsHash);
    }
  }

  /**
   * @notice Validates a proposed checkpoint header against chain state and constraints
   * @dev Called internally from propose() and externally from RollupCore.validateHeaderWithAttestations()
   *      for proposers to check header validity before submitting transactions
   *
   *      Header validations performed:
   *      - Coinbase address is non-zero: Errors.Rollup__InvalidCoinbase
   *      - Mana usage within limits: Errors.Rollup__ManaLimitExceeded
   *      - Builds on correct parent checkpoint (archive root check): Errors.Rollup__InvalidArchive
   *      - Slot number greater than last checkpoint's slot: Errors.Rollup__SlotAlreadyInChain
   *      - Slot number matches current timestamp slot: Errors.HeaderLib__InvalidSlotNumber
   *      - Timestamp matches slot-derived timestamp: Errors.Rollup__InvalidTimestamp
   *      - Timestamp not in future: Errors.Rollup__TimestampInFuture
   *      - Blob hashes match commitment (unless DA checks ignored): Errors.Rollup__UnavailableTxs
   *      - DA fee is zero: Errors.Rollup__NonZeroDaFee
   *      - L2 gas fee matches computed mana min fee: Errors.Rollup__InvalidManaMinFee
   *
   * @param _args Validation arguments including header, digest, mana min fee, and flags
   */
  function validateHeader(ValidateHeaderArgs memory _args) internal view {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(_args.header.coinbase != address(0), Errors.Rollup__InvalidCoinbase());
    require(_args.header.totalManaUsed <= _args.manaLimit, Errors.Rollup__ManaLimitExceeded());

    Timestamp currentTime = Timestamp.wrap(block.timestamp);

    uint256 pendingCheckpointNumber = STFLib.getEffectivePendingCheckpointNumber(currentTime);

    bytes32 tipArchive = rollupStore.archives[pendingCheckpointNumber];
    require(
      tipArchive == _args.header.lastArchiveRoot,
      Errors.Rollup__InvalidArchive(tipArchive, _args.header.lastArchiveRoot)
    );

    Slot slot = _args.header.slotNumber;
    Slot lastSlot = STFLib.getSlotNumber(pendingCheckpointNumber);
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Slot currentSlot = currentTime.slotFromTimestamp();
    require(slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, slot));

    Timestamp timestamp = TimeLib.toTimestamp(slot);
    require(_args.header.timestamp == timestamp, Errors.Rollup__InvalidTimestamp(timestamp, _args.header.timestamp));

    require(timestamp <= currentTime, Errors.Rollup__TimestampInFuture(currentTime, timestamp));

    require(
      _args.flags.ignoreDA || _args.header.blobsHash == _args.blobsHashesCommitment,
      Errors.Rollup__UnavailableTxs(_args.header.blobsHash)
    );

    require(_args.header.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
    require(
      _args.header.gasFees.feePerL2Gas == _args.manaMinFee,
      Errors.Rollup__InvalidManaMinFee(_args.manaMinFee, _args.header.gasFees.feePerL2Gas)
    );
  }

  function digest(ProposePayload memory _args) internal pure returns (bytes32) {
    return keccak256(abi.encode(SignatureDomainSeparator.checkpointAttestation, _args));
  }
}
