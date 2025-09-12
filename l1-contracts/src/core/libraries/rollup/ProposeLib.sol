// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore, BlockHeaderValidationFlags} from "@aztec/core/interfaces/IRollup.sol";
import {TempBlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {SignatureDomainSeparator, CommitteeAttestations} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {OracleInput, FeeLib, ManaBaseFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {ProposedHeader, ProposedHeaderLib, StateReference} from "./ProposedHeaderLib.sol";
import {STFLib} from "./STFLib.sol";

struct ProposeArgs {
  bytes32 archive;
  // Including stateReference here so that the archiver can reconstruct the full block header.
  // It doesn't need to be in the proposed header as the values are not used in propose() and they are committed to
  // by the last archive and blobs hash.
  // It can be removed if the archiver can refer to world state for the updated roots.
  StateReference stateReference;
  OracleInput oracleInput;
  ProposedHeader header;
}

struct ProposePayload {
  bytes32 archive;
  StateReference stateReference;
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
  bool isFirstBlockOfEpoch;
  bool isTxsEnabled;
}

/**
 * @param header - The proposed block header
 * @param digest - The digest that signatures signed
 * @param currentTime - The time of execution
 * @param blobsHashesCommitment - The blobs hash for this block, provided for simpler future simulation
 * @param flags - Flags specific to the execution, whether certain checks should be skipped
 */
struct ValidateHeaderArgs {
  ProposedHeader header;
  bytes32 digest;
  uint256 manaBaseFee;
  bytes32 blobsHashesCommitment;
  BlockHeaderValidationFlags flags;
}

/**
 * @title ProposeLib
 * @author Aztec Labs
 * @notice Library responsible for handling the L2 block proposal flow in the Aztec rollup.
 *
 * @dev This library implements the core block proposal mechanism that allows designated proposers to submit
 *      new L2 blocks to extend the rollup chain. It orchestrates the entire proposal process including:
 *      - Blob validation and commitment calculation
 *      - Header validation against chain state and timing constraints
 *      - Validator selection and proposer verification
 *      - Fee calculation and mana consumption tracking
 *      - State transitions and archive updates
 *      - Message processing between L1 and L2 via the Inbox and Outbox contracts
 *
 *      The proposal flow operates within Aztec's time-based model where:
 *      - Each slot has a designated proposer selected from the validator set
 *      - Blocks must be proposed in the correct time slot and build on the current chain tip
 *      - Proposers must provide valid attestations from committee members
 *      - All state transitions are atomically applied upon successful validation
 *
 *      Key functions:
 *      - `propose`: Main entry point called from `RollupCore.propose`.
 *         Handles the complete block proposal process from validation to state updates.
 *      - `validateHeader`: Validates block header against chain state, timing, and fee requirements.
 *         Called internally from `propose`, and externally from `RollupCore.validateHeaderWithAttestations`,
 *         used by proposers to ensure the header is valid before submitting the tx.
 *
 *      Dependencies on other main libraries:
 *      - STFLib: State Transition Function library for chain state management, pruning, and storage access
 *      - FeeLib: Fee calculation library for mana pricing, L1 gas oracles, and fee header computation
 *      - ValidatorSelectionLib: Validator and committee management for epoch setup and proposer verification
 *      - BlobLib: Blob commitment validation and hash calculation for data availability
 *      - ProposedHeaderLib: Block header hashing and validation utilities
 *
 *      Security considerations:
 *      - Only the designated proposer for the current slot can propose a block, enforced by
 *        validating the proposer validator signature among attestations. All other attestations are not
 *        verified on chain until time of proof submission.
 *      - Each block must built on the immediate previous one, ensuring no forks. This is enforced by checking
 *        the last archive root and block numbers. If the previous block is invalid, the proposer is expected to
 *        first invalidate it.
 *      - Blob commitments are validated, to ensure that the values provided correctly match the actual blobs published
 */
library ProposeLib {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using CompressedTimeMath for CompressedSlot;
  using ChainTipsLib for CompressedChainTips;

  /**
   * @notice  Publishes a new L2 block to the pending chain.
   * @dev     Handles a proposed L2 block, validates it, and updates rollup state adding it to the pending chain.
   *          Orchestrates blob validation, header validation, proposer verification, fee calculations, and state
   *          transitions. Automatically prunes unproven blocks if the proof submission window has passed.
   *
   *          Note that some validations and processes are disabled if the chain is configured to run without
   *          transactions, such as during ignition phase:
   *          - No fee header computation or L1 gas fee oracle update
   *          - No inbox message consumption or outbox message insertion
   *
   *          Validations performed:
   *          - Blob commitments against provided blob data: Errors.Rollup__InvalidBlobHash,
   *            Errors.Rollup__InvalidBlobProof
   *          - Block header validations (see validateHeader function for details)
   *          - Proposer signature is valid for designated slot proposer:
   *            Errors.ValidatorSelection__MissingProposerSignature
   *          - Inbox hash matches expected value (when txs enabled): Errors.Rollup__InvalidInHash
   *
   *          Validations NOT performed:
   *          - Committee attestations (only proposer signature verified)
   *          - Transaction validity and state root computation (done at proof submission via a validity proof)
   *
   *          State changes:
   *          - Increment pending block number
   *          - Store archive root for the new block number
   *          - Store block metadata in circular storage (TempBlockLog)
   *          - Update L1 gas fee oracle (when txs enabled)
   *          - Consume inbox messages (when txs enabled)
   *          - Insert outbox messages (when txs enabled)
   *          - Setup epoch for validator selection (first block of the epoch)
   *
   * @param _args - The arguments to propose the block
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
   *        - Nodes must validate actual signatures offchain when downloading blocks
   * @param _blobsInput - The bytes to verify our input blob commitments match real blobs:
   *        - input[:1] - num blobs in block
   *        - input[1:] - blob commitments (48 bytes * num blobs in block)
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
    // Prune unproven blocks if the proof submission window has passed
    if (STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp))) {
      STFLib.prune();
    }

    // Keep intermediate values in memory to avoid stack too deep errors
    InterimProposeValues memory v;

    // Transactions are disabled during ignition phase
    v.isTxsEnabled = FeeLib.isTxsEnabled();

    // Since ignition have no transactions, we need not waste gas updating pricing oracle.
    if (v.isTxsEnabled) {
      FeeLib.updateL1GasFeeOracle();
    }

    // Validate blob commitments against actual blob data and extract hashes
    // TODO(#13430): The below blobsHashesCommitment known as blobsHash elsewhere in the code. The name is confusingly
    // similar to blobCommitmentsHash, see comment in BlobLib.sol -> validateBlobs().
    (v.blobHashes, v.blobsHashesCommitment, v.blobCommitments) = BlobLib.validateBlobs(_blobsInput, _checkBlob);

    v.header = _args.header;

    // Compute header hash for computing the payload digest
    v.headerHash = ProposedHeaderLib.hash(v.header);

    // Setup epoch by sampling the committee for the current epoch and setting the seed for the one after the next.
    // This is a no-op if the epoch is already set up, so it only gets executed by the first block of the epoch.
    v.currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setupEpoch(v.currentEpoch);

    // Calculate mana base fee components for header validation
    ManaBaseFeeComponents memory components;
    if (v.isTxsEnabled) {
      // Since ignition have no transactions, we need not waste gas computing the fee components
      components = getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
    }

    // Create payload digest signed by the committee members
    v.payloadDigest = digest(
      ProposePayload({
        archive: _args.archive,
        stateReference: _args.stateReference,
        oracleInput: _args.oracleInput,
        headerHash: v.headerHash
      })
    );

    // Validate block header
    validateHeader(
      ValidateHeaderArgs({
        header: v.header,
        digest: v.payloadDigest,
        manaBaseFee: FeeLib.summedBaseFee(components),
        blobsHashesCommitment: v.blobsHashesCommitment,
        flags: BlockHeaderValidationFlags({ignoreDA: false})
      })
    );

    {
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

    // Begin state updates - get storage reference and current chain tips
    RollupStore storage rollupStore = STFLib.getStorage();
    CompressedChainTips tips = rollupStore.tips;

    // Increment block number and update chain tips
    uint256 blockNumber = tips.getPendingBlockNumber() + 1;
    tips = tips.updatePendingBlockNumber(blockNumber);

    // Calculate accumulated blob commitments hash for this block
    // Blob commitments are collected and proven per root rollup proof (per epoch),
    // so we need to know whether we are at the epoch start:
    v.isFirstBlockOfEpoch = v.currentEpoch > STFLib.getEpochForBlock(blockNumber - 1) || blockNumber == 1;
    bytes32 blobCommitmentsHash = BlobLib.calculateBlobCommitmentsHash(
      STFLib.getBlobCommitmentsHash(blockNumber - 1), v.blobCommitments, v.isFirstBlockOfEpoch
    );

    // Compute fee header for block metadata
    FeeHeader memory feeHeader;
    if (v.isTxsEnabled) {
      // Since ignition have no transactions, we need not waste gas deriving the fee header
      feeHeader = FeeLib.computeFeeHeader(
        blockNumber,
        _args.oracleInput.feeAssetPriceModifier,
        v.header.totalManaUsed,
        components.congestionCost,
        components.proverCost
      );
    }

    // Hash attestations for storage in block log
    // Compute attestationsHash from the attestations
    v.attestationsHash = keccak256(abi.encode(_attestations));

    // Commit state changes: update chain tips and store block data
    rollupStore.tips = tips;
    rollupStore.archives[blockNumber] = _args.archive;
    STFLib.addTempBlockLog(
      TempBlockLog({
        headerHash: v.headerHash,
        blobCommitmentsHash: blobCommitmentsHash,
        attestationsHash: v.attestationsHash,
        payloadDigest: v.payloadDigest,
        slotNumber: v.header.slotNumber,
        feeHeader: feeHeader
      })
    );

    // Handle L1<->L2 message processing (only when transactions are enabled)
    if (v.isTxsEnabled) {
      // Since ignition will have no transactions there will be no method to consume or output message.
      // Therefore we can ignore it as long as mana target is zero.
      // Since the inbox is async, it must enforce its own check to not try to insert if ignition.

      // Consume pending L1->L2 messages and validate against header commitment
      // @note  The block number here will always be >=1 as the genesis block is at 0
      v.inHash = rollupStore.config.inbox.consume(blockNumber);
      require(
        v.header.contentCommitment.inHash == v.inHash,
        Errors.Rollup__InvalidInHash(v.inHash, v.header.contentCommitment.inHash)
      );

      // Insert L2->L1 messages into outbox for later consumption
      rollupStore.config.outbox.insert(blockNumber, v.header.contentCommitment.outHash);
    }

    // Emit event for external listeners. Nodes rely on this event to update their state.
    emit IRollupCore.L2BlockProposed(blockNumber, _args.archive, v.blobHashes);
  }

  /**
   * @notice Validates a proposed block header against chain state and constraints
   * @dev Called internally from propose() and externally from RollupCore.validateHeaderWithAttestations()
   *      for proposers to check header validity before submitting transactions
   *
   *      Header validations performed:
   *      - Coinbase address is non-zero: Errors.Rollup__InvalidCoinbase
   *      - Mana usage within limits: Errors.Rollup__ManaLimitExceeded
   *      - Builds on correct parent block (archive root check): Errors.Rollup__InvalidArchive
   *      - Slot number greater than last block's slot: Errors.Rollup__SlotAlreadyInChain
   *      - Slot number matches current timestamp slot: Errors.HeaderLib__InvalidSlotNumber
   *      - Timestamp matches slot-derived timestamp: Errors.Rollup__InvalidTimestamp
   *      - Timestamp not in future: Errors.Rollup__TimestampInFuture
   *      - Blob hashes match commitment (unless DA checks ignored): Errors.Rollup__UnavailableTxs
   *      - DA fee is zero: Errors.Rollup__NonZeroDaFee
   *      - L2 gas fee matches computed mana base fee: Errors.Rollup__InvalidManaBaseFee
   *
   * @param _args Validation arguments including header, digest, mana base fee, and flags
   */
  function validateHeader(ValidateHeaderArgs memory _args) internal view {
    require(_args.header.coinbase != address(0), Errors.Rollup__InvalidCoinbase());
    require(_args.header.totalManaUsed <= FeeLib.getManaLimit(), Errors.Rollup__ManaLimitExceeded());

    Timestamp currentTime = Timestamp.wrap(block.timestamp);
    RollupStore storage rollupStore = STFLib.getStorage();

    uint256 pendingBlockNumber = STFLib.getEffectivePendingBlockNumber(currentTime);

    bytes32 tipArchive = rollupStore.archives[pendingBlockNumber];
    require(
      tipArchive == _args.header.lastArchiveRoot,
      Errors.Rollup__InvalidArchive(tipArchive, _args.header.lastArchiveRoot)
    );

    Slot slot = _args.header.slotNumber;
    Slot lastSlot = STFLib.getSlotNumber(pendingBlockNumber);
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Slot currentSlot = currentTime.slotFromTimestamp();
    require(slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, slot));

    Timestamp timestamp = TimeLib.toTimestamp(slot);
    require(_args.header.timestamp == timestamp, Errors.Rollup__InvalidTimestamp(timestamp, _args.header.timestamp));

    require(timestamp <= currentTime, Errors.Rollup__TimestampInFuture(currentTime, timestamp));

    require(
      _args.flags.ignoreDA || _args.header.contentCommitment.blobsHash == _args.blobsHashesCommitment,
      Errors.Rollup__UnavailableTxs(_args.header.contentCommitment.blobsHash)
    );

    require(_args.header.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
    require(
      _args.header.gasFees.feePerL2Gas == _args.manaBaseFee,
      Errors.Rollup__InvalidManaBaseFee(_args.manaBaseFee, _args.header.gasFees.feePerL2Gas)
    );
  }

  /**
   * @notice  Gets the mana base fee components
   *          For more context, consult:
   *          https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8757-fees/design.md
   *
   * @param _timestamp - The timestamp of the block
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana base fee components
   */
  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    internal
    view
    returns (ManaBaseFeeComponents memory)
  {
    uint256 blockOfInterest = STFLib.getEffectivePendingBlockNumber(_timestamp);
    return FeeLib.getManaBaseFeeComponentsAt(blockOfInterest, _timestamp, _inFeeAsset);
  }

  function digest(ProposePayload memory _args) internal pure returns (bytes32) {
    return keccak256(abi.encode(SignatureDomainSeparator.blockAttestation, _args));
  }
}
