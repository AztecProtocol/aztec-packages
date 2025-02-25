// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore, BlockLog} from "@aztec/core/interfaces/IRollup.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  OracleInput,
  FeeMath,
  ManaBaseFeeComponents,
  L1FeeData,
  FeeAssetPerEthE9,
  FeeHeader
} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {ValidatorSelectionLib} from
  "@aztec/core/libraries/ValidatorSelectionLib/ValidatorSelectionLib.sol";
import {BlobLib} from "./BlobLib.sol";
import {STFLib} from "./core/STFLib.sol";
import {Header, HeaderLib} from "./HeaderLib.sol";

struct ProposeArgs {
  bytes32 archive;
  bytes32 blockHash;
  OracleInput oracleInput;
  bytes header;
  bytes32[] txHashes;
}

struct ValidateHeaderArgs {
  Header header;
  Timestamp currentTime;
  uint256 manaBaseFee;
  bytes32 blobsHashesCommitment;
  uint256 pendingBlockNumber;
  DataStructures.ExecutionFlags flags;
}

struct InterimProposeValues {
  bytes32[] blobHashes;
  bytes32 blobsHashesCommitment;
  bytes32 blobPublicInputsHash;
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

  function propose(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    // TODO(#9101): Extract blobs from beacon chain => remove below body input
    bytes calldata,
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

    {
      uint256 manaBaseFee = FeeMath.summedBaseFee(components);
      validateHeader({
        _header: header,
        _signatures: _signatures,
        _digest: digest(_args),
        _currentTime: Timestamp.wrap(block.timestamp),
        _manaBaseFee: manaBaseFee,
        _blobsHashesCommitment: v.blobsHashesCommitment,
        _flags: DataStructures.ExecutionFlags({ignoreDA: false, ignoreSignatures: false})
      });
    }

    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 blockNumber = ++rollupStore.tips.pendingBlockNumber;

    {
      // @note The components are measured in the fee asset.
      rollupStore.blocks[blockNumber] =
        toBlockLog(_args, blockNumber, components.congestionCost, components.provingCost);
    }

    rollupStore.blobPublicInputsHashes[blockNumber] = v.blobPublicInputsHash;

    // @note  The block number here will always be >=1 as the genesis block is at 0
    {
      bytes32 inHash = rollupStore.config.inbox.consume(blockNumber);
      require(
        header.contentCommitment.inHash == inHash,
        Errors.Rollup__InvalidInHash(inHash, header.contentCommitment.inHash)
      );
    }
    {
      // TODO(#7218): Revert to fixed height tree for outbox, currently just providing min as interim
      // Min size = smallest path of the rollup tree + 1
      (uint256 min,) = MerkleLib.computeMinMaxPathLength(header.contentCommitment.numTxs);
      rollupStore.config.outbox.insert(blockNumber, header.contentCommitment.outHash, min + 1);
    }

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

  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    internal
    view
    returns (ManaBaseFeeComponents memory)
  {
    // @todo If we are not canonical we can just return mostly zeros here.

    RollupStore storage rollupStore = STFLib.getStorage();
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

  /**
   * @notice  Validates the header for submission
   *
   * @param _header - The proposed block header
   * @param _signatures - The signatures for the attestations
   * @param _digest - The digest that signatures signed
   * @param _currentTime - The time of execution
   * @param _blobsHashesCommitment - The blobs hash for this block
   * @dev                - This value is provided to allow for simple simulation of future
   * @param _flags - Flags specific to the execution, whether certain checks should be skipped
   */
  function validateHeader(
    Header memory _header,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    uint256 _manaBaseFee,
    bytes32 _blobsHashesCommitment,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 pendingBlockNumber = STFLib.canPruneAtTime(_currentTime)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    validateHeaderForSubmissionBase(
      ValidateHeaderArgs({
        header: _header,
        currentTime: _currentTime,
        manaBaseFee: _manaBaseFee,
        blobsHashesCommitment: _blobsHashesCommitment,
        pendingBlockNumber: pendingBlockNumber,
        flags: _flags
      })
    );
    validateHeaderForSubmissionSequencerSelection(
      Slot.wrap(_header.globalVariables.slotNumber), _signatures, _digest, _currentTime, _flags
    );
  }

  function digest(ProposeArgs memory _args) internal pure returns (bytes32) {
    return keccak256(abi.encode(SignatureLib.SignatureDomainSeparator.blockAttestation, _args));
  }

  function validateHeaderForSubmissionBase(ValidateHeaderArgs memory _args) private view {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      block.chainid == _args.header.globalVariables.chainId,
      Errors.Rollup__InvalidChainId(block.chainid, _args.header.globalVariables.chainId)
    );

    require(
      _args.header.globalVariables.version == rollupStore.config.version,
      Errors.Rollup__InvalidVersion(
        rollupStore.config.version, _args.header.globalVariables.version
      )
    );

    require(
      _args.header.globalVariables.blockNumber == _args.pendingBlockNumber + 1,
      Errors.Rollup__InvalidBlockNumber(
        _args.pendingBlockNumber + 1, _args.header.globalVariables.blockNumber
      )
    );

    bytes32 tipArchive = rollupStore.blocks[_args.pendingBlockNumber].archive;
    require(
      tipArchive == _args.header.lastArchive.root,
      Errors.Rollup__InvalidArchive(tipArchive, _args.header.lastArchive.root)
    );

    Slot slot = Slot.wrap(_args.header.globalVariables.slotNumber);
    Slot lastSlot = rollupStore.blocks[_args.pendingBlockNumber].slotNumber;
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Timestamp timestamp = TimeLib.toTimestamp(slot);
    require(
      Timestamp.wrap(_args.header.globalVariables.timestamp) == timestamp,
      Errors.Rollup__InvalidTimestamp(
        timestamp, Timestamp.wrap(_args.header.globalVariables.timestamp)
      )
    );

    // @note  If you are hitting this error, it is likely because the chain you use have a blocktime that differs
    //        from the value that we have in the constants.
    //        When you are encountering this, it will likely be as the sequencer expects to be able to include
    //        an Aztec block in the "next" ethereum block based on a timestamp that is 12 seconds in the future
    //        from the last block. However, if the actual will only be 1 second in the future, you will end up
    //        expecting this value to be in the future.
    require(
      timestamp <= _args.currentTime, Errors.Rollup__TimestampInFuture(_args.currentTime, timestamp)
    );

    // Check if the data is available
    require(
      _args.flags.ignoreDA
        || _args.header.contentCommitment.blobsHash == _args.blobsHashesCommitment,
      Errors.Rollup__UnavailableTxs(_args.header.contentCommitment.blobsHash)
    );

    // If not canonical rollup, require that the fees are zero
    if (address(this) != rollupStore.config.feeAssetPortal.canonicalRollup()) {
      require(_args.header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
      require(_args.header.globalVariables.gasFees.feePerL2Gas == 0, Errors.Rollup__NonZeroL2Fee());
    } else {
      require(_args.header.globalVariables.gasFees.feePerDaGas == 0, Errors.Rollup__NonZeroDaFee());
      require(
        _args.header.globalVariables.gasFees.feePerL2Gas == _args.manaBaseFee,
        Errors.Rollup__InvalidManaBaseFee(
          _args.manaBaseFee, _args.header.globalVariables.gasFees.feePerL2Gas
        )
      );
    }
  }

  /**
   * @notice  Validate a header for submission to the pending chain (sequencer selection checks)
   *
   *          These validation checks are directly related to sequencer selection.
   *          Note that while these checks are strict, they can be relaxed with some changes to
   *          message boxes.
   *
   *          Each of the following validation checks must pass, otherwise an error is thrown and we revert.
   *          - The slot MUST be the current slot
   *            This might be relaxed for allow consensus set to better handle short-term bursts of L1 congestion
   *          - The slot MUST be in the current epoch
   *
   * @param _slot - The slot of the header to validate
   * @param _signatures - The signatures to validate
   * @param _digest - The digest that signatures sign over
   */
  function validateHeaderForSubmissionSequencerSelection(
    Slot _slot,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    DataStructures.ExecutionFlags memory _flags
  ) private view {
    // Ensure that the slot proposed is NOT in the future
    Slot currentSlot = _currentTime.slotFromTimestamp();
    require(_slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, _slot));

    // @note  We are currently enforcing that the slot is in the current epoch
    //        If this is not the case, there could potentially be a weird reorg
    //        of an entire epoch if no-one from the new epoch committee have seen
    //        those blocks or behaves as if they did not.

    Epoch epochNumber = _slot.epochFromSlot();
    Epoch currentEpoch = _currentTime.epochFromTimestamp();
    require(epochNumber == currentEpoch, Errors.Rollup__InvalidEpoch(currentEpoch, epochNumber));

    ValidatorSelectionLib.validateValidatorSelection(
      StakingLib.getStorage(), _slot, epochNumber, _signatures, _digest, _flags
    );
  }

  // Helper to avoid stack too deep
  function toBlockLog(
    ProposeArgs calldata _args,
    uint256 _blockNumber,
    uint256 _congestionCost,
    uint256 _provingCost
  ) private view returns (BlockLog memory) {
    RollupStore storage rollupStore = STFLib.getStorage();
    FeeHeader memory parentFeeHeader = rollupStore.blocks[_blockNumber - 1].feeHeader;
    return BlockLog({
      archive: _args.archive,
      blockHash: _args.blockHash,
      slotNumber: Slot.wrap(uint256(bytes32(_args.header[0x0194:0x01b4]))),
      feeHeader: FeeHeader({
        excessMana: FeeMath.computeExcessMana(parentFeeHeader),
        feeAssetPriceNumerator: FeeMath.clampedAdd(
          parentFeeHeader.feeAssetPriceNumerator, _args.oracleInput.feeAssetPriceModifier
        ),
        manaUsed: uint256(bytes32(_args.header[0x0268:0x0288])),
        congestionCost: _congestionCost,
        provingCost: _provingCost
      })
    });
  }
}
