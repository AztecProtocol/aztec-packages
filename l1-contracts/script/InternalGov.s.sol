// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {
  Proposal, Configuration, ProposalState
} from "@aztec/governance/interfaces/IGovernance.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {RegisterNewRollupVersionPayload} from
  "../test/governance/scenario/RegisterNewRollupVersionPayload.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {Fakerollup} from "../test/governance/governance-proposer/mocks/Fakerollup.sol";
import {StakingAssetHandler} from "../src/mock/StakingAssetHandler.sol";
import {FeeAssetHandler} from "../src/mock/FeeAssetHandler.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IInstance} from "@aztec/core/interfaces/IInstance.sol";

contract GovScript is Test {
  using ProposalLib for Proposal;

  address internal constant ME = address(0xf8d7d601759CBcfB78044bA7cA9B0c0D6301A54f);

  Governance public constant governance = Governance(0xEE63E102E35F24c34b9eA09B597ACFb491c94e78);
  GovernanceProposer public constant governanceProposer =
    GovernanceProposer(0xF4bf5dF1c3B2dd67A0525Fc600E98ca51143a67D);
  TestERC20 public constant stakingAsset = TestERC20(0x5C30c66847866A184ccb5197cBE31Fce7A92eB26);
  TestERC20 public constant feeAsset = TestERC20(0x487Ff89A8bDAEFeA2Ad10D3e23727ccdA8F845B9);
  FeeAssetHandler public constant feeAssetHandler =
    FeeAssetHandler(0x80d848Dc9F52DF56789e2d62Ce66F19555FF1019);
  StakingAssetHandler public constant stakingAssetHandler =
    StakingAssetHandler(0xF739D03e98e23A7B65940848aBA8921fF3bAc4b2);
  IRegistry public constant registry = IRegistry(0x4d2cC1d5fb6BE65240e0bFC8154243e69c0Fb19E);

  IRollup public rollup;
  IValidatorSelection public validatorSelection;
  Proposal internal proposal;

  string[8] internal stateNames =
    ["Pending", "Active", "Queued", "Executable", "Rejected", "Executed", "Dropped", "Expired"];

  function setUp() public {
    emit log("# Chain");
    emit log_named_uint("\tChain ID    ", block.chainid);
    emit log_named_uint("\tBlock number", block.number);
    emit log_named_uint("\tTimestamp   ", block.timestamp);

    rollup = IRollup(address(registry.getCanonicalRollup()));
    validatorSelection = IValidatorSelection(address(rollup));
  }

  function miscLookup() public {
    emit log_named_address("# Registry", address(registry));
    emit log_named_address("\tOwner", Ownable(address(registry)).owner());
    emit log_named_uint("\tNumber of versions", registry.numberOfVersions());
    emit log_named_address("\tCanonical rollup", address(registry.getCanonicalRollup()));

    emit log_named_address("# Fee Asset", address(feeAsset));
    emit log_named_decimal_uint("\tMint Amount", feeAssetHandler.mintAmount(), 18);

    emit log_named_address("# Staking Asset", address(stakingAsset));
    emit log_named_uint("\tMint Interval    ", stakingAssetHandler.mintInterval());
    emit log_named_uint("\tDeposits Per Mint", stakingAssetHandler.depositsPerMint());
    emit log_named_address("\tRollup           ", address(stakingAssetHandler.getRollup()));
    emit log_named_address("\tWithdrawer       ", address(stakingAssetHandler.withdrawer()));

    emit log_named_address("# Rollup", address(rollup));
    uint256 baseFee = rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true);
    emit log_named_uint("\tBase fee", baseFee);
    emit log_named_address("\tOwner", Ownable(address(rollup)).owner());
    emit log_named_uint("\tPending block number", rollup.getPendingBlockNumber());
    emit log_named_uint("\tProven block number ", rollup.getProvenBlockNumber());
    emit log_named_uint(
      "\tNumber of attestors ", IStaking(address(rollup)).getActiveAttesterCount()
    );
    emit log_named_decimal_uint("\tMinimum stake", IStaking(address(rollup)).getDepositAmount(), 18);

    emit log_named_address("# Governance", address(governance));
    Configuration memory config = governance.getConfiguration();
    emit log_named_decimal_uint("\tquorum           ", config.quorum, 18);
    emit log_named_decimal_uint("\tvote Differential", config.voteDifferential, 18);
    emit log_named_decimal_uint("\tminimum Votes    ", config.minimumVotes, 18);
    emit log_named_uint("\tvotingDelay      ", Timestamp.unwrap(config.votingDelay));
    emit log_named_uint("\tvotingDuration   ", Timestamp.unwrap(config.votingDuration));
    emit log_named_uint("\texecutionDelay   ", Timestamp.unwrap(config.executionDelay));
    emit log_named_uint("\tgracePeriod      ", Timestamp.unwrap(config.gracePeriod));
    emit log_named_uint("\tlockDelay        ", Timestamp.unwrap(config.proposeConfig.lockDelay));
    emit log_named_decimal_uint("\tlockAmount       ", config.proposeConfig.lockAmount, 18);

    emit log_named_address("# Governance proposer", address(governanceProposer));
    emit log_named_uint("\tLifetime in rounds", governanceProposer.LIFETIME_IN_ROUNDS());
    emit log_named_uint("\tN", governanceProposer.N());
    emit log_named_uint("\tM", governanceProposer.M());
  }

  function lookAtRounds() public {
    uint256 lifetime = governanceProposer.LIFETIME_IN_ROUNDS();
    uint256 n = governanceProposer.N();
    uint256 m = governanceProposer.M();

    emit log_named_uint("lifetime", lifetime);
    emit log_named_uint("n       ", n);
    emit log_named_uint("m       ", m);

    Slot currentSlot = validatorSelection.getCurrentSlot();
    uint256 currentRound = governanceProposer.computeRound(currentSlot);
    emit log_named_uint("currentSlot     ", Slot.unwrap(currentSlot));
    emit log_named_uint("currentRound    ", currentRound);
    emit log_named_uint("slots into round", 1 + Slot.unwrap(currentSlot) % m);

    uint256 lowerLimit = currentRound > lifetime ? currentRound - lifetime : 0;
    bool found = false;

    for (uint256 i = lowerLimit; i <= currentRound; i++) {
      (, IPayload leader, bool executed) = governanceProposer.rounds(address(rollup), i);
      uint256 yeaCount = governanceProposer.yeaCount(address(rollup), i, leader);

      emit log_named_uint("Proposal at round", i);
      emit log_named_uint("\tyeaCount", yeaCount);
      emit log_named_address("\tleader", address(leader));

      if (!executed && yeaCount >= n) {
        emit log_named_uint("\tGood proposal at round", i);
        found = true;
      }
    }

    if (!found) {
      emit log("No good proposal found");
    }
  }

  function lookAtProposal(uint256 _proposalId) public {
    proposal = governance.getProposal(_proposalId);
    ProposalState state = governance.getProposalState(_proposalId);

    Timestamp pendingThrough = proposal.pendingThrough();

    emit log_named_string("Proposal state", stateNames[uint256(state)]);
    emit log_named_address("Proposal payload", address(proposal.payload));
    emit log_named_uint("pendingThrough   ", Timestamp.unwrap(pendingThrough));
    emit log_named_uint("activeThrough    ", Timestamp.unwrap(proposal.activeThrough()));
    emit log_named_uint("queuedThrough    ", Timestamp.unwrap(proposal.queuedThrough()));
    emit log_named_uint("executableThrough", Timestamp.unwrap(proposal.executableThrough()));
    emit log_named_uint("creation         ", Timestamp.unwrap(proposal.creation));
    emit log_named_decimal_uint("yeaCount         ", proposal.summedBallot.yea, 18);
    emit log_named_decimal_uint("neaCount         ", proposal.summedBallot.nea, 18);

    Timestamp ts = Timestamp.wrap(block.timestamp) < pendingThrough
      ? Timestamp.wrap(block.timestamp)
      : pendingThrough;

    emit log_named_decimal_uint("power            ", governance.powerAt(ME, ts), 18);
  }

  function lookAtPayload(address _payload) public {
    emit log_named_address("Payload", _payload);
    IPayload.Action[] memory actions = IPayload(_payload).getActions();

    for (uint256 i = 0; i < actions.length; i++) {
      emit log_named_address("\tTarget", actions[i].target);
      emit log_named_bytes("\tData  ", actions[i].data);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                          MUTATING FUNCTIONS START HERE                     */
  /* -------------------------------------------------------------------------- */

  function fundRewardDistributor() public {
    RewardDistributor rewardDistributor =
      RewardDistributor(address(registry.getRewardDistributor()));

    TestERC20 asset = TestERC20(address(rewardDistributor.ASSET()));
    uint256 blockReward = rewardDistributor.BLOCK_REWARD();

    emit log_named_decimal_uint(
      "Reward distributor balance", asset.balanceOf(address(rewardDistributor)), 18
    );

    vm.startBroadcast(ME);
    asset.mint(address(rewardDistributor), 200000 * blockReward);
    vm.stopBroadcast();

    emit log_named_decimal_uint(
      "Reward distributor balance", asset.balanceOf(address(rewardDistributor)), 18
    );
  }

  // This should only be called if we figure that we are minting too little fee asset
  function updateFeeHandlerConfig() public {
    uint256 newMintAmount = 1000 * 1e18;
    uint256 currentMintAmount = feeAssetHandler.mintAmount();

    if (newMintAmount == currentMintAmount) {
      emit log("New mint amount is the same as the current mint amount");
      return;
    }

    emit log_named_decimal_uint("Mint amount", currentMintAmount, 18);

    vm.startBroadcast(ME);
    feeAssetHandler.setMintAmount(newMintAmount);
    vm.stopBroadcast();

    emit log_named_decimal_uint("Mint amount", feeAssetHandler.mintAmount(), 18);
  }

  // This should be called to update the staking asset handler config when the rollup is updated
  function updateStakingAssetHandlerConfig() public {
    uint256 mintInterval = 60 * 60 * 24;
    uint256 depositsPerMint = 100;
    address amin = 0x3b218d0F26d15B36C715cB06c949210a0d630637;

    // Update the deposits per mint if it differs
    if (stakingAssetHandler.mintInterval() != mintInterval) {
      vm.startBroadcast(ME);
      stakingAssetHandler.setMintInterval(mintInterval);
      vm.stopBroadcast();
    }

    // Update the deposits per mint if it differs
    if (stakingAssetHandler.depositsPerMint() != depositsPerMint) {
      vm.startBroadcast(ME);
      stakingAssetHandler.setDepositsPerMint(depositsPerMint);
      vm.stopBroadcast();
    }

    // Update the withdrawer if it's not amin
    if (stakingAssetHandler.withdrawer() != amin) {
      vm.startBroadcast(ME);
      stakingAssetHandler.setWithdrawer(amin);
      vm.stopBroadcast();
    }

    // Add amin if not already in the list
    if (!stakingAssetHandler.isUnhinged(amin)) {
      vm.startBroadcast(ME);
      stakingAssetHandler.addUnhinged(amin);
      vm.stopBroadcast();
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                      GOV MUTATING FUNCTIONS START HERE                     */
  /* -------------------------------------------------------------------------- */

  // Pass the ownership of registry to governance
  function passOwnership() public {
    vm.startBroadcast(ME);
    Ownable(address(registry)).transferOwnership(address(governance));
    vm.stopBroadcast();
    assertEq(Ownable(address(registry)).owner(), address(governance));
    emit log_named_address(
      "Passed ownership of registry to governance", Ownable(address(registry)).owner()
    );
  }

  // Deposit enough funds to be able to pass a vote
  function deposit() public {
    uint256 alreadyDeposited = governance.powerAt(ME, Timestamp.wrap(block.timestamp));
    uint256 requiredBalance = governance.getConfiguration().minimumVotes;

    if (alreadyDeposited >= requiredBalance) {
      emit log("Already deposited enough");
      return;
    }

    uint256 missing = requiredBalance - alreadyDeposited;
    uint256 balance = stakingAsset.balanceOf(ME);

    if (balance < missing) {
      uint256 toMint = missing - balance;
      emit log_named_decimal_uint("minting", toMint, 18);

      vm.startBroadcast(ME);
      stakingAsset.mint(ME, toMint);
      vm.stopBroadcast();
    }

    vm.startBroadcast(ME);
    stakingAsset.approve(address(governance), missing);
    governance.deposit(ME, missing);
    vm.stopBroadcast();

    uint256 power = governance.powerAt(ME, Timestamp.wrap(block.timestamp));
    emit log_named_decimal_uint("power  ", power, 18);
  }

  // Use this to get the payload address that we want to give to the governanceProposer
  function createPayload(address _instance) public returns (RegisterNewRollupVersionPayload) {
    emit log_named_address("deploying payload to add instance", _instance);

    vm.startBroadcast(ME);
    RegisterNewRollupVersionPayload payload =
      new RegisterNewRollupVersionPayload(registry, IInstance(_instance));
    vm.stopBroadcast();

    lookAtPayload(address(payload));

    return payload;
  }

  // Use one of the values from lookAtRounds()
  function propose(uint256 _round) public {
    emit log_named_uint("proposing payload at round", _round);

    uint256 expectedId = governance.proposalCount();
    emit log_named_uint("expected id", expectedId);

    vm.startBroadcast(ME);
    governanceProposer.executeProposal(_round);
    vm.stopBroadcast();

    proposal = governance.getProposal(expectedId);
    emit log_named_address("Proposal payload", address(proposal.payload));
  }

  // Use to vote on the proposal from propose()
  function vote(uint256 _proposalId) public {
    emit log_named_uint("voting on proposal", _proposalId);

    proposal = governance.getProposal(_proposalId);

    uint256 power = governance.powerAt(ME, proposal.pendingThrough());
    emit log_named_decimal_uint("power", power, 18);

    vm.startBroadcast(ME);
    governance.vote(_proposalId, power, true);
    vm.stopBroadcast();

    emit log("voted");
  }

  // Use to execute the proposal from vote()
  function executeProposal(uint256 _proposalId) public {
    emit log_named_uint("executing proposal", _proposalId);

    emit log_named_uint("number of versions", registry.numberOfVersions());

    vm.startBroadcast(ME);
    governance.execute(_proposalId);
    vm.stopBroadcast();

    emit log_named_uint("number of versions", registry.numberOfVersions());
  }

  /* -------------------------------------------------------------------------- */
  /*                          FLOW TEST  START HERE                             */
  /* -------------------------------------------------------------------------- */

  function testRun() public {
    // This test run is essentially showcasing the flow that we want to use to update for the intial update
    // It is NOT using the usual flow for proposing, but just impersonating the governance proposer, to easily
    // showcase and simulate the rest of the flow.
    // 1. We pass over the ownership of the registry to governance (once off)
    // 2. We deposit enough funds to be able to pass a vote (once off)
    // 3. We create a payload to register a new rollup version (per update)
    // 3.5 (not shown here), we update the sequencers to cast signals for the payload
    // 4. We propose the payload (per update)
    // 5. We vote on the proposal (per update)
    // 6. We execute the proposal (per update)

    //    passOwnership();

    //    deposit();

    vm.broadcast();
    Fakerollup fakeRollup = new Fakerollup();

    RegisterNewRollupVersionPayload payload = createPayload(address(fakeRollup));

    vm.broadcast(address(governanceProposer));
    governance.propose(payload);

    lookAtProposal(0);

    vm.warp(block.timestamp + 100);
    vote(0);

    vm.warp(block.timestamp + 4000);

    lookAtProposal(0);

    emit log_named_uint("number of versions", registry.numberOfVersions());
    emit log_named_address("rollup address", address(registry.getCanonicalRollup()));

    executeProposal(0);

    emit log_named_uint("number of versions", registry.numberOfVersions());
    emit log_named_address("rollup address", address(registry.getCanonicalRollup()));
  }
}
