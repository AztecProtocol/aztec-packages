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
import {
  OracleInput,
  FeeMath,
  ManaBaseFeeComponents,
  L1FeeData,
  FeeAssetPerEthE9,
  FeeHeader
} from "@aztec/core/libraries/rollup/FeeMath.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {ValidatorSelectionLib} from
  "@aztec/core/libraries/validator-selection/ValidatorSelectionLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {Header, HeaderLib} from "./HeaderLib.sol";
import {STFLib} from "./STFLib.sol";

struct ProposeArgs {
  bytes32 archive;
  bytes32 blockHash;
  OracleInput oracleInput;
  bytes header;
  bytes32[] txHashes;
}

struct InterimProposeValues {
  bytes32[] blobHashes;
  bytes32 blobsHashesCommitment;
  bytes32 blobPublicInputsHash;
  bytes32 inHash;
  uint256 outboxMinsize;
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

  Slot internal constant LIFETIME = Slot.wrap(5);
  Slot internal constant LAG = Slot.wrap(2);

  function updateL1GasFeeOracle() internal {
    Slot slot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    // The slot where we find a new queued value acceptable
    RollupStore storage rollupStore = STFLib.getStorage();
    Slot acceptableSlot = rollupStore.l1GasOracleValues.slotOfChange + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    rollupStore.l1GasOracleValues.pre = rollupStore.l1GasOracleValues.post;
    rollupStore.l1GasOracleValues.post =
      L1FeeData({baseFee: block.basefee, blobFee: BlobLib.getBlobBaseFee()});
    rollupStore.l1GasOracleValues.slotOfChange = slot + LAG;
  }

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
    updateL1GasFeeOracle();

    InterimProposeValues memory v;
    // Since an invalid blob hash here would fail the consensus checks of
    // the header, the `blobInput` is implicitly accepted by consensus as well.
    (v.blobHashes, v.blobsHashesCommitment, v.blobPublicInputsHash) =
      BlobLib.validateBlobs(_blobInput, _checkBlob);

    Header memory header = HeaderLib.decode(_args.header);

    ValidatorSelectionLib.setupEpoch(StakingLib.getStorage());

    ManaBaseFeeComponents memory components =
      getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);

    validateHeader(
      ValidateHeaderArgs({
        header: header,
        attestations: _signatures,
        digest: digest(_args),
        currentTime: Timestamp.wrap(block.timestamp),
        manaBaseFee: FeeMath.summedBaseFee(components),
        blobsHashesCommitment: v.blobsHashesCommitment,
        flags: BlockHeaderValidationFlags({ignoreDA: false, ignoreSignatures: false})
      })
    );

    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 blockNumber = ++rollupStore.tips.pendingBlockNumber;

    rollupStore.blocks[blockNumber] =
      toBlockLog(_args, header, blockNumber, components.congestionCost, components.provingCost);

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

  function getL1FeesAt(Timestamp _timestamp) internal view returns (L1FeeData memory) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return _timestamp.slotFromTimestamp() < rollupStore.l1GasOracleValues.slotOfChange
      ? rollupStore.l1GasOracleValues.pre
      : rollupStore.l1GasOracleValues.post;
  }

  function getFeeAssetPerEth() internal view returns (FeeAssetPerEthE9) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return FeeMath.getFeeAssetPerEth(
      rollupStore.blocks[rollupStore.tips.pendingBlockNumber].feeHeader.feeAssetPriceNumerator
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
    RollupStore storage rollupStore = STFLib.getStorage();

    // If we are not the canonical rollup, we cannot claim any fees, so we return 0s
    // The congestion multiplier could be computed, but as it could only be used to guide
    // might as well save the gas and anyone interested can do it off-chain.
    if (address(this) != rollupStore.config.feeAssetPortal.canonicalRollup()) {
      return ManaBaseFeeComponents({
        congestionCost: 0,
        provingCost: 0,
        congestionMultiplier: 0,
        dataCost: 0,
        gasCost: 0
      });
    }

    // If we can prune, we use the proven block, otherwise the pending block
    uint256 blockOfInterest = STFLib.canPruneAtTime(_timestamp)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    return FeeMath.getManaBaseFeeComponentsAt(
      rollupStore.blocks[blockOfInterest].feeHeader,
      getL1FeesAt(_timestamp),
      rollupStore.provingCostPerMana,
      _inFeeAsset ? getFeeAssetPerEth() : FeeAssetPerEthE9.wrap(1e9),
      TimeLib.getStorage().epochDuration
    );
  }

  function validateHeader(ValidateHeaderArgs memory _args) internal view {
    require(
      block.chainid == _args.header.globalVariables.chainId,
      Errors.Rollup__InvalidChainId(block.chainid, _args.header.globalVariables.chainId)
    );

    RollupStore storage rollupStore = STFLib.getStorage();

    require(
      _args.header.globalVariables.version == rollupStore.config.version,
      Errors.Rollup__InvalidVersion(
        rollupStore.config.version, _args.header.globalVariables.version
      )
    );

    uint256 pendingBlockNumber = STFLib.canPruneAtTime(_args.currentTime)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    require(
      _args.header.globalVariables.blockNumber == pendingBlockNumber + 1,
      Errors.Rollup__InvalidBlockNumber(
        pendingBlockNumber + 1, _args.header.globalVariables.blockNumber
      )
    );

    bytes32 tipArchive = rollupStore.blocks[pendingBlockNumber].archive;
    require(
      tipArchive == _args.header.lastArchive.root,
      Errors.Rollup__InvalidArchive(tipArchive, _args.header.lastArchive.root)
    );

    Slot slot = _args.header.globalVariables.slotNumber;
    Slot lastSlot = rollupStore.blocks[pendingBlockNumber].slotNumber;
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Slot currentSlot = _args.currentTime.slotFromTimestamp();
    require(slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, slot));

    Timestamp timestamp = TimeLib.toTimestamp(slot);
    require(
      _args.header.globalVariables.timestamp == timestamp,
      Errors.Rollup__InvalidTimestamp(timestamp, _args.header.globalVariables.timestamp)
    );

    require(
      timestamp <= _args.currentTime, Errors.Rollup__TimestampInFuture(_args.currentTime, timestamp)
    );

    require(
      _args.flags.ignoreDA
        || _args.header.contentCommitment.blobsHash == _args.blobsHashesCommitment,
      Errors.Rollup__UnavailableTxs(_args.header.contentCommitment.blobsHash)
    );

    require(_args.header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
    require(
      _args.header.globalVariables.gasFees.feePerL2Gas == _args.manaBaseFee,
      Errors.Rollup__InvalidManaBaseFee(
        _args.manaBaseFee, _args.header.globalVariables.gasFees.feePerL2Gas
      )
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

  function digest(ProposeArgs memory _args) internal pure returns (bytes32) {
    return keccak256(abi.encode(SignatureLib.SignatureDomainSeparator.blockAttestation, _args));
  }

  // Helper to avoid stack too deep
  function toBlockLog(
    ProposeArgs calldata _args,
    Header memory _header,
    uint256 _blockNumber,
    uint256 _congestionCost,
    uint256 _provingCost
  ) private view returns (BlockLog memory) {
    RollupStore storage rollupStore = STFLib.getStorage();
    FeeHeader storage parentFeeHeader = rollupStore.blocks[_blockNumber - 1].feeHeader;
    return BlockLog({
      archive: _args.archive,
      blockHash: _args.blockHash,
      slotNumber: _header.globalVariables.slotNumber,
      feeHeader: FeeHeader({
        excessMana: FeeMath.computeExcessMana(parentFeeHeader),
        feeAssetPriceNumerator: FeeMath.clampedAdd(
          parentFeeHeader.feeAssetPriceNumerator, _args.oracleInput.feeAssetPriceModifier
        ),
        manaUsed: _header.totalManaUsed,
        congestionCost: _congestionCost,
        provingCost: _provingCost
      })
    });
  }
}
