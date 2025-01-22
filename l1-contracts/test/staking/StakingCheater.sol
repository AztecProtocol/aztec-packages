// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Staking, Status} from "@aztec/core/staking/Staking.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";

contract StakingCheater is Staking {
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor(
    IERC20 _stakingAsset,
    uint256 _minimumStake,
    uint256 _slashingQuorum,
    uint256 _roundSize
  ) Staking(_stakingAsset, _minimumStake, _slashingQuorum, _roundSize) {}

  function cheat__SetStatus(address _attester, Status _status) external {
    stakingStore.info[_attester].status = _status;
  }

  function cheat__AddAttester(address _attester) external {
    stakingStore.attesters.add(_attester);
  }

  function cheat__RemoveAttester(address _attester) external {
    stakingStore.attesters.remove(_attester);
  }
}
