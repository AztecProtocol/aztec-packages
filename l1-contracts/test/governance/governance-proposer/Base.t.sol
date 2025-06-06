// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IGSE} from "@aztec/core/staking/GSE.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";

contract FakeGovernance {
  address immutable GOVERNANCE_PROPOSER;

  mapping(IPayload => bool) public proposals;
  mapping(uint256 => address) public proposalProposer;
  uint256 public proposalCount;

  constructor(address _governanceProposer) {
    GOVERNANCE_PROPOSER = _governanceProposer;
  }

  function propose(IPayload _proposal) external returns (uint256) {
    uint256 id = proposalCount++;
    proposals[_proposal] = true;
    proposalProposer[id] = GOVERNANCE_PROPOSER;
    return id;
  }
}

contract GovernanceProposerBase is Test {
  Registry internal registry;
  FakeGovernance internal governance;
  GovernanceProposer internal governanceProposer;

  function setUp() public virtual {
    TestERC20 asset = new TestERC20("test", "TEST", address(this));
    registry = new Registry(address(this), asset);

    governanceProposer = new GovernanceProposer(registry, IGSE(address(0x03)), 667, 1000);
    governance = new FakeGovernance(address(governanceProposer));

    registry.updateGovernance(address(governance));
    registry.transferOwnership(address(governance));
  }
}
