// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  RollupStore,
  IRollupCore,
  BlockLog,
  BlockHeaderValidationFlags
} from "@aztec/core/interfaces/IRollup.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {OracleInput, FeeLib, ManaBaseFeeComponents} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {ValidatorSelectionLib} from
  "@aztec/core/libraries/validator-selection/ValidatorSelectionLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {Header, HeaderLib} from "./HeaderLib.sol";
import {STFLib} from "./STFLib.sol";

struct ProposeArgs {
  bytes32 archive;
  // Including stateReference here so that the archiver can reconstruct the full block header.
  // It doesn't need to be in the proposed header as the values are not used in propose() and they are committed to
  // by the last archive and blobs hash.
  // It can be removed if the archiver can refer to world state for the updated roots.
  bytes stateReference;
  OracleInput oracleInput;
  bytes header;
  bytes32[] txHashes;
}

struct ProposePayload {
  bytes32 archive;
  bytes stateReference;
  OracleInput oracleInput;
  bytes32 headerHash;
  bytes32[] txHashes;
}

struct InterimProposeValues {
  bytes32[] blobHashes;
  bytes32 blobsHashesCommitment;
  bytes32 blobPublicInputsHash;
  bytes32 inHash;
  uint256 outboxMinsize;
  bytes32 headerHash;
}

/**
 * @param header - The proposed block header
 * @param attestations - The signatures for the attestations
 * @param digest - The digest that signatures signed
 * @param currentTime - The time of execution
 * @param blobsHashesCommitment - The blobs hash for this block, provided for simpler future simulation
 * @param flags - Flags specific to the execution, whether certain checks should be skipped
 */
struct ValidateHeaderArgs {
  Header header;
  Signature[] attestations;
  bytes32 digest;
  Timestamp currentTime;
  uint256 manaBaseFee;
  bytes32 blobsHashesCommitment;
  BlockHeaderValidationFlags flags;
}

library ProposeLib {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  /**
   * @notice  Publishes the body and propose the block
   * @dev     `eth_log_handlers` rely on this function
   *
   * @param _args - The arguments to propose the block
   * @param _signatures - Signatures from the validators
   * @param _blobInput - The blob evaluation KZG proof, challenge, and opening required for the precompile.
   */
  function propose(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    bytes calldata _blobInput,
    bool _checkBlob
  ) internal {
    if (STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp))) {
      STFLib.prune();
    }
    FeeLib.updateL1GasFeeOracle();

    InterimProposeValues memory v;
    // Since an invalid blob hash here would fail the consensus checks of
    // the header, the `blobInput` is implicitly accepted by consensus as well.
    (v.blobHashes, v.blobsHashesCommitment, v.blobPublicInputsHash) =
      BlobLib.validateBlobs(_blobInput, _checkBlob);

    Header memory header = HeaderLib.decode(_args.header);
    v.headerHash = HeaderLib.hash(_args.header);

    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setupEpoch(StakingLib.getStorage(), currentEpoch);

    ManaBaseFeeComponents memory components =
      getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);

    validateHeader(
      ValidateHeaderArgs({
        header: header,
        attestations: _signatures,
        digest: digest(
          ProposePayload({
            archive: _args.archive,
            stateReference: _args.stateReference,
            oracleInput: _args.oracleInput,
            headerHash: v.headerHash,
            txHashes: _args.txHashes
          })
        ),
        currentTime: Timestamp.wrap(block.timestamp),
        manaBaseFee: FeeLib.summedBaseFee(components),
        blobsHashesCommitment: v.blobsHashesCommitment,
        flags: BlockHeaderValidationFlags({ignoreDA: false, ignoreSignatures: false})
      })
    );

    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 blockNumber = ++rollupStore.tips.pendingBlockNumber;

    rollupStore.blocks[blockNumber] =
      BlockLog({archive: _args.archive, headerHash: v.headerHash, slotNumber: header.slotNumber});

    FeeLib.writeFeeHeader(
      blockNumber,
      _args.oracleInput.feeAssetPriceModifier,
      header.totalManaUsed,
      components.congestionCost,
      components.provingCost
    );

    rollupStore.blobPublicInputsHashes[blockNumber] = v.blobPublicInputsHash;

    // @note  The block number here will always be >=1 as the genesis block is at 0
    v.inHash = rollupStore.config.inbox.consume(blockNumber);
    require(
      header.contentCommitment.inHash == v.inHash,
      Errors.Rollup__InvalidInHash(v.inHash, header.contentCommitment.inHash)
    );

    // TODO(#7218): Revert to fixed height tree for outbox, currently just providing min as interim
    // Min size = smallest path of the rollup tree + 1
    (v.outboxMinsize,) = MerkleLib.computeMinMaxPathLength(header.contentCommitment.numTxs);
    rollupStore.config.outbox.insert(
      blockNumber, header.contentCommitment.outHash, v.outboxMinsize + 1
    );

    emit IRollupCore.L2BlockProposed(blockNumber, _args.archive, v.blobHashes);
  }

  // @note: not view as sampling validators uses tstore
  function validateHeader(ValidateHeaderArgs memory _args) internal {
    require(_args.header.totalManaUsed <= FeeLib.getManaLimit(), Errors.Rollup__ManaLimitExceeded());

    RollupStore storage rollupStore = STFLib.getStorage();

    uint256 pendingBlockNumber = STFLib.getEffectivePendingBlockNumber(_args.currentTime);

    bytes32 tipArchive = rollupStore.blocks[pendingBlockNumber].archive;
    require(
      tipArchive == _args.header.lastArchiveRoot,
      Errors.Rollup__InvalidArchive(tipArchive, _args.header.lastArchiveRoot)
    );

    Slot slot = _args.header.slotNumber;
    Slot lastSlot = rollupStore.blocks[pendingBlockNumber].slotNumber;
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Slot currentSlot = _args.currentTime.slotFromTimestamp();
    require(slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, slot));

    Timestamp timestamp = TimeLib.toTimestamp(slot);
    require(
      _args.header.timestamp == timestamp,
      Errors.Rollup__InvalidTimestamp(timestamp, _args.header.timestamp)
    );

    require(
      timestamp <= _args.currentTime, Errors.Rollup__TimestampInFuture(_args.currentTime, timestamp)
    );

    require(
      _args.flags.ignoreDA
        || _args.header.contentCommitment.blobsHash == _args.blobsHashesCommitment,
      Errors.Rollup__UnavailableTxs(_args.header.contentCommitment.blobsHash)
    );

    require(_args.header.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
    require(
      _args.header.gasFees.feePerL2Gas == _args.manaBaseFee,
      Errors.Rollup__InvalidManaBaseFee(_args.manaBaseFee, _args.header.gasFees.feePerL2Gas)
    );

    ValidatorSelectionLib.verify(
      StakingLib.getStorage(),
      slot,
      slot.epochFromSlot(),
      _args.attestations,
      _args.digest,
      _args.flags
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
    return keccak256(abi.encode(SignatureLib.SignatureDomainSeparator.blockAttestation, _args));
  }
}
