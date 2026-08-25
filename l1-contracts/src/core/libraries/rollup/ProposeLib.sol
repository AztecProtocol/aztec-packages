// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BlobLib} from "@aztec-blob-lib/BlobLib.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {RollupStore, IRollupCore, CheckpointHeaderValidationFlags} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {TempCheckpointLog} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {CoordinationSignatureLib} from "@aztec/core/libraries/rollup/CoordinationSignatureLib.sol";
import {OracleInput, FeeLib, ManaMinFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {FieldLib} from "@aztec/core/libraries/rollup/FieldLib.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {ProposedHeader, ProposedHeaderLib} from "./ProposedHeaderLib.sol";
import {STFLib} from "./STFLib.sol";

struct ProposeArgs {
  bytes32 archive;
  OracleInput oracleInput;
  ProposedHeader header;
  // Sequence number of the Inbox bucket the header's `inboxRollingHash` corresponds to.
  // Unsigned lookup aid kept out of the attested payload digest: a wrong hint can only revert, never change what is
  // accepted, since integrity comes from the rolling-hash equality check against the committee-signed header.
  uint256 bucketHint;
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
  bytes32 blobCommitmentsHash;
  FeeHeader feeHeader;
  uint256 consumedInboxMsgTotal;
  bytes32 headerHash;
  bytes32 attestationsHash;
  bytes32 payloadDigest;
  Epoch currentEpoch;
  bool isFirstCheckpointOfEpoch;
  bool isEscapeHatch;
  address escapeHatchProposer;
  IEscapeHatch escapeHatch;
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
 *      - FeeLib: Fee calculation library for mana pricing, L1 gas oracles, and fee header computation
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
  using SafeCast for uint256;

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
   *          - Streaming Inbox consumption is valid: Errors.Rollup__InvalidInboxRollingHash
   *          - Archive root is within the scalar field: Errors.Rollup__FieldElementOutOfRange
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
   *          - Validate streaming Inbox consumption against the parent checkpoint
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
    // Prune unproven checkpoints if the proof submission window has passed
    if (STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp))) {
      STFLib.prune();
    }

    // Keep intermediate values in memory to avoid stack too deep errors
    InterimProposeValues memory v;

    FeeLib.updateL1GasFeeOracle();

    // Validate blob commitments against actual blob data and extract hashes
    // TODO(#13430): The below blobsHashesCommitment known as blobsHash elsewhere in the code. The name is confusingly
    // similar to blobCommitmentsHash, see comment in BlobLib.sol -> validateBlobs().
    (v.blobHashes, v.blobsHashesCommitment, v.blobCommitments) = BlobLib.validateBlobs(_blobsInput, _checkBlob);

    v.header = _args.header;

    // The new checkpoint archive root is not part of the header, so it is range-checked here rather than in
    // validateHeader.
    FieldLib.requireValidFieldElement(_args.archive);

    // Compute header hash for computing the payload digest
    v.headerHash = ProposedHeaderLib.hash(v.header);

    // Compute current epoch and check escape hatch BEFORE setupEpoch.
    // Uses epoch-stable lookup so mid-epoch governance changes don't affect current epoch proposals.
    v.currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
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

    // Calculate mana min fee components for header validation
    ManaMinFeeComponents memory components = getManaMinFeeComponentsAt(Timestamp.wrap(block.timestamp), true);

    // Create payload digest signed by the committee members
    v.payloadDigest =
      digest(ProposePayload({archive: _args.archive, oracleInput: _args.oracleInput, headerHash: v.headerHash}));

    // Validate checkpoint header
    validateHeader(
      ValidateHeaderArgs({
        header: v.header,
        digest: v.payloadDigest,
        manaMinFee: FeeLib.summedMinFee(components),
        blobsHashesCommitment: v.blobsHashesCommitment,
        flags: CheckpointHeaderValidationFlags({ignoreDA: false})
      })
    );

    RollupStore storage rollupStore = STFLib.getStorage();

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

    // Validate the streaming Inbox consumption against the parent checkpoint's consumed position.
    // The parent is checkpointNumber - 1, always available: checkpoint 0 carries the {0,0,0} genesis base
    // case written at initialization. rollupStore.tips is not committed until below, so the parent read still sees
    // the parent as the pending tip. The returned cumulative total is stored in this checkpoint's record so its
    // child validates against it and, since temp-log records rewind with the pending chain on a prune, the record
    // stays prune-consistent.
    v.consumedInboxMsgTotal = validateInboxConsumption(
      rollupStore.config.inbox,
      v.header.inboxRollingHash,
      _args.bucketHint,
      v.header.slotNumber,
      STFLib.getInboxMsgTotal(checkpointNumber - 1)
    );

    // Calculate accumulated blob commitments hash for this checkpoint
    // Blob commitments are collected and proven per root rollup proof (per epoch),
    // so we need to know whether we are at the epoch start:
    v.isFirstCheckpointOfEpoch =
      v.currentEpoch > STFLib.getEpochForCheckpoint(checkpointNumber - 1) || checkpointNumber == 1;
    v.blobCommitmentsHash = BlobLib.calculateBlobCommitmentsHash(
      STFLib.getBlobCommitmentsHash(checkpointNumber - 1), v.blobCommitments, v.isFirstCheckpointOfEpoch
    );

    // Compute fee header for checkpoint metadata
    v.feeHeader = FeeLib.computeFeeHeader(
      checkpointNumber,
      _args.oracleInput.feeAssetPriceModifier,
      v.header.totalManaUsed,
      components.congestionCost,
      components.proverCost
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
        blobCommitmentsHash: v.blobCommitmentsHash,
        outHash: v.header.outHash,
        attestationsHash: v.attestationsHash,
        payloadDigest: v.payloadDigest,
        slotNumber: v.header.slotNumber,
        feeHeader: v.feeHeader,
        inboxRollingHash: v.header.inboxRollingHash,
        inboxMsgTotal: v.consumedInboxMsgTotal.toUint64(),
        inboxConsumedBucket: _args.bucketHint.toUint64()
      })
    );

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
   *      - Fr-encoded header fields are within the scalar field: Errors.Rollup__FieldElementOutOfRange
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
    // Check that header fields that map to an Fr are within range.
    FieldLib.requireValidFieldElement(_args.header.blockHeadersHash);
    FieldLib.requireValidFieldElement(_args.header.outHash);
    FieldLib.requireValidFieldElement(_args.header.feeRecipient);
    FieldLib.requireValidFieldElement(bytes32(_args.header.accumulatedFees));

    require(_args.header.coinbase != address(0), Errors.Rollup__InvalidCoinbase());
    require(_args.header.totalManaUsed <= FeeLib.getManaLimit(), Errors.Rollup__ManaLimitExceeded());

    Timestamp currentTime = Timestamp.wrap(block.timestamp);
    RollupStore storage rollupStore = STFLib.getStorage();

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

  /**
   * @notice Validates a checkpoint's Inbox consumption against the streaming inbox buckets and returns how
   *         far consumption has reached. Called from propose() as the enforced consumption path.
   *
   * @dev Read-only; performs no Inbox write. Checks, in order:
   *      1. The checkpoint header's `inboxRollingHash` must equal the rolling hash snapshotted in the Inbox
   *         bucket referenced by `_bucketHint`. The hint is a plain calldata lookup aid, not signed and not
   *         part of the header: a wrong hint cannot change what gets accepted, it only reverts. A checkpoint
   *         that consumes no messages references the same bucket as its parent.
   *      2. The referenced bucket must be settled: a bucket that can still absorb another message is not a
   *         snapshot of anything.
   *      3. Consumption moves forward: the referenced bucket's cumulative total must be at least the parent
   *         checkpoint's (equal consumes nothing; behind is a hard revert). This precedes the subtractions
   *         below, which rely on `bucket.totalMsgCount >= _parentTotalMsgCount` to not underflow.
   *      4. Cap upper bound: a single checkpoint cannot consume more than MAX_L1_TO_L2_MSGS_PER_CHECKPOINT
   *         messages, the maximum the circuits can insert.
   *      5. Mandatory consumption (the censorship assert): the first unconsumed bucket (`_bucketHint + 1`)
   *         must either not exist, sit past the consumption cutoff, or be cap-escaped — consuming through it
   *         would exceed MAX_L1_TO_L2_MSGS_PER_CHECKPOINT messages since the parent checkpoint's cumulative
   *         total. The cutoff (`TimeLib.getInboxCutoffTimestamp`) sits one configured L1 slot before the
   *         previous Aztec slot: everything on L1 by then was visible to every node for the entire previous
   *         slot, while validators are not required to have seen buckets that appeared later than that.
   *
   *      No consumed-bucket pointer is written here. The caller (FI-14) stores the returned consumed
   *      position in the checkpoint's temp-log record, which is the authoritative consumed total: temp logs
   *      rewind with the pending chain on a prune, so the record stays prune-consistent — unlike an
   *      Inbox-side pointer advanced with the pending chain, which would sit ahead of the replacement chain.
   *
   * @param _inbox - The Inbox holding the rolling-hash buckets
   * @param _inboxRollingHash - The checkpoint header's inbox rolling hash
   * @param _bucketHint - Sequence number of the bucket the header's rolling hash corresponds to
   * @param _slotNumber - The slot the checkpoint is proposed in
   * @param _parentTotalMsgCount - Cumulative Inbox message count consumed as of the parent checkpoint
   * @return The cumulative Inbox message count consumed as of this checkpoint (`bucket.totalMsgCount`), for
   *         the caller to store in the checkpoint's temp-log record
   */
  function validateInboxConsumption(
    IInbox _inbox,
    bytes32 _inboxRollingHash,
    uint256 _bucketHint,
    Slot _slotNumber,
    uint256 _parentTotalMsgCount
  ) internal view returns (uint256) {
    IInbox.InboxBucket memory bucket = _inbox.getBucket(_bucketHint);
    require(
      bucket.rollingHash == _inboxRollingHash,
      Errors.Rollup__InvalidInboxRollingHash(bucket.rollingHash, _inboxRollingHash)
    );

    // A bucket that can still absorb a message mutates in place: a proposer bundling a send after its own propose
    // in one L1 transaction would leave the checkpoint committed to a rolling hash that exists neither on L1 nor
    // in any node, which only ever observes a bucket's end-of-block state, and no honest node could then resolve
    // the consumed position. Settled is the negation of the Inbox's rollover condition: the genesis bucket never
    // absorbs, a bucket whose L1 block has passed cannot be reopened, and a full bucket spills the next message
    // into a new one.
    require(
      _bucketHint == 0 || bucket.timestamp < block.timestamp || bucket.msgCount == MAX_MSGS_PER_BUCKET,
      Errors.Rollup__InboxBucketStillMutable(_bucketHint)
    );

    require(
      bucket.totalMsgCount >= _parentTotalMsgCount,
      Errors.Rollup__InboxConsumptionBehindParent(_parentTotalMsgCount, bucket.totalMsgCount)
    );

    require(
      bucket.totalMsgCount - _parentTotalMsgCount <= Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
      Errors.Rollup__TooManyInboxMessagesConsumed(bucket.totalMsgCount - _parentTotalMsgCount)
    );

    if (_bucketHint < _inbox.getCurrentBucketSeq()) {
      IInbox.InboxBucket memory next = _inbox.getBucket(_bucketHint + 1);
      Timestamp cutoff = TimeLib.getInboxCutoffTimestamp(_slotNumber);
      require(
        next.timestamp > Timestamp.unwrap(cutoff)
          || next.totalMsgCount - _parentTotalMsgCount > Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT,
        Errors.Rollup__UnconsumedInboxMessages(_bucketHint + 1)
      );
    }

    return bucket.totalMsgCount;
  }

  /**
   * @notice  Gets the mana min fee components
   *          For more context, consult:
   *          https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8757-fees/design.md
   *
   * @param _timestamp - The timestamp of the checkpoint
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana min fee components
   */
  function getManaMinFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    internal
    view
    returns (ManaMinFeeComponents memory)
  {
    uint256 checkpointOfInterest = STFLib.getEffectivePendingCheckpointNumber(_timestamp);
    return FeeLib.getManaMinFeeComponentsAt(checkpointOfInterest, _timestamp, _inFeeAsset);
  }

  function digest(ProposePayload memory _args) internal view returns (bytes32) {
    return digest(_args, address(this));
  }

  function digest(ProposePayload memory _args, address _verifyingContract) internal view returns (bytes32) {
    return CoordinationSignatureLib.checkpointAttestationDigest(keccak256(abi.encode(_args)), _verifyingContract);
  }
}
