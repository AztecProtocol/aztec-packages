// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

contract UpdateConfigurationTest {
    function test_WhenCallerIsNotSelf() external {
        // it revert
    }

    modifier whenCallerIsSelf() {
        _;
    }

    function test_WhenConfigurationIsInvalid() external whenCallerIsSelf {
        // it revert
    }

    function test_WhenConfigurationIsValid() external whenCallerIsSelf {
        // it updates the configuration
        // it emits {ConfigurationUpdates} event
    }
}
