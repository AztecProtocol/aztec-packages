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

      (uint256 amountWithdrawn, bool isRemoved) = store.gse.withdraw(_attester, _amount);

      if (isRemoved) {
        uint256 toUser = amountWithdrawn - _amount;
        store.exits[_attester] = Exit({
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

  function deposit(address _attester, address _proposer, address _withdrawer, bool _onCanonical)
    internal
  {
    require(
      _attester != address(0) && _proposer != address(0),
      Errors.Staking__InvalidDeposit(_attester, _proposer)
    );
    StakingStorage storage store = getStorage();
    require(!store.exits[_attester].exists, Errors.Staking__AlreadyRegistered(_attester));
    require(
      !store.gse.isRegistered(address(this), _attester), Errors.Staking__AlreadyActive(_attester)
    );
    uint256 amount = store.gse.MINIMUM_DEPOSIT();

    store.stakingAsset.transferFrom(msg.sender, address(this), amount);
    store.stakingAsset.approve(address(store.gse), amount);
    store.gse.deposit(_attester, _proposer, _withdrawer, _onCanonical);
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

      uint256 amount = store.gse.balanceOf(address(this), _attester);
      (uint256 actualAmount, bool removed) = store.gse.withdraw(_attester, amount);
      require(removed, Errors.Staking__WithdrawFailed(_attester));

      store.exits[_attester] = Exit({
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

  function getProposerForAttester(address _attester) internal view returns (address) {
    (address proposer,,) = getStorage().gse.getProposer(address(this), _attester);
    return proposer;
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
      effectiveBalance: getStorage().gse.balanceOf(address(this), _attester),
      exit: getExit(_attester),
      config: getConfig(_attester)
    });
  }

  function getStatus(address _attester) internal view returns (Status) {
    Exit memory exit = getExit(_attester);
    uint256 effectiveBalance = getStorage().gse.balanceOf(address(this), _attester);

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
