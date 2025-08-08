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
import {Slasher, ISlasher} from "@aztec/core/slashing/Slasher.sol";

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
    uint256 _slashingQuorum,
    uint256 _slashingRoundSize,
    uint256 _slashingLifetimeInRounds,
    uint256 _slashingExecutionDelayInRounds,
    address _slashingVetoer
  ) external returns (ISlasher) {
    Slasher slasher = new Slasher(
      _rollup,
      _slashingQuorum,
      _slashingRoundSize,
      _slashingLifetimeInRounds,
      _slashingExecutionDelayInRounds,
      _slashingVetoer
    );
    return ISlasher(address(slasher));
  }
}
