// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract UpdateConfigurationTest is GovernanceBase {
  using ConfigurationLib for DataStructures.Configuration;

  DataStructures.Configuration internal config;

  // Doing this as we are using a lib that works on storage
  DataStructures.Configuration internal fresh;

  function setUp() public override(GovernanceBase) {
    super.setUp();
    config = governance.getConfiguration();
  }

  function test_WhenCallerIsNotSelf() external {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__CallerNotSelf.selector, address(this), address(governance)
      )
    );
    governance.updateConfiguration(config);
  }

  modifier whenCallerIsSelf() {
    _;
  }

  modifier whenConfigurationIsInvalid() {
    _;
  }

  function test_WhenQuorumLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert
    config.quorum = bound(_val, 0, ConfigurationLib.QUORUM_LOWER - 1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Governance__ConfigurationLib__QuorumTooSmall.selector)
    );

    vm.prank(address(governance));
    governance.updateConfiguration(config);

    config.quorum = bound(_val, ConfigurationLib.QUORUM_UPPER + 1, type(uint256).max);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Governance__ConfigurationLib__QuorumTooBig.selector)
    );

    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenDifferentialLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert
    config.voteDifferential =
      bound(_val, ConfigurationLib.DIFFERENTIAL_UPPER + 1, type(uint256).max);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Governance__ConfigurationLib__DifferentialTooBig.selector)
    );

    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenMinimumVotesLtMin(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert
    config.minimumVotes = bound(_val, 0, ConfigurationLib.VOTES_LOWER - 1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Governance__ConfigurationLib__InvalidMinimumVotes.selector)
    );

    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenLockAmountLtMin(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert
    config.proposeConfig.lockAmount = bound(_val, 0, ConfigurationLib.VOTES_LOWER - 1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Governance__ConfigurationLib__LockAmountTooSmall.selector)
    );

    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenLockDelayLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert
    config.proposeConfig.lockDelay =
      Timestamp.wrap(bound(_val, 0, Timestamp.unwrap(ConfigurationLib.TIME_LOWER) - 1));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooSmall.selector, "LockDelay"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);

    config.proposeConfig.lockDelay = Timestamp.wrap(
      bound(_val, Timestamp.unwrap(ConfigurationLib.TIME_UPPER) + 1, type(uint256).max)
    );
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Governance__ConfigurationLib__TimeTooBig.selector, "LockDelay")
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenVotingDelayLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert

    config.votingDelay =
      Timestamp.wrap(bound(_val, 0, Timestamp.unwrap(ConfigurationLib.TIME_LOWER) - 1));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooSmall.selector, "VotingDelay"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);

    config.votingDelay = Timestamp.wrap(
      bound(_val, Timestamp.unwrap(ConfigurationLib.TIME_UPPER) + 1, type(uint256).max)
    );
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooBig.selector, "VotingDelay"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenVotingDurationLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert

    config.votingDuration =
      Timestamp.wrap(bound(_val, 0, Timestamp.unwrap(ConfigurationLib.TIME_LOWER) - 1));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooSmall.selector, "VotingDuration"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);

    config.votingDuration = Timestamp.wrap(
      bound(_val, Timestamp.unwrap(ConfigurationLib.TIME_UPPER) + 1, type(uint256).max)
    );
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooBig.selector, "VotingDuration"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenExecutionDelayLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert

    config.executionDelay =
      Timestamp.wrap(bound(_val, 0, Timestamp.unwrap(ConfigurationLib.TIME_LOWER) - 1));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooSmall.selector, "ExecutionDelay"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);

    config.executionDelay = Timestamp.wrap(
      bound(_val, Timestamp.unwrap(ConfigurationLib.TIME_UPPER) + 1, type(uint256).max)
    );
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooBig.selector, "ExecutionDelay"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  function test_WhenGracePeriodLtMinOrGtMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsInvalid
  {
    // it revert

    config.gracePeriod =
      Timestamp.wrap(bound(_val, 0, Timestamp.unwrap(ConfigurationLib.TIME_LOWER) - 1));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooSmall.selector, "GracePeriod"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);

    config.gracePeriod = Timestamp.wrap(
      bound(_val, Timestamp.unwrap(ConfigurationLib.TIME_UPPER) + 1, type(uint256).max)
    );
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__ConfigurationLib__TimeTooBig.selector, "GracePeriod"
      )
    );
    vm.prank(address(governance));
    governance.updateConfiguration(config);
  }

  modifier whenConfigurationIsValid() {
    // the local `config` will be modified throughout the execution
    // We check that it matches the what is seen on chain afterwards
    DataStructures.Configuration memory old = governance.getConfiguration();

    _;

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.ConfigurationUpdated(Timestamp.wrap(block.timestamp));
    vm.prank(address(governance));
    governance.updateConfiguration(config);

    fresh = governance.getConfiguration();

    assertEq(config.executionDelay, fresh.executionDelay);
    assertEq(config.gracePeriod, fresh.gracePeriod);
    assertEq(config.minimumVotes, fresh.minimumVotes);
    assertEq(config.quorum, fresh.quorum);
    assertEq(config.voteDifferential, fresh.voteDifferential);
    assertEq(config.votingDelay, fresh.votingDelay);
    assertEq(config.votingDuration, fresh.votingDuration);

    assertEq(config.withdrawalDelay(), fresh.withdrawalDelay());
    assertEq(
      config.withdrawalDelay(),
      Timestamp.wrap(Timestamp.unwrap(fresh.votingDelay) / 5) + fresh.votingDuration
        + fresh.executionDelay
    );
    assertEq(config.proposeConfig.lockAmount, fresh.proposeConfig.lockAmount);
    assertEq(config.proposeConfig.lockDelay, fresh.proposeConfig.lockDelay);

    // Ensure that there is a difference between the two
    assertFalse(
      old.executionDelay == fresh.executionDelay && old.gracePeriod == fresh.gracePeriod
        && old.minimumVotes == fresh.minimumVotes && old.quorum == fresh.quorum
        && old.voteDifferential == fresh.voteDifferential && old.votingDelay == fresh.votingDelay
        && old.votingDuration == fresh.votingDuration
        && old.proposeConfig.lockAmount == fresh.proposeConfig.lockAmount
        && old.proposeConfig.lockDelay == fresh.proposeConfig.lockDelay
    );
  }

  function test_WhenQuorumGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event

    uint256 val = bound(_val, ConfigurationLib.QUORUM_LOWER, ConfigurationLib.QUORUM_UPPER);

    vm.assume(val != config.quorum);
    config.quorum = val;
  }

  function test_WhenDifferentialGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event

    uint256 val = bound(_val, 0, ConfigurationLib.DIFFERENTIAL_UPPER);

    vm.assume(val != config.voteDifferential);
    config.voteDifferential = val;
  }

  function test_WhenMinimumVotesGeMin(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event

    uint256 val = bound(_val, ConfigurationLib.VOTES_LOWER, type(uint256).max);

    vm.assume(val != config.minimumVotes);
    config.minimumVotes = val;
  }

  function test_WhenLockAmountGeMin(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event

    uint256 val = bound(_val, ConfigurationLib.VOTES_LOWER, type(uint256).max);

    vm.assume(val != config.proposeConfig.lockAmount);
    config.proposeConfig.lockAmount = val;
  }

  function test_WhenLockDelayGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event
    Timestamp val = Timestamp.wrap(
      bound(
        _val,
        Timestamp.unwrap(ConfigurationLib.TIME_LOWER),
        Timestamp.unwrap(ConfigurationLib.TIME_UPPER)
      )
    );

    vm.assume(val != config.proposeConfig.lockDelay);
    config.proposeConfig.lockDelay = val;
  }

  function test_WhenVotingDelayGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event
    Timestamp val = Timestamp.wrap(
      bound(
        _val,
        Timestamp.unwrap(ConfigurationLib.TIME_LOWER),
        Timestamp.unwrap(ConfigurationLib.TIME_UPPER)
      )
    );

    vm.assume(val != config.votingDelay);
    config.votingDelay = val;
  }

  function test_WhenVotingDurationGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event
    Timestamp val = Timestamp.wrap(
      bound(
        _val,
        Timestamp.unwrap(ConfigurationLib.TIME_LOWER),
        Timestamp.unwrap(ConfigurationLib.TIME_UPPER)
      )
    );

    vm.assume(val != config.votingDuration);
    config.votingDuration = val;
  }

  function test_WhenExecutionDelayGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event

    Timestamp val = Timestamp.wrap(
      bound(
        _val,
        Timestamp.unwrap(ConfigurationLib.TIME_LOWER),
        Timestamp.unwrap(ConfigurationLib.TIME_UPPER)
      )
    );

    vm.assume(val != config.executionDelay);
    config.executionDelay = val;
  }

  function test_WhenGracePeriodGeMinAndLeMax(uint256 _val)
    external
    whenCallerIsSelf
    whenConfigurationIsValid
  {
    // it updates the configuration
    // it emits {ConfigurationUpdated} event

    Timestamp val = Timestamp.wrap(
      bound(
        _val,
        Timestamp.unwrap(ConfigurationLib.TIME_LOWER),
        Timestamp.unwrap(ConfigurationLib.TIME_UPPER)
      )
    );

    vm.assume(val != config.gracePeriod);
    config.gracePeriod = val;
  }
}
