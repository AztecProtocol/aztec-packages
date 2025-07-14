// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GSEBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Errors as GovErrors} from "@aztec/governance/libraries/Errors.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IStakingCore, Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Fakerollup} from "../governance/governance-proposer/mocks/Fakerollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

struct Timestamps {
  uint256 ts1;
  uint256 ts2;
  uint256 ts3;
  uint256 ts4;
  uint256 ts5;
  uint256 ts6;
  uint256 ts7;
}

// Collection of minimal test suite to get some idea
// Not to be seen as full tests
contract MinimalDelegationTest is GSEBase {
  using stdStorage for StdStorage;

  address canonical;
  uint256 depositAmount;

  function setUp() public override {
    super.setUp();
    canonical = gse.getCanonicalMagicAddress();
    depositAmount = ROLLUP.getDepositAmount();

    vm.label(canonical, "canonical");
  }

  function test_votingPower(bool _overwriteDelay, bool _claim, bool _updateRegistry) public {
    // Setup

    address proposer = governance.governanceProposer();
    vm.prank(proposer);
    uint256 proposalId = governance.propose(IPayload(address(ROLLUP))); // Useless payload, just to get it in there.

    // Fake it till you make it
    stdstore.target(proposer).sig("getProposalProposer(uint256)").with_key(proposalId).checked_write(
      address(ROLLUP)
    );
    assertEq(GovernanceProposer(proposer).getProposalProposer(proposalId), address(ROLLUP));

    uint256 votingTime =
      Timestamp.unwrap(ProposalLib.pendingThroughMemory(governance.getProposal(0)));

    Timestamps memory ts;

    ts.ts1 = block.timestamp;
    ts.ts2 = ts.ts1 + EPOCH_DURATION_SECONDS;
    ts.ts3 = ts.ts2 + EPOCH_DURATION_SECONDS;

    require(votingTime > ts.ts3, "voting time not long enough");
    ts.ts4 = votingTime + EPOCH_DURATION_SECONDS;
    ts.ts5 = ts.ts4 + EPOCH_DURATION_SECONDS;
    ts.ts6 = ts.ts5 + EPOCH_DURATION_SECONDS;
    ts.ts7 = ts.ts6 + EPOCH_DURATION_SECONDS;

    // Lets start
    assertEq(gse.getVotingPower(canonical), 0, "votingPowerCanonical");

    help__deposit(ATTESTER1, WITHDRAWER, true);

    vm.warp(ts.ts2);

    help__deposit(ATTESTER2, WITHDRAWER, false);

    vm.warp(ts.ts3);

    help__deposit(WITHDRAWER, WITHDRAWER, true);

    vm.warp(ts.ts4);

    _checkInstanceCanonical(address(ROLLUP), 0, depositAmount, Timestamp.wrap(ts.ts1));
    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount, Timestamp.wrap(ts.ts2));
    _checkInstanceCanonical(
      address(ROLLUP), depositAmount, depositAmount * 2, Timestamp.wrap(ts.ts3)
    );

    assertEq(gse.getVotingPower(ATTESTER1), 0, "voting power user");
    assertEq(gse.getVotingPower(ATTESTER2), 0, "voting power user");
    assertEq(gse.getVotingPower(WITHDRAWER), 0, "voting power user");

    vm.prank(WITHDRAWER);
    gse.delegate(canonical, ATTESTER1, WITHDRAWER);

    vm.warp(ts.ts5);

    Fakerollup dead = new Fakerollup();
    vm.label(address(dead), "fake rollup");

    // From the view of the GSE we make a new version canonical.
    // Beware that the registry don't have the same, and that we are abusing this
    // since the governance proposer still believe the old rollup is canonical
    // This setup is contrived, but let us test a lot very concisely.
    vm.prank(gse.owner());
    gse.addRollup(address(dead));

    if (_updateRegistry) {
      // If we update the registry. The governance proposer will be belonging to someone else!
      // We should not be failing because we are not longer canonical :sob:
      vm.prank(registry.owner());
      registry.addRollup(IRollup(address(dead)));
    }

    vm.warp(ts.ts6);

    assertEq(governance.totalPowerAt(Timestamp.wrap(ts.ts6)), depositAmount * 3);

    if (_overwriteDelay) {
      stdstore.enable_packed_slots().target(address(ROLLUP)).sig("getExitDelay()").checked_write(5);
    }

    vm.prank(WITHDRAWER);
    ROLLUP.initiateWithdraw(ATTESTER2, WITHDRAWER);

    assertEq(governance.totalPowerAt(Timestamp.wrap(ts.ts6)), depositAmount * 2);

    vm.warp(ts.ts7);

    // Check power at different points in time.
    _checkInstanceCanonical(address(ROLLUP), 0, depositAmount, Timestamp.wrap(ts.ts1));
    _checkInstanceNonCanonical(address(dead), 0, Timestamp.wrap(ts.ts1));

    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount, Timestamp.wrap(ts.ts2));
    _checkInstanceNonCanonical(address(dead), 0, Timestamp.wrap(ts.ts2));

    _checkInstanceCanonical(
      address(ROLLUP), depositAmount, depositAmount * 2, Timestamp.wrap(ts.ts3)
    );
    _checkInstanceNonCanonical(address(dead), 0, Timestamp.wrap(ts.ts3));

    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount, Timestamp.wrap(ts.ts4));
    _checkInstanceNonCanonical(address(dead), 0, Timestamp.wrap(ts.ts4));

    _checkInstanceNonCanonical(address(ROLLUP), depositAmount, Timestamp.wrap(ts.ts5));
    _checkInstanceCanonical(address(dead), 0, depositAmount, Timestamp.wrap(ts.ts5));

    _checkInstanceNonCanonical(address(ROLLUP), 0, Timestamp.wrap(ts.ts6));
    _checkInstanceCanonical(address(dead), 0, depositAmount, Timestamp.wrap(ts.ts6));

    assertEq(gse.getVotingPower(WITHDRAWER), depositAmount, "voting power user");

    // Voting
    _checkPowerUsed(WITHDRAWER, 0, 0, votingTime);
    _checkPowerUsed(address(ROLLUP), 0, depositAmount, votingTime);
    _checkPowerUsed(canonical, 0, depositAmount * 2, votingTime);

    // Checking extra here just for sanity
    uint256 powerToVoteSelf = gse.getVotingPowerAt(address(ROLLUP), Timestamp.wrap(votingTime));
    assertEq(powerToVoteSelf, depositAmount, "powerToVoteSelf");

    // We go to the rollup and have it vote.
    // If we did not update the registry, it and the governanceProposer still belive that the rollup is canonical
    // so it can use the governance proposer.
    // But if updated, we should instead break and explode!

    if (_updateRegistry) {
      vm.expectRevert(
        abi.encodeWithSelector(Errors.Staking__NotCanonical.selector, address(ROLLUP))
      );
    } else {
      vm.expectEmit(true, true, true, true, address(governance));
      emit IGovernance.VoteCast(proposalId, address(gse), true, depositAmount);
      vm.expectEmit(true, true, true, true, address(governance));
      emit IGovernance.VoteCast(proposalId, address(gse), true, depositAmount * 2);
    }
    ROLLUP.vote(proposalId);

    // Exit early as things revert and so will a lot below!
    if (_updateRegistry) {
      return;
    }

    assertEq(gse.getPowerUsed(WITHDRAWER, 0), 0, "power used");
    assertEq(gse.getPowerUsed(address(ROLLUP), 0), depositAmount, "power used");
    assertEq(gse.getPowerUsed(canonical, 0), depositAmount * 2, "power used");

    // Make sure we cannot double vote. Here we just bypass and try to make the rollup do it directly.
    vm.prank(address(ROLLUP));
    vm.expectRevert(
      abi.encodeWithSelector(
        GovErrors.Delegation__InsufficientPower.selector,
        address(ROLLUP),
        depositAmount,
        depositAmount * 2
      )
    );
    gse.vote(proposalId, powerToVoteSelf, true);

    // Now make the same checks but with the canonical
    powerToVoteSelf = gse.getVotingPowerAt(canonical, Timestamp.wrap(votingTime));
    assertEq(powerToVoteSelf, depositAmount * 2, "powerToVoteSelf");
    vm.prank(address(ROLLUP));
    vm.expectRevert(
      abi.encodeWithSelector(
        GovErrors.Delegation__InsufficientPower.selector,
        address(canonical),
        depositAmount * 2,
        depositAmount * 4
      )
    );
    gse.voteWithCanonical(proposalId, powerToVoteSelf, true);

    {
      // Finalise the exit. We are doing it down here because the timetravel messes with voting
      Timestamp govUnlocks = governance.getWithdrawal(0).unlocksAt;
      Timestamp exitAt = ROLLUP.getExit(ATTESTER2).exitableAt;

      if (_overwriteDelay) {
        assertTrue(govUnlocks > exitAt, "govUnlocks > exitAt");
      } else {
        assertTrue(govUnlocks < exitAt, "govUnlocks < exitAt");
      }

      vm.warp(Timestamp.unwrap(govUnlocks > exitAt ? govUnlocks : exitAt));
    }

    if (_claim) {
      governance.finaliseWithdraw(0);
    }
    ROLLUP.finaliseWithdraw(ATTESTER2);

    assertEq(governance.totalPowerAt(Timestamp.wrap(block.timestamp)), depositAmount * 2);
    assertEq(stakingAsset.balanceOf(WITHDRAWER), depositAmount);

    assertEq(governance.getProposal(proposalId).summedBallot.yea, depositAmount * 3, "yeas");
    assertEq(governance.getProposal(proposalId).summedBallot.nea, 0, "neas");
  }

  function _checkPowerUsed(address _delegatee, uint256 _used, uint256 _power, uint256 _votingTime)
    internal
    view
  {
    uint256 proposalId = 0;
    assertEq(gse.getPowerUsed(_delegatee, proposalId), _used, "power used");
    assertEq(gse.getVotingPowerAt(_delegatee, Timestamp.wrap(_votingTime)), _power, "voting power");
  }

  function _checkInstanceCanonical(
    address _instance,
    uint256 _specific,
    uint256 _canonical,
    Timestamp _ts
  ) internal view {
    assertEq(gse.getVotingPowerAt(canonical, _ts), _canonical, "voting power canonical");
    assertEq(gse.getVotingPowerAt(_instance, _ts), _specific, "voting power specific");
    assertEq(_instance, gse.getCanonicalAt(_ts), "instance != canonical");
  }

  function _checkInstanceNonCanonical(address _instance, uint256 _specific, Timestamp _ts)
    internal
    view
  {
    assertEq(gse.getVotingPowerAt(_instance, _ts), _specific, "voting power specific");
    assertNotEq(_instance, gse.getCanonicalAt(_ts), "instance == canonical");
  }
}
