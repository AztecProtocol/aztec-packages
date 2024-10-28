// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {TestBase} from "@test/base/Base.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Apella} from "@aztec/governance/Apella.sol";
import {Gerousia} from "@aztec/governance/Gerousia.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {MockFeeJuicePortal} from "@aztec/mock/MockFeeJuicePortal.sol";
import {Slot} from "@aztec/core/libraries/TimeMath.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {NewGerousiaPayload} from "./NewGerousiaPayload.sol";
import {Sysstia} from "@aztec/governance/Sysstia.sol";
/**
 * @title UpgradeGerousiaTest
 * @author Aztec Labs
 * @notice A test that showcases an upgrade of the governance system, here the gerousia contract.
 */

contract UpgradeGerousiaTest is TestBase {
  using ProposalLib for DataStructures.Proposal;

  IMintableERC20 internal token;
  Registry internal registry;
  Apella internal apella;
  Gerousia internal gerousia;
  Rollup internal rollup;

  DataStructures.Proposal internal proposal;

  mapping(uint256 => address) internal validators;
  mapping(address validator => uint256 privateKey) internal privateKeys;

  IPayload internal payload;

  uint256 internal constant VALIDATOR_COUNT = 4;
  address internal constant EMPEROR = address(uint160(bytes20("EMPEROR")));

  function setUp() external {
    token = IMintableERC20(address(new TestERC20()));

    registry = new Registry(address(this));
    gerousia = new Gerousia(registry, 7, 10);

    apella = new Apella(token, address(gerousia));

    address[] memory initialValidators = new address[](VALIDATOR_COUNT);
    for (uint256 i = 1; i <= VALIDATOR_COUNT; i++) {
      uint256 privateKey = uint256(keccak256(abi.encode("validator", i)));
      address validator = vm.addr(privateKey);
      privateKeys[validator] = privateKey;
      validators[i - 1] = validator;
      initialValidators[i - 1] = validator;
    }

    Sysstia sysstia = new Sysstia(token, registry, address(this));
    rollup = new Rollup(
      new MockFeeJuicePortal(), sysstia, bytes32(0), bytes32(0), address(this), initialValidators
    );

    registry.upgrade(address(rollup));

    registry.transferOwnership(address(apella));
  }

  function test_UpgradeIntoNewVersion() external {
    payload = IPayload(address(new NewGerousiaPayload(registry)));
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(1))));

    for (uint256 i = 0; i < 10; i++) {
      address proposer = rollup.getCurrentProposer();
      vm.prank(proposer);
      gerousia.vote(payload);
      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(1))));
    }

    gerousia.pushProposal(0);
    proposal = apella.getProposal(0);
    assertEq(address(proposal.payload), address(payload));

    token.mint(EMPEROR, 10000 ether);

    vm.startPrank(EMPEROR);
    token.approve(address(apella), 10000 ether);
    apella.deposit(EMPEROR, 10000 ether);
    vm.stopPrank();

    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + 1);
    assertTrue(apella.getProposalState(0) == DataStructures.ProposalState.Active);

    vm.prank(EMPEROR);
    apella.vote(0, 10000 ether, true);

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);
    assertTrue(apella.getProposalState(0) == DataStructures.ProposalState.Queued);

    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);
    assertTrue(apella.getProposalState(0) == DataStructures.ProposalState.Executable);
    assertEq(apella.gerousia(), address(gerousia));

    apella.execute(0);

    assertNotEq(apella.gerousia(), address(gerousia));
    address newGerousia = address(NewGerousiaPayload(address(payload)).NEW_GEROUSIA());
    assertEq(apella.gerousia(), newGerousia);

    // Ensure that we cannot push a proposal after the upgrade.
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Apella__CallerNotGerousia.selector, address(gerousia), newGerousia
      )
    );
    vm.prank(address(gerousia));
    apella.propose(payload);
  }
}
