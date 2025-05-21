// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

struct CheatDepositArgs {
  address attester;
  address proposer;
  address withdrawer;
  uint256 amount;
}

interface IMultiAdder {
  function addValidators(CheatDepositArgs[] memory _args) external;
}

contract MultiAdder is IMultiAdder {
  address public immutable OWNER;
  IStaking public immutable STAKING;

  constructor(address _staking, address _owner) {
    OWNER = _owner;
    STAKING = IStaking(_staking);

    IERC20 stakingAsset = STAKING.getStakingAsset();
    stakingAsset.approve(address(STAKING), type(uint256).max);
  }

  function addValidators(CheatDepositArgs[] memory _args) external override(IMultiAdder) {
    require(msg.sender == OWNER, "Not owner");
    for (uint256 i = 0; i < _args.length; i++) {
      STAKING.deposit(_args[i].attester, _args[i].proposer, _args[i].withdrawer, _args[i].amount);
    }
  }
}
