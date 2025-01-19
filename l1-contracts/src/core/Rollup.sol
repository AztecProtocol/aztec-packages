// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {
  IRollup,
  ITestRollup,
  CheatDepositArgs,
  FeeHeader,
  ManaBaseFeeComponents,
  BlockLog,
  ChainTips,
  RollupStore,
  L1GasOracleValues,
  L1FeeData,
  SubmitEpochRootProofArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  ExtRollupLib,
  ValidateHeaderArgs,
  Header,
  SignedEpochProofQuote,
  SubmitEpochRootProofInterimValues
} from "@aztec/core/libraries/RollupLibs/ExtRollupLib.sol";
import {IntRollupLib, EpochProofQuote} from "@aztec/core/libraries/RollupLibs/IntRollupLib.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";
import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {ProofCommitmentEscrow} from "@aztec/core/ProofCommitmentEscrow.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {AccessControl} from "@oz/access/AccessControl.sol";

struct Config {
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 targetCommitteeSize;
  uint256 aztecEpochProofClaimWindowInL2Slots;
  uint256 minimumStake;
}

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that is concerned about readability and velocity of development
 * not giving a damn about gas costs.
 * @dev WARNING: This contract is VERY close to the size limit (500B at time of writing).
 */
contract Rollup is EIP712("Aztec Rollup", "1"), Ownable, Leonidas, AccessControl, IRollup, ITestRollup {
  using SlotLib for Slot;
  using EpochLib for Epoch;
  using ProposeLib for ProposeArgs;
  using IntRollupLib for uint256;
  using IntRollupLib for ManaBaseFeeComponents;

  // Define roles for access control
  bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
  bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);

  // See https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8401-proof-timeliness/proof-timeliness.ipynb
  // for justification of CLAIM_DURATION_IN_L2_SLOTS.
  uint256 public constant PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST = 1000;

  // A Cuauhxicalli [kʷaːʍʃiˈkalːi] ("eagle gourd bowl") is a ceremonial Aztec vessel or altar used to hold offerings,
  // such as sacrificial hearts, during rituals performed within temples.
  address public constant CUAUHXICALLI = address(bytes20("CUAUHXICALLI"));

  address public constant VM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
  bool public immutable IS_FOUNDRY_TEST;
  // @note  Always true, exists to override to false for testing only
  bool public checkBlob = true;

  uint256 public immutable CLAIM_DURATION_IN_L2_SLOTS;
  uint256 public immutable L1_BLOCK_AT_GENESIS;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  IProofCommitmentEscrow public immutable PROOF_COMMITMENT_ESCROW;
  uint256 public immutable VERSION;
  IFeeJuicePortal public immutable FEE_JUICE_PORTAL;
  IRewardDistributor public immutable REWARD_DISTRIBUTOR;
  IERC20 public immutable ASSET;

  RollupStore internal rollupStore;

  // @note  Assume that all blocks up to this value (inclusive) are automatically proven. Speeds up bootstrapping.
  //        Testing only. This should be removed eventually.
  uint256 private assumeProvenThroughBlockNumber;

  constructor(
    IFeeJuicePortal _fpcJuicePortal,
    IRewardDistributor _rewardDistributor,
    IERC20 _stakingAsset,
    bytes32 _vkTreeRoot,
    bytes32 _protocolContractTreeRoot,
    address _ares,
    Config memory _config
  )
    Ownable(_ares)
    AccessControl()
    Leonidas(
      _ares,
      _stakingAsset,
      _config.minimumStake,
      _config.aztecSlotDuration,
      _config.aztecEpochDuration,
      _config.targetCommitteeSize
    )
  {
    rollupStore.epochProofVerifier = new MockVerifier();
    FEE_JUICE_PORTAL = _fpcJuicePortal;
    REWARD_DISTRIBUTOR = _rewardDistributor;
    ASSET = _fpcJuicePortal.UNDERLYING();
    PROOF_COMMITMENT_ESCROW = new ProofCommitmentEscrow(
      ASSET, address(this), _config.aztecSlotDuration, _config.aztecEpochDuration
    );
    INBOX = IInbox(address(new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT)));
    OUTBOX = IOutbox(address(new Outbox(address(this))));
    rollupStore.vkTreeRoot = _vkTreeRoot;
    rollupStore.protocolContractTreeRoot = _protocolContractTreeRoot;
    VERSION = 1;
    L1_BLOCK_AT_GENESIS = block.number;
    CLAIM_DURATION_IN_L2_SLOTS = _config.aztecEpochProofClaimWindowInL2Slots;

    IS_FOUNDRY_TEST = VM_ADDRESS.code.length > 0;

    // Grant the deployer the admin role and validator role
    _grantRole(ADMIN_ROLE, msg.sender);
    _grantRole(VALIDATOR_ROLE, msg.sender);

    // Genesis block
    rollupStore.blocks[0] = BlockLog({
      feeHeader: FeeHeader({
        excessMana: 0,
        feeAssetPriceNumerator: 0,
        manaUsed: 0,
        provingCostPerManaNumerator: 0,
        congestionCost: 0
      }),
      archive: bytes32(Constants.GENESIS_ARCHIVE_ROOT),
      blockHash: bytes32(0), // TODO(palla/prover): The first block does not have hash zero
      slotNumber: Slot.wrap(0)
    });
    rollupStore.l1GasOracleValues = L1GasOracleValues({
      pre: L1FeeData({baseFee: 1 gwei, blobFee: 1}),
      post: L1FeeData({baseFee: block.basefee, blobFee: ExtRollupLib.getBlobBaseFee(VM_ADDRESS)}),
      slotOfChange: LIFETIME
    });
  }

  //add a new validator
  function addValidator(address validator) external override(IRollup) onlyRole(ADMIN_ROLE) {
    grantRole(VALIDATOR_ROLE, validator);
  }

  //revoke/remove a validator
  function removeValidator(address validator) external override(IRollup) onlyRole(ADMIN_ROLE) {
    revokeRole(VALIDATOR_ROLE, validator);
  }


  function cheat__InitialiseValidatorSet(CheatDepositArgs[] memory _args)
    external
    override(ITestRollup)
    onlyOwner
  {
    for (uint256 i = 0; i < _args.length; i++) {
      _cheat__Deposit(_args[i].attester, _args[i].proposer, _args[i].withdrawer, _args[i].amount);
    }
    setupEpoch();
  }

  /**
   * @notice  Prune the pending chain up to the last proven block
   *
   * @dev     Will revert if there is nothing to prune or if the chain is not ready to be pruned
   */
  function prune() external override(IRollup) onlyRole(VALIDATOR_ROLE)  {
    require(canPrune(), Errors.Rollup__NothingToPrune());
    _prune();
  }

  /**
   * Sets the assumeProvenThroughBlockNumber. Only the contract deployer can set it.
   * @param _blockNumber - New value.
   */
  function setAssumeProvenThroughBlockNumber(uint256 _blockNumber)
    external
    override(ITestRollup)
    onlyOwner
  {
    _fakeBlockNumberAsProven(_blockNumber);
    assumeProvenThroughBlockNumber = _blockNumber;
  }

  /**
   * @notice  Set the verifier contract
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _verifier - The new verifier contract
   */
  function setEpochVerifier(address _verifier) external override(ITestRollup) onlyOwner {
    rollupStore.epochProofVerifier = IVerifier(_verifier);
  }

  /**
   * @notice  Set the vkTreeRoot
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _vkTreeRoot - The new vkTreeRoot to be used by proofs
   */
  function setVkTreeRoot(bytes32 _vkTreeRoot) external override(ITestRollup) onlyOwner {
    rollupStore.vkTreeRoot = _vkTreeRoot;
  }

  /**
   * @notice  Set the protocolContractTreeRoot
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _protocolContractTreeRoot - The new protocolContractTreeRoot to be used by proofs
   */
  function setProtocolContractTreeRoot(bytes32 _protocolContractTreeRoot)
    external
    override(ITestRollup)
    onlyOwner
  {
    rollupStore.protocolContractTreeRoot = _protocolContractTreeRoot;
  }

  /**
   * @notice  Publishes the body and propose the block
   * @dev     `eth_log_handlers` rely on this function
   *
   * @param _args - The arguments to propose the block
   * @param _signatures - Signatures from the validators
   * // TODO(#9101): The below _body should be removed once we can extract blobs. It's only here so the archiver can extract tx effects.
   * @param _body - The body of the L2 block
   * @param _blobInput - The blob evaluation KZG proof, challenge, and opening required for the precompile.
   */
  function proposeAndClaim(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    bytes calldata _body,
    bytes calldata _blobInput,
    SignedEpochProofQuote calldata _quote
  ) external override(IRollup) onlyRole(VALIDATOR_ROLE) {
    propose(_args, _signatures, _body, _blobInput);
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
   * @param _args - The arguments to submit the epoch root proof:
   *          _epochSize - The size of the epoch (to be promoted to a constant)
   *          _args - Array of public inputs to the proof (previousArchive, endArchive, previousBlockHash, endBlockHash, endTimestamp, outHash, proverId)
   *          _fees - Array of recipient-value pairs with fees to be distributed for the epoch
   *          _blobPublicInputs - The blob public inputs for the proof
   *          _aggregationObject - The aggregation object for the proof
   *          _proof - The proof to verify
   */
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args) external override(IRollup) onlyRole(VALIDATOR_ROLE) {
    if (canPrune()) {
      _prune();
    }

    // We want to compute the two epoch values before hand. Could we do partial interim?
    // We compute these in here to avoid a lot of pain with linking libraries and passing
    // external functions into internal functions as args.
    SubmitEpochRootProofInterimValues memory interimValues;
    interimValues.previousBlockNumber = rollupStore.tips.provenBlockNumber;
    interimValues.endBlockNumber = interimValues.previousBlockNumber + _args.epochSize;

    // @note The _getEpochForBlock is expected to revert if the block is beyond pending.
    //       If this changes you are gonna get so rekt you won't believe it.
    //       I mean proving blocks that have been pruned rekt.
    interimValues.startEpoch = getEpochForBlock(interimValues.previousBlockNumber + 1);
    interimValues.epochToProve = getEpochForBlock(interimValues.endBlockNumber);

    uint256 endBlockNumber = ExtRollupLib.submitEpochRootProof(
      rollupStore,
      _args,
      interimValues,
      PROOF_COMMITMENT_ESCROW,
      FEE_JUICE_PORTAL,
      REWARD_DISTRIBUTOR,
      ASSET,
      CUAUHXICALLI
    );
    emit L2ProofVerified(endBlockNumber, _args.args[6]);
  }

  function getProofClaim()
    external
    view
    override(IRollup)
    returns (DataStructures.EpochProofClaim memory)
  {
    return rollupStore.proofClaim;
  }

  function getTips() external view override(IRollup) returns (ChainTips memory) {
    return rollupStore.tips;
  }

  function status(uint256 _myHeaderBlockNumber)
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
      rollupStore.tips.provenBlockNumber,
      rollupStore.blocks[rollupStore.tips.provenBlockNumber].archive,
      rollupStore.tips.pendingBlockNumber,
      rollupStore.blocks[rollupStore.tips.pendingBlockNumber].archive,
      archiveAt(_myHeaderBlockNumber),
      getEpochForBlock(rollupStore.tips.provenBlockNumber)
    );
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
    bytes32[] calldata _fees,
    bytes calldata _blobPublicInputs,
    bytes calldata _aggregationObject
  ) external view override(IRollup) returns (bytes32[] memory) {
    return ExtRollupLib.getEpochProofPublicInputs(
      rollupStore, _epochSize, _args, _fees, _blobPublicInputs, _aggregationObject
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

    // Consider if a prune will hit in this slot
    uint256 pendingBlockNumber =
      canPruneAtTime(_ts) ? rollupStore.tips.provenBlockNumber : rollupStore.tips.pendingBlockNumber;

    Slot lastSlot = rollupStore.blocks[pendingBlockNumber].slotNumber;

    require(slot > lastSlot, Errors.Rollup__SlotAlreadyInChain(lastSlot, slot));

    // Make sure that the proposer is up to date and on the right chain (ie no reorgs)
    bytes32 tipArchive = rollupStore.blocks[pendingBlockNumber].archive;
    require(tipArchive == _archive, Errors.Rollup__InvalidArchive(tipArchive, _archive));

    Signature[] memory sigs = new Signature[](0);
    DataStructures.ExecutionFlags memory flags =
      DataStructures.ExecutionFlags({ignoreDA: true, ignoreSignatures: true});
    _validateLeonidas(slot, sigs, _archive, flags);

    return (slot, pendingBlockNumber + 1);
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
   * @param _blobsHash - The blobs hash for this block
   * @param _flags - The flags to validate
   */
  function validateHeader(
    bytes calldata _header,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    bytes32 _blobsHash,
    DataStructures.ExecutionFlags memory _flags
  ) external view override(IRollup) {
    _validateHeader(
      ExtRollupLib.decodeHeader(_header),
      _signatures,
      _digest,
      _currentTime,
      getManaBaseFeeAt(_currentTime, true),
      _blobsHash,
      _flags
    );
  }

  /**
   * @notice  Validate blob transactions against given inputs.
   * @dev     Only exists here for gas estimation.
   */
  function validateBlobs(bytes calldata _blobsInput)
    external
    view
    override(IRollup)
    returns (bytes32, bytes32)
  {
    return ExtRollupLib.validateBlobs(_blobsInput, checkBlob);
  }

  /**
   * @notice  Get the next epoch that can be claimed
   * @dev     Will revert if the epoch has already been claimed or if there is no epoch to prove
   */
  function getClaimableEpoch() external view override(IRollup) returns (Epoch) {
    Epoch epochToProve = getEpochToProve();
    require(
      // If the epoch has been claimed, it cannot be claimed again
      rollupStore.proofClaim.epochToProve != epochToProve
      // Edge case for if no claim has been made yet.
      // We know that the bondProvider is always set,
      // Since otherwise the claimEpochProofRight would have reverted,
      // because the zero address cannot have deposited funds into escrow.
      || rollupStore.proofClaim.bondProvider == address(0),
      Errors.Rollup__ProofRightAlreadyClaimed()
    );
    return epochToProve;
  }

  function claimEpochProofRight(SignedEpochProofQuote calldata _quote) public override(IRollup) {
    validateEpochProofRightClaimAtTime(Timestamp.wrap(block.timestamp), _quote);

    Slot currentSlot = getCurrentSlot();
    Epoch epochToProve = getEpochToProve();

    // We don't currently unstake,
    // but we will as part of https://github.com/AztecProtocol/aztec-packages/issues/8652.
    // Blocked on submitting epoch proofs to this contract.
    PROOF_COMMITMENT_ESCROW.stakeBond(_quote.quote.prover, _quote.quote.bondAmount);

    rollupStore.proofClaim = DataStructures.EpochProofClaim({
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
   * @param _args - The arguments to propose the block
   * @param _signatures - Signatures from the validators
   * // TODO(#9101): The below _body should be removed once we can extract blobs. It's only here so the archiver can extract tx effects.
   * @param  - The body of the L2 block
   * @param _blobInput - The blob evaluation KZG proof, challenge, and opening required for the precompile.
   */
  function propose(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    // TODO(#9101): Extract blobs from beacon chain => remove below body input
    bytes calldata,
    bytes calldata _blobInput
  ) public override(IRollup) onlyRole(VALIDATOR_ROLE) {
    if (canPrune()) {
      _prune();
    }
    updateL1GasFeeOracle();

    // Since an invalid blob hash here would fail the consensus checks of
    // the header, the `blobInput` is implicitly accepted by consensus as well.
    (bytes32 blobsHash, bytes32 blobPublicInputsHash) =
      ExtRollupLib.validateBlobs(_blobInput, checkBlob);

    // Decode and validate header
    Header memory header = ExtRollupLib.decodeHeader(_args.header);

    setupEpoch();
    ManaBaseFeeComponents memory components =
      getManaBaseFeeComponentsAt(Timestamp.wrap(block.timestamp), true);
    uint256 manaBaseFee = components.summedBaseFee();
    _validateHeader({
      _header: header,
      _signatures: _signatures,
      _digest: _args.digest(),
      _currentTime: Timestamp.wrap(block.timestamp),
      _manaBaseFee: manaBaseFee,
      _blobsHash: blobsHash,
      _flags: DataStructures.ExecutionFlags({ignoreDA: false, ignoreSignatures: false})
    });

    uint256 blockNumber = ++rollupStore.tips.pendingBlockNumber;

    {
      rollupStore.blocks[blockNumber] = _toBlockLog(_args, blockNumber, components.congestionCost);
    }

    rollupStore.blobPublicInputsHashes[blockNumber] = blobPublicInputsHash;

    // @note  The block number here will always be >=1 as the genesis block is at 0
    {
      bytes32 inHash = INBOX.consume(blockNumber);
      require(
        header.contentCommitment.inHash == inHash,
        Errors.Rollup__InvalidInHash(inHash, header.contentCommitment.inHash)
      );
    }

    // TODO(#7218): Revert to fixed height tree for outbox, currently just providing min as interim
    // Min size = smallest path of the rollup tree + 1
    (uint256 min,) = MerkleLib.computeMinMaxPathLength(header.contentCommitment.numTxs);
    OUTBOX.insert(blockNumber, header.contentCommitment.outHash, min + 1);

    emit L2BlockProposed(blockNumber, _args.archive);

    // Automatically flag the block as proven if we have cheated and set assumeProvenThroughBlockNumber.
    if (blockNumber <= assumeProvenThroughBlockNumber) {
      _fakeBlockNumberAsProven(blockNumber);

      bool isFeeCanonical = address(this) == FEE_JUICE_PORTAL.canonicalRollup();
      bool isRewardDistributorCanonical = address(this) == REWARD_DISTRIBUTOR.canonicalRollup();

      if (isFeeCanonical && header.globalVariables.coinbase != address(0) && header.totalFees > 0) {
        // @note  This will currently fail if there are insufficient funds in the bridge
        //        which WILL happen for the old version after an upgrade where the bridge follow.
        //        Consider allowing a failure. See #7938.
        FEE_JUICE_PORTAL.distributeFees(header.globalVariables.coinbase, header.totalFees);
      }
      if (isRewardDistributorCanonical && header.globalVariables.coinbase != address(0)) {
        REWARD_DISTRIBUTOR.claim(header.globalVariables.coinbase);
      }

      emit L2ProofVerified(blockNumber, "CHEAT");
    }
  }

  /**
   * @notice  Updates the l1 gas fee oracle
   * @dev     This function is called by the `propose` function
   */
  function updateL1GasFeeOracle() public override(IRollup) {
    Slot slot = getCurrentSlot();
    // The slot where we find a new queued value acceptable
    Slot acceptableSlot = rollupStore.l1GasOracleValues.slotOfChange + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    rollupStore.l1GasOracleValues.pre = rollupStore.l1GasOracleValues.post;
    rollupStore.l1GasOracleValues.post =
      L1FeeData({baseFee: block.basefee, blobFee: ExtRollupLib.getBlobBaseFee(VM_ADDRESS)});
    rollupStore.l1GasOracleValues.slotOfChange = slot + LAG;
  }

  /**
   * @notice  Gets the fee asset price as fee_asset / eth with 1e9 precision
   *
   * @return The fee asset price
   */
  function getFeeAssetPrice() public view override(IRollup) returns (uint256) {
    return IntRollupLib.feeAssetPriceModifier(
      rollupStore.blocks[rollupStore.tips.pendingBlockNumber].feeHeader.feeAssetPriceNumerator
    );
  }

  function getL1FeesAt(Timestamp _timestamp)
    public
    view
    override(IRollup)
    returns (L1FeeData memory)
  {
    return getSlotAt(_timestamp) < rollupStore.l1GasOracleValues.slotOfChange
      ? rollupStore.l1GasOracleValues.pre
      : rollupStore.l1GasOracleValues.post;
  }

  /**
   * @notice  Gets the mana base fee
   *
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana base fee
   */
  function getManaBaseFeeAt(Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(IRollup)
    returns (uint256)
  {
    return getManaBaseFeeComponentsAt(_timestamp, _inFeeAsset).summedBaseFee();
  }

  /**
   * @notice  Gets the mana base fee components
   *          For more context, consult:
   *          https://github.com/AztecProtocol/engineering-designs/blob/main/in-progress/8757-fees/design.md
   *
   * @dev     TODO #10004 - As part of the refactor, will likely get rid of this function or make it private
   *          keeping it public for now makes it simpler to test.
   *
   * @param _inFeeAsset - Whether to return the fee in the fee asset or ETH
   *
   * @return The mana base fee components
   */
  function getManaBaseFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    public
    view
    override(ITestRollup)
    returns (ManaBaseFeeComponents memory)
  {
    // If we can prune, we use the proven block, otherwise the pending block
    uint256 blockOfInterest = canPruneAtTime(_timestamp)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    return ExtRollupLib.getManaBaseFeeComponentsAt(
      rollupStore.blocks[blockOfInterest].feeHeader,
      getL1FeesAt(_timestamp),
      _inFeeAsset ? getFeeAssetPrice() : 1e9,
      EPOCH_DURATION
    );
  }

  function quoteToDigest(EpochProofQuote memory _quote)
    public
    view
    override(IRollup)
    returns (bytes32)
  {
    return _hashTypedDataV4(IntRollupLib.computeQuoteHash(_quote));
  }

  function validateEpochProofRightClaimAtTime(Timestamp _ts, SignedEpochProofQuote calldata _quote)
    public
    view
    override(IRollup)
  {
    Slot currentSlot = getSlotAt(_ts);
    address currentProposer = getProposerAt(_ts);
    Epoch epochToProve = getEpochToProve();
    uint256 posInEpoch = positionInEpoch(currentSlot);
    bytes32 digest = quoteToDigest(_quote.quote);

    ExtRollupLib.validateEpochProofRightClaimAtTime(
      currentSlot,
      currentProposer,
      epochToProve,
      posInEpoch,
      _quote,
      digest,
      rollupStore.proofClaim,
      CLAIM_DURATION_IN_L2_SLOTS,
      PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST,
      PROOF_COMMITMENT_ESCROW
    );
  }

  /**
   * @notice  Get the current archive root
   *
   * @return bytes32 - The current archive root
   */
  function archive() public view override(IRollup) returns (bytes32) {
    return rollupStore.blocks[rollupStore.tips.pendingBlockNumber].archive;
  }

  function getProvenBlockNumber() public view override(IRollup) returns (uint256) {
    return rollupStore.tips.provenBlockNumber;
  }

  function getPendingBlockNumber() public view override(IRollup) returns (uint256) {
    return rollupStore.tips.pendingBlockNumber;
  }

  function getBlock(uint256 _blockNumber) public view override(IRollup) returns (BlockLog memory) {
    require(
      _blockNumber <= rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.pendingBlockNumber, _blockNumber)
    );
    return rollupStore.blocks[_blockNumber];
  }

  function getBlobPublicInputsHash(uint256 _blockNumber)
    public
    view
    override(IRollup)
    returns (bytes32)
  {
    return rollupStore.blobPublicInputsHashes[_blockNumber];
  }

  function getEpochForBlock(uint256 _blockNumber) public view override(IRollup) returns (Epoch) {
    require(
      _blockNumber <= rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.pendingBlockNumber, _blockNumber)
    );
    return getEpochAt(getTimestampForSlot(rollupStore.blocks[_blockNumber].slotNumber));
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
    require(
      rollupStore.tips.provenBlockNumber != rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__NoEpochToProve()
    );
    return getEpochForBlock(rollupStore.tips.provenBlockNumber + 1);
  }

  /**
   * @notice  Get the archive root of a specific block
   *
   * @param _blockNumber - The block number to get the archive root of
   *
   * @return bytes32 - The archive root of the block
   */
  function archiveAt(uint256 _blockNumber) public view override(IRollup) returns (bytes32) {
    return _blockNumber <= rollupStore.tips.pendingBlockNumber
      ? rollupStore.blocks[_blockNumber].archive
      : bytes32(0);
  }

  function canPrune() public view override(IRollup) returns (bool) {
    return canPruneAtTime(Timestamp.wrap(block.timestamp));
  }

  function canPruneAtTime(Timestamp _ts) public view override(IRollup) returns (bool) {
    if (
      rollupStore.tips.pendingBlockNumber == rollupStore.tips.provenBlockNumber
        || rollupStore.tips.pendingBlockNumber <= assumeProvenThroughBlockNumber
    ) {
      return false;
    }

    Slot currentSlot = getSlotAt(_ts);
    Epoch oldestPendingEpoch = getEpochForBlock(rollupStore.tips.provenBlockNumber + 1);
    Slot startSlotOfPendingEpoch = toSlots(oldestPendingEpoch);

    // suppose epoch 1 is proven, epoch 2 is pending, epoch 3 is the current epoch.
    // we prune the pending chain back to the end of epoch 1 if:
    // - the proof claim phase of epoch 3 has ended without a claim to prove epoch 2 (or proof of epoch 2)
    // - we reach epoch 4 without a proof of epoch 2 (regardless of whether a proof claim was submitted)
    bool inClaimPhase = currentSlot
      < startSlotOfPendingEpoch + toSlots(Epoch.wrap(1)) + Slot.wrap(CLAIM_DURATION_IN_L2_SLOTS);

    bool claimExists = currentSlot < startSlotOfPendingEpoch + toSlots(Epoch.wrap(2))
      && rollupStore.proofClaim.epochToProve == oldestPendingEpoch
      && rollupStore.proofClaim.proposerClaimant != address(0);

    if (inClaimPhase || claimExists) {
      // If we are in the claim phase, do not prune
      return false;
    }
    return true;
  }

  function _prune() internal {
    // TODO #8656
    delete rollupStore.proofClaim;

    uint256 pending = rollupStore.tips.pendingBlockNumber;

    // @note  We are not deleting the blocks, but we are "winding back" the pendingTip to the last block that was proven.
    //        We can do because any new block proposed will overwrite a previous block in the block log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    rollupStore.tips.pendingBlockNumber = rollupStore.tips.provenBlockNumber;

    emit PrunedPending(rollupStore.tips.provenBlockNumber, pending);
  }

  /**
   * @notice  Validates the header for submission
   *
   * @param _header - The proposed block header
   * @param _signatures - The signatures for the attestations
   * @param _digest - The digest that signatures signed
   * @param _currentTime - The time of execution
   * @param _blobsHash - The blobs hash for this block
   * @dev                - This value is provided to allow for simple simulation of future
   * @param _flags - Flags specific to the execution, whether certain checks should be skipped
   */
  function _validateHeader(
    Header memory _header,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    uint256 _manaBaseFee,
    bytes32 _blobsHash,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    uint256 pendingBlockNumber = canPruneAtTime(_currentTime)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    ExtRollupLib.validateHeaderForSubmissionBase(
      ValidateHeaderArgs({
        header: _header,
        currentTime: _currentTime,
        manaBaseFee: _manaBaseFee,
        blobsHash: _blobsHash,
        pendingBlockNumber: pendingBlockNumber,
        flags: _flags,
        version: VERSION,
        feeJuicePortal: FEE_JUICE_PORTAL,
        getTimestampForSlot: this.getTimestampForSlot
      }),
      rollupStore.blocks
    );
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
    Signature[] memory _signatures,
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

  // Helper to avoid stack too deep
  function _toBlockLog(ProposeArgs calldata _args, uint256 _blockNumber, uint256 _congestionCost)
    internal
    view
    returns (BlockLog memory)
  {
    FeeHeader memory parentFeeHeader = rollupStore.blocks[_blockNumber - 1].feeHeader;
    return BlockLog({
      archive: _args.archive,
      blockHash: _args.blockHash,
      slotNumber: Slot.wrap(uint256(bytes32(_args.header[0x0194:0x01b4]))),
      feeHeader: FeeHeader({
        excessMana: IntRollupLib.computeExcessMana(parentFeeHeader),
        feeAssetPriceNumerator: parentFeeHeader.feeAssetPriceNumerator.clampedAdd(
          _args.oracleInput.feeAssetPriceModifier
        ),
        manaUsed: uint256(bytes32(_args.header[0x0268:0x0288])),
        provingCostPerManaNumerator: parentFeeHeader.provingCostPerManaNumerator.clampedAdd(
          _args.oracleInput.provingCostModifier
        ),
        congestionCost: _congestionCost
      })
    });
  }

  function _fakeBlockNumberAsProven(uint256 _blockNumber) private {
    if (
      _blockNumber > rollupStore.tips.provenBlockNumber
        && _blockNumber <= rollupStore.tips.pendingBlockNumber
    ) {
      rollupStore.tips.provenBlockNumber = _blockNumber;

      // If this results on a new epoch, create a fake claim for it
      // Otherwise nextEpochToProve will report an old epoch
      Epoch epoch = getEpochForBlock(_blockNumber);
      if (
        Epoch.unwrap(epoch) == 0
          || Epoch.unwrap(epoch) > Epoch.unwrap(rollupStore.proofClaim.epochToProve)
      ) {
        rollupStore.proofClaim = DataStructures.EpochProofClaim({
          epochToProve: epoch,
          basisPointFee: 0,
          bondAmount: 0,
          bondProvider: address(0),
          proposerClaimant: msg.sender
        });
      }
    }
  }
}
