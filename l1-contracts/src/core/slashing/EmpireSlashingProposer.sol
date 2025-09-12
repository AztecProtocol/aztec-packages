// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {ISlasher, SlasherFlavor} from "@aztec/core/interfaces/ISlasher.sol";
import {IEmpire} from "@aztec/governance/interfaces/IEmpire.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {EmpireBase} from "@aztec/governance/proposer/EmpireBase.sol";

/**
 * @notice  A SlashingProposer implementation following the empire model
 */
contract EmpireSlashingProposer is IEmpire, EmpireBase {
  /**
   * @notice Type of slashing proposer (either Tally or Empire)
   */
  SlasherFlavor public constant SLASHING_PROPOSER_TYPE = SlasherFlavor.EMPIRE;

  address public immutable INSTANCE;
  ISlasher public immutable SLASHER;

  /**
   * @notice Constructor for the EmpireSlashingProposer contract.
   *
   * @param _instance - The specific rollup that the proposer will be used for
   * @param _slasher - The entity that can slash on the _instance
   *                    The EmpireSlashingProposer `address(this)` should be able to use the slasher for this contract
   * to
   *                    make sense.
   * @param _slashingQuorum The number of signals needed in a round for a slash to pass.
   * @param _roundSize The number of signals that can be cast in a round.
   * @param _lifetimeInRounds - A deadline for when the passing proposal must have been executed.
   * @param _executionDelayInRounds - A delay for how quickly a passing proposal can be executed.
   *                                  When used together with a `_slasher` that has VETO functionality this is the time
   *                                  that the vetoer have to act.
   */
  constructor(
    address _instance,
    ISlasher _slasher,
    uint256 _slashingQuorum,
    uint256 _roundSize,
    uint256 _lifetimeInRounds,
    uint256 _executionDelayInRounds
  ) EmpireBase(_slashingQuorum, _roundSize, _lifetimeInRounds, _executionDelayInRounds) {
    INSTANCE = _instance;
    SLASHER = _slasher;
  }

  function getInstance() public view override(EmpireBase, IEmpire) returns (address) {
    return INSTANCE;
  }

  function _handleRoundWinner(IPayload _payload) internal override(EmpireBase) returns (bool) {
    return SLASHER.slash(_payload);
  }
}
