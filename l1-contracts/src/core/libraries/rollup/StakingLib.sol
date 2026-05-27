// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {
  StakingQueueConfig,
  CompressedStakingQueueConfig,
  StakingQueueConfigLib
} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingQueueLib, StakingQueue, DepositArgs} from "@aztec/core/libraries/StakingQueue.sol";
import {TimeLib, Timestamp, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GSE, AttesterConfig, IGSECore} from "@aztec/governance/GSE.sol";
import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {CompressedTimeMath, CompressedTimestamp, CompressedEpoch} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// None -> Does not exist in our setup
// Validating -> Participating as validator
// Zombie -> Not participating as validator, but have funds in setup,
//     hit if slashes and going below the minimum
// Exiting -> In the process of exiting the system
enum Status {
  NONE,
  VALIDATING,
  ZOMBIE,
  EXITING
}

/**
 * @notice Represents a validator's exit from the staking system
 * @dev Used to track withdrawal details and timing for validators leaving the system.
 *      The exit can be created in two scenarios:
 *      1. Voluntary withdrawal: Validator calls initiateWithdraw() -> recipientOrWithdrawer is the final recipient
 *      2. Slashing-induced exit: Validator gets slashed -> recipientOrWithdrawer is the withdrawer who must later
 *         call initiateWithdraw() to specify a recipient
 *
 *      The recipientOrWithdrawer field serves dual purposes:
 *      - When isRecipient=true: This address will receive the withdrawn funds
 *      - When isRecipient=false: This address (the withdrawer) can call initiateWithdraw() to set a recipient
 *
 *      Workflow for slashing-induced exits:
 *      1. Slashing occurs -> Exit created with recipientOrWithdrawer=withdrawer, isRecipient=false
 *      2. Withdrawer calls initiateWithdraw() -> Updates to recipientOrWithdrawer=recipient, isRecipient=true
 *      3. After delay period -> finalizeWithdraw() can transfer funds to the recipient
 * @param withdrawalId Unique identifier for this withdrawal from the GSE contract
 * @param amount The amount of stake being withdrawn
 * @param exitableAt Timestamp when the stake becomes withdrawable after delay period
 * @param recipientOrWithdrawer Address that can either receive funds (if isRecipient) or initiate withdrawal (if
 * !isRecipient)
 * @param isRecipient True if recipientOrWithdrawer is the recipient, false if it's the withdrawer
 * @param exists True if this exit record exists, false if not yet created
 */
struct Exit {
  uint256 withdrawalId;
  uint256 amount;
  Timestamp exitableAt;
  address recipientOrWithdrawer;
  bool isRecipient;
  bool exists;
}

struct AttesterView {
  Status status;
  uint256 effectiveBalance;
  Exit exit;
  AttesterConfig config;
}

struct StakingStorage {
  IERC20 stakingAsset;
  address slasher;
  uint96 localEjectionThreshold;
  address pendingSlasher;
  CompressedTimestamp pendingSlasherReadyAt;
  GSE gse;
  CompressedTimestamp exitDelay;
  mapping(address attester => Exit) exits;
  CompressedStakingQueueConfig queueConfig;
  StakingQueue entryQueue;
  CompressedEpoch nextFlushableEpoch;
  uint32 availableValidatorFlushes;
  bool isBootstrapped;
  // Outgoing slasher that finalizeSetSlasher has rotated off the active slot. Retains
  // authority to call {slash} until `legacySlasherAuthorizedUntil` so that slashing rounds
  // which already reached quorum before the rotation can still execute after the new
  // slasher takes over.
  address legacySlasher;
  CompressedTimestamp legacySlasherAuthorizedUntil;
}

library StakingLib {
  using SafeCast for uint256;
  using SafeERC20 for IERC20;
  using StakingQueueLib for StakingQueue;
  using ProposalLib for Proposal;
  using StakingQueueConfigLib for CompressedStakingQueueConfig;
  using StakingQueueConfigLib for StakingQueueConfig;
  using CompressedTimeMath for CompressedTimestamp;
  using CompressedTimeMath for Timestamp;
  using CompressedTimeMath for CompressedEpoch;
  using CompressedTimeMath for Epoch;

  bytes32 private constant STAKING_SLOT = keccak256("aztec.core.staking.storage");

  /// @notice Delay between queuing a slasher replacement and being able to finalize it.
  uint256 internal constant SLASHER_EXECUTION_DELAY = 60 days;
  /// @notice After {finalizeSetSlasher} swaps the active slasher, the outgoing slasher retains
  ///         the right to call {slash} for this long. The window is sized to comfortably cover
  ///         any reasonable SlashingProposer lifetime: at the default config a round's full
  ///         vote -> execution lifetime fits inside a few hours, so 30 days is generous.
  ///         Rollups configured with multi-week round lifetimes should raise this -- the value
  ///         is the only knob bounding how long an in-flight slash can drain through the old
  ///         proposer after rotation.
  uint256 internal constant LEGACY_SLASHER_DRAIN_WINDOW = 30 days;

  function initialize(
    IERC20 _stakingAsset,
    GSE _gse,
    Timestamp _exitDelay,
    address _slasher,
    StakingQueueConfig memory _config,
    uint256 _localEjectionThreshold
  ) internal {
    StakingStorage storage store = getStorage();
    store.stakingAsset = _stakingAsset;
    store.gse = _gse;
    store.exitDelay = _exitDelay.compress();
    store.slasher = _slasher;
    store.queueConfig = _config.compress();
    store.entryQueue.init();
    store.localEjectionThreshold = _localEjectionThreshold.toUint96();
  }

  function queueSetSlasher(address _slasher) internal {
    StakingStorage storage store = getStorage();

    // `Slasher.initializeProposer` is permissionless while `PROPOSER` is unset. Queuing a
    // not-yet-initialized Slasher would let anyone claim the proposer role during the 60-day
    // delay and gain arbitrary slash-payload authority once `finalizeSetSlasher` lands. Require
    // the proposer to already be wired so the queued replacement is not capturable.
    require(Slasher(_slasher).PROPOSER() != address(0), Errors.Staking__SlasherProposerNotInitialized(_slasher));

    Timestamp readyAt = Timestamp.wrap(block.timestamp + SLASHER_EXECUTION_DELAY);
    store.pendingSlasher = _slasher;
    store.pendingSlasherReadyAt = readyAt.compress();

    emit IStakingCore.PendingSlasherQueued(_slasher, Timestamp.unwrap(readyAt));
  }

  function cancelSetSlasher() internal {
    StakingStorage storage store = getStorage();

    require(CompressedTimestamp.unwrap(store.pendingSlasherReadyAt) != 0, Errors.Staking__NoPendingSlasher());

    address cancelled = store.pendingSlasher;
    store.pendingSlasher = address(0);
    store.pendingSlasherReadyAt = CompressedTimestamp.wrap(0);

    emit IStakingCore.PendingSlasherCancelled(cancelled);
  }

  function finalizeSetSlasher() internal {
    StakingStorage storage store = getStorage();

    require(CompressedTimestamp.unwrap(store.pendingSlasherReadyAt) != 0, Errors.Staking__NoPendingSlasher());
    Timestamp readyAt = store.pendingSlasherReadyAt.decompress();
    require(Timestamp.wrap(block.timestamp) >= readyAt, Errors.Staking__SlasherNotReady(readyAt));

    address newSlasher = store.pendingSlasher;
    // Defense in depth against state queued before the queueSetSlasher guard existed, and
    // against a replacement whose proposer somehow regressed to zero after queueing.
    require(Slasher(newSlasher).PROPOSER() != address(0), Errors.Staking__SlasherProposerNotInitialized(newSlasher));

    address oldSlasher = store.slasher;
    // Park the outgoing slasher in the legacy slot with a drain window so quorum-backed rounds
    // already accumulated on the old SlashingProposer can still execute against the rollup
    // through the old slasher. Without this, a committee just before a queued slasher takes over
    // gets a "free round" to do what they like. Any prior legacy auth window is overwritten -- only
    // one rotation can be in flight at a time, and the most recent rotation defines the
    // currently-relevant outgoing slasher.
    Timestamp drainUntil = Timestamp.wrap(block.timestamp + LEGACY_SLASHER_DRAIN_WINDOW);
    store.legacySlasher = oldSlasher;
    store.legacySlasherAuthorizedUntil = drainUntil.compress();

    store.slasher = newSlasher;
    store.pendingSlasher = address(0);
    store.pendingSlasherReadyAt = CompressedTimestamp.wrap(0);

    emit IStakingCore.SlasherUpdated(oldSlasher, newSlasher);
    emit IStakingCore.LegacySlasherAuthorized(oldSlasher, Timestamp.unwrap(drainUntil));
  }

  /**
   * @notice Vote on a governance proposal with the rollup's voting power
   * @dev Only votes if:
   *      1. This rollup is the current canonical instance according to governance proposer
   *      2. This rollup was canonical when the proposal was created
   *      3. The proposal was created by the governance proposer
   * @param _proposalId The ID of the proposal to vote on
   */
  function vote(uint256 _proposalId) internal {
    StakingStorage storage store = getStorage();
    Governance gov = store.gse.getGovernance();

    GovernanceProposer govProposer = GovernanceProposer(gov.governanceProposer());
    // We only vote if we are the canonical instance
    require(address(this) == govProposer.getInstance(), Errors.Staking__NotCanonical(address(this)));
    address proposalProposer = govProposer.getProposalProposer(_proposalId);
    // We only vote if we were canonical when the proposal was created
    require(
      address(this) == proposalProposer, Errors.Staking__NotOurProposal(_proposalId, address(this), proposalProposer)
    );
    // We only vote if the proposal was created by the governance proposer
    Proposal memory proposal = gov.getProposal(_proposalId);
    require(proposal.proposer == address(govProposer), Errors.Staking__IncorrectGovProposer(_proposalId));

    Timestamp ts = proposal.creation + proposal.config.votingDelay;

    // Cast votes with all our power
    uint256 vp = store.gse.getVotingPowerAt(address(this), ts);
    store.gse.vote(_proposalId, vp, true);

    // If we are the canonical at the time of the proposal we also cast those votes.
    if (store.gse.getLatestRollupAt(ts) == address(this)) {
      address bonusInstance = store.gse.getBonusInstanceAddress();
      vp = store.gse.getVotingPowerAt(bonusInstance, ts);
      store.gse.voteWithBonus(_proposalId, vp, true);
    }
  }

  /**
   * @notice Completes a validator's withdrawal after the exit delay period
   * @param _attester The address of the validator completing withdrawal
   * @dev Reverts if the attester has no valid exit request (Staking__NotExiting) or if the exit delay period has not
   * elapsed (Staking__WithdrawalNotUnlockedYet)
   */
  function finalizeWithdraw(address _attester) internal {
    StakingStorage storage store = getStorage();
    // We load it into memory to cache it, as we will delete it before we use it.
    Exit memory exit = store.exits[_attester];
    require(exit.exists, Errors.Staking__NotExiting(_attester));
    require(exit.isRecipient, Errors.Staking__InitiateWithdrawNeeded(_attester));
    require(
      exit.exitableAt <= Timestamp.wrap(block.timestamp),
      Errors.Staking__WithdrawalNotUnlockedYet(Timestamp.wrap(block.timestamp), exit.exitableAt)
    );

    delete store.exits[_attester];

    store.gse.finalizeWithdraw(exit.withdrawalId);
    store.stakingAsset.safeTransfer(exit.recipientOrWithdrawer, exit.amount);

    emit IStakingCore.WithdrawFinalized(_attester, exit.recipientOrWithdrawer, exit.amount);
  }

  function trySlash(address _attester, uint256 _amount) internal returns (bool) {
    if (!isSlashable(_attester)) {
      return false;
    }
    slash(_attester, _amount);
    return true;
  }

  /**
   * @notice Slashes a validator's stake as punishment for misbehavior
   * @dev Only callable by the authorized slasher contract. Handles slashing for both exiting and active validators.
   *      For exiting validators, reduces their exit amount. For active validators, the balance will be reduced and
   *      an exit will be created if the remaining stake falls below the ejection threshold.
   * @param _attester The address of the validator to slash
   * @param _amount The amount of stake to slash
   */
  function slash(address _attester, uint256 _amount) internal {
    StakingStorage storage store = getStorage();
    require(_isAuthorizedSlasher(store, msg.sender), Errors.Staking__NotSlasher(store.slasher, msg.sender));

    Exit storage exit = store.exits[_attester];

    if (exit.exists) {
      require(exit.exitableAt > Timestamp.wrap(block.timestamp), Errors.Staking__CannotSlashExitedStake(_attester));

      // If the slash amount is greater than the exit amount, bound it to the exit amount
      uint256 slashAmount = Math.min(_amount, exit.amount);

      if (exit.amount == slashAmount) {
        // If we slash the entire thing, nuke it entirely
        delete store.exits[_attester];
      } else {
        exit.amount -= slashAmount;
      }

      emit IStakingCore.Slashed(_attester, slashAmount);
    } else {
      // Get the effective balance of the attester
      uint256 effectiveBalance = store.gse.effectiveBalanceOf(address(this), _attester);
      require(effectiveBalance > 0, Errors.Staking__NoOneToSlash(_attester));

      address withdrawer = store.gse.getWithdrawer(_attester);

      // If the slash amount is greater than the effective balance, bound it to the effective balance
      uint256 slashAmount = Math.min(_amount, effectiveBalance);
      // The `localEjectionThreshold` might be stricter (larger) than the global (gse ejection threshold)
      uint256 toWithdraw =
        effectiveBalance - slashAmount < store.localEjectionThreshold ? effectiveBalance : slashAmount;

      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) = store.gse.withdraw(_attester, toWithdraw);

      // The slashed amount remains in the contract permanently, effectively burning those tokens.
      uint256 toUser = amountWithdrawn - slashAmount;
      if (isRemoved && toUser > 0) {
        // Only if we remove the attester AND there is something left will we create an exit
        store.exits[_attester] = Exit({
          withdrawalId: withdrawalId,
          amount: toUser,
          exitableAt: Timestamp.wrap(block.timestamp) + store.exitDelay.decompress(),
          recipientOrWithdrawer: withdrawer,
          isRecipient: false,
          exists: true
        });
      }

      emit IStakingCore.Slashed(_attester, slashAmount);
    }
  }

  /**
   * @notice Deposits stake to add a new validator to the entry queue
   * @dev Transfers stake from the caller and adds the validator to the entry queue.
   *      The validator must not already be exiting. The attester and withdrawer addresses
   *      must be non-zero. The stake amount is fixed at the activation threshold.
   *      The validator will be processed from the queue in a future flushEntryQueue call.
   *
   * @param _attester The address that will act as the validator (sign attestations)
   * @param _withdrawer The address that can withdraw the stake
   * @param _publicKeyInG1 The G1 point for the BLS public key (used for efficient signature verification in GSE)
   * @param _publicKeyInG2 The G2 point for the BLS public key (used for BLS aggregation and pairing operations in GSE)
   * @param _proofOfPossession The proof of possession to show that the keys in G1 and G2 share the same secret key
   * @param _moveWithLatestRollup Whether to automatically stake on a new rollup instance after an upgrade
   */
  function deposit(
    address _attester,
    address _withdrawer,
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession,
    bool _moveWithLatestRollup
  ) internal {
    require(
      _attester != address(0) && _withdrawer != address(0), Errors.Staking__InvalidDeposit(_attester, _withdrawer)
    );
    StakingStorage storage store = getStorage();
    // We don't allow deposits, if we are currently exiting.
    require(!store.exits[_attester].exists, Errors.Staking__AlreadyExiting(_attester));
    uint256 amount = store.gse.ACTIVATION_THRESHOLD();

    store.stakingAsset.safeTransferFrom(msg.sender, address(this), amount);
    store.entryQueue
      .enqueue(_attester, _withdrawer, _publicKeyInG1, _publicKeyInG2, _proofOfPossession, _moveWithLatestRollup);
    emit IStakingCore.ValidatorQueued(_attester, _withdrawer);
  }

  function updateAndGetAvailableFlushes() internal returns (uint256) {
    (uint256 flushes, Epoch currentEpoch, bool shouldUpdateState) = _calculateAvailableFlushes();

    if (shouldUpdateState) {
      StakingStorage storage store = getStorage();
      store.nextFlushableEpoch = (currentEpoch + Epoch.wrap(1)).compress();
      store.availableValidatorFlushes = flushes.toUint32();
    }

    return flushes;
  }

  /**
   * @notice Processes the validator entry queue to add new validators to the active set
   * @dev Processes up to min(maxAddableValidators, _toAdd) entries from the queue,
   *      attempting to deposit each validator into the Governance Staking Escrow (GSE).
   *
   *      For each validator:
   *      - Dequeues their entry from the queue
   *      - Attempts to deposit them into the GSE contract
   *      - On success: emits Deposit event
   *      - On failure: refunds their stake and emits FailedDeposit event
   *
   *      The function will revert if:
   *      - A deposit fails due to out of gas (to prevent queue draining attacks)
   *
   *      The function approves the GSE contract to spend the total stake amount needed for all deposits,
   *      then revokes the approval after processing is complete.
   *      It also updates the available validator flushes
   *
   * @param _toAdd - The max number the caller will try to add
   */
  function flushEntryQueue(uint256 _toAdd) internal {
    uint256 maxAddableValidators = updateAndGetAvailableFlushes();

    if (maxAddableValidators == 0) {
      return;
    }

    StakingStorage storage store = getStorage();

    uint256 queueLength = store.entryQueue.length();
    uint256 numToDequeue = Math.min(Math.min(maxAddableValidators, queueLength), _toAdd);

    if (numToDequeue == 0) {
      return;
    }

    // Approve the GSE to spend the total stake amount needed for all deposits.
    uint256 amount = store.gse.ACTIVATION_THRESHOLD();
    store.stakingAsset.approve(address(store.gse), amount * numToDequeue);
    uint256 depositCount = 0;
    for (uint256 i = 0; i < numToDequeue; i++) {
      DepositArgs memory args = store.entryQueue.dequeue();
      (bool success, bytes memory data) = address(store.gse)
        .call(
          abi.encodeWithSelector(
            IGSECore.deposit.selector,
            args.attester,
            args.withdrawer,
            args.publicKeyInG1,
            args.publicKeyInG2,
            args.proofOfPossession,
            args.moveWithLatestRollup
          )
        );
      if (success) {
        depositCount++;
        emit IStakingCore.Deposit(
          args.attester, args.withdrawer, args.publicKeyInG1, args.publicKeyInG2, args.proofOfPossession, amount
        );
      } else {
        // If the deposit fails, we need to handle two cases:
        // 1. Normal failure (data.length > 0): We return the funds to the withdrawer and continue processing
        //    the queue. This prevents a single failed deposit from blocking the entire queue.
        // 2. Out of gas failure (data.length == 0): We revert the entire transaction. This prevents an attack
        //    where someone could drain the queue without making any deposits.
        //    We can safely assume data.length == 0 means out of gas since we only call trusted GSE contract.
        require(data.length > 0, Errors.Staking__DepositOutOfGas());
        store.stakingAsset.safeTransfer(args.withdrawer, amount);
        emit IStakingCore.FailedDeposit(
          args.attester, args.withdrawer, args.publicKeyInG1, args.publicKeyInG2, args.proofOfPossession
        );
      }
    }
    store.stakingAsset.approve(address(store.gse), 0);

    store.availableValidatorFlushes -= depositCount.toUint32();

    // If we have reached the bootstrap size, mark it as bootstrapped such that we don't re-enter it.
    if (
      !store.isBootstrapped
        && getAttesterCountAtTime(Timestamp.wrap(block.timestamp))
          >= store.queueConfig.decompress().bootstrapValidatorSetSize
    ) {
      store.isBootstrapped = true;
    }
  }

  /**
   * @notice Initiates withdrawal of a validator's stake
   * @dev Can be called by the registered withdrawer to start the exit process for a validator.
   *      Handles two cases:
   *      1. If an exit already exists (e.g. from slashing):
   *         - Only allows updating recipient if caller is withdrawer
   *         - Does not update the exit delay timer
   *      2. If no exit exists:
   *         - Requires validator has non-zero balance
   *         - Only allows registered withdrawer to initiate
   *         - Withdraws stake from GSE contract
   *         - Creates new exit with delay timer
   * @param _attester The validator address to withdraw stake for
   * @param _recipient The address that will receive the withdrawn stake
   * @return True if withdrawal was successfully initiated
   */
  function initiateWithdraw(address _attester, address _recipient) internal returns (bool) {
    require(_recipient != address(0), Errors.Staking__InvalidRecipient(_recipient));
    StakingStorage storage store = getStorage();

    if (store.exits[_attester].exists) {
      // If there is already an exit, we either started it and should revert
      // or it is because of a slash and we should update the recipient
      // Still only if we are the withdrawer
      // We DO NOT update the exitableAt
      require(!store.exits[_attester].isRecipient, Errors.Staking__NothingToExit(_attester));
      require(
        store.exits[_attester].recipientOrWithdrawer == msg.sender,
        Errors.Staking__NotWithdrawer(store.exits[_attester].recipientOrWithdrawer, msg.sender)
      );
      store.exits[_attester].recipientOrWithdrawer = _recipient;
      store.exits[_attester].isRecipient = true;

      emit IStakingCore.WithdrawInitiated(_attester, _recipient, store.exits[_attester].amount);
    } else {
      uint256 effectiveBalance = store.gse.effectiveBalanceOf(address(this), _attester);
      require(effectiveBalance > 0, Errors.Staking__NothingToExit(_attester));

      address withdrawer = store.gse.getWithdrawer(_attester);
      require(msg.sender == withdrawer, Errors.Staking__NotWithdrawer(withdrawer, msg.sender));

      (uint256 actualAmount, bool removed, uint256 withdrawalId) = store.gse.withdraw(_attester, effectiveBalance);
      require(removed, Errors.Staking__WithdrawFailed(_attester));

      store.exits[_attester] = Exit({
        withdrawalId: withdrawalId,
        amount: actualAmount,
        exitableAt: Timestamp.wrap(block.timestamp) + store.exitDelay.decompress(),
        recipientOrWithdrawer: _recipient,
        isRecipient: true,
        exists: true
      });
      emit IStakingCore.WithdrawInitiated(_attester, _recipient, actualAmount);
    }

    return true;
  }

  function updateStakingQueueConfig(StakingQueueConfig memory _config) internal {
    assertValidQueueConfig(_config);
    getStorage().queueConfig = _config.compress();
    emit IStakingCore.StakingQueueConfigUpdated(_config);
  }

  function getNextFlushableEpoch() internal view returns (Epoch) {
    return getStorage().nextFlushableEpoch.decompress();
  }

  function getEntryQueueLength() internal view returns (uint256) {
    return getStorage().entryQueue.length();
  }

  function isSlashable(address _attester) internal view returns (bool) {
    StakingStorage storage store = getStorage();
    Exit storage exit = store.exits[_attester];

    if (exit.exists) {
      return exit.exitableAt > Timestamp.wrap(block.timestamp);
    }

    uint256 effectiveBalance = store.gse.effectiveBalanceOf(address(this), _attester);
    return effectiveBalance > 0;
  }

  function getAttesterCountAtTime(Timestamp _timestamp) internal view returns (uint256) {
    return getStorage().gse.getAttesterCountAtTime(address(this), _timestamp);
  }

  function getAttesterAtIndex(uint256 _index) internal view returns (address) {
    return getStorage().gse.getAttesterFromIndexAtTime(address(this), _index, Timestamp.wrap(block.timestamp));
  }

  function getEntryQueueAt(uint256 _index) internal view returns (DepositArgs memory) {
    return getStorage().entryQueue.at(_index);
  }

  function getAttesterFromIndexAtTime(uint256 _index, Timestamp _timestamp) internal view returns (address) {
    return getStorage().gse.getAttesterFromIndexAtTime(address(this), _index, _timestamp);
  }

  function getAttestersFromIndicesAtTime(Timestamp _timestamp, uint256[] memory _indices)
    internal
    view
    returns (address[] memory)
  {
    return getStorage().gse.getAttestersFromIndicesAtTime(address(this), _timestamp, _indices);
  }

  function getExit(address _attester) internal view returns (Exit memory) {
    return getStorage().exits[_attester];
  }

  function getConfig(address _attester) internal view returns (AttesterConfig memory) {
    return getStorage().gse.getConfig(_attester);
  }

  function getAttesterView(address _attester) internal view returns (AttesterView memory) {
    return AttesterView({
      status: getStatus(_attester),
      effectiveBalance: getStorage().gse.effectiveBalanceOf(address(this), _attester),
      exit: getExit(_attester),
      config: getConfig(_attester)
    });
  }

  function getStatus(address _attester) internal view returns (Status) {
    Exit memory exit = getExit(_attester);
    uint256 effectiveBalance = getStorage().gse.effectiveBalanceOf(address(this), _attester);

    Status status;
    if (exit.exists) {
      status = exit.isRecipient ? Status.EXITING : Status.ZOMBIE;
    } else {
      status = effectiveBalance > 0 ? Status.VALIDATING : Status.NONE;
    }

    return status;
  }

  /**
   * @notice Determines the maximum number of validators that could be flushed from the entry queue if there were
   * an unlimited number of validators in the queue - this function provides a theoretical limit.
   * @dev Implements three-phase validator set management to control initial validator onboarding (called floodgates):
   *      1. Bootstrap phase: When no active validators exist, the queue must grow to the bootstrap validator set size
   *         constant from config before any validators can be flushed. This creates an initial "floodgate" that
   *         prevents small numbers of validators from activating before reaching the desired bootstrap size.
   *      2. Growth phase: Once the bootstrap size is reached, allows a large fixed batch size (bootstrapFlushSize) to
   *         be flushed at once. This enables the initial large cohort of validators to activate together.
   *      3. Normal phase: After the initial bootstrap and growth phases, returns a number proportional to the current
   *         set size for conservative steady-state growth, unless constrained by configuration (`normalFlushSizeMin`).
   *
   *      The normal-phase result is clamped to `maxQueueFlushSize` at runtime; the
   *      bootstrap-phase value is bounded by the same cap at config-acceptance time inside
   *      {assertValidQueueConfig}, so every phase respects the cap.
   *
   *      The motivation for floodgates is that the whole system starts producing checkpoints with what is considered
   *      a sufficiently decentralized set of validators.
   *
   *      Note that Governance has the ability to close the validator set for this instance by setting
   *      `normalFlushSizeMin` to zero and `normalFlushSizeQuotient` to a very high value. If this is done, this
   *      function will always return zero and no new validator can enter.
   *
   * @param _activeAttesterCount - The number of active attesters
   * @return - The maximum number of validators that could be flushed from the entry queue.
   */
  function getEntryQueueFlushSize(uint256 _activeAttesterCount) internal view returns (uint256) {
    StakingStorage storage store = getStorage();
    StakingQueueConfig memory config = store.queueConfig.decompress();

    uint256 queueSize = store.entryQueue.length();

    // Only if there is bootstrap values configured will we look into bootstrap or growth phases.
    if (config.bootstrapValidatorSetSize > 0 && !store.isBootstrapped) {
      // If bootstrap:
      if (_activeAttesterCount == 0 && queueSize < config.bootstrapValidatorSetSize) {
        return 0;
      }

      // If growth:
      if (_activeAttesterCount < config.bootstrapValidatorSetSize) {
        return config.bootstrapFlushSize;
      }
    }

    // If normal:
    return Math.min(
      Math.max(_activeAttesterCount / config.normalFlushSizeQuotient, config.normalFlushSizeMin),
      config.maxQueueFlushSize
    );
  }

  function getAvailableValidatorFlushes() internal view returns (uint256) {
    (uint256 flushes,,) = _calculateAvailableFlushes();
    return flushes;
  }

  function getCachedAvailableValidatorFlushes() internal view returns (uint256) {
    return getStorage().availableValidatorFlushes;
  }

  /// @notice Enforces invariants on a {StakingQueueConfig}.
  ///         - `normalFlushSizeMin > 0`: a zero floor can close the queue on a running rollup.
  ///         - `normalFlushSizeQuotient > 0`: {getEntryQueueFlushSize} divides by this field.
  ///         - `maxQueueFlushSize > 0`: a zero cap leaves the normal-phase queue impossible to
  ///           drain (the `Math.min(..., 0)` clamp pins every flush at zero), trapping queued
  ///           validator stake.
  ///         - `bootstrapFlushSize > 0` whenever `bootstrapValidatorSetSize > 0`: a zero
  ///           bootstrap flush size traps queued validators during bootstrap growth because the
  ///           bootstrap branch returns `bootstrapFlushSize` directly.
  ///         - `bootstrapFlushSize <= maxQueueFlushSize`: keeps {getEntryQueueFlushSize}'s
  ///           bootstrap-phase return inside the same cap that bounds the normal phase, so the
  ///           cap holds across every phase as documented.
  /// @param _config The queue config to validate; reverts when any of the above is violated.
  function assertValidQueueConfig(StakingQueueConfig memory _config) internal pure {
    require(_config.normalFlushSizeMin > 0, Errors.Staking__InvalidStakingQueueConfig());
    require(_config.normalFlushSizeQuotient > 0, Errors.Staking__InvalidNormalFlushSizeQuotient());
    require(_config.maxQueueFlushSize > 0, Errors.Staking__InvalidMaxQueueFlushSize());
    require(
      _config.bootstrapValidatorSetSize == 0 || _config.bootstrapFlushSize > 0,
      Errors.Staking__InvalidBootstrapFlushSize()
    );
    require(
      _config.bootstrapFlushSize <= _config.maxQueueFlushSize,
      Errors.Staking__BootstrapFlushSizeAboveMax(_config.bootstrapFlushSize, _config.maxQueueFlushSize)
    );
  }

  function getStorage() internal pure returns (StakingStorage storage storageStruct) {
    bytes32 position = STAKING_SLOT;
    assembly {
      storageStruct.slot := position
    }
  }

  /// @notice Whether `_caller` can call {slash}.
  /// @dev The active slasher always qualifies. The legacy slasher qualifies only while its
  ///      drain window is still open, so quorum-backed rounds queued before a rotation can
  ///      still execute against the rollup even though the active slasher has moved on.
  function _isAuthorizedSlasher(StakingStorage storage _store, address _caller) private view returns (bool) {
    if (_caller == _store.slasher) {
      return true;
    }
    address legacy = _store.legacySlasher;
    if (legacy == address(0) || _caller != legacy) {
      return false;
    }
    return Timestamp.wrap(block.timestamp) <= _store.legacySlasherAuthorizedUntil.decompress();
  }

  function _calculateAvailableFlushes()
    private
    view
    returns (uint256 flushes, Epoch currentEpoch, bool shouldUpdateState)
  {
    StakingStorage storage store = getStorage();
    currentEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));

    if (store.nextFlushableEpoch.decompress() > currentEpoch) {
      return (store.availableValidatorFlushes, currentEpoch, false);
    }

    uint256 activeAttesterCount = getAttesterCountAtTime(Timestamp.wrap(block.timestamp));
    uint256 newFlushes = getEntryQueueFlushSize(activeAttesterCount);

    return (newFlushes, currentEpoch, true);
  }
}
