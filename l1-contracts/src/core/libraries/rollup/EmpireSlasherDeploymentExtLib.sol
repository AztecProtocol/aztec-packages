// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {Slasher, ISlasher} from "@aztec/core/slashing/Slasher.sol";
import {EmpireSlashingProposer} from "@aztec/core/slashing/EmpireSlashingProposer.sol";

/**
 * @title EmpireSlasherDeploymentExtLib - External Rollup Library (Empire Slasher Deployment)
 * @author Aztec Labs
 * @notice External library containing empire slasher deployment function for the Rollup contract
 * to avoid exceeding max contract size.
 *
 * @dev This library serves as an external library for the Rollup contract, splitting off empire slasher deployment
 *      functionality to keep the main contract within the maximum contract size limit. Uses two-phase
 *      initialization to resolve circular dependency between Slasher and EmpireSlashingProposer.
 */
library EmpireSlasherDeploymentExtLib {
  function deployEmpireSlasher(address _rollup, address _governance, RollupConfigInput memory _config)
    external
    returns (ISlasher)
  {
    // Deploy slasher first
    Slasher slasher = new Slasher(_config.slashingVetoer, _governance, _config.slashingDisableDuration);

    // Deploy proposer with slasher address
    EmpireSlashingProposer proposer = new EmpireSlashingProposer(
      _rollup,
      ISlasher(address(slasher)),
      _config.slashingQuorum,
      _config.slashingRoundSize,
      _config.slashingLifetimeInRounds,
      _config.slashingExecutionDelayInRounds
    );

    // Initialize the slasher with the proposer address
    slasher.initializeProposer(address(proposer));

    return ISlasher(address(slasher));
  }
}
