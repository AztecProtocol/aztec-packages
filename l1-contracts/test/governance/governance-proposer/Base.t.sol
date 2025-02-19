// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";

contract FakeGovernance {
  address immutable GOVERNANCE_PROPOSER;

  mapping(IPayload => bool) public proposals;

  constructor(address _governanceProposer) {
    GOVERNANCE_PROPOSER = _governanceProposer;
  }

  function propose(IPayload _proposal) external returns (bool) {
    proposals[_proposal] = true;
    return true;
  }
}

contract GovernanceProposerBase is Test {
  Registry internal registry;
  FakeGovernance internal governance;
  GovernanceProposer internal governanceProposer;

  function setUp() public virtual {
    registry = new Registry(address(this));

    governanceProposer = new GovernanceProposer(registry, 667, 1000);
    governance = new FakeGovernance(address(governanceProposer));

    registry.transferOwnership(address(governance));
  }
}
