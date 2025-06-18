// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DelegationLib, DelegationData} from "@aztec/governance/libraries/DelegationLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

contract DelegationLibWrapper {
  using DelegationLib for DelegationData;

  DelegationData internal self;

  function increaseBalance(address _instance, address _attester, uint256 _amount) external {
    self.increaseBalance(_instance, _attester, _amount);
  }

  function decreaseBalance(address _instance, address _attester, uint256 _amount) external {
    self.decreaseBalance(_instance, _attester, _amount);
  }

  function delegate(address _instance, address _attester, address _newDelegatee) external {
    self.delegate(_instance, _attester, _newDelegatee);
  }

  function usePower(address _delegatee, uint256 _proposalId, Timestamp _timestamp, uint256 _amount)
    external
  {
    self.usePower(_delegatee, _proposalId, _timestamp, _amount);
  }

  function getBalanceOf(address _instance, address _attester) external view returns (uint256) {
    return self.getBalanceOf(_instance, _attester);
  }

  function getSupplyOf(address _instance) external view returns (uint256) {
    return self.getSupplyOf(_instance);
  }

  function getSupply() external view returns (uint256) {
    return self.getSupply();
  }

  function getDelegatee(address _instance, address _attester) external view returns (address) {
    return self.getDelegatee(_instance, _attester);
  }

  function getPowerUsed(address _delegatee, uint256 _proposalId) external view returns (uint256) {
    return self.getPowerUsed(_delegatee, _proposalId);
  }

  function getVotingPower(address _delegatee) external view returns (uint256) {
    return self.getVotingPower(_delegatee);
  }

  function getVotingPowerAt(address _delegatee, Timestamp _timestamp)
    external
    view
    returns (uint256)
  {
    return self.getVotingPowerAt(_delegatee, _timestamp);
  }
}
