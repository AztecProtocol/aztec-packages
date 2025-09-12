// SPDX-License-Identifier: UNLICENSED
// solhint-disable
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
import {RollupBuilder} from "../../builder/RollupBuilder.sol";
import {IGSE, GSE} from "@aztec/governance/GSE.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {FakeRollup} from "../governance/TestPayloads.sol";
import {RegisterNewRollupVersionPayload} from "./RegisterNewRollupVersionPayload.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {UncompressedProposalWrapper} from "@test/governance/helpers/UncompressedProposalTestLib.sol";

contract BadRollup {
  IGSE public immutable gse;

  constructor(IGSE _gse) {
    gse = _gse;
  }

  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }

  function getGSE() external view returns (GSE) {
    return GSE(address(gse));
  }
}

contract AddRollupTest is TestBase {
  UncompressedProposalWrapper internal upw = new UncompressedProposalWrapper();

  TestERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;
  Rollup internal rollup;
  IGSE internal gse;

  Proposal internal proposal;

  mapping(uint256 => address) internal validators;
  mapping(address validator => uint256 privateKey) internal privateKeys;

  IPayload internal payload;

  uint256 internal constant VALIDATOR_COUNT = 4;
  address internal constant EMPEROR = address(uint160(bytes20("EMPEROR")));

  function setUp() external {
    StakingQueueConfig memory stakingQueueConfig = TestConstants.getStakingQueueConfig();
    stakingQueueConfig.normalFlushSizeMin = VALIDATOR_COUNT * 2;

    // We need to make a timejump that is far enough that we can go at least 2 epochs in the past
    vm.warp(100_000);
    RollupBuilder builder = new RollupBuilder(address(this)).setGovProposerN(7).setGovProposerM(10)
      .setStakingQueueConfig(stakingQueueConfig).setTargetCommitteeSize(0);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;
    governance = builder.getConfig().governance;
    governanceProposer = GovernanceProposer(governance.governanceProposer());
    gse = IGSE(address(rollup.getGSE()));

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](VALIDATOR_COUNT);
    for (uint256 i = 1; i <= VALIDATOR_COUNT; i++) {
      uint256 privateKey = uint256(keccak256(abi.encode("validator", i)));
      address validator = vm.addr(privateKey);
      privateKeys[validator] = privateKey;
      validators[i - 1] = validator;
      initialValidators[i - 1] = CheatDepositArgs({
        attester: validator,
        withdrawer: validator,
        publicKeyInG1: BN254Lib.g1Zero(),
        publicKeyInG2: BN254Lib.g2Zero(),
        proofOfPossession: BN254Lib.g1Zero()
      });
    }

    MultiAdder multiAdder = new MultiAdder(address(rollup), address(this));
    uint256 activationThreshold = rollup.getActivationThreshold();
    vm.prank(token.owner());
    token.mint(address(multiAdder), activationThreshold * VALIDATOR_COUNT);
    multiAdder.addValidators(initialValidators);

    registry.transferOwnership(address(governance));
  }

  function test_AddRollup(bool _break) external {
    BadRollup newRollup = new BadRollup(gse);
    payload = IPayload(address(new RegisterNewRollupVersionPayload(registry, IInstance(address(newRollup)))));
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(1))));

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      governanceProposer.signal(payload);
      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(1))));
    }

    governanceProposer.submitRoundWinner(0);
    proposal = governance.getProposal(0);

    GSEPayload gsePayload = GSEPayload(address(proposal.payload));
    address originalPayload = address(gsePayload.getOriginalPayload());

    assertEq(originalPayload, address(payload));
    assertEq(gsePayload.getURI(), payload.getURI());

    vm.prank(token.owner());
    token.mint(EMPEROR, 10_000 ether);

    vm.startPrank(EMPEROR);
    token.approve(address(governance), 10_000 ether);
    governance.deposit(EMPEROR, 10_000 ether);
    vm.stopPrank();

    vm.warp(Timestamp.unwrap(upw.pendingThrough(proposal)) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Active);

    vm.prank(EMPEROR);
    governance.vote(0, 10_000 ether, true);

    vm.warp(Timestamp.unwrap(upw.activeThrough(proposal)) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Queued);

    vm.warp(Timestamp.unwrap(upw.queuedThrough(proposal)) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Executable);
    assertEq(governance.governanceProposer(), address(governanceProposer));

    if (_break) {
      // We keep adding attesters until we have that for this specific rollup (non-following)
      // is > 1/3, such that it cannot pass.
      uint256 val = 1;

      // We need 1/3 of the total supply to be off canonical
      // So we add 1/2 of the initial supply to the specific instance
      // The result is that 1/3 of the new total supply is off canonical
      uint256 validatorsNeeded = (gse.totalSupply() / 2) / rollup.getActivationThreshold() + 1;

      uint256 activationThreshold = rollup.getActivationThreshold();
      while (val <= validatorsNeeded) {
        vm.prank(token.owner());
        token.mint(address(this), activationThreshold);
        token.approve(address(rollup), activationThreshold);
        rollup.deposit(
          address(uint160(val)), address(this), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), false
        );
        val++;
      }
      rollup.flushEntryQueue();

      // While Errors.GovernanceProposer__GSEPayloadInvalid.selector is the error, we are catching it
      // So the expected error is that the call failed and the address of it.
      vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CallFailed.selector, address(gsePayload)));
    }

    governance.execute(0);

    if (_break) {
      assertEq(address(registry.getCanonicalRollup()), address(rollup));
    } else {
      assertNotEq(address(registry.getCanonicalRollup()), address(rollup));
      assertEq(address(registry.getCanonicalRollup()), address(newRollup));
    }
  }
}
