// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {User, UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

struct AttesterDelegationData {
  uint256 balance;
  address delegatee;
}

struct InstanceDelegationData {
  mapping(address attester => AttesterDelegationData attesterData) attesterData;
  User supply;
}

struct DelegateeData {
  mapping(uint256 proposalId => uint256 powerUsed) powerUsed;
  User votingPower;
}

struct DelegationData {
  mapping(address instance => InstanceDelegationData instanceData) instanceData;
  mapping(address delegatee => DelegateeData delegateeData) delegateeData;
  User supply;
}

// @todo Need to figure out a better naming here. It is not just delegation, it is a lib to deal with
// all of the token value stuff really.

// This library have a lot of overlap with `Votes.sol` from Openzeppelin,
// It mainly differs as it is a library to allow us having many accountings in the same contract
// and the unit of time
library DelegationLib {
  using UserLib for User;

  event DelegateChanged(address indexed attester, address oldDelegatee, address newDelegatee);
  event DelegateVotesChanged(address indexed delegatee, uint256 oldValue, uint256 newValue);

  function increaseBalance(
    DelegationData storage _self,
    address _instance,
    address _attester,
    uint256 _amount
  ) internal {
    InstanceDelegationData storage instance = _self.instanceData[_instance];

    instance.attesterData[_attester].balance += _amount;
    moveVotingPower(_self, address(0), instance.attesterData[_attester].delegatee, _amount);

    instance.supply.add(_amount);
    _self.supply.add(_amount);
  }

  function decreaseBalance(
    DelegationData storage _self,
    address _instance,
    address _attester,
    uint256 _amount
  ) internal {
    InstanceDelegationData storage instance = _self.instanceData[_instance];

    instance.attesterData[_attester].balance -= _amount;
    moveVotingPower(_self, instance.attesterData[_attester].delegatee, address(0), _amount);

    instance.supply.sub(_amount);
    _self.supply.sub(_amount);
  }

  /**
   * @notice    Use power on a specific proposal and use its time as balance
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
    DelegationData storage _self,
    address _delegatee,
    uint256 _proposalId,
    Timestamp _timestamp,
    uint256 _amount
  ) internal {
    uint256 powerAt = getVotingPowerAt(_self, _delegatee, _timestamp);
    uint256 powerUsed = getPowerUsed(_self, _delegatee, _proposalId);

    require(
      powerAt >= powerUsed + _amount,
      Errors.Delegation__InsufficientPower(_delegatee, powerAt, powerUsed + _amount)
    );

    _self.delegateeData[_delegatee].powerUsed[_proposalId] += _amount;
  }

  function delegate(
    DelegationData storage _self,
    address _instance,
    address _attester,
    address _delegatee
  ) internal {
    address oldDelegate = getDelegatee(_self, _instance, _attester);
    if (oldDelegate == _delegatee) {
      return;
    }
    _self.instanceData[_instance].attesterData[_attester].delegatee = _delegatee;
    emit DelegateChanged(_attester, oldDelegate, _delegatee);

    moveVotingPower(_self, oldDelegate, _delegatee, getBalanceOf(_self, _instance, _attester));
  }

  function moveVotingPower(
    DelegationData storage _self,
    address _from,
    address _to,
    uint256 _amount
  ) internal {
    if (_from == _to || _amount == 0) {
      return;
    }

    if (_from != address(0)) {
      (uint256 oldValue, uint256 newValue) = _self.delegateeData[_from].votingPower.sub(_amount);
      emit DelegateVotesChanged(_from, oldValue, newValue);
    }

    if (_to != address(0)) {
      (uint256 oldValue, uint256 newValue) = _self.delegateeData[_to].votingPower.add(_amount);
      emit DelegateVotesChanged(_to, oldValue, newValue);
    }
  }

  function getBalanceOf(DelegationData storage _self, address _instance, address _attester)
    internal
    view
    returns (uint256)
  {
    return _self.instanceData[_instance].attesterData[_attester].balance;
  }

  function getSupplyOf(DelegationData storage _self, address _instance)
    internal
    view
    returns (uint256)
  {
    return _self.instanceData[_instance].supply.powerNow();
  }

  function getSupply(DelegationData storage _self) internal view returns (uint256) {
    return _self.supply.powerNow();
  }

  function getDelegatee(DelegationData storage _self, address _instance, address _attester)
    internal
    view
    returns (address)
  {
    return _self.instanceData[_instance].attesterData[_attester].delegatee;
  }

  function getVotingPower(DelegationData storage _self, address _delegatee)
    internal
    view
    returns (uint256)
  {
    return _self.delegateeData[_delegatee].votingPower.powerNow();
  }

  function getVotingPowerAt(DelegationData storage _self, address _delegatee, Timestamp _timestamp)
    internal
    view
    returns (uint256)
  {
    return _self.delegateeData[_delegatee].votingPower.powerAt(_timestamp);
  }

  function getPowerUsed(DelegationData storage _self, address _delegatee, uint256 _proposalId)
    internal
    view
    returns (uint256)
  {
    return _self.delegateeData[_delegatee].powerUsed[_proposalId];
  }
}
