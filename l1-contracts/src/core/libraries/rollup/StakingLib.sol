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
import {Governance} from "@aztec/governance/Governance.sol";
import {GSE, AttesterConfig} from "@aztec/governance/GSE.sol";
import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {
  CompressedTimeMath, CompressedTimestamp
} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// None -> Does not exist in our setup
// Validating -> Participating as validator
// Zombie -> Not participating as validator, but have funds in setup,
// 			 hit if slashes and going below the minimum
// Exiting -> In the process of exiting the system
enum Status {
  NONE,
  VALIDATING,
  ZOMBIE,
  EXITING
}

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
  GSE gse;
  CompressedTimestamp exitDelay;
  mapping(address attester => Exit) exits;
  CompressedStakingQueueConfig queueConfig;
  StakingQueue entryQueue;
  Epoch nextFlushableEpoch;
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

  bytes32 private constant STAKING_SLOT = keccak256("aztec.core.staking.storage");

  function initialize(
    IERC20 _stakingAsset,
    GSE _gse,
    Timestamp _exitDelay,
    address _slasher,
    StakingQueueConfig memory _config
  ) internal {
    StakingStorage storage store = getStorage();
    store.stakingAsset = _stakingAsset;
    store.gse = _gse;
    store.exitDelay = _exitDelay.compress();
    store.slasher = _slasher;
    store.queueConfig = _config.compress();
    store.entryQueue.init();
  }

  function setSlasher(address _slasher) internal {
    StakingStorage storage store = getStorage();

    address oldSlasher = store.slasher;
    store.slasher = _slasher;

    emit IStakingCore.SlasherUpdated(oldSlasher, _slasher);
  }

  function vote(uint256 _proposalId) internal {
    StakingStorage storage store = getStorage();
    Governance gov = store.gse.getGovernance();

    // We will vote if:
    // 1. We are the canonical instance as seen be my the governance proposer
    // 2. We are the actor that was canonical when the proposal was made in the governance proposer
    // 3. The proposer in the governance is the governance proposer.
    // This means that if we only vote if canonical and on our own proposals (assuming that the governance
    // proposer don't lie to us).

    GovernanceProposer govProposer = GovernanceProposer(gov.governanceProposer());
    require(address(this) == govProposer.getInstance(), Errors.Staking__NotCanonical(address(this)));
    address proposalProposer = govProposer.getProposalProposer(_proposalId);
    require(
      address(this) == proposalProposer,
      Errors.Staking__NotOurProposal(_proposalId, address(this), proposalProposer)
    );
    Proposal memory proposal = gov.getProposal(_proposalId);
    require(
      proposal.proposer == address(govProposer), Errors.Staking__IncorrectGovProposer(_proposalId)
    );

    Timestamp ts = proposal.pendingThroughMemory();

    // Cast votes will all our power
    uint256 vp = store.gse.getVotingPowerAt(address(this), ts);
    store.gse.vote(_proposalId, vp, true);

    // If we are the canonical at the time of the proposal we also cast those votes.
    if (store.gse.getLatestRollupAt(ts) == address(this)) {
      address bonusInstance = store.gse.getBonusInstanceAddress();
      vp = store.gse.getVotingPowerAt(bonusInstance, ts);
      store.gse.voteWithBonus(_proposalId, vp, true);
    }
  }

  function finaliseWithdraw(address _attester) internal {
    StakingStorage storage store = getStorage();
    // We load it into memory to cache it, as we will delete it before we use it.
    Exit memory exit = store.exits[_attester];
    require(exit.exists, Errors.Staking__NotExiting(_attester));
    require(exit.isRecipient, Errors.Staking__NotExiting(_attester));
    require(
      exit.exitableAt <= Timestamp.wrap(block.timestamp),
      Errors.Staking__WithdrawalNotUnlockedYet(Timestamp.wrap(block.timestamp), exit.exitableAt)
    );

    delete store.exits[_attester];

    store.gse.finaliseHelper(exit.withdrawalId);
    store.stakingAsset.transfer(exit.recipientOrWithdrawer, exit.amount);

    emit IStakingCore.WithdrawFinalised(_attester, exit.recipientOrWithdrawer, exit.amount);
  }

  function trySlash(address _attester, uint256 _amount) internal returns (bool) {
    if (!isSlashable(_attester)) {
      return false;
    }
    slash(_attester, _amount);
    return true;
  }

  function slash(address _attester, uint256 _amount) internal {
    StakingStorage storage store = getStorage();
    require(msg.sender == store.slasher, Errors.Staking__NotSlasher(store.slasher, msg.sender));

    Exit storage exit = store.exits[_attester];

    if (exit.exists) {
      require(
        exit.exitableAt > Timestamp.wrap(block.timestamp),
        Errors.Staking__CannotSlashExitedStake(_attester)
      );

      // If the slash amount is greater than the exit amount, bound it to the exit amount
      uint256 slashAmount = Math.min(_amount, exit.amount);

      if (exit.amount == slashAmount) {
        // If we slashes the entire thing, nuke it entirely
        delete store.exits[_attester];
      } else {
        exit.amount -= slashAmount;
      }

      emit IStakingCore.Slashed(_attester, slashAmount);
    } else {
      (address withdrawer, bool attesterExists,) = store.gse.getWithdrawer(address(this), _attester);
      require(attesterExists, Errors.Staking__NoOneToSlash(_attester));

      // Get the effective balance of the attester
      uint256 effectiveBalance = store.gse.effectiveBalanceOf(address(this), _attester);

      // If the slash amount is greater than the effective balance, bound it to the effective balance
      uint256 slashAmount = Math.min(_amount, effectiveBalance);

      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) =
        store.gse.withdraw(_attester, slashAmount);

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

  function deposit(address _attester, address _withdrawer, bool _onCanonical) internal {
    require(
      _attester != address(0) && _withdrawer != address(0),
      Errors.Staking__InvalidDeposit(_attester, _withdrawer)
    );
    StakingStorage storage store = getStorage();
    // We don't allow deposits, if we are currently exiting.
    require(!store.exits[_attester].exists, Errors.Staking__AlreadyExiting(_attester));
    uint256 amount = store.gse.DEPOSIT_AMOUNT();

    store.stakingAsset.transferFrom(msg.sender, address(this), amount);
    store.entryQueue.enqueue(_attester, _withdrawer, _onCanonical);
    emit IStakingCore.ValidatorQueued(_attester, _withdrawer);
  }

  function flushEntryQueue(uint256 _maxAddableValidators) internal {
    if (_maxAddableValidators == 0) {
      return;
    }

    Epoch currentEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));
    StakingStorage storage store = getStorage();
    require(
      store.nextFlushableEpoch <= currentEpoch, Errors.Staking__QueueAlreadyFlushed(currentEpoch)
    );
    store.nextFlushableEpoch = currentEpoch + Epoch.wrap(1);
    uint256 amount = store.gse.DEPOSIT_AMOUNT();

    uint256 queueLength = store.entryQueue.length();
    uint256 numToDequeue = Math.min(_maxAddableValidators, queueLength);
    store.stakingAsset.approve(address(store.gse), amount * numToDequeue);
    for (uint256 i = 0; i < numToDequeue; i++) {
      DepositArgs memory args = store.entryQueue.dequeue();
      (bool success, bytes memory data) = address(store.gse).call(
        abi.encodeWithSelector(
          IStakingCore.deposit.selector, args.attester, args.withdrawer, args.onCanonical
        )
      );
      if (success) {
        emit IStakingCore.Deposit(args.attester, args.withdrawer, amount);
      } else {
        // If the deposit fails, we generally ignore it, since we need to continue dequeuing to prevent DoS.
        // However, if the data is empty, we can assume that the deposit failed due to out of gas, since
        // we are only calling trusted contracts as part of gse.deposit.
        // When this happens, we need to revert the whole transaction, else it is possible to
        // empty the queue without making any deposits: e.g. the deposit always runs OOG, but
        // we have enough gas to refund/dequeue.
        require(data.length > 0, Errors.Staking__DepositOutOfGas());
        store.stakingAsset.transfer(args.withdrawer, amount);
        emit IStakingCore.FailedDeposit(args.attester, args.withdrawer);
      }
    }
    store.stakingAsset.approve(address(store.gse), 0);
  }

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
      (address withdrawer, bool attesterExists,) = store.gse.getWithdrawer(address(this), _attester);
      require(attesterExists, Errors.Staking__NothingToExit(_attester));
      require(msg.sender == withdrawer, Errors.Staking__NotWithdrawer(withdrawer, msg.sender));

      uint256 amount = store.gse.effectiveBalanceOf(address(this), _attester);
      (uint256 actualAmount, bool removed, uint256 withdrawalId) =
        store.gse.withdraw(_attester, amount);
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
    getStorage().queueConfig = _config.compress();
    emit IStakingCore.StakingQueueConfigUpdated(_config);
  }

  function getNextFlushableEpoch() internal view returns (Epoch) {
    return getStorage().nextFlushableEpoch;
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

    (, bool attesterExists,) = store.gse.getWithdrawer(address(this), _attester);
    return attesterExists;
  }

  function getAttesterCountAtTime(Timestamp _timestamp) internal view returns (uint256) {
    return getStorage().gse.getAttesterCountAtTime(address(this), _timestamp);
  }

  function getAttestersAtTime(Timestamp _timestamp) internal view returns (address[] memory) {
    return getStorage().gse.getAttestersAtTime(address(this), _timestamp);
  }

  function getAttesterAtIndex(uint256 _index) internal view returns (address) {
    return getStorage().gse.getAttesterFromIndexAtTime(
      address(this), _index, Timestamp.wrap(block.timestamp)
    );
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
    return getStorage().gse.getConfig(address(this), _attester);
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
   * @notice Determines the maximum number of validators that can be flushed from the entry queue
   * @dev Implements three-phase validator set management:
   *      1. Bootstrap phase: When no validators exist, the queue must grow to the bootstrap validator set size
   *      2. Growth phase: When validators are below target size, adds a large fixed batch size
   *      3. Normal phase: When at target size, adds proportional amount based on current set size
   *
   *      All phases are subject to a hard cap of `MAX_QUEUE_FLUSH_SIZE`.
   * @return - The maximum number of validators that can be flushed from the entry queue
   */
  function getEntryQueueFlushSize() internal view returns (uint256) {
    StakingStorage storage store = getStorage();
    StakingQueueConfig memory config = store.queueConfig.decompress();

    uint256 activeAttesterCount = getAttesterCountAtTime(Timestamp.wrap(block.timestamp));
    uint256 queueSize = store.entryQueue.length();

    // Only if there is bootstrap values configured will we look into boostrap or growth phases.
    if (config.bootstrapValidatorSetSize > 0) {
      // If bootstrap:
      if (activeAttesterCount == 0 && queueSize < config.bootstrapValidatorSetSize) {
        return 0;
      }

      // If growth:
      if (activeAttesterCount < config.bootstrapValidatorSetSize) {
        return Math.min(config.bootstrapFlushSize, StakingQueueLib.MAX_QUEUE_FLUSH_SIZE);
      }
    }

    return Math.min(
      Math.max(activeAttesterCount / config.normalFlushSizeQuotient, config.normalFlushSizeMin),
      StakingQueueLib.MAX_QUEUE_FLUSH_SIZE
    );
  }

  function getStorage() internal pure returns (StakingStorage storage storageStruct) {
    bytes32 position = STAKING_SLOT;
    assembly {
      storageStruct.slot := position
    }
  }
}
