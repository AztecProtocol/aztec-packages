// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {
  RollupStore, SubmitEpochRootProofArgs, FeeHeader
} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/core/libraries/TimeMath.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";

struct SubmitEpochRootProofAddresses {
  IProofCommitmentEscrow proofCommitmentEscrow;
  IFeeJuicePortal feeJuicePortal;
  IRewardDistributor rewardDistributor;
  IERC20 asset;
  address cuauhxicalli;
}

struct SubmitEpochRootProofInterimValues {
  uint256 previousBlockNumber;
  uint256 endBlockNumber;
  Epoch epochToProve;
  Epoch startEpoch;
  bool isFeeCanonical;
  bool isRewardDistributorCanonical;
  uint256 totalProverReward;
  uint256 totalBurn;
}

library EpochProofLib {
  using SafeERC20 for IERC20;

  function submitEpochRootProof(
    RollupStore storage _rollupStore,
    SubmitEpochRootProofArgs calldata _args,
    SubmitEpochRootProofInterimValues memory _interimValues,
    SubmitEpochRootProofAddresses memory _addresses
  ) internal returns (uint256) {
    // Ensure that the proof is not across epochs
    require(
      _interimValues.startEpoch == _interimValues.epochToProve,
      Errors.Rollup__InvalidEpoch(_interimValues.startEpoch, _interimValues.epochToProve)
    );

    for (uint256 i = 0; i < _args.epochSize; i++) {
      // This was moved from getEpochProofPublicInputs() due to stack too deep
      uint256 blobOffset = i * Constants.BLOB_PUBLIC_INPUTS_BYTES + i;
      uint8 blobsInBlock = uint8(_args.blobPublicInputs[blobOffset++]);
      checkBlobPublicInputsHashes(
        _args.blobPublicInputs,
        _rollupStore.blobPublicInputsHashes[_interimValues.previousBlockNumber + i + 1],
        blobOffset,
        blobsInBlock
      );
    }

    bytes32[] memory publicInputs = getEpochProofPublicInputs(
      _rollupStore,
      _args.epochSize,
      _args.args,
      _args.fees,
      _args.blobPublicInputs,
      _args.aggregationObject
    );

    require(
      _rollupStore.epochProofVerifier.verify(_args.proof, publicInputs),
      Errors.Rollup__InvalidProof()
    );

    if (_rollupStore.proofClaim.epochToProve == _interimValues.epochToProve) {
      _addresses.proofCommitmentEscrow.unstakeBond(
        _rollupStore.proofClaim.bondProvider, _rollupStore.proofClaim.bondAmount
      );
    }

    _rollupStore.tips.provenBlockNumber = _interimValues.endBlockNumber;

    // @note  Only if the rollup is the canonical will it be able to meaningfully claim fees
    //        Otherwise, the fees are unbacked #7938.
    _interimValues.isFeeCanonical = address(this) == _addresses.feeJuicePortal.canonicalRollup();
    _interimValues.isRewardDistributorCanonical =
      address(this) == _addresses.rewardDistributor.canonicalRollup();

    _interimValues.totalProverReward = 0;
    _interimValues.totalBurn = 0;

    if (_interimValues.isFeeCanonical || _interimValues.isRewardDistributorCanonical) {
      for (uint256 i = 0; i < _args.epochSize; i++) {
        address coinbase = address(uint160(uint256(publicInputs[9 + i * 2])));
        uint256 reward = 0;
        uint256 toProver = 0;
        uint256 burn = 0;

        if (_interimValues.isFeeCanonical) {
          uint256 fees = uint256(publicInputs[10 + i * 2]);
          if (fees > 0) {
            // This is insanely expensive, and will be fixed as part of the general storage cost reduction.
            // See #9826.
            FeeHeader storage feeHeader =
              _rollupStore.blocks[_interimValues.previousBlockNumber + 1 + i].feeHeader;
            burn += feeHeader.congestionCost * feeHeader.manaUsed;

            reward += (fees - burn);
            _addresses.feeJuicePortal.distributeFees(address(this), fees);
          }
        }

        if (_interimValues.isRewardDistributorCanonical) {
          reward += _addresses.rewardDistributor.claim(address(this));
        }

        if (coinbase == address(0)) {
          toProver = reward;
        } else {
          // @note  We are getting value from the `proofClaim`, which are not cleared.
          //        So if someone is posting the proof before a new claim is made,
          //        the reward will calculated based on the previous values.
          toProver = Math.mulDiv(reward, _rollupStore.proofClaim.basisPointFee, 10_000);
        }

        uint256 toCoinbase = reward - toProver;
        if (toCoinbase > 0) {
          _addresses.asset.safeTransfer(coinbase, toCoinbase);
        }

        _interimValues.totalProverReward += toProver;
        _interimValues.totalBurn += burn;
      }

      if (_interimValues.totalProverReward > 0) {
        // If there is a bond-provider give him the reward, otherwise give it to the submitter.
        address proofRewardRecipient = _rollupStore.proofClaim.bondProvider == address(0)
          ? msg.sender
          : _rollupStore.proofClaim.bondProvider;
        _addresses.asset.safeTransfer(proofRewardRecipient, _interimValues.totalProverReward);
      }

      if (_interimValues.totalBurn > 0) {
        _addresses.asset.safeTransfer(_addresses.cuauhxicalli, _interimValues.totalBurn);
      }
    }

    return _interimValues.endBlockNumber;
  }

  /**
   * @notice Returns the computed public inputs for the given epoch proof.
   *
   * @dev Useful for debugging and testing. Allows submitter to compare their
   * own public inputs used for generating the proof vs the ones assembled
   * by this contract when verifying it.
   *
   * @param  _epochSize - The size of the epoch (to be promoted to a constant)
   * @param  _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   * @param  _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   * @param _blobPublicInputs- The blob public inputs for the proof
   * @param  _aggregationObject - The aggregation object for the proof
   */
  function getEpochProofPublicInputs(
    RollupStore storage _rollupStore,
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs,
    bytes calldata _aggregationObject
  ) internal view returns (bytes32[] memory) {
    uint256 previousBlockNumber = _rollupStore.tips.provenBlockNumber;
    uint256 endBlockNumber = previousBlockNumber + _epochSize;

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
      bytes32 expectedPreviousArchive = _rollupStore.blocks[previousBlockNumber].archive;
      require(
        expectedPreviousArchive == _args[0],
        Errors.Rollup__InvalidPreviousArchive(expectedPreviousArchive, _args[0])
      );

      bytes32 expectedEndArchive = _rollupStore.blocks[endBlockNumber].archive;
      require(
        expectedEndArchive == _args[1], Errors.Rollup__InvalidArchive(expectedEndArchive, _args[1])
      );

      bytes32 expectedPreviousBlockHash = _rollupStore.blocks[previousBlockNumber].blockHash;
      require(
        expectedPreviousBlockHash == _args[2],
        Errors.Rollup__InvalidPreviousBlockHash(expectedPreviousBlockHash, _args[2])
      );

      bytes32 expectedEndBlockHash = _rollupStore.blocks[endBlockNumber].blockHash;
      require(
        expectedEndBlockHash == _args[3],
        Errors.Rollup__InvalidBlockHash(expectedEndBlockHash, _args[3])
      );
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

    // previous_archive.root: the previous archive tree root
    publicInputs[0] = _args[0];

    // previous_archive.next_available_leaf_index: the previous archive next available index
    // normally this should be equal to the block number (since leaves are 0-indexed and blocks 1-indexed)
    // but in yarn-project/merkle-tree/src/new_tree.ts we prefill the tree so that block N is in leaf N
    publicInputs[1] = bytes32(previousBlockNumber + 1);

    // end_archive.root: the new archive tree root
    publicInputs[2] = _args[1];

    // end_archive.next_available_leaf_index: the new archive next available index
    publicInputs[3] = bytes32(endBlockNumber + 1);

    // previous_block_hash: the block hash just preceding this epoch
    publicInputs[4] = _args[2];

    // end_block_hash: the last block hash in the epoch
    publicInputs[5] = _args[3];

    // end_timestamp: the timestamp of the last block in the epoch
    publicInputs[6] = _args[4];

    // end_block_number: last block number in the epoch
    publicInputs[7] = bytes32(endBlockNumber);

    // out_hash: root of this epoch's l2 to l1 message tree
    publicInputs[8] = _args[5];

    uint256 feesLength = Constants.AZTEC_MAX_EPOCH_DURATION * 2;
    // fees[9 to (9+feesLength-1)]: array of recipient-value pairs
    for (uint256 i = 0; i < feesLength; i++) {
      publicInputs[9 + i] = _fees[i];
    }
    uint256 offset = 9 + feesLength;

    // vk_tree_root
    publicInputs[offset] = _rollupStore.vkTreeRoot;
    offset += 1;

    // protocol_contract_tree_root
    publicInputs[offset] = _rollupStore.protocolContractTreeRoot;
    offset += 1;

    // prover_id: id of current epoch's prover
    publicInputs[offset] = _args[6];
    offset += 1;

    // blob_public_inputs
    uint256 blobOffset = 0;
    for (uint256 i = 0; i < _epochSize; i++) {
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

    return publicInputs;
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
  ) internal pure {
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
    internal
    pure
    returns (bytes32 firstLimb, bytes32 secondLimb, bytes32 thirdLimb)
  {
    firstLimb = bytes32(uint256(uint120(bytes15(_input << 136))));
    secondLimb = bytes32(uint256(uint120(bytes15(_input << 16))));
    thirdLimb = bytes32(uint256(uint16(bytes2(_input))));
  }
}
