// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {EnumerableSet} from "@oz/utils/structs/EnumerableSet.sol";
import {
  IStaking, ValidatorInfo, Exit, OperatorInfo, Status
} from "@aztec/core/interfaces/IStaking.sol";

import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {StakingLib} from "@aztec/core/libraries/staking/StakingLib.sol";
import {Slasher} from "@aztec/core/staking/Slasher.sol";

contract StakingCheater is IStaking {
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor(
    IERC20 _stakingAsset,
    uint256 _minimumStake,
    uint256 _slashingQuorum,
    uint256 _roundSize
  ) {
    Timestamp exitDelay = Timestamp.wrap(60 * 60 * 24);
    Slasher slasher = new Slasher(_slashingQuorum, _roundSize);
    StakingLib.initialize(_stakingAsset, _minimumStake, exitDelay, address(slasher));
  }

  function finaliseWithdraw(address _attester) external {
    StakingLib.finaliseWithdraw(_attester);
  }

  function slash(address _attester, uint256 _amount) external {
    StakingLib.slash(_attester, _amount);
  }

  function deposit(address _attester, address _proposer, address _withdrawer, uint256 _amount)
    external
  {
    StakingLib.deposit(_attester, _proposer, _withdrawer, _amount);
  }

  function initiateWithdraw(address _attester, address _recipient) external returns (bool) {
    return StakingLib.initiateWithdraw(_attester, _recipient);
  }

  function getActiveAttesterCount() external view returns (uint256) {
    return StakingLib.getStorage().attesters.length();
  }

  function getProposerForAttester(address _attester) external view returns (address) {
    return StakingLib.getStorage().info[_attester].proposer;
  }

  function getAttesterAtIndex(uint256 _index) external view returns (address) {
    return StakingLib.getStorage().attesters.at(_index);
  }

  function getProposerAtIndex(uint256 _index) external view returns (address) {
    return StakingLib.getStorage().info[StakingLib.getStorage().attesters.at(_index)].proposer;
  }

  function getInfo(address _attester) external view returns (ValidatorInfo memory) {
    return StakingLib.getStorage().info[_attester];
  }

  function getExit(address _attester) external view returns (Exit memory) {
    return StakingLib.getStorage().exits[_attester];
  }

  function getOperatorAtIndex(uint256 _index) external view returns (OperatorInfo memory) {
    address attester = StakingLib.getStorage().attesters.at(_index);
    return
      OperatorInfo({proposer: StakingLib.getStorage().info[attester].proposer, attester: attester});
  }

  function getSlasher() external view returns (address) {
    return StakingLib.getStorage().slasher;
  }

  function getStakingAsset() external view returns (IERC20) {
    return StakingLib.getStorage().stakingAsset;
  }

  function getMinimumStake() external view returns (uint256) {
    return StakingLib.getStorage().minimumStake;
  }

  function getExitDelay() external view returns (Timestamp) {
    return StakingLib.getStorage().exitDelay;
  }

  //////////////
  // CHEATING //
  //////////////

  function cheat__SetStatus(address _attester, Status _status) external {
    StakingLib.getStorage().info[_attester].status = _status;
  }

  function cheat__AddAttester(address _attester) external {
    StakingLib.getStorage().attesters.add(_attester);
  }

  function cheat__RemoveAttester(address _attester) external {
    StakingLib.getStorage().attesters.remove(_attester);
  }
}
