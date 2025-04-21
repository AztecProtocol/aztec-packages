// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  SubmitEpochRootProofArgs,
  PublicInputArgs,
  IRollupCore,
  EpochRewards,
  SubEpochRewards
} from "@aztec/core/interfaces/IRollup.sol";
import {RollupStore, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  CompressedFeeHeader,
  FeeHeaderLib,
  FeeLib,
  FeeStore
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {STFLib, RollupStore} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";

library EpochProofLib {
  using SafeERC20 for IERC20;

  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;
  using FeeHeaderLib for CompressedFeeHeader;

  struct Values {
    address sequencer;
    uint256 proverFee;
    uint256 sequencerFee;
    uint256 sequencerBlockReward;
    uint256 manaUsed;
  }

  struct Totals {
    uint256 feesToClaim;
    uint256 totalBurn;
  }

  // A Cuauhxicalli [kʷaːʍʃiˈkalːi] ("eagle gourd bowl") is a ceremonial Aztec vessel or altar used to hold offerings,
  // such as sacrificial hearts, during rituals performed within temples.
  address public constant BURN_ADDRESS = address(bytes20("CUAUHXICALLI"));

  /**
   * @notice  Submit a proof for an epoch in the pending chain
   *
   * @dev     Will emit `L2ProofVerified` if the proof is valid
   *
   * @dev     Will throw if:
   *          - The block number is past the pending chain
   *          - The last archive root of the header does not match the archive root of parent block
   *          - The archive root of the header does not match the archive root of the proposed block
   *          - The proof is invalid
   *
   * @dev     We provide the `_archive` and `_blockHash` even if it could be read from storage itself because it allow for
   *          better error messages. Without passing it, we would just have a proof verification failure.
   *
   * @param _args - The arguments to submit the epoch root proof:
   *          _epochSize - The size of the epoch (to be promoted to a constant)
   *          _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   *          _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   *          _blobPublicInputs - The blob public inputs for the proof
   *          _aggregationObject - The aggregation object for the proof
   *          _proof - The proof to verify
   */
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) internal {
    if (STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp))) {
      STFLib.prune();
    }

    Epoch endEpoch = assertAcceptable(_args.start, _args.end);

    require(verifyEpochRootProof(_args), "proof is invalid");

    RollupStore storage rollupStore = STFLib.getStorage();
    rollupStore.tips.provenBlockNumber = Math.max(rollupStore.tips.provenBlockNumber, _args.end);

    handleRewardsAndFees(_args, endEpoch);

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
   * @param  _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   * @param  _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   * @param _blobPublicInputs- The blob public inputs for the proof
   * @param  _aggregationObject - The aggregation object for the proof
   */
  function getEpochProofPublicInputs(
    uint256 _start,
    uint256 _end,
    PublicInputArgs calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs,
    bytes calldata _aggregationObject
  ) internal view returns (bytes32[] memory) {
    RollupStore storage rollupStore = STFLib.getStorage();
    // Args are defined as an array because Solidity complains with "stack too deep" otherwise
    // 0 bytes32 _previousArchive,
    // 1 bytes32 _endArchive,
    // 2 bytes32 _previousBlockHash,
    // 3 bytes32 _endBlockHash,
    // 4 bytes32 _endTimestamp,
    // 5 bytes32 _outHash,
    // 6 bytes32 _proverId,

    // TODO(#7373): Public inputs are not fully verified

    {
      // We do it this way to provide better error messages than passing along the storage values
      {
        bytes32 expectedPreviousArchive = rollupStore.blocks[_start - 1].archive;
        require(
          expectedPreviousArchive == _args.previousArchive,
          Errors.Rollup__InvalidPreviousArchive(expectedPreviousArchive, _args.previousArchive)
        );
      }

      {
        bytes32 expectedEndArchive = rollupStore.blocks[_end].archive;
        require(
          expectedEndArchive == _args.endArchive,
          Errors.Rollup__InvalidArchive(expectedEndArchive, _args.endArchive)
        );
      }

      {
        bytes32 expectedPreviousBlockHash = rollupStore.blocks[_start - 1].blockHash;
        require(
          expectedPreviousBlockHash == _args.previousBlockHash,
          Errors.Rollup__InvalidPreviousBlockHash(
            expectedPreviousBlockHash, _args.previousBlockHash
          )
        );
      }

      {
        bytes32 expectedEndBlockHash = rollupStore.blocks[_end].blockHash;
        require(
          expectedEndBlockHash == _args.endBlockHash,
          Errors.Rollup__InvalidBlockHash(expectedEndBlockHash, _args.endBlockHash)
        );
      }
    }

    bytes32[] memory publicInputs = new bytes32[](
      Constants.ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH + Constants.AGGREGATION_OBJECT_LENGTH
    );

    // Structure of the root rollup public inputs we need to reassemble:
    //
    // struct RootRollupPublicInputs {
    //   previous_archive: AppendOnlyTreeSnapshot,
    //   end_archive: AppendOnlyTreeSnapshot,
    //   previous_block_hash: Field,
    //   end_block_hash: Field,
    //   end_timestamp: u64,
    //   end_block_number: Field,
    //   out_hash: Field,
    //   fees: [FeeRecipient; Constants.AZTEC_MAX_EPOCH_DURATION],
    //   vk_tree_root: Field,
    //   protocol_contract_tree_root: Field,
    //   prover_id: Field,
    //   blob_public_inputs: [BlockBlobPublicInputs; Constants.AZTEC_MAX_EPOCH_DURATION], // <--This will be reduced to 1 if/when we implement multi-opening for blob verification
    // }
    {
      // previous_archive.root: the previous archive tree root
      publicInputs[0] = _args.previousArchive;

      // previous_archive.next_available_leaf_index: the previous archive next available index
      // normally this should be equal to the block number (since leaves are 0-indexed and blocks 1-indexed)
      // but in yarn-project/merkle-tree/src/new_tree.ts we prefill the tree so that block N is in leaf N
      publicInputs[1] = bytes32(_start);

      // end_archive.root: the new archive tree root
      publicInputs[2] = _args.endArchive;

      // end_archive.next_available_leaf_index: the new archive next available index
      publicInputs[3] = bytes32(_end + 1);

      // previous_block_hash: the block hash just preceding this epoch
      publicInputs[4] = _args.previousBlockHash;

      // end_block_hash: the last block hash in the epoch
      publicInputs[5] = _args.endBlockHash;

      // end_timestamp: the timestamp of the last block in the epoch
      publicInputs[6] = bytes32(Timestamp.unwrap(_args.endTimestamp));

      // end_block_number: last block number in the epoch
      publicInputs[7] = bytes32(_end);

      // out_hash: root of this epoch's l2 to l1 message tree
      publicInputs[8] = _args.outHash;
    }

    uint256 feesLength = Constants.AZTEC_MAX_EPOCH_DURATION * 2;
    // fees[9 to (9+feesLength-1)]: array of recipient-value pairs
    for (uint256 i = 0; i < feesLength; i++) {
      publicInputs[9 + i] = _fees[i];
    }
    uint256 offset = 9 + feesLength;

    // vk_tree_root
    publicInputs[offset] = rollupStore.config.vkTreeRoot;
    offset += 1;

    // protocol_contract_tree_root
    publicInputs[offset] = rollupStore.config.protocolContractTreeRoot;
    offset += 1;

    // prover_id: id of current epoch's prover
    publicInputs[offset] = addressToField(_args.proverId);
    offset += 1;

    {
      // blob_public_inputs
      uint256 blobOffset = 0;
      for (uint256 i = 0; i < _end - _start + 1; i++) {
        uint8 blobsInBlock = uint8(_blobPublicInputs[blobOffset++]);
        for (uint256 j = 0; j < Constants.BLOBS_PER_BLOCK; j++) {
          if (j < blobsInBlock) {
            // z
            publicInputs[offset++] = bytes32(_blobPublicInputs[blobOffset:blobOffset += 32]);
            // y
            (publicInputs[offset++], publicInputs[offset++], publicInputs[offset++]) =
              bytes32ToBigNum(bytes32(_blobPublicInputs[blobOffset:blobOffset += 32]));
            // To fit into 2 fields, the commitment is split into 31 and 17 byte numbers
            // See yarn-project/foundation/src/blob/index.ts -> commitmentToFields()
            // TODO: The below left pads, possibly inefficiently
            // c[0]
            publicInputs[offset++] =
              bytes32(uint256(uint248(bytes31(_blobPublicInputs[blobOffset:blobOffset += 31]))));
            // c[1]
            publicInputs[offset++] =
              bytes32(uint256(uint136(bytes17(_blobPublicInputs[blobOffset:blobOffset += 17]))));
          } else {
            offset += Constants.BLOB_PUBLIC_INPUTS;
          }
        }
      }
    }

    {
      // the block proof is recursive, which means it comes with an aggregation object
      // this snippet copies it into the public inputs needed for verification
      // it also guards against empty _aggregationObject used with mocked proofs
      uint256 aggregationLength = _aggregationObject.length / 32;
      for (uint256 i = 0; i < Constants.AGGREGATION_OBJECT_LENGTH && i < aggregationLength; i++) {
        bytes32 part;
        assembly {
          part := calldataload(add(_aggregationObject.offset, mul(i, 32)))
        }
        publicInputs[i + Constants.ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH] = part;
      }
    }

    return publicInputs;
  }

  function handleRewardsAndFees(SubmitEpochRootProofArgs memory _args, Epoch _endEpoch) private {
    RollupStore storage rollupStore = STFLib.getStorage();

    bool isRewardDistributorCanonical =
      address(this) == rollupStore.config.rewardDistributor.canonicalRollup();

    uint256 length = _args.end - _args.start + 1;
    EpochRewards storage $er = rollupStore.epochRewards[_endEpoch];
    SubEpochRewards storage $sr = $er.subEpoch[length];

    {
      address prover = _args.args.proverId;
      require(
        !$sr.hasSubmitted[prover], Errors.Rollup__ProverHaveAlreadySubmitted(prover, _endEpoch)
      );
      $sr.hasSubmitted[prover] = true;
    }
    $sr.summedCount += 1;

    if (length > $er.longestProvenLength) {
      Values memory v;
      Totals memory t;

      {
        uint256 added = length - $er.longestProvenLength;
        uint256 blockRewardsAvailable = isRewardDistributorCanonical
          ? rollupStore.config.rewardDistributor.claimBlockRewards(address(this), added)
          : 0;
        uint256 sequencerShare = blockRewardsAvailable / 2;
        v.sequencerBlockReward = sequencerShare / added;

        $er.rewards += (blockRewardsAvailable - sequencerShare);
      }

      FeeStore storage feeStore = FeeLib.getStorage();

      for (uint256 i = $er.longestProvenLength; i < length; i++) {
        CompressedFeeHeader storage feeHeader = feeStore.feeHeaders[_args.start + i];

        v.manaUsed = feeHeader.getManaUsed();

        uint256 fee = uint256(_args.fees[1 + i * 2]);
        uint256 burn = feeHeader.getCongestionCost() * v.manaUsed;

        t.feesToClaim += fee;
        t.totalBurn += burn;

        // Compute the proving fee in the fee asset
        v.proverFee = Math.min(v.manaUsed * feeHeader.getProvingCost(), fee - burn);
        $er.rewards += v.proverFee;

        v.sequencerFee = fee - burn - v.proverFee;

        {
          v.sequencer = fieldToAddress(_args.fees[i * 2]);
          rollupStore.sequencerRewards[v.sequencer] += (v.sequencerBlockReward + v.sequencerFee);
        }
      }

      $er.longestProvenLength = length;

      if (t.feesToClaim > 0) {
        rollupStore.config.feeAssetPortal.distributeFees(address(this), t.feesToClaim);
      }

      if (t.totalBurn > 0) {
        rollupStore.config.feeAsset.transfer(BURN_ADDRESS, t.totalBurn);
      }
    }
  }

  function assertAcceptable(uint256 _start, uint256 _end) private view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();

    Epoch startEpoch = STFLib.getEpochForBlock(_start);
    // This also checks for existence of the block.
    Epoch endEpoch = STFLib.getEpochForBlock(_end);

    require(startEpoch == endEpoch, Errors.Rollup__StartAndEndNotSameEpoch(startEpoch, endEpoch));

    Slot deadline = startEpoch.toSlots() + Slot.wrap(rollupStore.config.proofSubmissionWindow);
    require(
      deadline >= Timestamp.wrap(block.timestamp).slotFromTimestamp(),
      Errors.Rollup__PastDeadline(deadline, Timestamp.wrap(block.timestamp).slotFromTimestamp())
    );

    // By making sure that the previous block is in another epoch, we know that we were
    // at the start.
    Epoch parentEpoch = STFLib.getEpochForBlock(_start - 1);

    require(startEpoch > Epoch.wrap(0) || _start == 1, "invalid first epoch proof");

    bool isStartOfEpoch = _start == 1 || parentEpoch <= startEpoch - Epoch.wrap(1);
    require(isStartOfEpoch, Errors.Rollup__StartIsNotFirstBlockOfEpoch());

    bool isStartBuildingOnProven = _start - 1 <= rollupStore.tips.provenBlockNumber;
    require(isStartBuildingOnProven, Errors.Rollup__StartIsNotBuildingOnProven());

    return endEpoch;
  }

  function verifyEpochRootProof(SubmitEpochRootProofArgs calldata _args)
    private
    view
    returns (bool)
  {
    RollupStore storage rollupStore = STFLib.getStorage();

    uint256 size = _args.end - _args.start + 1;

    for (uint256 i = 0; i < size; i++) {
      uint256 blobOffset = i * Constants.BLOB_PUBLIC_INPUTS_BYTES + i;
      uint8 blobsInBlock = uint8(_args.blobPublicInputs[blobOffset++]);
      checkBlobPublicInputsHashes(
        _args.blobPublicInputs,
        rollupStore.blobPublicInputsHashes[_args.start + i],
        blobOffset,
        blobsInBlock
      );
    }

    bytes32[] memory publicInputs = getEpochProofPublicInputs(
      _args.start,
      _args.end,
      _args.args,
      _args.fees,
      _args.blobPublicInputs,
      _args.aggregationObject
    );

    require(
      rollupStore.config.epochProofVerifier.verify(_args.proof, publicInputs),
      Errors.Rollup__InvalidProof()
    );

    return true;
  }

  /**
   * Helper fn to prevent stack too deep. Checks blob public input hashes match for a block:
   * @param _blobPublicInputs - The provided blob public inputs bytes array
   * @param _blobPublicInputsHash - The stored blob public inputs hash
   * @param _index - The index to start in _blobPublicInputs
   * @param _blobsInBlock - The number of blobs in this block
   */
  function checkBlobPublicInputsHashes(
    bytes calldata _blobPublicInputs,
    bytes32 _blobPublicInputsHash,
    uint256 _index,
    uint8 _blobsInBlock
  ) private pure {
    bytes32 calcBlobPublicInputsHash = sha256(
      abi.encodePacked(
        _blobPublicInputs[_index:_index + Constants.BLOB_PUBLIC_INPUTS_BYTES * _blobsInBlock]
      )
    );
    require(
      calcBlobPublicInputsHash == _blobPublicInputsHash,
      Errors.Rollup__InvalidBlobPublicInputsHash(_blobPublicInputsHash, calcBlobPublicInputsHash)
    );
  }

  /**
   * @notice  Converts a BLS12 field element from bytes32 to a nr BigNum type
   * The nr bignum type for BLS12 fields is encoded as 3 nr fields - see blob_public_inputs.ts:
   * firstLimb = last 15 bytes;
   * secondLimb = bytes 2 -> 17;
   * thirdLimb = first 2 bytes;
   * Used when verifying epoch proofs to gather blob specific public inputs.
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

  function addressToField(address _a) private pure returns (bytes32) {
    return bytes32(uint256(uint160(_a)));
  }

  function fieldToAddress(bytes32 _f) private pure returns (address) {
    return address(uint160(uint256(_f)));
  }
}
