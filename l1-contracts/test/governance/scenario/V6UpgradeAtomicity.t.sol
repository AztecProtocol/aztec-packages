// SPDX-License-Identifier: UNLICENSED
// solhint-disable
pragma solidity >=0.8.27;

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {IGSE, GSE} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry, IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {V6UpgradePayload} from "@aztec/periphery/V6UpgradePayload.sol";
import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {TestBase} from "@test/base/Base.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";
import {RollupBuilder} from "../../builder/RollupBuilder.sol";
import {UncompressedProposalWrapper} from "@test/governance/helpers/UncompressedProposalTestLib.sol";

/// @dev The payload only reads `getRollup()` off the hatch it installs.
contract StubEscapeHatch {
  address internal immutable ROLLUP_;

  constructor(address _rollup) {
    ROLLUP_ = _rollup;
  }

  function getRollup() external view returns (address) {
    return ROLLUP_;
  }
}

/// @dev Stands in for a rollup being registered: a version to key on, a GSE to point at.
contract StandInRollup {
  IGSE public immutable GSE_;

  constructor(IGSE _gse) {
    GSE_ = _gse;
  }

  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }

  function getGSE() external view returns (GSE) {
    return GSE(address(GSE_));
  }
}

/**
 * @dev Two actions where the FIRST succeeds and the SECOND reverts, so the test can ask what
 *      `Governance.execute` leaves behind. Shaped like the real payload -- `Registry.addRollup`
 *      then something else -- because that is the ordering whose rollback actually matters.
 */
contract RegisterThenFailPayload is IPayload {
  IRegistry public immutable REGISTRY;
  address public immutable ROLLUP;

  error DeliberateFailure();

  constructor(IRegistry _registry, address _rollup) {
    REGISTRY = _registry;
    ROLLUP = _rollup;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](2);
    res[0] = Action({target: address(REGISTRY), data: abi.encodeWithSelector(IRegistry.addRollup.selector, ROLLUP)});
    res[1] = Action({target: address(this), data: abi.encodeWithSelector(this.alwaysReverts.selector)});
    return res;
  }

  function alwaysReverts() external pure {
    revert DeliberateFailure();
  }

  function getURI() external pure override(IPayload) returns (string memory) {
    return "RegisterThenFailPayload";
  }
}

contract V6UpgradeAtomicityTest is TestBase {
  UncompressedProposalWrapper internal upw = new UncompressedProposalWrapper();

  TestERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;
  Rollup internal rollup;
  IGSE internal gse;

  address internal constant EMPEROR = address(uint160(bytes20("EMPEROR")));
  uint256 internal constant VALIDATOR_COUNT = 4;
  uint256 internal constant REWARD_PER_INSERTION = 1000e18;
  uint256 internal constant REWARDER_BALANCE = 390_000e18;

  function setUp() external {
    StakingQueueConfig memory stakingQueueConfig = TestConstants.getStakingQueueConfig();
    stakingQueueConfig.normalFlushSizeMin = VALIDATOR_COUNT * 2;

    vm.warp(100_000);
    RollupBuilder builder = new RollupBuilder(address(this))
      .setGovProposerN(7)
      .setGovProposerM(10)
      .setStakingQueueConfig(stakingQueueConfig)
      .setTargetCommitteeSize(0);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    registry = builder.getConfig().registry;
    token = builder.getConfig().testERC20;
    governance = builder.getConfig().governance;
    governanceProposer = GovernanceProposer(governance.governanceProposer());
    gse = IGSE(address(rollup.getGSE()));

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](VALIDATOR_COUNT);
    for (uint256 i = 1; i <= VALIDATOR_COUNT; i++) {
      address validator = vm.addr(uint256(keccak256(abi.encode("validator", i))));
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
  }

  /**
   * @dev THE QUESTION THIS FILE EXISTS FOR: when the predecessor guard fails, is anything left
   *      behind? Every later action's effect is asserted absent, not just the first one.
   */
  function test_StalePayloadExecutesNothingAtAll() public {
    FlushRewarder oldRewarder = _deployRewarder();
    V6UpgradePayload payload = _deployV6Payload(oldRewarder);
    address newRollup = address(payload.ROLLUP());

    registry.transferOwnership(address(governance));
    uint256 proposalId = _proposeAndQueue(IPayload(address(payload)));

    // Another registration lands while this proposal sat in its delay -- the abandoned-payload
    // scenario. Pranked as governance, the registry's owner, rather than run through a second
    // proposal round: how canonical moved is irrelevant to the guard, only that it moved. It has
    // to happen AFTER the proposal is queued, because signalling resolves proposers off whatever
    // rollup is canonical at the time.
    StandInRollup other = new StandInRollup(gse);
    vm.prank(address(governance));
    registry.addRollup(IHaveVersion(address(other)));

    // Snapshot everything the payload would touch if it ran at all.
    address canonicalBefore = address(registry.getCanonicalRollup());
    address gseLatestBefore = gse.getLatestRollup();
    uint256 versionsBefore = registry.numberOfVersions();
    uint256 oldRewarderBefore = token.balanceOf(address(oldRewarder));
    uint256 newRewarderBefore = token.balanceOf(address(payload.NEW_FLUSH_REWARDER()));

    // The failing action is the payload's own self-targeted guard, so that is the target
    // `Governance` names when it refuses the whole execution.
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CallFailed.selector, address(payload)));
    governance.execute(proposalId);

    // Action 1 (Registry.addRollup) did not run.
    assertEq(address(registry.getCanonicalRollup()), canonicalBefore, "canonical rollup moved");
    assertEq(registry.numberOfVersions(), versionsBefore, "a version was registered");
    assertNotEq(address(registry.getCanonicalRollup()), newRollup, "v6 became canonical");
    // Action 2 (GSE.addRollup) did not run.
    assertEq(gse.getLatestRollup(), gseLatestBefore, "GSE latest moved");
    // Action 3 (FlushRewarder.recover) did not run.
    assertEq(token.balanceOf(address(oldRewarder)), oldRewarderBefore, "old rewarder was drained");
    assertEq(token.balanceOf(address(payload.NEW_FLUSH_REWARDER())), newRewarderBefore, "new rewarder was funded");

    // And the proposal was not consumed: the Executed flag is rolled back with everything else, so
    // a rejected attempt leaves it executable until it expires on its own.
    assertTrue(governance.getProposalState(proposalId) == ProposalState.Executable, "proposal was consumed");
  }

  /**
   * @dev The general property, independent of where the guard sits: a failure in a LATER action
   *      rolls back an earlier one that already succeeded. `Governance.execute` requires success
   *      per action inside one transaction, so a partial execution is not representable.
   */
  function test_AFailureAfterAddRollupRollsBackTheRegistration() public {
    StandInRollup target = new StandInRollup(gse);
    RegisterThenFailPayload payload = new RegisterThenFailPayload(IRegistry(address(registry)), address(target));
    registry.transferOwnership(address(governance));

    uint256 proposalId = _proposeAndQueue(IPayload(address(payload)));

    address canonicalBefore = address(registry.getCanonicalRollup());
    uint256 versionsBefore = registry.numberOfVersions();

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CallFailed.selector, address(payload)));
    governance.execute(proposalId);

    assertEq(address(registry.getCanonicalRollup()), canonicalBefore, "addRollup survived a later failure");
    assertEq(registry.numberOfVersions(), versionsBefore, "a version survived a later failure");
    assertNotEq(address(registry.getCanonicalRollup()), address(target), "target became canonical");
  }

  // -----------------------------------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------------------------------

  function _deployRewarder() internal returns (FlushRewarder) {
    FlushRewarder rewarder =
      new FlushRewarder(address(governance), IInstance(address(rollup)), IERC20(address(token)), REWARD_PER_INSERTION);
    vm.prank(token.owner());
    token.mint(address(rewarder), REWARDER_BALANCE);
    return rewarder;
  }

  function _deployV6Payload(FlushRewarder _old) internal returns (V6UpgradePayload) {
    StandInRollup newRollup = new StandInRollup(gse);
    // Window off: this file is about atomicity, and the clock would only add a second reason to
    // revert. The window itself is covered in test/periphery/V6UpgradePayload.t.sol.
    IEscapeHatch hatch = IEscapeHatch(address(new StubEscapeHatch(address(newRollup))));
    return new V6UpgradePayload(IRegistry(address(registry)), IInstance(address(newRollup)), hatch, _old, false);
  }

  /// @dev Signal → submit → vote → warp, leaving the proposal Executable.
  function _proposeAndQueue(IPayload _payload) internal returns (uint256) {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(1))));
    for (uint256 i = 0; i < 10; i++) {
      vm.prank(rollup.getCurrentProposer());
      governanceProposer.signal(_payload);
      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(rollup.getCurrentSlot() + Slot.wrap(1))));
    }
    governanceProposer.submitRoundWinner(0);

    Proposal memory proposal = governance.getProposal(0);
    assertEq(address(GSEPayload(address(proposal.payload)).getOriginalPayload()), address(_payload));

    vm.prank(token.owner());
    token.mint(EMPEROR, 10_000 ether);
    vm.startPrank(EMPEROR);
    token.approve(address(governance), 10_000 ether);
    governance.deposit(EMPEROR, 10_000 ether);
    vm.stopPrank();

    vm.warp(Timestamp.unwrap(upw.pendingThrough(proposal)) + 1);
    vm.prank(EMPEROR);
    governance.vote(0, 10_000 ether, true);

    vm.warp(Timestamp.unwrap(upw.activeThrough(proposal)) + 1);
    vm.warp(Timestamp.unwrap(upw.queuedThrough(proposal)) + 1);
    assertTrue(governance.getProposalState(0) == ProposalState.Executable, "proposal is not executable");
    return 0;
  }
}
