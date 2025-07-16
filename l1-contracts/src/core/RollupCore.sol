// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {
  IRollupCore,
  RollupStore,
  SubmitEpochRootProofArgs,
  RollupConfigInput
} from "@aztec/core/interfaces/IRollup.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IValidatorSelectionCore} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {CommitteeAttestations} from "@aztec/shared/libraries/SignatureLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {ExtRollupLib} from "@aztec/core/libraries/rollup/ExtRollupLib.sol";
import {ExtRollupLib2} from "@aztec/core/libraries/rollup/ExtRollupLib2.sol";
import {EthValue, FeeLib} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {STFLib, GenesisState} from "@aztec/core/libraries/rollup/STFLib.sol";
import {StakingLib} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EIP712} from "@oz/utils/cryptography/EIP712.sol";
import {RewardLib, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {
  FeeConfigLib,
  CompressedFeeConfig
} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";

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
  IRollupCore
{
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using FeeConfigLib for CompressedFeeConfig;

  uint256 public immutable L1_BLOCK_AT_GENESIS;

  // To push checkBlob into its own slot so we don't have the trouble of being in the middle of a slot
  uint256 private gap = 0;

  // @note  Always true, exists to override to false for testing only
  bool public checkBlob = true;

  // @note  This is only a temporary and should be too deeply ingrained into the rollup library
  bool public isRewardsClaimable = false;

  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) Ownable(_governance) {
    TimeLib.initialize(
      block.timestamp,
      _config.aztecSlotDuration,
      _config.aztecEpochDuration,
      _config.aztecProofSubmissionEpochs
    );

    Timestamp exitDelay = Timestamp.wrap(_config.exitDelaySeconds);
    Slasher slasher = new Slasher(_config.slashingQuorum, _config.slashingRoundSize);
    StakingLib.initialize(
      _stakingAsset, _gse, exitDelay, address(slasher), _config.stakingQueueConfig
    );
    ExtRollupLib2.initializeValidatorSelection(_config.targetCommitteeSize);

    // If no booster specifically provided deploy one.
    if (address(_config.rewardConfig.booster) == address(0)) {
      _config.rewardConfig.booster = ExtRollupLib2.deployRewardBooster(_config.rewardBoostConfig);
    }

    RewardLib.setConfig(_config.rewardConfig);

    L1_BLOCK_AT_GENESIS = block.number;

    STFLib.initialize(_genesisState);
    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.feeAsset = _feeAsset;
    rollupStore.config.epochProofVerifier = _epochProofVerifier;

    // @todo handle case where L1 forks and chainid is different
    // @note Truncated to 32 bits to make simpler to deal with all the node changes at a separate time.
    uint32 version = uint32(
      uint256(
        keccak256(abi.encode(bytes("aztec_rollup"), block.chainid, address(this), _genesisState))
      )
    );
    rollupStore.config.version = version;

    IInbox inbox = IInbox(
      address(new Inbox(address(this), _feeAsset, version, Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT))
    );

    rollupStore.config.inbox = inbox;

    rollupStore.config.outbox = IOutbox(address(new Outbox(address(this), version)));

    rollupStore.config.feeAssetPortal = IFeeJuicePortal(inbox.getFeeAssetPortal());

    FeeLib.initialize(_config.manaTarget, _config.provingCostPerMana);
  }

  function preheatHeaders() external override(IRollupCore) {
    STFLib.preheatHeaders();
  }

  function setRewardConfig(RewardConfig memory _config) external override(IRollupCore) onlyOwner {
    RewardLib.setConfig(_config);
    emit RewardConfigUpdated(_config);
  }

  function updateManaTarget(uint256 _manaTarget) external override(IRollupCore) onlyOwner {
    uint256 currentManaTarget = FeeLib.getStorage().config.getManaTarget();
    require(
      _manaTarget >= currentManaTarget,
      Errors.Rollup__InvalidManaTarget(currentManaTarget, _manaTarget)
    );
    FeeLib.updateManaTarget(_manaTarget);
    emit IRollupCore.ManaTargetUpdated(_manaTarget);
  }

  function setRewardsClaimable(bool _isRewardsClaimable) external override(IRollupCore) onlyOwner {
    isRewardsClaimable = _isRewardsClaimable;
    emit RewardsClaimableUpdated(_isRewardsClaimable);
  }

  function setSlasher(address _slasher) external override(IStakingCore) onlyOwner {
    ExtRollupLib2.setSlasher(_slasher);
  }

  function setProvingCostPerMana(EthValue _provingCostPerMana)
    external
    override(IRollupCore)
    onlyOwner
  {
    FeeLib.updateProvingCostPerMana(_provingCostPerMana);
  }

  function updateStakingQueueConfig(StakingQueueConfig memory _config)
    external
    override(IStakingCore)
    onlyOwner
  {
    ExtRollupLib2.updateStakingQueueConfig(_config);
  }

  function claimSequencerRewards(address _recipient)
    external
    override(IRollupCore)
    returns (uint256)
  {
    require(isRewardsClaimable, Errors.Rollup__RewardsNotClaimable());
    return RewardLib.claimSequencerRewards(_recipient);
  }

  function claimProverRewards(address _recipient, Epoch[] memory _epochs)
    external
    override(IRollupCore)
    returns (uint256)
  {
    require(isRewardsClaimable, Errors.Rollup__RewardsNotClaimable());
    return RewardLib.claimProverRewards(_recipient, _epochs);
  }

  function vote(uint256 _proposalId) external override(IStakingCore) {
    ExtRollupLib2.vote(_proposalId);
  }

  function deposit(address _attester, address _withdrawer, bool _onCanonical)
    external
    override(IStakingCore)
  {
    ExtRollupLib2.deposit(_attester, _withdrawer, _onCanonical);
  }

  function flushEntryQueue() external override(IStakingCore) {
    uint256 maxAddableValidators = getEntryQueueFlushSize();
    ExtRollupLib2.flushEntryQueue(maxAddableValidators);
  }

  function initiateWithdraw(address _attester, address _recipient)
    external
    override(IStakingCore)
    returns (bool)
  {
    return ExtRollupLib2.initiateWithdraw(_attester, _recipient);
  }

  function finaliseWithdraw(address _attester) external override(IStakingCore) {
    StakingLib.finaliseWithdraw(_attester);
  }

  function slash(address _attester, uint256 _amount) external override(IStakingCore) returns (bool) {
    return StakingLib.trySlash(_attester, _amount);
  }

  function prune() external override(IRollupCore) {
    require(STFLib.canPruneAtTime(Timestamp.wrap(block.timestamp)), Errors.Rollup__NothingToPrune());
    STFLib.prune();
  }

  function submitEpochRootProof(SubmitEpochRootProofArgs calldata _args)
    external
    override(IRollupCore)
  {
    ExtRollupLib.submitEpochRootProof(_args);
  }

  function propose(
    ProposeArgs calldata _args,
    CommitteeAttestations memory _attestations,
    bytes calldata _blobInput
  ) external override(IRollupCore) {
    ExtRollupLib.propose(_args, _attestations, _blobInput, checkBlob);
  }

  function setupEpoch() public override(IValidatorSelectionCore) {
    ExtRollupLib2.setupEpoch();
  }

  function setupSeedSnapshotForNextEpoch() public override(IValidatorSelectionCore) {
    ExtRollupLib2.setupSeedSnapshotForNextEpoch();
  }

  /**
   * @notice  Updates the l1 gas fee oracle
   * @dev     This function is called by the `propose` function
   */
  function updateL1GasFeeOracle() public override(IRollupCore) {
    FeeLib.updateL1GasFeeOracle();
  }

  function getEntryQueueFlushSize() public view override(IStakingCore) returns (uint256) {
    return ExtRollupLib2.getEntryQueueFlushSize();
  }

  function getActiveAttesterCount() public view override(IStakingCore) returns (uint256) {
    return StakingLib.getAttesterCountAtTime(Timestamp.wrap(block.timestamp));
  }
}
