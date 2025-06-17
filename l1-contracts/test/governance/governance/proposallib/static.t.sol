// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Proposal, Configuration} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";

contract Static is TestBase {
  using ProposalLib for Proposal;

  Proposal internal proposal;

  modifier limitConfig(Configuration memory _config) {
    proposal.config.votingDelay =
      Timestamp.wrap(bound(Timestamp.unwrap(_config.votingDelay), 0, type(uint32).max));
    proposal.config.votingDuration =
      Timestamp.wrap(bound(Timestamp.unwrap(_config.votingDuration), 0, type(uint32).max));
    proposal.config.executionDelay =
      Timestamp.wrap(bound(Timestamp.unwrap(_config.executionDelay), 0, type(uint32).max));
    proposal.config.gracePeriod =
      Timestamp.wrap(bound(Timestamp.unwrap(_config.gracePeriod), 0, type(uint32).max));

    _;
  }

  function test_pendingThrough(Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(proposal.pendingThrough(), proposal.creation + proposal.config.votingDelay);
  }

  function test_activeThrough(Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(
      proposal.activeThrough(),
      proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration
    );
  }

  function test_queuedThrough(Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(
      proposal.queuedThrough(),
      proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration
        + proposal.config.executionDelay
    );
  }

  function test_executableThrough(Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(
      proposal.executableThrough(),
      proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration
        + proposal.config.executionDelay + proposal.config.gracePeriod
    );
  }
}
