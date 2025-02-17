// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {
  IRollupCore,
  ITestRollup,
  CheatDepositArgs,
  FeeHeader,
  ManaBaseFeeComponents,
  BlockLog,
  RollupStore,
  L1GasOracleValues,
  L1FeeData,
  SubmitEpochRootProofArgs,
  SubEpochRewards,
  EpochRewards
} from "@aztec/core/interfaces/IRollup.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  ExtRollupLib,
  ValidateHeaderArgs,
  Header
} from "@aztec/core/libraries/RollupLibs/ExtRollupLib.sol";
import {EthValue, FeeAssetPerEthE9, PriceLib} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
import {IntRollupLib} from "@aztec/core/libraries/RollupLibs/IntRollupLib.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {ValidatorSelectionLib} from
  "@aztec/core/libraries/ValidatorSelectionLib/ValidatorSelectionLib.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Slasher} from "@aztec/core/staking/Slasher.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {MockVerifier} from "@aztec/mock/MockVerifier.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {STFLib} from "@aztec/core/libraries/RollupLibs/core/STFLib.sol";

struct Config {
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 targetCommitteeSize;
  uint256 aztecProofSubmissionWindow;
  uint256 minimumStake;
  uint256 slashingQuorum;
  uint256 slashingRoundSize;
}

// @note https://www.youtube.com/watch?v=glN0W8WogK8
struct SubmitProofInterim {
  Slot deadline;
  uint256 length;
  uint256 totalBurn;
  address prover;
  uint256 feesToClaim;
  uint256 fee;
  uint256 proverFee;
  uint256 burn;
  uint256 blockRewardsAvailable;
  uint256 blockRewardSequencer;
  uint256 blockRewardProver;
  uint256 added;
  uint256 sequencerShare;
  bool isFeeCanonical;
  bool isRewardDistributorCanonical;
  FeeAssetPerEthE9 feeAssetPrice;
}

/**
 * @title Rollup
 * @author Aztec Labs
 * @notice Rollup contract that is concerned about readability and velocity of development
 * not giving a damn about gas costs.
 * @dev WARNING: This contract is VERY close to the size limit
 */
contract RollupCore is
  EIP712("Aztec Rollup", "1"),
  Ownable,
  IStakingCore,
  IValidatorSelectionCore,
  IRollupCore,
  ITestRollup
{
  using ProposeLib for ProposeArgs;
  using IntRollupLib for uint256;
  using IntRollupLib for ManaBaseFeeComponents;

  using PriceLib for EthValue;

  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  Slot public constant LIFETIME = Slot.wrap(5);
  Slot public constant LAG = Slot.wrap(2);

  uint256 public immutable L1_BLOCK_AT_GENESIS;
  IInbox public immutable INBOX;
  IOutbox public immutable OUTBOX;
  uint256 public immutable VERSION;

  // To push checkBlob into its own slot so we don't have the trouble of being in the middle of a slot
  uint256 private gap = 0;

  // @note  Always true, exists to override to false for testing only
  bool public checkBlob = true;

  constructor(
    IFeeJuicePortal _fpcJuicePortal,
    IRewardDistributor _rewardDistributor,
    IERC20 _stakingAsset,
    bytes32 _vkTreeRoot,
    bytes32 _protocolContractTreeRoot,
    bytes32 _genesisArchiveRoot,
    bytes32 _genesisBlockHash,
    address _ares,
    Config memory _config
  ) Ownable(_ares) {
    TimeLib.initialize(block.timestamp, _config.aztecSlotDuration, _config.aztecEpochDuration);

    Timestamp exitDelay = Timestamp.wrap(60 * 60 * 24);
    Slasher slasher = new Slasher(_config.slashingQuorum, _config.slashingRoundSize);
    StakingLib.initialize(_stakingAsset, _config.minimumStake, exitDelay, address(slasher));
    ValidatorSelectionLib.initialize(_config.targetCommitteeSize);

    INBOX = IInbox(address(new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT)));
    OUTBOX = IOutbox(address(new Outbox(address(this))));
    VERSION = 1;
    L1_BLOCK_AT_GENESIS = block.number;

    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.proofSubmissionWindow = _config.aztecProofSubmissionWindow;
    rollupStore.config.feeAsset = _fpcJuicePortal.UNDERLYING();
    rollupStore.config.feeAssetPortal = _fpcJuicePortal;
    rollupStore.config.rewardDistributor = _rewardDistributor;

    rollupStore.config.epochProofVerifier = new MockVerifier();
    rollupStore.config.vkTreeRoot = _vkTreeRoot;
    rollupStore.config.protocolContractTreeRoot = _protocolContractTreeRoot;

    rollupStore.provingCostPerMana = EthValue.wrap(100);

    // Genesis block
    rollupStore.blocks[0] = BlockLog({
      feeHeader: FeeHeader({
        excessMana: 0,
        feeAssetPriceNumerator: 0,
        manaUsed: 0,
        congestionCost: 0,
        provingCost: 0
      }),
      archive: _genesisArchiveRoot,
      blockHash: _genesisBlockHash,
      slotNumber: Slot.wrap(0)
    });
    rollupStore.l1GasOracleValues = L1GasOracleValues({
      pre: L1FeeData({baseFee: 1 gwei, blobFee: 1}),
      post: L1FeeData({baseFee: block.basefee, blobFee: ExtRollupLib.getBlobBaseFee()}),
      slotOfChange: LIFETIME
    });
  }

  function setProvingCostPerMana(EthValue _provingCostPerMana)
    external
    override(IRollupCore)
    onlyOwner
  {
    STFLib.getStorage().provingCostPerMana = _provingCostPerMana;
  }

  function claimSequencerRewards(address _recipient)
    external
    override(IRollupCore)
    returns (uint256)
  {
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 amount = rollupStore.sequencerRewards[msg.sender];
    rollupStore.sequencerRewards[msg.sender] = 0;
    rollupStore.config.feeAsset.transfer(_recipient, amount);

    return amount;
  }

  function claimProverRewards(address _recipient, Epoch[] memory _epochs)
    external
    override(IRollupCore)
    returns (uint256)
  {
    Slot currentSlot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 proofSubmissionWindow = rollupStore.config.proofSubmissionWindow;

    uint256 accumulatedRewards = 0;
    for (uint256 i = 0; i < _epochs.length; i++) {
      Slot deadline = _epochs[i].toSlots() + Slot.wrap(proofSubmissionWindow);
      require(deadline < currentSlot, Errors.Rollup__NotPastDeadline(deadline, currentSlot));

      // We can use fancier bitmaps for performance
      require(
        !rollupStore.proverClaimed[msg.sender][_epochs[i]],
        Errors.Rollup__AlreadyClaimed(msg.sender, _epochs[i])
      );
      rollupStore.proverClaimed[msg.sender][_epochs[i]] = true;

      EpochRewards storage e = rollupStore.epochRewards[_epochs[i]];
      if (e.subEpoch[e.longestProvenLength].hasSubmitted[msg.sender]) {
        accumulatedRewards += (e.rewards / e.subEpoch[e.longestProvenLength].summedCount);
      }
    }

    rollupStore.config.feeAsset.transfer(_recipient, accumulatedRewards);

    return accumulatedRewards;
  }

  function deposit(address _attester, address _proposer, address _withdrawer, uint256 _amount)
    external
    override(IStakingCore)
  {
    setupEpoch();
    StakingLib.deposit(_attester, _proposer, _withdrawer, _amount);
  }

  function initiateWithdraw(address _attester, address _recipient)
    external
    override(IStakingCore)
    returns (bool)
  {
    // @note The attester might be chosen for the epoch, so the delay must be long enough
    //       to allow for that.
    setupEpoch();
    return StakingLib.initiateWithdraw(_attester, _recipient);
  }

  function finaliseWithdraw(address _attester) external override(IStakingCore) {
    StakingLib.finaliseWithdraw(_attester);
  }

  function slash(address _attester, uint256 _amount) external override(IStakingCore) {
    StakingLib.slash(_attester, _amount);
  }

  function cheat__InitialiseValidatorSet(CheatDepositArgs[] memory _args)
    external
    override(ITestRollup)
    onlyOwner
  {
    for (uint256 i = 0; i < _args.length; i++) {
      StakingLib.deposit(_args[i].attester, _args[i].proposer, _args[i].withdrawer, _args[i].amount);
    }
    setupEpoch();
  }

  /**
   * @notice  Prune the pending chain up to the last proven block
   *
   * @dev     Will revert if there is nothing to prune or if the chain is not ready to be pruned
   */
  function prune() external override(IRollupCore) {
    require(canPrune(), Errors.Rollup__NothingToPrune());
    STFLib.prune();
  }

  /**
   * @notice  Set the verifier contract
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _verifier - The new verifier contract
   */
  function setEpochVerifier(address _verifier) external override(ITestRollup) onlyOwner {
    STFLib.getStorage().config.epochProofVerifier = IVerifier(_verifier);
  }

  /**
   * @notice  Set the vkTreeRoot
   *
   * @dev     This is only needed for testing, and should be removed
   *
   * @param _vkTreeRoot - The new vkTreeRoot to be used by proofs
   */
  function setVkTreeRoot(bytes32 _vkTreeRoot) external override(ITestRollup) onlyOwner {
    STFLib.getStorage().config.vkTreeRoot = _vkTreeRoot;
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
    STFLib.getStorage().config.protocolContractTreeRoot = _protocolContractTreeRoot;
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
  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args)
    external
    override(IRollupCore)
  {
    ExtRollupLib.submitEpochRootProof(_args);
  }

  function setupEpoch() public override(IValidatorSelectionCore) {
    ValidatorSelectionLib.setupEpoch(StakingLib.getStorage());
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
  ) public override(IRollupCore) {
    if (canPrune()) {
      STFLib.prune();
    }
    updateL1GasFeeOracle();

    // Since an invalid blob hash here would fail the consensus checks of
    // the header, the `blobInput` is implicitly accepted by consensus as well.
    (bytes32[] memory blobHashes, bytes32 blobsHashesCommitment, bytes32 blobPublicInputsHash) =
      ExtRollupLib.validateBlobs(_blobInput, checkBlob);

    // Decode and validate header
    Header memory header = ExtRollupLib.decodeHeader(_args.header);

    // @todo As part of a refactor of the core for propose and submit, we should
    //       be able to set it up such that we don't need compute the fee components
    //       unless needed.
    //       Would be part of joining the header validation.

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
      _blobsHashesCommitment: blobsHashesCommitment,
      _flags: DataStructures.ExecutionFlags({ignoreDA: false, ignoreSignatures: false})
    });

    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 blockNumber = ++rollupStore.tips.pendingBlockNumber;

    {
      // @note The components are measured in the fee asset.
      rollupStore.blocks[blockNumber] =
        _toBlockLog(_args, blockNumber, components.congestionCost, components.provingCost);
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

    emit L2BlockProposed(blockNumber, _args.archive, blobHashes);
  }

  /**
   * @notice  Updates the l1 gas fee oracle
   * @dev     This function is called by the `propose` function
   */
  function updateL1GasFeeOracle() public override(IRollupCore) {
    Slot slot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    // The slot where we find a new queued value acceptable
    RollupStore storage rollupStore = STFLib.getStorage();
    Slot acceptableSlot = rollupStore.l1GasOracleValues.slotOfChange + (LIFETIME - LAG);

    if (slot < acceptableSlot) {
      return;
    }

    rollupStore.l1GasOracleValues.pre = rollupStore.l1GasOracleValues.post;
    rollupStore.l1GasOracleValues.post =
      L1FeeData({baseFee: block.basefee, blobFee: ExtRollupLib.getBlobBaseFee()});
    rollupStore.l1GasOracleValues.slotOfChange = slot + LAG;
  }

  /**
   * @notice  Gets the fee asset price as fee_asset / eth with 1e9 precision
   *
   * @return The fee asset price
   */
  function getFeeAssetPerEth() public view override(IRollupCore) returns (FeeAssetPerEthE9) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return IntRollupLib.getFeeAssetPerEth(
      rollupStore.blocks[rollupStore.tips.pendingBlockNumber].feeHeader.feeAssetPriceNumerator
    );
  }

  function getL1FeesAt(Timestamp _timestamp)
    public
    view
    override(IRollupCore)
    returns (L1FeeData memory)
  {
    RollupStore storage rollupStore = STFLib.getStorage();
    return _timestamp.slotFromTimestamp() < rollupStore.l1GasOracleValues.slotOfChange
      ? rollupStore.l1GasOracleValues.pre
      : rollupStore.l1GasOracleValues.post;
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
    RollupStore storage rollupStore = STFLib.getStorage();
    // If we can prune, we use the proven block, otherwise the pending block
    uint256 blockOfInterest = canPruneAtTime(_timestamp)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    return ExtRollupLib.getManaBaseFeeComponentsAt(
      rollupStore.blocks[blockOfInterest].feeHeader,
      getL1FeesAt(_timestamp),
      rollupStore.provingCostPerMana,
      _inFeeAsset ? getFeeAssetPerEth() : FeeAssetPerEthE9.wrap(1e9),
      TimeLib.getStorage().epochDuration
    );
  }

  function getEpochForBlock(uint256 _blockNumber) public view override(IRollupCore) returns (Epoch) {
    return STFLib.getEpochForBlock(_blockNumber);
  }

  function canPrune() public view override(IRollupCore) returns (bool) {
    return canPruneAtTime(Timestamp.wrap(block.timestamp));
  }

  function canPruneAtTime(Timestamp _ts) public view override(IRollupCore) returns (bool) {
    return STFLib.canPruneAtTime(_ts);
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
  function _validateHeader(
    Header memory _header,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    uint256 _manaBaseFee,
    bytes32 _blobsHashesCommitment,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 pendingBlockNumber = canPruneAtTime(_currentTime)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;

    ExtRollupLib.validateHeaderForSubmissionBase(
      ValidateHeaderArgs({
        header: _header,
        currentTime: _currentTime,
        manaBaseFee: _manaBaseFee,
        blobsHashesCommitment: _blobsHashesCommitment,
        pendingBlockNumber: pendingBlockNumber,
        flags: _flags,
        version: VERSION,
        feeJuicePortal: rollupStore.config.feeAssetPortal
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
  function _validateHeaderForSubmissionSequencerSelection(
    Slot _slot,
    Signature[] memory _signatures,
    bytes32 _digest,
    Timestamp _currentTime,
    DataStructures.ExecutionFlags memory _flags
  ) internal view {
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
  function _toBlockLog(
    ProposeArgs calldata _args,
    uint256 _blockNumber,
    uint256 _congestionCost,
    uint256 _provingCost
  ) internal view returns (BlockLog memory) {
    RollupStore storage rollupStore = STFLib.getStorage();
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
        congestionCost: _congestionCost,
        provingCost: _provingCost
      })
    });
  }
}
