// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {ECDSA} from "@oz/utils/cryptography/ECDSA.sol";

import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRollup, ITestRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {HeaderLib} from "@aztec/core/libraries/HeaderLib.sol";
import {TxsDecoder} from "@aztec/core/libraries/TxsDecoder.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {ProofCommitmentEscrow} from "@aztec/core/ProofCommitmentEscrow.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";

import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that is concerned about readability and velocity of development
 * not giving a damn about gas costs.
 */
contract Rollup is EIP712("Aztec Rollup", "1"), Leonidas, IRollup, ITestRollup {
  using SafeCast for uint256;
  using SlotLib for Slot;
  using EpochLib for Epoch;

  struct ChainTips {
    uint256 pendingBlockNumber;
    uint256 provenBlockNumber;
  }

  struct BlockLog {
    bytes32 archive;
    bytes32 blockHash;
    Slot slotNumber;
  }

  // See https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8401-proof-timeliness/proof-timeliness.ipynb
  // for justification of CLAIM_DURATION_IN_L2_SLOTS.
  uint256 public constant CLAIM_DURATION_IN_L2_SLOTS = 13;
  uint256 public constant PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST = 1000;

  uint256 public immutable L1_BLOCK_AT_GENESIS;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  IProofCommitmentEscrow public immutable PROOF_COMMITMENT_ESCROW;
  uint256 public immutable VERSION;
  IFeeJuicePortal public immutable FEE_JUICE_PORTAL;
  IVerifier public epochProofVerifier;

  ChainTips public tips;
  DataStructures.EpochProofClaim public proofClaim;

  // @todo  Validate assumption:
  //        Currently we assume that the archive root following a block is specific to the block
  //        e.g., changing any values in the block or header should in the end make its way to the archive
  //
  //        More direct approach would be storing keccak256(header) as well
  mapping(uint256 blockNumber => BlockLog log) public blocks;

  bytes32 public vkTreeRoot;

  // @note  Assume that all blocks up to this value (inclusive) are automatically proven. Speeds up bootstrapping.
  //        Testing only. This should be removed eventually.
  uint256 private assumeProvenThroughBlockNumber;

  constructor(
    IFeeJuicePortal _fpcJuicePortal,
    bytes32 _vkTreeRoot,
    address _ares,
    address[] memory _validators
  ) Leonidas(_ares) {
    epochProofVerifier = new MockVerifier();
    FEE_JUICE_PORTAL = _fpcJuicePortal;
    PROOF_COMMITMENT_ESCROW = new ProofCommitmentEscrow(_fpcJuicePortal.underlying(), address(this));
    INBOX = IInbox(address(new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT)));
    OUTBOX = IOutbox(address(new Outbox(address(this))));
    vkTreeRoot = _vkTreeRoot;
    VERSION = 1;
    L1_BLOCK_AT_GENESIS = block.number;

    // Genesis block
    blocks[0] = BlockLog({
      archive: bytes32(Constants.GENESIS_ARCHIVE_ROOT),
      blockHash: bytes32(0), // TODO(palla/prover): The first block does not have hash zero
      slotNumber: Slot.wrap(0)
    });
    for (uint256 i = 0; i < _validators.length; i++) {
      _addValidator(_validators[i]);
    }
    setupEpoch();
  }

  function quoteToDigest(EpochProofQuoteLib.EpochProofQuote memory quote)
    public
    view
    override(IRollup)
    returns (bytes32)
  {
    return _hashTypedDataV4(EpochProofQuoteLib.hash(quote));
  }

  /**
   * @notice  Prune the pending chain up to the last proven block
   *
   * @dev     Will revert if there is nothing to prune or if the chain is not ready to be pruned
   */
  function prune() external override(IRollup) {
    require(_canPrune(), Errors.Rollup__NothingToPrune());
    _prune();
  }

  /**
   * Sets the assumeProvenThroughBlockNumber. Only the contract deployer can set it.
   * @param blockNumber - New value.
   */
  function setAssumeProvenThroughBlockNumber(uint256 blockNumber)
    external
    override(ITestRollup)
    onlyOwner
  {
    fakeBlockNumberAsProven(blockNumber);
    assumeProvenThroughBlockNumber = blockNumber;
  }

  function fakeBlockNumberAsProven(uint256 blockNumber) private {
    if (blockNumber > tips.provenBlockNumber && blockNumber <= tips.pendingBlockNumber) {
      tips.provenBlockNumber = blockNumber;

      // If this results on a new epoch, create a fake claim for it
      // Otherwise nextEpochToProve will report an old epoch
      Epoch epoch = getEpochForBlock(blockNumber);
      if (Epoch.unwrap(epoch) == 0 || Epoch.unwrap(epoch) > Epoch.unwrap(proofClaim.epochToProve)) {
        proofClaim = DataStructures.EpochProofClaim({
          epochToProve: epoch,
          basisPointFee: 0,
          bondAmount: 0,
          bondProvider: address(0),
          proposerClaimant: msg.sender
        });
      }
    }
  }

  /**
   * @notice  Set the verifier contract
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _verifier - The new verifier contract
   */
  function setEpochVerifier(address _verifier) external override(ITestRollup) onlyOwner {
    epochProofVerifier = IVerifier(_verifier);
  }

  /**
   * @notice  Set the vkTreeRoot
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _vkTreeRoot - The new vkTreeRoot to be used by proofs
   */
  function setVkTreeRoot(bytes32 _vkTreeRoot) external override(ITestRollup) onlyOwner {
    vkTreeRoot = _vkTreeRoot;
  }

  /**
   * @notice  Publishes the body and propose the block
   * @dev     `eth_log_handlers` rely on this function
   *
   * @param _header - The L2 block header
   * @param _archive - A root of the archive tree after the L2 block is applied
   * @param _blockHash - The poseidon2 hash of the header added to the archive tree in the rollup circuit
   * @param _signatures - Signatures from the validators
   * @param _body - The body of the L2 block
   */
  function proposeAndClaim(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _blockHash,
    bytes32[] memory _txHashes,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body,
    EpochProofQuoteLib.SignedEpochProofQuote calldata _quote
  ) external override(IRollup) {
    propose(_header, _archive, _blockHash, _txHashes, _signatures, _body);
    claimEpochProofRight(_quote);
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
   *          - The proof is invalid
   *
   * @dev     We provide the `_archive` and `_blockHash` even if it could be read from storage itself because it allow for
   *          better error messages. Without passing it, we would just have a proof verification failure.
   *
   * @param  _epochSize - The size of the epoch (to be promoted to a constant)
   * @param  _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   * @param  _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   * @param  _aggregationObject - The aggregation object for the proof
   * @param  _proof - The proof to verify
   */
  function submitEpochRootProof(
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[64] calldata _fees,
    bytes calldata _aggregationObject,
    bytes calldata _proof
  ) external override(IRollup) {
    uint256 previousBlockNumber = tips.provenBlockNumber;
    uint256 endBlockNumber = previousBlockNumber + _epochSize;

    bytes32[] memory publicInputs =
      getEpochProofPublicInputs(_epochSize, _args, _fees, _aggregationObject);

    require(epochProofVerifier.verify(_proof, publicInputs), Errors.Rollup__InvalidProof());

    tips.provenBlockNumber = endBlockNumber;

    for (uint256 i = 0; i < 32; i++) {
      address coinbase = address(uint160(uint256(publicInputs[9 + i * 2])));
      uint256 fees = uint256(publicInputs[10 + i * 2]);

      if (coinbase != address(0) && fees > 0) {
        // @note  This will currently fail if there are insufficient funds in the bridge
        //        which WILL happen for the old version after an upgrade where the bridge follow.
        //        Consider allowing a failure. See #7938.
        FEE_JUICE_PORTAL.distributeFees(coinbase, fees);
      }
    }

    emit L2ProofVerified(endBlockNumber, _args[6]);
  }

  function status(uint256 myHeaderBlockNumber)
    external
    view
    override(IRollup)
    returns (
      uint256 provenBlockNumber,
      bytes32 provenArchive,
      uint256 pendingBlockNumber,
      bytes32 pendingArchive,
      bytes32 archiveOfMyBlock,
      Epoch provenEpochNumber
    )
  {
    return (
      tips.provenBlockNumber,
      blocks[tips.provenBlockNumber].archive,
      tips.pendingBlockNumber,
      blocks[tips.pendingBlockNumber].archive,
      archiveAt(myHeaderBlockNumber),
      getEpochForBlock(tips.provenBlockNumber)
    );
  }

  /**
   * @notice  Check if msg.sender can propose at a given time
   *
   * @param _ts - The timestamp to check
   * @param _archive - The archive to check (should be the latest archive)
   *
   * @return uint256 - The slot at the given timestamp
   * @return uint256 - The block number at the given timestamp
   */
  function canProposeAtTime(Timestamp _ts, bytes32 _archive)
    external
    view
    override(IRollup)
    returns (Slot, uint256)
  {
    Slot slot = getSlotAt(_ts);

    Slot lastSlot = blocks[tips.pendingBlockNumber].slotNumber;

    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    // Make sure that the proposer is up to date
    bytes32 tipArchive = archive();
    require(tipArchive == _archive, Errors.Rollup__InvalidArchive(tipArchive, _archive));

    SignatureLib.Signature[] memory sigs = new SignatureLib.Signature[](0);
    DataStructures.ExecutionFlags memory flags =
      DataStructures.ExecutionFlags({ignoreDA: true, ignoreSignatures: true});
    _validateLeonidas(slot, sigs, _archive, flags);

    return (slot, tips.pendingBlockNumber + 1);
  }

  /**
   * @notice  Validate a header for submission
   *
   * @dev     This is a convenience function that can be used by the sequencer to validate a "partial" header
   *          without having to deal with viem or anvil for simulating timestamps in the future.
   *
   * @param _header - The header to validate
   * @param _signatures - The signatures to validate
   * @param _digest - The digest to validate
   * @param _currentTime - The current time
   * @param _flags - The flags to validate
   */
  function validateHeader(
    bytes calldata _header,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _txsEffectsHash,
    DataStructures.ExecutionFlags memory _flags
  ) external view override(IRollup) {
    HeaderLib.Header memory header = HeaderLib.decode(_header);
    _validateHeader(header, _signatures, _digest, _currentTime, _txsEffectsHash, _flags);
  }

  function nextEpochToClaim() external view override(IRollup) returns (Epoch) {
    Epoch epochClaimed = proofClaim.epochToProve;
    if (proofClaim.proposerClaimant == address(0) && epochClaimed == Epoch.wrap(0)) {
      return Epoch.wrap(0);
    }
    return Epoch.wrap(1) + epochClaimed;
  }

  function computeTxsEffectsHash(bytes calldata _body)
    external
    pure
    override(IRollup)
    returns (bytes32)
  {
    return TxsDecoder.decode(_body);
  }

  function claimEpochProofRight(EpochProofQuoteLib.SignedEpochProofQuote calldata _quote)
    public
    override(IRollup)
  {
    validateEpochProofRightClaim(_quote);

    Slot currentSlot = getCurrentSlot();
    Epoch epochToProve = getEpochToProve();

    // We don't currently unstake,
    // but we will as part of https://github.com/AztecProtocol/aztec-packages/issues/8652.
    // Blocked on submitting epoch proofs to this contract.
    PROOF_COMMITMENT_ESCROW.stakeBond(_quote.quote.prover, _quote.quote.bondAmount);

    proofClaim = DataStructures.EpochProofClaim({
      epochToProve: epochToProve,
      basisPointFee: _quote.quote.basisPointFee,
      bondAmount: _quote.quote.bondAmount,
      bondProvider: _quote.quote.prover,
      proposerClaimant: msg.sender
    });

    emit ProofRightClaimed(
      epochToProve, _quote.quote.prover, msg.sender, _quote.quote.bondAmount, currentSlot
    );
  }

  /**
   * @notice  Publishes the body and propose the block
   * @dev     `eth_log_handlers` rely on this function
   *
   * @param _header - The L2 block header
   * @param _archive - A root of the archive tree after the L2 block is applied
   * @param _blockHash - The poseidon2 hash of the header added to the archive tree in the rollup circuit
   * @param _signatures - Signatures from the validators
   * @param _body - The body of the L2 block
   */
  function propose(
    bytes calldata _header,
    bytes32 _archive,
    bytes32 _blockHash,
    bytes32[] memory _txHashes,
    SignatureLib.Signature[] memory _signatures,
    bytes calldata _body
  ) public override(IRollup) {
    if (_canPrune()) {
      _prune();
    }
    bytes32 txsEffectsHash = TxsDecoder.decode(_body);

    // Decode and validate header
    HeaderLib.Header memory header = HeaderLib.decode(_header);

    bytes32 digest = keccak256(abi.encode(_archive, _txHashes));
    setupEpoch();
    _validateHeader({
      _header: header,
      _signatures: _signatures,
      _digest: digest,
      _currentTime: Timestamp.wrap(block.timestamp),
      _txEffectsHash: txsEffectsHash,
      _flags: DataStructures.ExecutionFlags({ignoreDA: false, ignoreSignatures: false})
    });

    uint256 blockNumber = ++tips.pendingBlockNumber;

    blocks[blockNumber] = BlockLog({
      archive: _archive,
      blockHash: _blockHash,
      slotNumber: Slot.wrap(header.globalVariables.slotNumber)
    });

    // @note  The block number here will always be >=1 as the genesis block is at 0
    bytes32 inHash = INBOX.consume(blockNumber);
    require(
      header.contentCommitment.inHash == inHash,
      Errors.Rollup__InvalidInHash(inHash, header.contentCommitment.inHash)
    );

    // TODO(#7218): Revert to fixed height tree for outbox, currently just providing min as interim
    // Min size = smallest path of the rollup tree + 1
    (uint256 min,) = MerkleLib.computeMinMaxPathLength(header.contentCommitment.numTxs);
    uint256 l2ToL1TreeMinHeight = min + 1;
    OUTBOX.insert(blockNumber, header.contentCommitment.outHash, l2ToL1TreeMinHeight);

    emit L2BlockProposed(blockNumber, _archive);

    // Automatically flag the block as proven if we have cheated and set assumeProvenThroughBlockNumber.
    if (blockNumber <= assumeProvenThroughBlockNumber) {
      fakeBlockNumberAsProven(blockNumber);

      if (header.globalVariables.coinbase != address(0) && header.totalFees > 0) {
        // @note  This will currently fail if there are insufficient funds in the bridge
        //        which WILL happen for the old version after an upgrade where the bridge follow.
        //        Consider allowing a failure. See #7938.
        FEE_JUICE_PORTAL.distributeFees(header.globalVariables.coinbase, header.totalFees);
      }

      emit L2ProofVerified(blockNumber, "CHEAT");
    }
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
   * @param  _aggregationObject - The aggregation object for the proof
   */
  function getEpochProofPublicInputs(
    uint256 _epochSize,
    bytes32[7] calldata _args,
    bytes32[64] calldata _fees,
    bytes calldata _aggregationObject
  ) public view override(IRollup) returns (bytes32[] memory) {
    uint256 previousBlockNumber = tips.provenBlockNumber;
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
      bytes32 expectedPreviousArchive = blocks[previousBlockNumber].archive;
      require(
        expectedPreviousArchive == _args[0],
        Errors.Rollup__InvalidPreviousArchive(expectedPreviousArchive, _args[0])
      );

      bytes32 expectedEndArchive = blocks[endBlockNumber].archive;
      require(
        expectedEndArchive == _args[1], Errors.Rollup__InvalidArchive(expectedEndArchive, _args[1])
      );

      bytes32 expectedPreviousBlockHash = blocks[previousBlockNumber].blockHash;
      // TODO: Remove 0 check once we inject the proper genesis block hash
      require(
        expectedPreviousBlockHash == 0 || expectedPreviousBlockHash == _args[2],
        Errors.Rollup__InvalidPreviousBlockHash(expectedPreviousBlockHash, _args[2])
      );

      bytes32 expectedEndBlockHash = blocks[endBlockNumber].blockHash;
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
    //   fees: [FeeRecipient; 32],
    //   vk_tree_root: Field,
    //   prover_id: Field
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

    // fees[9-72]: array of recipient-value pairs
    for (uint256 i = 0; i < 64; i++) {
      publicInputs[9 + i] = _fees[i];
    }

    // vk_tree_root
    publicInputs[73] = vkTreeRoot;

    // prover_id: id of current epoch's prover
    publicInputs[74] = _args[6];

    // the block proof is recursive, which means it comes with an aggregation object
    // this snippet copies it into the public inputs needed for verification
    // it also guards against empty _aggregationObject used with mocked proofs
    uint256 aggregationLength = _aggregationObject.length / 32;
    for (uint256 i = 0; i < Constants.AGGREGATION_OBJECT_LENGTH && i < aggregationLength; i++) {
      bytes32 part;
      assembly {
        part := calldataload(add(_aggregationObject.offset, mul(i, 32)))
      }
      publicInputs[i + 75] = part;
    }

    return publicInputs;
  }

  function validateEpochProofRightClaim(EpochProofQuoteLib.SignedEpochProofQuote calldata _quote)
    public
    view
    override(IRollup)
  {
    SignatureLib.verify(_quote.signature, _quote.quote.prover, quoteToDigest(_quote.quote));

    Slot currentSlot = getCurrentSlot();
    address currentProposer = getCurrentProposer();
    Epoch epochToProve = getEpochToProve();

    require(
      currentProposer == address(0) || currentProposer == msg.sender,
      Errors.Leonidas__InvalidProposer(currentProposer, msg.sender)
    );

    require(
      _quote.quote.epochToProve == epochToProve,
      Errors.Rollup__NotClaimingCorrectEpoch(epochToProve, _quote.quote.epochToProve)
    );

    require(
      currentSlot.positionInEpoch() < CLAIM_DURATION_IN_L2_SLOTS,
      Errors.Rollup__NotInClaimPhase(currentSlot.positionInEpoch(), CLAIM_DURATION_IN_L2_SLOTS)
    );

    // if the epoch to prove is not the one that has been claimed,
    // then whatever is in the proofClaim is stale
    require(
      proofClaim.epochToProve != epochToProve || proofClaim.proposerClaimant == address(0),
      Errors.Rollup__ProofRightAlreadyClaimed()
    );

    require(
      _quote.quote.bondAmount >= PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST,
      Errors.Rollup__InsufficientBondAmount(
        PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST, _quote.quote.bondAmount
      )
    );

    uint256 availableFundsInEscrow = PROOF_COMMITMENT_ESCROW.deposits(_quote.quote.prover);
    require(
      _quote.quote.bondAmount <= availableFundsInEscrow,
      Errors.Rollup__InsufficientFundsInEscrow(_quote.quote.bondAmount, availableFundsInEscrow)
    );

    require(
      _quote.quote.validUntilSlot >= currentSlot,
      Errors.Rollup__QuoteExpired(currentSlot, _quote.quote.validUntilSlot)
    );
  }

  /**
   * @notice  Get the current archive root
   *
   * @return bytes32 - The current archive root
   */
  function archive() public view override(IRollup) returns (bytes32) {
    return blocks[tips.pendingBlockNumber].archive;
  }

  function getProvenBlockNumber() public view override(IRollup) returns (uint256) {
    return tips.provenBlockNumber;
  }

  function getPendingBlockNumber() public view override(IRollup) returns (uint256) {
    return tips.pendingBlockNumber;
  }

  function getEpochForBlock(uint256 blockNumber) public view override(IRollup) returns (Epoch) {
    require(
      blockNumber <= tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(tips.pendingBlockNumber, blockNumber)
    );
    return getEpochAt(getTimestampForSlot(blocks[blockNumber].slotNumber));
  }

  /**
   * @notice  Get the epoch that should be proven
   *
   * @dev    This is the epoch that should be proven. It does so by getting the epoch of the block
   *        following the last proven block. If there is no such block (i.e. the pending chain is
   *        the same as the proven chain), then revert.
   *
   * @return uint256 - The epoch to prove
   */
  function getEpochToProve() public view override(IRollup) returns (Epoch) {
    require(tips.provenBlockNumber != tips.pendingBlockNumber, Errors.Rollup__NoEpochToProve());
    return getEpochForBlock(getProvenBlockNumber() + 1);
  }

  /**
   * @notice  Get the archive root of a specific block
   *
   * @param _blockNumber - The block number to get the archive root of
   *
   * @return bytes32 - The archive root of the block
   */
  function archiveAt(uint256 _blockNumber) public view override(IRollup) returns (bytes32) {
    if (_blockNumber <= tips.pendingBlockNumber) {
      return blocks[_blockNumber].archive;
    }
    return bytes32(0);
  }

  function _prune() internal {
    // TODO #8656
    delete proofClaim;

    uint256 pending = tips.pendingBlockNumber;

    // @note  We are not deleting the blocks, but we are "winding back" the pendingTip to the last block that was proven.
    //        We can do because any new block proposed will overwrite a previous block in the block log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    tips.pendingBlockNumber = tips.provenBlockNumber;

    emit PrunedPending(tips.provenBlockNumber, pending);
  }

  function _canPrune() internal view returns (bool) {
    if (
      tips.pendingBlockNumber == tips.provenBlockNumber
        || tips.pendingBlockNumber <= assumeProvenThroughBlockNumber
    ) {
      return false;
    }

    Slot currentSlot = getCurrentSlot();
    Epoch oldestPendingEpoch = getEpochForBlock(tips.provenBlockNumber + 1);
    Slot startSlotOfPendingEpoch = oldestPendingEpoch.toSlots();

    // suppose epoch 1 is proven, epoch 2 is pending, epoch 3 is the current epoch.
    // we prune the pending chain back to the end of epoch 1 if:
    // - the proof claim phase of epoch 3 has ended without a claim to prove epoch 2 (or proof of epoch 2)
    // - we reach epoch 4 without a proof of epoch 2 (regardless of whether a proof claim was submitted)
    bool inClaimPhase = currentSlot
      < startSlotOfPendingEpoch + Epoch.wrap(1).toSlots() + Slot.wrap(CLAIM_DURATION_IN_L2_SLOTS);

    bool claimExists = currentSlot < startSlotOfPendingEpoch + Epoch.wrap(2).toSlots()
      && proofClaim.epochToProve == oldestPendingEpoch && proofClaim.proposerClaimant != address(0);

    if (inClaimPhase || claimExists) {
      // If we are in the claim phase, do not prune
      return false;
    }
    return true;
  }

  /**
   * @notice  Validates the header for submission
   *
   * @param _header - The proposed block header
   * @param _signatures - The signatures for the attestations
   * @param _digest - The digest that signatures signed
   * @param _currentTime - The time of execution
   * @dev                - This value is provided to allow for simple simulation of future
   * @param _flags - Flags specific to the execution, whether certain checks should be skipped
   */
  function _validateHeader(
    HeaderLib.Header memory _header,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _txEffectsHash,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    _validateHeaderForSubmissionBase(_header, _currentTime, _txEffectsHash, _flags);
    _validateHeaderForSubmissionSequencerSelection(
      Slot.wrap(_header.globalVariables.slotNumber), _signatures, _digest, _currentTime, _flags
    );
  }

  /**
   * @notice  Validate a header for submission to the pending chain (sequencer selection checks)
   *
   *          These validation checks are directly related to Leonidas.
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
  function _validateHeaderForSubmissionSequencerSelection(
    Slot _slot,
    SignatureLib.Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    // Ensure that the slot proposed is NOT in the future
    Slot currentSlot = getSlotAt(_currentTime);
    require(_slot == currentSlot, Errors.HeaderLib__InvalidSlotNumber(currentSlot, _slot));

    // @note  We are currently enforcing that the slot is in the current epoch
    //        If this is not the case, there could potentially be a weird reorg
    //        of an entire epoch if no-one from the new epoch committee have seen
    //        those blocks or behaves as if they did not.

    Epoch epochNumber = getEpochAt(getTimestampForSlot(_slot));
    Epoch currentEpoch = getEpochAt(_currentTime);
    require(epochNumber == currentEpoch, Errors.Rollup__InvalidEpoch(currentEpoch, epochNumber));

    _validateLeonidas(_slot, _signatures, _digest, _flags);
  }

  /**
   * @notice  Validate a header for submission to the pending chain (base checks)
   *          Base checks here being the checks that we wish to do regardless of the sequencer
   *          selection mechanism.
   *
   *         Each of the following validation checks must pass, otherwise an error is thrown and we revert.
   *          - The chain ID MUST match the current chain ID
   *          - The version MUST match the current version
   *          - The block id MUST be the next block in the chain
   *          - The last archive root in the header MUST match the current archive
   *          - The slot MUST be larger than the slot of the previous block (ensures single block per slot)
   *          - The timestamp MUST be equal to GENESIS_TIME + slot * SLOT_DURATION
   *          - The `txsEffectsHash` of the header must match the computed `_txsEffectsHash`
   *            - This can be relaxed to happen at the time of `submitProof` instead
   *
   * @param _header - The header to validate
   */
  function _validateHeaderForSubmissionBase(
    HeaderLib.Header memory _header,
    Timestamp _currentTime,
    bytes32 _txsEffectsHash,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    require(
      block.chainid == _header.globalVariables.chainId,
      Errors.Rollup__InvalidChainId(block.chainid, _header.globalVariables.chainId)
    );

    require(
      _header.globalVariables.version == VERSION,
      Errors.Rollup__InvalidVersion(VERSION, _header.globalVariables.version)
    );

    require(
      _header.globalVariables.blockNumber == tips.pendingBlockNumber + 1,
      Errors.Rollup__InvalidBlockNumber(
        tips.pendingBlockNumber + 1, _header.globalVariables.blockNumber
      )
    );

    bytes32 tipArchive = archive();
    require(
      tipArchive == _header.lastArchive.root,
      Errors.Rollup__InvalidArchive(tipArchive, _header.lastArchive.root)
    );

    Slot slot = Slot.wrap(_header.globalVariables.slotNumber);
    Slot lastSlot = blocks[tips.pendingBlockNumber].slotNumber;
    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    Timestamp timestamp = getTimestampForSlot(slot);
    require(
      Timestamp.wrap(_header.globalVariables.timestamp) == timestamp,
      Errors.Rollup__InvalidTimestamp(timestamp, Timestamp.wrap(_header.globalVariables.timestamp))
    );

    // @note  If you are hitting this error, it is likely because the chain you use have a blocktime that differs
    //        from the value that we have in the constants.
    //        When you are encountering this, it will likely be as the sequencer expects to be able to include
    //        an Aztec block in the "next" ethereum block based on a timestamp that is 12 seconds in the future
    //        from the last block. However, if the actual will only be 1 second in the future, you will end up
    //        expecting this value to be in the future.
    require(timestamp <= _currentTime, Errors.Rollup__TimestampInFuture(_currentTime, timestamp));

    // Check if the data is available
    require(
      _flags.ignoreDA || _header.contentCommitment.txsEffectsHash == _txsEffectsHash,
      Errors.Rollup__UnavailableTxs(_header.contentCommitment.txsEffectsHash)
    );
  }
}
