// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Proposal} from "@aztec/governance/interfaces/IGovernance.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";

import {
  ProposalLib,
  VoteTabulationReturn,
  VoteTabulationInfo
} from "@aztec/governance/libraries/ProposalLib.sol";

contract LimitedDepositTest is TestBase {
  IMintableERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;

  mapping(bytes32 => Proposal) internal proposals;
  mapping(bytes32 => uint256) internal proposalIds;
  Proposal internal proposal;
  uint256 proposalId;

  function setUp() public {
    token = IMintableERC20(address(new TestERC20("test", "TEST", address(this))));

    registry = new Registry(address(this), token);
    governanceProposer = new GovernanceProposer(registry, IGSE(address(0x03)), 677, 1000);

    governance = new Governance(
      token, address(governanceProposer), address(this), TestConstants.getGovernanceConfiguration()
    );
  }

  function test_WhenNotAllowedToDeposit(address _caller, address _depositor) external {
    // it reverts

    vm.assume(_caller != address(0) && _depositor != address(0));
    vm.assume(!governance.isAllowedToDeposit(_depositor));

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__DepositNotAllowed.selector));
    governance.deposit(_depositor, 1000);
  }

  function test_WhenIsAllowedToDeposit(address _caller, address _depositor) external {
    // it deposits
    vm.assume(_caller != address(0) && _depositor != address(0));

    vm.prank(address(governance));
    governance.addDepositor(_depositor);

    token.mint(_caller, 1000);

    vm.prank(_caller);
    token.approve(address(governance), 1000);

    vm.prank(_caller);
    governance.deposit(_depositor, 1000);

    assertEq(governance.powerAt(_depositor, Timestamp.wrap(block.timestamp)), 1000);
  }

  function test_WhenFloodgatesAreOpen(address _caller, address _depositor) external {
    // it deposits

    vm.assume(_caller != address(0) && _depositor != address(0));

    vm.prank(address(governance));
    governance.openFloodgates();

    token.mint(_caller, 1000);

    vm.prank(_caller);
    token.approve(address(governance), 1000);

    vm.prank(_caller);
    governance.deposit(_depositor, 1000);

    assertEq(governance.powerAt(_depositor, Timestamp.wrap(block.timestamp)), 1000);
  }
}
