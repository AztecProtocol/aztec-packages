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
  EpochRewards
} from "@aztec/core/interfaces/IRollup.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {STFLib} from "@aztec/core/libraries/RollupLibs/core/STFLib.sol";
import {ExtRollupLib} from "@aztec/core/libraries/RollupLibs/ExtRollupLib.sol";
import {EthValue, FeeAssetPerEthE9, PriceLib} from "@aztec/core/libraries/RollupLibs/FeeMath.sol";
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

struct Config {
  uint256 aztecSlotDuration;
  uint256 aztecEpochDuration;
  uint256 targetCommitteeSize;
  uint256 aztecProofSubmissionWindow;
  uint256 minimumStake;
  uint256 slashingQuorum;
  uint256 slashingRoundSize;
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

  using PriceLib for EthValue;

  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  uint256 public immutable L1_BLOCK_AT_GENESIS;

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

    L1_BLOCK_AT_GENESIS = block.number;

    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.proofSubmissionWindow = _config.aztecProofSubmissionWindow;
    rollupStore.config.feeAsset = _fpcJuicePortal.UNDERLYING();
    rollupStore.config.feeAssetPortal = _fpcJuicePortal;
    rollupStore.config.rewardDistributor = _rewardDistributor;

    rollupStore.config.epochProofVerifier = new MockVerifier();
    rollupStore.config.vkTreeRoot = _vkTreeRoot;
    rollupStore.config.protocolContractTreeRoot = _protocolContractTreeRoot;
    rollupStore.config.version = 1;

    rollupStore.config.inbox =
      IInbox(address(new Inbox(address(this), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT)));
    rollupStore.config.outbox = IOutbox(address(new Outbox(address(this))));
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
      slotOfChange: ProposeLib.LIFETIME
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
  function propose(
    ProposeArgs calldata _args,
    Signature[] memory _signatures,
    // TODO(#9101): Extract blobs from beacon chain => remove below body input
    bytes calldata _body,
    bytes calldata _blobInput
  ) external override(IRollupCore) {
    ExtRollupLib.propose(_args, _signatures, _body, _blobInput, checkBlob);
  }

  function setupEpoch() public override(IValidatorSelectionCore) {
    ValidatorSelectionLib.setupEpoch(StakingLib.getStorage());
  }

  /**
   * @notice  Updates the l1 gas fee oracle
   * @dev     This function is called by the `propose` function
   */
  function updateL1GasFeeOracle() public override(IRollupCore) {
    ProposeLib.updateL1GasFeeOracle();
  }

  /**
   * @notice  Gets the fee asset price as fee_asset / eth with 1e9 precision
   *
   * @return The fee asset price
   */
  function getFeeAssetPerEth() public view override(IRollupCore) returns (FeeAssetPerEthE9) {
    return ProposeLib.getFeeAssetPerEth();
  }

  function getL1FeesAt(Timestamp _timestamp)
    public
    view
    override(IRollupCore)
    returns (L1FeeData memory)
  {
    return ProposeLib.getL1FeesAt(_timestamp);
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
    return ProposeLib.getManaBaseFeeComponentsAt(_timestamp, _inFeeAsset);
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
}
