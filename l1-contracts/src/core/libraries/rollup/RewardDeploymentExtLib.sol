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

/**
 * @title RewardDeploymentExtLib - External Rollup Library (Reward Booster Deployment)
 * @author Aztec Labs
 * @notice External library containing deployment functions for the Rollup contract to avoid exceeding max contract
 * size.
 *
 * @dev This library serves as an external library for the Rollup contract, splitting off deployment-related
 *      functionality to keep the main contract within the maximum contract size limit. The library contains
 *      external functions focused on deployments performed during initialization:
 *      - Reward booster contract deployment with configuration
 */
library RewardDeploymentExtLib {
  function deployRewardBooster(RewardBoostConfig memory _config) external returns (IBoosterCore) {
    RewardBooster booster = new RewardBooster(IValidatorSelection(address(this)), _config);
    return IBoosterCore(address(booster));
  }
}
