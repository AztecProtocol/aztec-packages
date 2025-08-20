// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Slasher, ISlasher} from "@aztec/core/slashing/Slasher.sol";
import {ConsensusSlashingProposer} from "@aztec/core/slashing/ConsensusSlashingProposer.sol";

/**
 * @title ConsensusDeploymentExtLib - External Rollup Library (Consensus Slasher Deployment)
 * @author Aztec Labs
 * @notice External library containing consensus slasher deployment function for the Rollup contract
 * to avoid exceeding max contract size.
 *
 * @dev This library deploys a consensus slasher system using two-phase initialization
 *      to resolve the circular dependency between Slasher and ConsensusSlashingProposer.
 */
library ConsensusDeploymentExtLib {
  function deployConsensusSlasher(
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
    ConsensusSlashingProposer proposer = new ConsensusSlashingProposer(
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
