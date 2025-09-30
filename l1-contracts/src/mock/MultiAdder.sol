// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

struct CheatDepositArgs {
  address attester;
  address withdrawer;
  G1Point publicKeyInG1;
  G2Point publicKeyInG2;
  G1Point proofOfPossession;
}

interface IMultiAdder {
  function addValidators(CheatDepositArgs[] memory _args) external;
  function addValidators(CheatDepositArgs[] memory _args, uint256 _toFlush) external;
}

contract MultiAdder is IMultiAdder {
  address public immutable OWNER;
  IInstance public immutable STAKING;

  error NotOwner();

  constructor(address _staking, address _owner) {
    OWNER = _owner;
    STAKING = IInstance(_staking);

    IERC20 stakingAsset = STAKING.getStakingAsset();
    stakingAsset.approve(address(STAKING), type(uint256).max);
  }

  function addValidators(CheatDepositArgs[] memory _args) public override(IMultiAdder) {
    addValidators(_args, type(uint256).max);
  }

  function addValidators(CheatDepositArgs[] memory _args, uint256 _toFlush) public override(IMultiAdder) {
    require(msg.sender == OWNER, NotOwner());
    for (uint256 i = 0; i < _args.length; i++) {
      STAKING.deposit(
        _args[i].attester,
        _args[i].withdrawer,
        _args[i].publicKeyInG1,
        _args[i].publicKeyInG2,
        _args[i].proofOfPossession,
        true
      );
    }

    if (_toFlush != 0) {
      STAKING.flushEntryQueue(_toFlush);
    }
  }
}
