// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract Static is TestBase {
  using ProposalLib for DataStructures.Proposal;

  DataStructures.Proposal internal proposal;

  modifier limitConfig(DataStructures.Configuration memory _config) {
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

  function test_PendingUntil(DataStructures.Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(proposal.pendingUntil(), proposal.creation + proposal.config.votingDelay);
  }

  function test_ActiveUntil(DataStructures.Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(
      proposal.activeUntil(),
      proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration
    );
  }

  function test_QueuedUntil(DataStructures.Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(
      proposal.queuedUntil(),
      proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration
        + proposal.config.executionDelay
    );
  }

  function test_ExecutableUntil(DataStructures.Configuration memory _config, uint256 _creation)
    external
    limitConfig(_config)
  {
    proposal.creation = Timestamp.wrap(bound(_creation, 0, type(uint32).max));
    assertEq(
      proposal.executableUntil(),
      proposal.creation + proposal.config.votingDelay + proposal.config.votingDuration
        + proposal.config.executionDelay + proposal.config.gracePeriod
    );
  }
}
