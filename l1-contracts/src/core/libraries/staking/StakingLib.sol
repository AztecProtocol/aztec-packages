// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {GSE, AttesterConfig} from "@aztec/core/staking/GSE.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// None -> Does not exist in our setup
// Validating -> Participating as validator
// Living -> Not participating as validator, but have funds in setup,
// 			 hit if slashes and going below the minimum
// Exiting -> In the process of exiting the system
enum Status {
  NONE,
  VALIDATING,
  LIVING,
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
  Timestamp exitDelay;
  mapping(address attester => Exit) exits;
}

library StakingLib {
  using SafeCast for uint256;
  using SafeERC20 for IERC20;
  using AddressSnapshotLib for SnapshottedAddressSet;
  using ProposalLib for DataStructures.Proposal;

  bytes32 private constant STAKING_SLOT = keccak256("aztec.core.staking.storage");

  function initialize(IERC20 _stakingAsset, GSE _gse, Timestamp _exitDelay, address _slasher)
    internal
  {
    StakingStorage storage store = getStorage();
    store.stakingAsset = _stakingAsset;
    store.gse = _gse;
    store.exitDelay = _exitDelay;
    store.slasher = _slasher;
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

    // We need to check if we made the proposal. We are assuming an honest gov, because if dishonest
    // this vote don't matter anyway.
    // We must be the current canonical instance. Because we only want to vote on our own proposals.
    GovernanceProposer govProposer = GovernanceProposer(gov.governanceProposer());
    require(address(this) == govProposer.getInstance(), Errors.Staking__NotCanonical(address(this)));
    require(
      address(this) == govProposer.getProposalProposer(_proposalId),
      Errors.Staking__NotOurProposal(_proposalId)
    );
    DataStructures.Proposal memory proposal = gov.getProposal(_proposalId);
    require(proposal.proposer == address(govProposer), Errors.Staking__NotOurProposal(_proposalId));

    Timestamp ts = proposal.pendingThroughMemory();

    // Cast votes will all our power
    uint256 vp = store.gse.getVotingPowerAt(address(this), ts);
    store.gse.vote(_proposalId, vp, true);

    // If we are the canonical at the time of the proposal we also cast those votes.
    if (store.gse.getCanonicalAt(ts) == address(this)) {
      address magic = store.gse.CANONICAL_MAGIC_ADDRESS();
      vp = store.gse.getVotingPowerAt(magic, ts);
      store.gse.voteWithCanonical(_proposalId, vp, true);
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

  function slash(address _attester, uint256 _amount) internal {
    StakingStorage storage store = getStorage();
    require(msg.sender == store.slasher, Errors.Staking__NotSlasher(store.slasher, msg.sender));

    Exit storage exit = store.exits[_attester];

    if (exit.exists) {
      require(
        exit.exitableAt > Timestamp.wrap(block.timestamp),
        Errors.Staking__CannotSlashExitedStake(_attester)
      );

      if (exit.amount == _amount) {
        // If we slashes the entire thing, nuke it entirely
        delete store.exits[_attester];
      } else {
        exit.amount -= _amount;
      }
    } else {
      (address withdrawer, bool attesterExists,) = store.gse.getWithdrawer(address(this), _attester);
      require(attesterExists, Errors.Staking__NoOneToSlash(_attester));

      (uint256 amountWithdrawn, bool isRemoved, uint256 withdrawalId) =
        store.gse.withdraw(_attester, _amount);

      uint256 toUser = amountWithdrawn - _amount;
      if (isRemoved && toUser > 0) {
        // Only if we remove the attester AND there is something left will we create an exit
        store.exits[_attester] = Exit({
          withdrawalId: withdrawalId,
          amount: toUser,
          exitableAt: Timestamp.wrap(block.timestamp) + store.exitDelay,
          recipientOrWithdrawer: withdrawer,
          isRecipient: false,
          exists: true
        });
      }
    }

    emit IStakingCore.Slashed(_attester, _amount);
  }

  function deposit(address _attester, address _withdrawer, bool _onCanonical) internal {
    require(
      _attester != address(0) && _withdrawer != address(0),
      Errors.Staking__InvalidDeposit(_attester, _withdrawer)
    );
    StakingStorage storage store = getStorage();
    // We don't allow deposits, if we are currently exiting.
    require(!store.exits[_attester].exists, Errors.Staking__AlreadyExiting(_attester));
    uint256 amount = store.gse.MINIMUM_DEPOSIT();

    store.stakingAsset.transferFrom(msg.sender, address(this), amount);
    store.stakingAsset.approve(address(store.gse), amount);
    store.gse.deposit(_attester, _withdrawer, _onCanonical);
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
        exitableAt: Timestamp.wrap(block.timestamp) + store.exitDelay,
        recipientOrWithdrawer: _recipient,
        isRecipient: true,
        exists: true
      });
      emit IStakingCore.WithdrawInitiated(_attester, _recipient, actualAmount);
    }

    return true;
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
      status = exit.isRecipient ? Status.EXITING : Status.LIVING;
    } else {
      status = effectiveBalance > 0 ? Status.VALIDATING : Status.NONE;
    }

    return status;
  }

  function getStorage() internal pure returns (StakingStorage storage storageStruct) {
    bytes32 position = STAKING_SLOT;
    assembly {
      storageStruct.slot := position
    }
  }
}
