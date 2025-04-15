// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  Status,
  ValidatorInfo,
  Exit,
  Timestamp,
  StakingStorage,
  IStakingCore
} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

library StakingLib {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.AddressSet;

  bytes32 private constant STAKING_SLOT = keccak256("aztec.core.staking.storage");

  function initialize(
    IERC20 _stakingAsset,
    uint256 _minimumStake,
    Timestamp _exitDelay,
    address _slasher
  ) internal {
    StakingStorage storage store = getStorage();
    store.stakingAsset = _stakingAsset;
    store.minimumStake = _minimumStake;
    store.exitDelay = _exitDelay;
    store.slasher = _slasher;
  }

  function finaliseWithdraw(address _attester) internal {
    StakingStorage storage store = getStorage();
    ValidatorInfo storage validator = store.info[_attester];
    require(validator.status == Status.EXITING, Errors.Staking__NotExiting(_attester));

    Exit storage exit = store.exits[_attester];
    require(
      exit.exitableAt <= Timestamp.wrap(block.timestamp),
      Errors.Staking__WithdrawalNotUnlockedYet(Timestamp.wrap(block.timestamp), exit.exitableAt)
    );

    uint256 amount = validator.stake;
    address recipient = exit.recipient;

    delete store.exits[_attester];
    delete store.info[_attester];

    store.stakingAsset.transfer(recipient, amount);

    emit IStakingCore.WithdrawFinalised(_attester, recipient, amount);
  }

  function slash(address _attester, uint256 _amount) internal {
    StakingStorage storage store = getStorage();
    require(msg.sender == store.slasher, Errors.Staking__NotSlasher(store.slasher, msg.sender));

    ValidatorInfo storage validator = store.info[_attester];
    require(validator.status != Status.NONE, Errors.Staking__NoOneToSlash(_attester));

    // There is a special, case, if exiting and past the limit, it is untouchable!
    require(
      !(
        validator.status == Status.EXITING
          && store.exits[_attester].exitableAt <= Timestamp.wrap(block.timestamp)
      ),
      Errors.Staking__CannotSlashExitedStake(_attester)
    );
    validator.stake -= _amount;

    // If the attester was validating AND is slashed below the MINIMUM_STAKE we update him to LIVING
    // When LIVING, he can only start exiting, we don't "really" exit him, because that cost
    // gas and cost edge cases around recipient, so lets just avoid that.
    if (validator.status == Status.VALIDATING && validator.stake < store.minimumStake) {
      require(store.attesters.remove(_attester), Errors.Staking__FailedToRemove(_attester));
      validator.status = Status.LIVING;
    }

    emit IStakingCore.Slashed(_attester, _amount);
  }

  function deposit(address _attester, address _proposer, address _withdrawer, uint256 _amount)
    internal
  {
    require(
      _attester != address(0) && _proposer != address(0),
      Errors.Staking__InvalidDeposit(_attester, _proposer)
    );
    StakingStorage storage store = getStorage();
    require(
      _amount >= store.minimumStake, Errors.Staking__InsufficientStake(_amount, store.minimumStake)
    );
    store.stakingAsset.transferFrom(msg.sender, address(this), _amount);
    require(
      store.info[_attester].status == Status.NONE, Errors.Staking__AlreadyRegistered(_attester)
    );
    require(store.attesters.add(_attester), Errors.Staking__AlreadyActive(_attester));

    // If BLS, need to check possession of private key to avoid attacks.

    store.info[_attester] = ValidatorInfo({
      stake: _amount,
      withdrawer: _withdrawer,
      proposer: _proposer,
      status: Status.VALIDATING
    });

    emit IStakingCore.Deposit(_attester, _proposer, _withdrawer, _amount);
  }

  function initiateWithdraw(address _attester, address _recipient) internal returns (bool) {
    StakingStorage storage store = getStorage();
    ValidatorInfo storage validator = store.info[_attester];

    require(
      msg.sender == validator.withdrawer,
      Errors.Staking__NotWithdrawer(validator.withdrawer, msg.sender)
    );
    require(
      validator.status == Status.VALIDATING || validator.status == Status.LIVING,
      Errors.Staking__NothingToExit(_attester)
    );
    if (validator.status == Status.VALIDATING) {
      require(store.attesters.remove(_attester), Errors.Staking__FailedToRemove(_attester));
    }

    // Note that the "amount" is not stored here, but reusing the `validators`
    // We always exit fully.
    // @note The attester might be chosen for the epoch, so the delay must be long enough
    //       to allow for that.
    store.exits[_attester] =
      Exit({exitableAt: Timestamp.wrap(block.timestamp) + store.exitDelay, recipient: _recipient});
    validator.status = Status.EXITING;

    emit IStakingCore.WithdrawInitiated(_attester, _recipient, validator.stake);

    return true;
  }

  function getStorage() internal pure returns (StakingStorage storage storageStruct) {
    bytes32 position = STAKING_SLOT;
    assembly {
      storageStruct.slot := position
    }
  }
}
