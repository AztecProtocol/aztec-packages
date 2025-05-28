// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GSEBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {IStakingCore, Status, AttesterView} from "@aztec/core/interfaces/IStaking.sol";
import {IGSE} from "@aztec/core/staking/GSE.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";

// Collection of minimal test suite to get some idea
// Not to be seen as full tests
contract MinimalDelegationTest is GSEBase {
  using stdStorage for StdStorage;

  address canonical;
  uint256 depositAmount;

  function setUp() public override {
    super.setUp();
    canonical = gse.CANONICAL_MAGIC_ADDRESS();
    depositAmount = ROLLUP.getMinimumStake();

    vm.label(canonical, "canonical");
  }

  function test_votingPower(bool _overwriteDelay, bool _claim) public {
    // Setup

    address proposer = governance.governanceProposer();
    vm.prank(proposer);
    governance.propose(IPayload(address(ROLLUP))); // Useless payload, just to get it in there.

    uint256 votingTime =
      Timestamp.unwrap(ProposalLib.pendingThroughMemory(governance.getProposal(0)));

    uint256 ts1 = block.timestamp;
    uint256 ts2 = ts1 + 10;
    uint256 ts3 = ts2 + 10;

    require(votingTime > ts3, "ts");
    uint256 ts4 = votingTime + 10;
    uint256 ts5 = ts4 + 10;
    uint256 ts6 = ts5 + 10;
    uint256 ts7 = ts6 + 10;

    // Lets start
    assertEq(gse.getVotingPower(canonical), 0, "votingPowerCanonical");

    help__deposit(ATTESTER, PROPOSER, WITHDRAWER, true);

    vm.warp(ts2);

    help__deposit(PROPOSER, PROPOSER, WITHDRAWER, false);

    vm.warp(ts3);

    help__deposit(WITHDRAWER, PROPOSER, WITHDRAWER, true);

    vm.warp(ts4);

    _checkInstanceCanonical(address(ROLLUP), 0, depositAmount, Timestamp.wrap(ts1));
    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount, Timestamp.wrap(ts2));
    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount * 2, Timestamp.wrap(ts3));

    assertEq(gse.getVotingPower(ATTESTER), 0, "voting power user");
    assertEq(gse.getVotingPower(PROPOSER), 0, "voting power user");
    assertEq(gse.getVotingPower(WITHDRAWER), 0, "voting power user");

    vm.prank(WITHDRAWER);
    gse.delegate(canonical, ATTESTER, WITHDRAWER);

    vm.warp(ts5);

    // From the view of the GSE we make a new version canonical.
    // Beware that the registry don't have the same, and that we are abusing this
    // since the governance proposer still believe the old rollup is canonical
    // This setup is contrived, but let us test a lot very concisely.
    vm.prank(gse.owner());
    gse.addRollup(address(0xdead));

    vm.warp(ts6);

    assertEq(governance.totalPowerAt(Timestamp.wrap(ts6)), depositAmount * 3);

    if (_overwriteDelay) {
      stdstore.target(address(ROLLUP)).sig("getExitDelay()").checked_write(5);
    }

    vm.prank(WITHDRAWER);
    ROLLUP.initiateWithdraw(PROPOSER, WITHDRAWER);

    assertEq(governance.totalPowerAt(Timestamp.wrap(ts6)), depositAmount * 2);

    vm.warp(ts7);

    // Check power at different points in time.
    _checkInstanceCanonical(address(ROLLUP), 0, depositAmount, Timestamp.wrap(ts1));
    _checkInstanceNonCanonical(address(0xdead), 0, Timestamp.wrap(ts1));

    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount, Timestamp.wrap(ts2));
    _checkInstanceNonCanonical(address(0xdead), 0, Timestamp.wrap(ts2));

    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount * 2, Timestamp.wrap(ts3));
    _checkInstanceNonCanonical(address(0xdead), 0, Timestamp.wrap(ts3));

    _checkInstanceCanonical(address(ROLLUP), depositAmount, depositAmount, Timestamp.wrap(ts4));
    _checkInstanceNonCanonical(address(0xdead), 0, Timestamp.wrap(ts4));

    _checkInstanceNonCanonical(address(ROLLUP), depositAmount, Timestamp.wrap(ts5));
    _checkInstanceCanonical(address(0xdead), 0, depositAmount, Timestamp.wrap(ts5));

    _checkInstanceNonCanonical(address(ROLLUP), 0, Timestamp.wrap(ts6));
    _checkInstanceCanonical(address(0xdead), 0, depositAmount, Timestamp.wrap(ts6));

    assertEq(gse.getVotingPower(WITHDRAWER), depositAmount, "voting power user");

    // Voting
    _checkPowerUsed(WITHDRAWER, 0, 0, votingTime);
    _checkPowerUsed(address(ROLLUP), 0, depositAmount, votingTime);
    _checkPowerUsed(canonical, 0, depositAmount * 2, votingTime);

    // Checking extra here just for sanity
    uint256 powerToVoteSelf = gse.getVotingPowerAt(address(ROLLUP), Timestamp.wrap(votingTime));
    assertEq(powerToVoteSelf, depositAmount, "powerToVoteSelf");

    // We go to the rollup and have it vote. We can do this because the registry and governanceProposer still
    // belive that the rollup is canonical so it can use the governance proposer. Thereby, the rollup is voting
    // on a proposal that it have made itself.
    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.VoteCast(0, address(gse), true, depositAmount);
    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.VoteCast(0, address(gse), true, depositAmount * 2);
    ROLLUP.vote(0);

    assertEq(gse.getPowerUsed(WITHDRAWER, 0), 0, "power used");
    assertEq(gse.getPowerUsed(address(ROLLUP), 0), depositAmount, "power used");
    assertEq(gse.getPowerUsed(canonical, 0), depositAmount * 2, "power used");

    // Make sure we cannot double vote. Here we just bypass and try to make the rollup do it directly.
    vm.prank(address(ROLLUP));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__InsufficientPower.selector, depositAmount, depositAmount * 2
      )
    );
    gse.vote(0, powerToVoteSelf, true);

    // Now make the same checks but with the canonical
    powerToVoteSelf = gse.getVotingPowerAt(canonical, Timestamp.wrap(votingTime));
    assertEq(powerToVoteSelf, depositAmount * 2, "powerToVoteSelf");
    vm.prank(address(ROLLUP));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__InsufficientPower.selector, depositAmount * 2, depositAmount * 4
      )
    );
    gse.voteWithCanonical(0, powerToVoteSelf, true);

    // Finalise the exit. We are doing it down here because the timetravel messes with voting
    Timestamp govUnlocks = governance.getWithdrawal(0).unlocksAt;
    Timestamp exitAt = ROLLUP.getExit(PROPOSER).exitableAt;

    if (_overwriteDelay) {
      assertTrue(govUnlocks > exitAt, "govUnlocks > exitAt");
    } else {
      assertTrue(govUnlocks < exitAt, "govUnlocks < exitAt");
    }

    vm.warp(Timestamp.unwrap(govUnlocks > exitAt ? govUnlocks : exitAt));

    if (_claim) {
      governance.finaliseWithdraw(0);
    }
    ROLLUP.finaliseWithdraw(PROPOSER);

    assertEq(governance.totalPowerAt(Timestamp.wrap(block.timestamp)), depositAmount * 2);
    assertEq(stakingAsset.balanceOf(WITHDRAWER), depositAmount);

    uint256 yeas = governance.getProposal(0).summedBallot.yea;
    uint256 neas = governance.getProposal(0).summedBallot.nea;

    assertEq(yeas, depositAmount * 3, "yeas");
    assertEq(neas, 0, "neas");
  }

  function _checkPowerUsed(address _delegatee, uint256 _used, uint256 _power, uint256 _votingTime)
    internal
    view
  {
    uint256 porposalId = 0;
    assertEq(gse.getPowerUsed(_delegatee, porposalId), _used, "power used");
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
    assertEq(
      gse.getEffectiveVotingPowerAt(_instance, _ts),
      _specific + _canonical,
      "effective voting power"
    );
  }

  function _checkInstanceNonCanonical(address _instance, uint256 _specific, Timestamp _ts)
    internal
    view
  {
    assertEq(gse.getVotingPowerAt(_instance, _ts), _specific, "voting power specific");
    assertEq(gse.getEffectiveVotingPowerAt(_instance, _ts), _specific, "effective voting power");
  }
}
