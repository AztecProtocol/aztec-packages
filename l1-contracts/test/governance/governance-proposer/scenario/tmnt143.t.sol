// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceProposerBase} from "../Base.t.sol";

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Fakerollup} from "../mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {FakeGovernance} from "../Base.t.sol";
import {TestBase} from "@test/base/Base.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {TestConstants} from "../../../harnesses/TestConstants.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {UncompressedProposalWrapper} from "@test/governance/helpers/UncompressedProposalTestLib.sol";
import {IGSE} from "@aztec/governance/GSE.sol";

contract MisconfiguredPayload is IPayload {
  IRegistry public immutable REGISTRY;
  IInstance public immutable ROLLUP;

  constructor(IRegistry _registry, IInstance _rollup) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);

    res[0] =
      Action({target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, address(ROLLUP))});

    return res;
  }

  function getURI() external pure override(IPayload) returns (string memory) {
    return "MisconfiguredPayload";
  }
}

contract FakeGSE {
  address public latestRollup;
  uint256 public totalSupply;
  address public bonusInstance;
  mapping(address instance => uint256 supply) public supplyOf;

  function setLatestRollup(address _latestRollup) external {
    latestRollup = _latestRollup;
  }

  function setSupplyOf(address _instance, uint256 _supply) external {
    totalSupply -= supplyOf[_instance];
    supplyOf[_instance] = _supply;
    totalSupply += _supply;
  }

  function setBonusInstanceAddress(address _bonusInstance) external {
    bonusInstance = _bonusInstance;
  }

  function getLatestRollup() external view returns (address) {
    return latestRollup;
  }

  function getTotalSupply() external view returns (uint256) {
    return totalSupply;
  }

  function getBonusInstanceAddress() external view returns (address) {
    return bonusInstance;
  }
}

// https://linear.app/aztec-labs/issue/TMNT-143/spearbit-gov-finding-8-governance-deadlock
contract TestTmnt143 is TestBase {
  UncompressedProposalWrapper internal upw = new UncompressedProposalWrapper();

  TestERC20 public asset;
  Registry public registry;
  FakeGSE public gse;
  GovernanceProposer public governanceProposer;
  Fakerollup public rollup;
  Governance internal governance;
  Proposal internal proposal;

  function setUp() external {
    asset = new TestERC20("test", "TEST", address(this));
    registry = new Registry(address(this), new TestERC20("test", "TEST", address(this)));
    gse = new FakeGSE();

    governanceProposer = new GovernanceProposer(registry, IGSE(address(gse)), 6, 10);

    rollup = new Fakerollup();
    registry.addRollup(rollup);

    governance =
      new Governance(asset, address(governanceProposer), address(gse), TestConstants.getGovernanceConfiguration());

    registry.transferOwnership(address(governance));

    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(10))));
  }

  function test_livelock() external {
    // Make a proposal to move to a new GSE, but people leave early so less than 2/3 on the latest in the GSE.

    vm.prank(address(governance));
    governance.openFloodgates();

    vm.prank(asset.owner());
    asset.mint(address(this), 10_000e18);
    asset.approve(address(governance), 10_000e18);
    governance.deposit(address(this), 10_000e18);

    // We setup the gse state where 70% percent is on the current instance (half directly, half from following)
    // The last 30% are then on older rollups.
    gse.setLatestRollup(address(rollup));
    gse.setSupplyOf(address(rollup), 3500e18);
    address bonusInstance = address(0xbeef);
    gse.setBonusInstanceAddress(bonusInstance);
    gse.setSupplyOf(bonusInstance, 3500e18);

    address oldRandomRollup = address(0x1234);
    gse.setSupplyOf(oldRandomRollup, 3000e18);

    Fakerollup newRollup = new Fakerollup();

    MisconfiguredPayload payload = new MisconfiguredPayload(registry, IInstance(address(newRollup)));

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      governanceProposer.signal(payload);
      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(1))));
    }

    governanceProposer.submitRoundWinner(1);
    proposal = governance.getProposal(0);

    // At this point, we expect the new rollup to be gaining traction, so people that follows (on bonus)
    // exit from the GSE, because they want to be on the one with reward. Those on the specific
    // are fine with staying, they like the tech/deployment.
    gse.setSupplyOf(bonusInstance, 0);

    vm.warp(Timestamp.unwrap(upw.pendingThrough(proposal)) + 1);

    governance.vote(0, 10_000e18, true);

    vm.warp(Timestamp.unwrap(upw.activeThrough(proposal)) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Queued);

    vm.warp(Timestamp.unwrap(upw.queuedThrough(proposal)) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Executable);
    assertEq(governance.governanceProposer(), address(governanceProposer));

    // Since the canonical != latest on the GSE. We expect there have been a misstep in the payload
    // e.g., forgot to add a new governance proposer not using the stale GSE.

    governance.execute(0);

    assertEq(address(registry.getCanonicalRollup()), address(newRollup));
  }
}
