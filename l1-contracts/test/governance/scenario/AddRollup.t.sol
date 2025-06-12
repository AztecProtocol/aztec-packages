// SPDX-License-Identifier: UNLICENSED
// solhint-disable
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {TestBase} from "@test/base/Base.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
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
import {IGSE, GSE} from "@aztec/core/staking/GSE.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {FakeRollup} from "../governance/TestPayloads.sol";
import {RegisterNewRollupVersionPayload} from "./RegisterNewRollupVersionPayload.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";

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
  using ProposalLib for DataStructures.Proposal;
  using stdStorage for StdStorage;

  IMintableERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;
  Rollup internal rollup;
  IGSE internal gse;

  DataStructures.Proposal internal proposal;

  mapping(uint256 => address) internal validators;
  mapping(address validator => uint256 privateKey) internal privateKeys;

  IPayload internal payload;

  uint256 internal constant VALIDATOR_COUNT = 4;
  address internal constant EMPEROR = address(uint160(bytes20("EMPEROR")));

  function setUp() external {
    // We need to make a timejump that is far enough that we can go at least 2 epochs in the past
    vm.warp(100000);
    RollupBuilder builder = new RollupBuilder(address(this)).setGovProposerN(7).setGovProposerM(10)
      .setEntryQueueFlushSizeMin(VALIDATOR_COUNT * 2).setTargetCommitteeSize(0);
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
      initialValidators[i - 1] = CheatDepositArgs({attester: validator, withdrawer: validator});
    }

    MultiAdder multiAdder = new MultiAdder(address(rollup), address(this));
    token.mint(address(multiAdder), rollup.getDepositAmount() * VALIDATOR_COUNT);
    multiAdder.addValidators(initialValidators);

    registry.updateGovernance(address(governance));
    registry.transferOwnership(address(governance));
  }

  function test_AddRollup(bool _break) external {
    BadRollup newRollup = new BadRollup(gse);
    payload = IPayload(
      address(new RegisterNewRollupVersionPayload(registry, IInstance(address(newRollup))))
    );
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(1))));

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

    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + 1);
    assertTrue(governance.getProposalState(0) == DataStructures.ProposalState.Active);

    vm.prank(EMPEROR);
    governance.vote(0, 10000 ether, true);

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);
    assertTrue(governance.getProposalState(0) == DataStructures.ProposalState.Queued);

    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);
    assertTrue(governance.getProposalState(0) == DataStructures.ProposalState.Executable);
    assertEq(governance.governanceProposer(), address(governanceProposer));

    if (_break) {
      // We keep adding attesters until we have that for this specific rollup (non-following)
      // is > 1/3, such that it cannot pass.
      uint256 val = 1;

      // We need 1/3 of the total supply to be off canonical
      // So we add 1/2 of the initial supply to the specific instance
      // The result is that 1/3 of the new total supply is off canonical
      uint256 validatorsNeeded = (gse.totalSupply() / 2) / rollup.getDepositAmount() + 1;

      while (val <= validatorsNeeded) {
        token.mint(address(this), rollup.getDepositAmount());
        token.approve(address(rollup), rollup.getDepositAmount());
        rollup.deposit(address(uint160(val)), address(this), false);
        val++;
      }
      rollup.flushEntryQueue();

      // While Errors.GovernanceProposer__GSEPayloadInvalid.selector is the error, we are catching it
      // So the expected error is that the call failed and the address of it.
      vm.expectRevert(
        abi.encodeWithSelector(Errors.Governance__CallFailed.selector, address(gsePayload))
      );
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
