// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IRollup} from "./interfaces/IRollup.sol";
import {IAvailabilityOracle} from "./interfaces/IAvailabilityOracle.sol";
import {IInbox} from "./interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "./interfaces/messagebridge/IOutbox.sol";
import {IRegistry} from "./interfaces/messagebridge/IRegistry.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

// Libraries
import {HeaderLib} from "./libraries/HeaderLib.sol";
import {Hash} from "./libraries/Hash.sol";
import {Errors} from "./libraries/Errors.sol";
import {Constants} from "./libraries/ConstantsGen.sol";
import {MerkleLib} from "./libraries/MerkleLib.sol";
import {SignatureLib} from "./sequencer_selection/SignatureLib.sol";

// Contracts
import {MockVerifier} from "../mock/MockVerifier.sol";
import {Inbox} from "./messagebridge/Inbox.sol";
import {Outbox} from "./messagebridge/Outbox.sol";
import {Leonidas} from "./sequencer_selection/Leonidas.sol";

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that is concerned about readability and velocity of development
 * not giving a damn about gas costs.
 */
contract Rollup is Leonidas, IRollup {
  struct BlockLog {
    bytes32 archive;
    bool isProven;
  }

  IRegistry public immutable REGISTRY;
  IAvailabilityOracle public immutable AVAILABILITY_ORACLE;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  uint256 public immutable VERSION;
  IERC20 public immutable GAS_TOKEN;

  IVerifier public verifier;

  uint256 public lastBlockTs;
  // Tracks the last time time was warped on L2 ("warp" is the testing cheatcode).
  // See https://github.com/AztecProtocol/aztec-packages/issues/1614
  uint256 public lastWarpedBlockTs;

  uint256 public pendingBlockCount;
  uint256 public provenBlockCount;

  // @todo  Validate assumption:
  //        Currently we assume that the archive root following a block is specific to the block
  //        e.g., changing any values in the block or header should in the end make its way to the archive
  //
  //        More direct approach would be storing keccak256(header) as well
  mapping(uint256 blockNumber => BlockLog log) public blocks;

  bytes32 public vkTreeRoot;

  constructor(
    IRegistry _registry,
    IAvailabilityOracle _availabilityOracle,
    IERC20 _gasToken,
    bytes32 _vkTreeRoot
  ) Leonidas(msg.sender) {
    verifier = new MockVerifier();
    REGISTRY = _registry;
    AVAILABILITY_ORACLE = _availabilityOracle;
    GAS_TOKEN = _gasToken;
    INBOX = new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
    OUTBOX = new Outbox(address(this));
    vkTreeRoot = _vkTreeRoot;
    VERSION = 1;

    // Genesis block
    blocks[0] = BlockLog(bytes32(0), true);
    pendingBlockCount = 1;
    provenBlockCount = 1;
  }

  function setVerifier(address _verifier) external override(IRollup) {
    // TODO remove, only needed for testing
    verifier = IVerifier(_verifier);
  }

  function setVkTreeRoot(bytes32 _vkTreeRoot) external {
    vkTreeRoot = _vkTreeRoot;
  }

  function archive() public view returns (bytes32) {
    return blocks[pendingBlockCount - 1].archive;
  }

  function isBlockProven(uint256 _blockNumber) public view returns (bool) {
    return blocks[_blockNumber].isProven;
  }

  function archiveAt(uint256 _blockNumber) public view returns (bytes32) {
    return blocks[_blockNumber].archive;
  }

  /**
   * @notice Process an incoming L2 block and progress the state
   * @param _header - The L2 block header
   * @param _archive - A root of the archive tree after the L2 block is applied
   * @param _signatures - Signatures from the validators
   */
  function process(
    bytes calldata _header,
    bytes32 _archive,
    SignatureLib.Signature[] memory _signatures
  ) public {
    _processPendingBlock(_signatures, _archive);

    // Decode and validate header
    HeaderLib.Header memory header = HeaderLib.decode(_header);
    HeaderLib.validate(header, VERSION, getCurrentSlot(), lastBlockTs, archive());

    if (header.globalVariables.blockNumber != pendingBlockCount) {
      revert Errors.Rollup__InvalidBlockNumber(
        pendingBlockCount, header.globalVariables.blockNumber
      );
    }

    // Check if the data is available using availability oracle (change availability oracle if you want a different DA layer)
    if (!AVAILABILITY_ORACLE.isAvailable(header.contentCommitment.txsEffectsHash)) {
      revert Errors.Rollup__UnavailableTxs(header.contentCommitment.txsEffectsHash);
    }

    blocks[pendingBlockCount++] = BlockLog(_archive, false);

    lastBlockTs = block.timestamp;

    bytes32 inHash = INBOX.consume();
    if (header.contentCommitment.inHash != inHash) {
      revert Errors.Rollup__InvalidInHash(inHash, header.contentCommitment.inHash);
    }

    // TODO(#7218): Revert to fixed height tree for outbox, currently just providing min as interim
    // Min size = smallest path of the rollup tree + 1
    (uint256 min,) = MerkleLib.computeMinMaxPathLength(header.contentCommitment.numTxs);
    uint256 l2ToL1TreeMinHeight = min + 1;
    OUTBOX.insert(
      header.globalVariables.blockNumber, header.contentCommitment.outHash, l2ToL1TreeMinHeight
    );

    // pay the coinbase 1 gas token if it is not empty and header.totalFees is not zero
    if (header.globalVariables.coinbase != address(0) && header.totalFees > 0) {
      GAS_TOKEN.transfer(address(header.globalVariables.coinbase), header.totalFees);
    }

    emit L2BlockProcessed(header.globalVariables.blockNumber);
  }

  function process(bytes calldata _header, bytes32 _archive) external override(IRollup) {
    SignatureLib.Signature[] memory emptySignatures = new SignatureLib.Signature[](0);
    process(_header, _archive, emptySignatures);
  }

  /**
   * @notice  Submit a proof for a block in the pending chain
   *
   * @dev     TODO(#7346): Verify root proofs rather than block root when batch rollups are integrated.
   *
   * @dev     Will call `_progressState` to update the proven chain. Notice this have potentially
   *          unbounded gas consumption.
   *
   * @dev     Will emit `L2ProofVerified` if the proof is valid
   *
   * @dev     Will throw if:
   *          - The block number is past the pending chain
   *          - The last archive root of the header does not match the archive root of parent block
   *          - The archive root of the header does not match the archive root of the proposed block
   *          - The proof is invalid
   *
   * @dev     We provide the `_archive` even if it could be read from storage itself because it allow for
   *          better error messages. Without passing it, we would just have a proof verification failure.
   *
   * @dev     Following the `BlockLog` struct assumption
   *
   * @param  _header - The header of the block (should match the block in the pending chain)
   * @param  _archive - The archive root of the block (should match the block in the pending chain)
   * @param  _proverId - The id of this block's prover
   * _previousBlockHash - The poseidon hash of the previous block (should match the value in the previous archive tree)
   * @param  _currentBlockHash - The poseidon hash of this block (should match the value in the new archive tree)
   * @param  _aggregationObject - The aggregation object for the proof
   * @param  _proof - The proof to verify
   */
  function submitBlockRootProof(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _proverId,
    // TODO(#7246): Prev block hash unchecked for single blocks, should be checked for batch rollups. See block-building-helpers.ts for where to inject.
    // bytes32 _previousBlockHash,
    bytes32 _currentBlockHash,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external override(IRollup) {
    HeaderLib.Header memory header = HeaderLib.decode(_header);

    if (header.globalVariables.blockNumber >= pendingBlockCount) {
      revert Errors.Rollup__TryingToProveNonExistingBlock();
    }

    bytes32 expectedLastArchive = blocks[header.globalVariables.blockNumber - 1].archive;
    bytes32 expectedArchive = blocks[header.globalVariables.blockNumber].archive;

    // We do it this way to provide better error messages than passing along the storage values
    // TODO(#4148) Proper genesis state. If the state is empty, we allow anything for now.
    if (expectedLastArchive != bytes32(0) && header.lastArchive.root != expectedLastArchive) {
      revert Errors.Rollup__InvalidArchive(expectedLastArchive, header.lastArchive.root);
    }

    if (_archive != expectedArchive) {
      revert Errors.Rollup__InvalidProposedArchive(expectedArchive, _archive);
    }

    // TODO(#7346): Currently verifying block root proofs until batch rollups fully integrated.
    // Hence the below pub inputs are BlockRootOrBlockMergePublicInputs, which are larger than
    // the planned set (RootRollupPublicInputs), for the interim.
    // Public inputs are not fully verified (TODO(#7373))

    bytes32[] memory publicInputs = new bytes32[](
      Constants.BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH + Constants.AGGREGATION_OBJECT_LENGTH
    );

    // From block_root_or_block_merge_public_inputs.nr: BlockRootOrBlockMergePublicInputs.
    // previous_archive.root: the previous archive tree root
    publicInputs[0] = expectedLastArchive;
    // previous_archive.next_available_leaf_index: the previous archive next available index
    publicInputs[1] = bytes32(header.globalVariables.blockNumber);

    // new_archive.root: the new archive tree root
    publicInputs[2] = expectedArchive;
    // this is the _next_ available leaf in the archive tree
    // normally this should be equal to the block number (since leaves are 0-indexed and blocks 1-indexed)
    // but in yarn-project/merkle-tree/src/new_tree.ts we prefill the tree so that block N is in leaf N
    // new_archive.next_available_leaf_index: the new archive next available index
    publicInputs[3] = bytes32(header.globalVariables.blockNumber + 1);

    // TODO(#7346): Currently previous block hash is unchecked, but will be checked in batch rollup (block merge -> root).
    // block-building-helpers.ts is injecting as 0 for now, replicating here.
    // previous_block_hash: the block hash just preceding this block (will eventually become the end_block_hash of the prev batch)
    publicInputs[4] = bytes32(0);

    // TODO(#7346): Move archive membership proof to contract?
    // verifyMembership(archivePath, _previousBlockHash, header.globalVariables.blockNumber - 1, expectedLastArchive)

    // end_block_hash: the current block hash (will eventually become the hash of the final block proven in a batch)
    publicInputs[5] = _currentBlockHash;

    // TODO(#7346): Move archive membership proof to contract?
    // Currently archive root is updated by adding the new block hash inside block-root circuit.
    // verifyMembership(archivePath, _currentBlockHash, header.globalVariables.blockNumber, expectedArchive)

    // For block root proof outputs, we have a block 'range' of just 1 block => start and end globals are the same
    bytes32[] memory globalVariablesFields = HeaderLib.toFields(header.globalVariables);
    for (uint256 i = 0; i < globalVariablesFields.length; i++) {
      // start_global_variables
      publicInputs[i + 6] = globalVariablesFields[i];
      // end_global_variables
      publicInputs[globalVariablesFields.length + i + 6] = globalVariablesFields[i];
    }
    // out_hash: root of this block's l2 to l1 message tree (will eventually be root of roots)
    publicInputs[24] = header.contentCommitment.outHash;

    // For block root proof outputs, we have a single recipient-value fee payment pair,
    // but the struct contains space for the max (32) => we keep 31*2=62 fields blank to represent it.
    // fees: array of recipient-value pairs, for a single block just one entry (will eventually be filled and paid out here)
    publicInputs[25] = bytes32(uint256(uint160(header.globalVariables.coinbase)));
    publicInputs[26] = bytes32(header.totalFees);
    // publicInputs[27] -> publicInputs[88] left blank for empty fee array entries

    // vk_tree_root
    publicInputs[89] = vkTreeRoot;
    // prover_id: id of current block range's prover
    publicInputs[90] = _proverId;

    // the block proof is recursive, which means it comes with an aggregation object
    // this snippet copies it into the public inputs needed for verification
    // it also guards against empty _aggregationObject used with mocked proofs
    uint256 aggregationLength = _aggregationObject.length / 32;
    for (uint256 i = 0; i < Constants.AGGREGATION_OBJECT_LENGTH && i < aggregationLength; i++) {
      bytes32 part;
      assembly {
        part := calldataload(add(_aggregationObject.offset, mul(i, 32)))
      }
      publicInputs[i + 91] = part;
    }

    if (!verifier.verify(_proof, publicInputs)) {
      revert Errors.Rollup__InvalidProof();
    }

    blocks[header.globalVariables.blockNumber].isProven = true;

    _progressState();

    emit L2ProofVerified(header.globalVariables.blockNumber, _proverId);
  }
  //  TODO(#7346): Commented out for now as stack too deep (unused until batch rollups integrated anyway).
  //  /**
  //  * @notice  Submit a proof for a range of blocks in the pending chain
  //  *
  //  * @dev     TODO(#7346): Currently unused - integrate when batch rollups are integrated.
  //  *
  //  * @dev     Will call `_progressState` to update the proven chain. Notice this have potentially
  //  *          unbounded gas consumption.
  //  *
  //  * @dev     Will emit `L2ProofVerified` if the proof is valid
  //  *
  //  * @dev     Will throw if:
  //  *          - The block number is past the pending chain
  //  *          - The previous archive root does not match the archive root of the previous range's last block
  //  *          - The new archive root does not match the archive root of the proposed range's last block
  //  *          - The proof is invalid
  //  *
  //  * @dev     We provide the `_archive` and `_previousArchive` even if it could be read from storage itself because it allow for
  //  *          better error messages. Without passing it, we would just have a proof verification failure.
  //  *
  //  * @dev     Following the `BlockLog` struct assumption
  //  *
  //  * @param  _previousArchive - The archive root of the last block in the previous proven range
  //  * @param  _archive - The archive root of the last block in the range
  //  * @param  _previousBlockHash - The poseidon hash of the last block in the previous proven range (should match the value in the previous archive tree)
  //  * @param  _currentBlockHash - The poseidon hash of the last block in this range (should match the value in the new archive tree)
  //  * @param  outHash - The root of roots of the blocks' l2 to l1 message tree
  //  * @param  coinbases - The recipients of the fees for each block in the range (max 32)
  //  * @param  fees - The fees to be paid for each block in the range (max 32)
  //   * @param  _proverId - The id of this block's prover
  //  * @param  _aggregationObject - The aggregation object for the proof
  //  * @param  _proof - The proof to verify
  //  */
  // function submitRootProof(
  //   bytes32 _previousArchive,
  //   bytes32 _archive,
  //   bytes32 _previousBlockHash,
  //   bytes32 _currentBlockHash,
  //   bytes32 outHash,
  //   address[32] calldata coinbases,
  //   uint256[32] calldata fees,
  //   bytes32 _proverId,
  //   bytes calldata _aggregationObject,
  //   bytes calldata _proof
  // ) external override(IRollup) {
  //   // TODO(#7346): The below assumes that the range of blocks being proven is always the 'next' range,
  //   // does not allow for any 'gaps'. Maybe we should allow gaps to avoid someone holding up the chain.
  //   uint256 startBlockNumber = provenBlockCount + 1;
  //   uint256 endBlockNumber = pendingBlockCount;

  //   // TODO: For now, while this fn is unused, checking input prev and current archives against expected.
  //   // It may be better to input block numbers and gather archives from there.
  //   bytes32 expectedLastArchive = blocks[startBlockNumber - 1].archive;
  //   bytes32 expectedArchive = blocks[endBlockNumber].archive;

  //   // We do it this way to provide better error messages than passing along the storage values
  //   // TODO(#4148) Proper genesis state. If the state is empty, we allow anything for now.
  //   if (expectedLastArchive != bytes32(0) && _previousArchive != expectedLastArchive) {
  //     revert Errors.Rollup__InvalidArchive(expectedLastArchive, _previousArchive);
  //   }

  //   // TODO: Below assumes the end state after proving this range of blocks cannot be 0, correct?
  //   if (expectedArchive == bytes32(0)) {
  //     revert Errors.Rollup__TryingToProveNonExistingBlock();
  //   }

  //   if (_archive != expectedArchive) {
  //     revert Errors.Rollup__InvalidProposedArchive(expectedArchive, _archive);
  //   }

  //   // TODO(#7346): Add a constant with calculated len of RootRollupPublicInputs:
  //   // Currently 64 for fees (32 * 2) + 4 for archives (2 * 2) + 6 for indiv. fields
  //   // Public inputs are not fully verified (TODO(#7373))

  //   bytes32[] memory publicInputs =
  //     new bytes32[](74 + Constants.AGGREGATION_OBJECT_LENGTH);

  //   // From root_rollup_public_inputs.nr RootRollupPublicInputs.
  //   // previous_archive.root: the previous archive tree root
  //   publicInputs[0] = expectedLastArchive;
  //   // previous_archive.next_available_leaf_index: the previous archive next available index
  //   publicInputs[1] = bytes32(startBlockNumber);

  //   // end_archive.root: the new archive tree root
  //   publicInputs[2] = expectedArchive;
  //   // this is the _next_ available leaf in the archive tree
  //   // normally this should be equal to the block number (since leaves are 0-indexed and blocks 1-indexed)
  //   // but in yarn-project/merkle-tree/src/new_tree.ts we prefill the tree so that block N is in leaf N
  //   // end_archive.next_available_leaf_index: the new archive next available index
  //   publicInputs[3] = bytes32(endBlockNumber + 1);

  //   // previous_block_hash: the block hash of block number startBlockNumber - 1
  //   publicInputs[4] = _previousBlockHash;

  //   // verifyMembership(archivePath, _previousBlockHash, startBlockNumber - 1, expectedLastArchive)

  //   // end_timestamp: TODO: is this the correct timestamp for public inputs?
  //   publicInputs[5] = bytes32(lastBlockTs);

  //   // end_block_hash: the block hash of block number endBlockNumber
  //   publicInputs[6] = _currentBlockHash;

  //   // verifyMembership(archivePath, _currentBlockHash, endBlockNumber, expectedArchive)

  //   // out_hash: the root of roots of each block's l2 to l1 message tree
  //   publicInputs[7] = outHash;

  //   // TODO(Miranda):
  //   // Current outbox takes a single block's set of l2 to l1 messages where the outHash represents the root
  //   // of a wonky tree, where each leaf is itself a small tree of each tx's l2 to l1 messages.
  //   // For #7346 we need this outHash to represent multiple blocks' outHashes.
  //   // OUTBOX.insert(
  //   //   endBlockNumber, outHash, l2ToL1TreeMinHeight
  //   // );

  //   // fees: array of recipient-value pairs
  //   for (uint256 i = 0; i < 32; i++) {
  //     publicInputs[2*i + 8] = bytes32(uint256(uint160(coinbases[i])));
  //     publicInputs[2*i + 9] = bytes32(fees[i]);
  //     // TODO(#7346): Move payout of fees here from process()
  //     // if (coinbases[i] != address(0) && fees[i] > 0) {
  //     //   GAS_TOKEN.transfer(coinbases[i], fees[i]);
  //     // }
  //   }

  //   // prover_id: id of current block range's prover
  //   publicInputs[73] = _proverId;

  //   for (uint256 i = 0; i < 74; i++) {
  //     console.logBytes32(publicInputs[i]);
  //   }

  //   // the block proof is recursive, which means it comes with an aggregation object
  //   // this snippet copies it into the public inputs needed for verification
  //   // it also guards against empty _aggregationObject used with mocked proofs
  //   uint256 aggregationLength = _aggregationObject.length / 32;
  //   for (uint256 i = 0; i < Constants.AGGREGATION_OBJECT_LENGTH && i < aggregationLength; i++) {
  //     bytes32 part;
  //     assembly {
  //       part := calldataload(add(_aggregationObject.offset, mul(i, 32)))
  //     }
  //     publicInputs[i + 74] = part;
  //   }

  //   if (!verifier.verify(_proof, publicInputs)) {
  //     revert Errors.Rollup__InvalidProof();
  //   }

  //   for (uint256 i = startBlockNumber; i < endBlockNumber; i++) {
  //     blocks[i].isProven = true;
  //   }

  //   _progressState();

  //   emit L2ProofVerified(endBlockNumber, _proverId);
  // }

  /**
   * @notice  Progresses the state of the proven chain as far as possible
   *
   * @dev     Emits `ProgressedState` if the state is progressed
   *
   * @dev     Will continue along the pending chain as long as the blocks are proven
   *          stops at the first unproven block.
   *
   * @dev     Have a potentially unbounded gas usage. @todo Will need a bounded version, such that it cannot be
   *          used as a DOS vector.
   */
  function _progressState() internal {
    if (pendingBlockCount == provenBlockCount) {
      // We are already up to date
      return;
    }

    uint256 cachedProvenBlockCount = provenBlockCount;

    for (; cachedProvenBlockCount < pendingBlockCount; cachedProvenBlockCount++) {
      if (!blocks[cachedProvenBlockCount].isProven) {
        break;
      }
    }

    if (cachedProvenBlockCount > provenBlockCount) {
      provenBlockCount = cachedProvenBlockCount;
      emit ProgressedState(provenBlockCount, pendingBlockCount);
    }
  }
}
