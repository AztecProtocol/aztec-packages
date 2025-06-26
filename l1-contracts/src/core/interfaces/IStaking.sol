// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Exit, Status, AttesterView} from "@aztec/core/libraries/rollup/StakingLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/StakingQueue.sol";
import {AttesterConfig, GSE} from "@aztec/governance/GSE.sol";
import {Timestamp, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

interface IStakingCore {
  event SlasherUpdated(address indexed oldSlasher, address indexed newSlasher);
  event ValidatorQueued(address indexed attester, address indexed withdrawer);
  event Deposit(address indexed attester, address indexed withdrawer, uint256 amount);
  event FailedDeposit(address indexed attester, address indexed withdrawer);
  event WithdrawInitiated(address indexed attester, address indexed recipient, uint256 amount);
  event WithdrawFinalised(address indexed attester, address indexed recipient, uint256 amount);
  event Slashed(address indexed attester, uint256 amount);
  event StakingQueueConfigUpdated(StakingQueueConfig config);

  function setSlasher(address _slasher) external;
  function deposit(address _attester, address _withdrawer, bool _onCanonical) external;
  function flushEntryQueue() external;
  function initiateWithdraw(address _attester, address _recipient) external returns (bool);
  function finaliseWithdraw(address _attester) external;
  function slash(address _attester, uint256 _amount) external returns (bool);
  function vote(uint256 _proposalId) external;
  function updateStakingQueueConfig(StakingQueueConfig memory _config) external;

  function getEntryQueueFlushSize() external view returns (uint256);
  function getActiveAttesterCount() external view returns (uint256);
}

interface IStaking is IStakingCore {
  function getConfig(address _attester) external view returns (AttesterConfig memory);
  function getExit(address _attester) external view returns (Exit memory);
  function getAttesterAtIndex(uint256 _index) external view returns (address);
  function getSlasher() external view returns (address);
  function getStakingAsset() external view returns (IERC20);
  function getDepositAmount() external view returns (uint256);
  function getMinimumStake() external view returns (uint256);
  function getExitDelay() external view returns (Timestamp);
  function getGSE() external view returns (GSE);
  function getAttesterView(address _attester) external view returns (AttesterView memory);
  function getStatus(address _attester) external view returns (Status);
  function getNextFlushableEpoch() external view returns (Epoch);
  function getEntryQueueLength() external view returns (uint256);
}
