// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Checkpoints, CheckpointedUintLib} from "@aztec/governance/libraries/CheckpointedUintLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

// A struct storing balance and delegatee for an attester
struct DepositPosition {
  uint256 balance;
  address delegatee;
}

// A struct storing all the positions for an instance along with a supply
struct DepositLedger {
  mapping(address attester => DepositPosition position) positions;
  Checkpoints.Trace224 supply;
}

// A struct storing the voting power used for each proposal for a delegatee
// as well as their checkpointed voting power
struct VotingAccount {
  mapping(uint256 proposalId => uint256 powerUsed) powerUsed;
  Checkpoints.Trace224 votingPower;
}

// A struct storing the ledgers for the individual rollup instances, the voting
// account for delegatees and the total supply.
struct DepositAndDelegationAccounting {
  mapping(address instance => DepositLedger ledger) ledgers;
  mapping(address delegatee => VotingAccount votingAccount) votingAccounts;
  Checkpoints.Trace224 supply;
}

// This library have a lot of overlap with `Votes.sol` from Openzeppelin,
// It mainly differs as it is a library to allow us having many accountings in the same contract
// the unit of time and allowing multiple uses of power.
library DepositDelegationLib {
  using CheckpointedUintLib for Checkpoints.Trace224;

  event DelegateChanged(address indexed attester, address oldDelegatee, address newDelegatee);
  event DelegateVotesChanged(address indexed delegatee, uint256 oldValue, uint256 newValue);

  function increaseBalance(
    DepositAndDelegationAccounting storage _self,
    address _instance,
    address _attester,
    uint256 _amount
  ) internal {
    if (_amount == 0) {
      return;
    }

    DepositLedger storage instance = _self.ledgers[_instance];

    instance.positions[_attester].balance += _amount;
    moveVotingPower(_self, address(0), instance.positions[_attester].delegatee, _amount);

    instance.supply.add(_amount);
    _self.supply.add(_amount);
  }

  function decreaseBalance(
    DepositAndDelegationAccounting storage _self,
    address _instance,
    address _attester,
    uint256 _amount
  ) internal {
    if (_amount == 0) {
      return;
    }

    DepositLedger storage instance = _self.ledgers[_instance];

    instance.positions[_attester].balance -= _amount;
    moveVotingPower(_self, instance.positions[_attester].delegatee, address(0), _amount);

    instance.supply.sub(_amount);
    _self.supply.sub(_amount);
  }

  /**
   * @notice    Use `_amount` of `_delegatee`'s voting power on `_proposalId`
   *            The `_delegatee`'s voting power based on the snapshot at `_timestamp`
   *
   * @dev       If different timestamps are passed, it can cause mismatch in the amount of
   *            power that can be voted with, so it is very important that it is stable for
   *            a given `_proposalId`
   *
   * @param _self       - The DelegationDate struct to modify in storage
   * @param _delegatee  - The delegatee using their power
   * @param _proposalId - The id to use for accounting
   * @param _timestamp  - The timestamp for voting power of the specific `_proposalId`
   * @param _amount     - The amount of power to use
   */
  function usePower(
    DepositAndDelegationAccounting storage _self,
    address _delegatee,
    uint256 _proposalId,
    Timestamp _timestamp,
    uint256 _amount
  ) internal {
    uint256 powerAt = getVotingPowerAt(_self, _delegatee, _timestamp);
    uint256 powerUsed = getPowerUsed(_self, _delegatee, _proposalId);

    require(
      powerAt >= powerUsed + _amount, Errors.Delegation__InsufficientPower(_delegatee, powerAt, powerUsed + _amount)
    );

    _self.votingAccounts[_delegatee].powerUsed[_proposalId] += _amount;
  }

  function delegate(
    DepositAndDelegationAccounting storage _self,
    address _instance,
    address _attester,
    address _delegatee
  ) internal {
    address oldDelegate = getDelegatee(_self, _instance, _attester);
    if (oldDelegate == _delegatee) {
      return;
    }
    _self.ledgers[_instance].positions[_attester].delegatee = _delegatee;
    emit DelegateChanged(_attester, oldDelegate, _delegatee);

    moveVotingPower(_self, oldDelegate, _delegatee, getBalanceOf(_self, _instance, _attester));
  }

  function undelegate(DepositAndDelegationAccounting storage _self, address _instance, address _attester) internal {
    delegate(_self, _instance, _attester, address(0));
  }

  function getBalanceOf(DepositAndDelegationAccounting storage _self, address _instance, address _attester)
    internal
    view
    returns (uint256)
  {
    return _self.ledgers[_instance].positions[_attester].balance;
  }

  function getSupplyOf(DepositAndDelegationAccounting storage _self, address _instance) internal view returns (uint256) {
    return _self.ledgers[_instance].supply.valueNow();
  }

  function getSupply(DepositAndDelegationAccounting storage _self) internal view returns (uint256) {
    return _self.supply.valueNow();
  }

  function getDelegatee(DepositAndDelegationAccounting storage _self, address _instance, address _attester)
    internal
    view
    returns (address)
  {
    return _self.ledgers[_instance].positions[_attester].delegatee;
  }

  function getVotingPower(DepositAndDelegationAccounting storage _self, address _delegatee)
    internal
    view
    returns (uint256)
  {
    return _self.votingAccounts[_delegatee].votingPower.valueNow();
  }

  function getVotingPowerAt(DepositAndDelegationAccounting storage _self, address _delegatee, Timestamp _timestamp)
    internal
    view
    returns (uint256)
  {
    return _self.votingAccounts[_delegatee].votingPower.valueAt(_timestamp);
  }

  function getPowerUsed(DepositAndDelegationAccounting storage _self, address _delegatee, uint256 _proposalId)
    internal
    view
    returns (uint256)
  {
    return _self.votingAccounts[_delegatee].powerUsed[_proposalId];
  }

  function moveVotingPower(DepositAndDelegationAccounting storage _self, address _from, address _to, uint256 _amount)
    private
  {
    if (_from == _to || _amount == 0) {
      return;
    }

    if (_from != address(0)) {
      (uint256 oldValue, uint256 newValue) = _self.votingAccounts[_from].votingPower.sub(_amount);
      emit DelegateVotesChanged(_from, oldValue, newValue);
    }

    if (_to != address(0)) {
      (uint256 oldValue, uint256 newValue) = _self.votingAccounts[_to].votingPower.add(_amount);
      emit DelegateVotesChanged(_to, oldValue, newValue);
    }
  }
}
