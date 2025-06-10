// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  SubmitEpochRootProofArgs,
  PublicInputArgs,
  IRollupCore
} from "@aztec/core/interfaces/IRollup.sol";
import {RollupStore, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {BlobLib} from "@aztec/core/libraries/rollup/BlobLib.sol";
import {CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {RewardLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {STFLib, RollupStore} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

library EpochProofLib {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;
  using FeeHeaderLib for CompressedFeeHeader;

  // This is a temporary struct to avoid stack too deep errors
  struct BlobVarsTemp {
    uint256 blobOffset;
    uint256 offset;
    uint256 i;
  }

  /**
   * @notice  Submit a proof for an epoch in the pending chain
   *
   * @dev     Will emit `L2ProofVerified` if the proof is valid
   *
   * @dev     Will throw if:
   *          - The block number is past the pending chain
   *          - The last archive root of the header does not match the archive root of parent block
   *          - The archive root of the header does not match the archive root of the proposed block
   *          - The batched blob proof is invalid
   *          - The batched blob proof does not correspond to the rollup data
   *          - The proof is invalid
   *
   * @dev     We provide the `_archive` even if it could be read from storage itself because it allow for better error
   *          messages. Without passing it, we would just have a proof verification failure.
   *
   * @param _args - The arguments to submit the epoch root proof:
   *          _start - The block number at the start of the epoch
   *          _end - The block number at the end of the epoch
   *          _args - Array of public inputs to the proof (previousArchive, endArchive, endTimestamp, outHash, proverId)
   *          _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   *          _blobInputs - The batched blob inputs for the EVM point evaluation precompile and as public inputs for the proof
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
    }

    bytes32[] memory publicInputs = new bytes32[](Constants.ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH);

    // Structure of the root rollup public inputs we need to reassemble:
    //
    // struct RootRollupPublicInputs {
    //   previous_archive_root: Field,
    //   end_archive_root: Field,
    //   proposedBlockHeaderHashes: [Field; Constants.AZTEC_MAX_EPOCH_DURATION],
    //   fees: [FeeRecipient; Constants.AZTEC_MAX_EPOCH_DURATION],
    //   chain_id: Field,
    //   version: Field,
    //   vk_tree_root: Field,
    //   protocol_contract_tree_root: Field,
    //   prover_id: Field,
    //   blob_public_inputs: FinalBlobAccumulatorPublicInputs,
    // }
    {
      // previous_archive.root: the previous archive tree root
      publicInputs[0] = _args.previousArchive;

      // end_archive.root: the new archive tree root
      publicInputs[1] = _args.endArchive;
    }

    uint256 numBlocks = _end - _start + 1;

    for (uint256 i = 0; i < numBlocks; i++) {
      publicInputs[2 + i] = rollupStore.blocks[_start + i].headerHash;
    }

    uint256 offset = 2 + Constants.AZTEC_MAX_EPOCH_DURATION;

    uint256 feesLength = Constants.AZTEC_MAX_EPOCH_DURATION * 2;
    // fees[2n to 2n + 1]: a fee element, which contains of a recipient and a value
    for (uint256 i = 0; i < feesLength; i++) {
      publicInputs[offset + i] = _fees[i];
    }
    offset += feesLength;

    publicInputs[offset] = bytes32(block.chainid);
    offset += 1;

    publicInputs[offset] = bytes32(rollupStore.config.version);
    offset += 1;

    // vk_tree_root
    publicInputs[offset] = rollupStore.config.vkTreeRoot;
    offset += 1;

    // protocol_contract_tree_root
    publicInputs[offset] = rollupStore.config.protocolContractTreeRoot;
    offset += 1;

    // prover_id: id of current epoch's prover
    publicInputs[offset] = addressToField(_args.proverId);
    offset += 1;

    // FinalBlobAccumulatorPublicInputs:
    // The blob public inputs do not require the versioned hash of the batched commitment, which is stored in _blobPublicInputs[0:32]
    // or the KZG opening 'proof' (commitment Q) stored in _blobPublicInputs[144:]. They are used in validateBatchedBlob().
    // See BlobLib.sol -> validateBatchedBlob() and calculateBlobCommitmentsHash() for documentation on the below blob related inputs.

    // blobCommitmentsHash
    publicInputs[offset] = rollupStore.blocks[_end].blobCommitmentsHash;
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
    offset += 2;

    return publicInputs;
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

    bool claimedNumBlocksInEpoch = _end - _start + 1 <= Constants.AZTEC_MAX_EPOCH_DURATION;
    require(
      claimedNumBlocksInEpoch,
      Errors.Rollup__TooManyBlocksInEpoch(Constants.AZTEC_MAX_EPOCH_DURATION, _end - _start)
    );

    return endEpoch;
  }

  function verifyEpochRootProof(SubmitEpochRootProofArgs calldata _args)
    private
    view
    returns (bool)
  {
    RollupStore storage rollupStore = STFLib.getStorage();

    BlobLib.validateBatchedBlob(_args.blobInputs);

    bytes32[] memory publicInputs =
      getEpochProofPublicInputs(_args.start, _args.end, _args.args, _args.fees, _args.blobInputs);

    require(
      rollupStore.config.epochProofVerifier.verify(_args.proof, publicInputs),
      Errors.Rollup__InvalidProof()
    );

    return true;
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
}
