// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {User, UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";

struct DelegationData {
  mapping(address attester => uint256 balance) balanceOf;
  mapping(address attester => address delegatee) delegatee;
  mapping(address delegatee => User) votingPower;
  User supply;
}

// This library have a lot of overlap with `Votes.sol` from Openzeppelin,
// It mainly differs as it is a library to allow us having many accountings in the same contract
// and the unit of time
library DelegationLib {
  using UserLib for User;

  event DelegateChanged(address indexed attester, address oldDelegatee, address newDelegatee);
  event DelegateVotesChanged(address indexed delegatee, uint256 oldValue, uint256 newValue);

  function increaseBalance(DelegationData storage _self, address _attester, uint256 _amount)
    internal
  {
    _self.balanceOf[_attester] += _amount;
    _self.supply.add(_amount);
  }

  function decreaseBalance(DelegationData storage _self, address _attester, uint256 _amount)
    internal
  {
    _self.balanceOf[_attester] -= _amount;
    _self.supply.sub(_amount);
  }

  function getSupply(DelegationData storage _self) internal view returns (uint256) {
    return _self.supply.powerNow();
  }
}
