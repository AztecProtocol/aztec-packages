// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Slasher, ISlasher} from "@aztec/core/slashing/Slasher.sol";
import {TallySlashingProposer} from "@aztec/core/slashing/TallySlashingProposer.sol";

/**
 * @title TallySlasherDeploymentExtLib - External Rollup Library (Tally Slasher Deployment)
 * @author Aztec Labs
 * @notice External library containing tally slasher deployment function for the Rollup contract
 * to avoid exceeding max contract size.
 *
 * @dev This library deploys a tally slasher system using two-phase initialization
 *      to resolve the circular dependency between Slasher and TallySlashingProposer.
 */
library TallySlasherDeploymentExtLib {
  function deployTallySlasher(
    address _rollup,
    address _vetoer,
    address _governance,
    uint256 _quorum,
    uint256 _roundSize,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds,
    uint256 _slashingUnit,
    uint256 _committeeSize,
    uint256 _epochDuration,
    uint256 _slashOffsetInRounds
  ) external returns (ISlasher) {
    // Deploy slasher first
    Slasher slasher = new Slasher(_vetoer, _governance);

    // Deploy proposer with slasher address
    TallySlashingProposer proposer = new TallySlashingProposer(
      _rollup,
      ISlasher(address(slasher)),
      _quorum,
      _roundSize,
      _lifetimeInRounds,
      _executionDelayInRounds,
      _slashingUnit,
      _committeeSize,
      _epochDuration,
      _slashOffsetInRounds
    );

    // Initialize the slasher with the proposer address
    slasher.initializeProposer(address(proposer));

    return ISlasher(address(slasher));
  }
}
