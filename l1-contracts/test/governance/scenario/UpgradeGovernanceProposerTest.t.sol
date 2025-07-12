// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {TestBase} from "@test/base/Base.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {MockFeeJuicePortal} from "@aztec/mock/MockFeeJuicePortal.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {NewGovernanceProposerPayload} from "./NewGovernanceProposerPayload.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";
import {RollupBuilder} from "../../builder/RollupBuilder.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {TimeCheater} from "../../staking/TimeCheater.sol";

/**
 * @title UpgradeGovernanceProposerTest
 * @author Aztec Labs
 * @notice A test that showcases an upgrade of the governance system, here the governanceProposer contract.
 */
contract UpgradeGovernanceProposerTest is TestBase {
  using ProposalLib for Proposal;

  IMintableERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;
  Rollup internal rollup;
  IGSE internal gse;
  TimeCheater internal timeCheater;

  Proposal internal proposal;

  mapping(uint256 => address) internal validators;
  mapping(address validator => uint256 privateKey) internal privateKeys;

  IPayload internal payload;

  uint256 internal constant VALIDATOR_COUNT = 4;
  address internal constant EMPEROR = address(uint160(bytes20("EMPEROR")));

  function setUp() external {
    // We do a timejump to ensure that we don't underflow with time when looking up sample
    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](VALIDATOR_COUNT);
    for (uint256 i = 1; i <= VALIDATOR_COUNT; i++) {
      uint256 privateKey = uint256(keccak256(abi.encode("validator", i)));
      address validator = vm.addr(privateKey);
      privateKeys[validator] = privateKey;
      validators[i - 1] = validator;
      initialValidators[i - 1] = CheatDepositArgs({attester: validator, withdrawer: validator});
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setGovProposerN(7).setGovProposerM(10)
      .setValidators(initialValidators).setTargetCommitteeSize(4).setEpochDuration(1);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;
    governance = builder.getConfig().governance;
    governanceProposer = GovernanceProposer(governance.governanceProposer());
    gse = IGSE(address(rollup.getGSE()));

    registry.updateGovernance(address(governance));
    registry.transferOwnership(address(governance));

    timeCheater = new TimeCheater(
      address(rollup),
      block.timestamp,
      builder.getConfig().rollupConfigInput.aztecSlotDuration,
      builder.getConfig().rollupConfigInput.aztecEpochDuration,
      builder.getConfig().rollupConfigInput.aztecProofSubmissionEpochs
    );
  }

  function test_UpgradeIntoNewVersion() external {
    timeCheater.cheat__jumpForwardEpochs(2);
    payload = IPayload(address(new NewGovernanceProposerPayload(registry, gse)));

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      governanceProposer.vote(payload);
      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(1))));
    }

    governanceProposer.executeProposal(0);
    proposal = governance.getProposal(0);

    GSEPayload gsePayload = GSEPayload(address(proposal.payload));
    address originalPayload = address(gsePayload.getOriginalPayload());

    assertEq(originalPayload, address(payload));

    token.mint(EMPEROR, 10000 ether);

    vm.startPrank(EMPEROR);
    token.approve(address(governance), 10000 ether);
    governance.deposit(EMPEROR, 10000 ether);
    vm.stopPrank();

    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + DEPOSIT_GRANULARITY_SECONDS);
    assertTrue(governance.getProposalState(0) == ProposalState.Active);

    vm.prank(EMPEROR);
    governance.vote(0, 10000 ether, true);

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Queued);

    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Executable);
    assertEq(governance.governanceProposer(), address(governanceProposer));

    governance.execute(0);

    assertNotEq(governance.governanceProposer(), address(governanceProposer));
    address newGovernanceProposer =
      address(NewGovernanceProposerPayload(address(payload)).NEW_GOVERNANCE_PROPOSER());
    assertEq(governance.governanceProposer(), newGovernanceProposer);

    // Ensure that we cannot push a proposal after the upgrade.
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__CallerNotGovernanceProposer.selector,
        address(governanceProposer),
        newGovernanceProposer
      )
    );
    vm.prank(address(governanceProposer));
    governance.propose(payload);
  }
}
