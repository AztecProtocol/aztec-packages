// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Slasher, ISlasher} from "@aztec/core/slashing/Slasher.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";

/**
 * @title SlasherDeploymentExtLib - External Rollup Library (Slasher Deployment)
 * @author Aztec Labs
 * @notice External library containing slasher deployment function for the Rollup contract
 * to avoid exceeding max contract size.
 *
 * @dev This library deploys a slasher system using two-phase initialization
 *      to resolve the circular dependency between Slasher and SlashingProposer.
 */
library SlasherDeploymentExtLib {
  function deploySlasher(address _rollup, address _governance, RollupConfigInput memory _config)
    external
    returns (ISlasher)
  {
    // Deploy slasher first
    Slasher slasher = new Slasher(_config.slashingVetoer, _governance, _config.slashingDisableDuration);

    // Deploy proposer with slasher address
    SlashingProposer proposer = new SlashingProposer(
      _rollup,
      ISlasher(address(slasher)),
      _config.slashingQuorum,
      _config.slashingRoundSize,
      _config.slashingLifetimeInRounds,
      _config.slashingExecutionDelayInRounds,
      _config.slashAmounts,
      _config.targetCommitteeSize,
      _config.aztecEpochDuration,
      _config.slashingOffsetInRounds
    );

    // Initialize the slasher with the proposer address
    slasher.initializeProposer(address(proposer));

    return ISlasher(address(slasher));
  }
}
