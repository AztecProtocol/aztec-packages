// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {
  RewardBooster,
  RewardBoostConfig,
  IBoosterCore,
  IValidatorSelection
} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Slasher, ISlasher, SlasherFlavor} from "@aztec/core/slashing/Slasher.sol";

/**
 * @title ExtRollupLib3 - External Rollup Library (Deployment Functions)
 * @author Aztec Labs
 * @notice External library containing deployment functions for the Rollup contract to avoid exceeding max contract
 * size.
 *
 * @dev This library serves as an external library for the Rollup contract, splitting off deployment-related
 *      functionality to keep the main contract within the maximum contract size limit. The library contains
 *      external functions focused on deployments performed during initialization:
 *      - Reward booster contract deployment with configuration
 *      - Slasher contract deployment with governance parameters
 */
library ExtRollupLib3 {
  function deployRewardBooster(RewardBoostConfig memory _config) external returns (IBoosterCore) {
    RewardBooster booster = new RewardBooster(IValidatorSelection(address(this)), _config);
    return IBoosterCore(address(booster));
  }

  function deploySlasher(
    address _rollup,
    address _vetoer,
    SlasherFlavor _flavor,
    uint256 _quorumSize,
    uint256 _roundSize,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds,
    uint256 _slashingUnit,
    uint256 _committeeSize,
    uint256 _epochDuration
  ) external returns (ISlasher) {
    Slasher slasher = new Slasher(
      _rollup,
      _vetoer,
      _flavor,
      _quorumSize,
      _roundSize,
      _lifetimeInRounds,
      _executionDelayInRounds,
      _slashingUnit,
      _committeeSize,
      _epochDuration
    );
    return ISlasher(address(slasher));
  }
}
