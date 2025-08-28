// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {SlashPayloadCloneable} from "@aztec/periphery/SlashPayloadCloneable.sol";
import {SlashPayloadLib} from "@aztec/core/libraries/SlashPayloadLib.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title SlashPayloadCloneableTest
 * @author Aztec Labs
 * @notice Test suite for SlashPayloadCloneable contract to verify proper encoding/decoding
 *         of immutable arguments and correct execution of slash actions
 */
contract SlashPayloadCloneableTest is Test {
  using Clones for address;

  SlashPayloadCloneable private implementation;
  address private mockValidatorSelection;

  // Test data
  address[] private testValidators;
  uint96[] private testAmounts;

  event SlashCalled(address indexed validator, uint96 amount);

  /**
   * @notice Helper function to decode slash call data
   * @param callData The encoded call data
   * @return selector The function selector
   * @return validator The validator address
   * @return amount The slash amount
   */
  function decodeSlashCallData(bytes memory callData)
    internal
    pure
    returns (bytes4 selector, address validator, uint96 amount)
  {
    // Extract selector
    assembly {
      selector := mload(add(callData, 0x20))
    }

    // Skip the selector (4 bytes) and decode the parameters
    bytes memory params = new bytes(callData.length - 4);
    for (uint256 i = 0; i < params.length; i++) {
      params[i] = callData[i + 4];
    }
    (validator, amount) = abi.decode(params, (address, uint96));
  }

  function setUp() public {
    // Deploy the implementation contract
    implementation = new SlashPayloadCloneable();

    // Create a mock validator selection contract
    mockValidatorSelection = makeAddr("mockValidatorSelection");
    vm.etch(mockValidatorSelection, type(MockValidatorSelection).creationCode);

    // Set up test data
    testValidators = new address[](3);
    testValidators[0] = makeAddr("validator1");
    testValidators[1] = makeAddr("validator2");
    testValidators[2] = makeAddr("validator3");

    testAmounts = new uint96[](3);
    testAmounts[0] = 100e18; // 100 tokens
    testAmounts[1] = 250e18; // 250 tokens
    testAmounts[2] = 75e18; // 75 tokens
  }

  /**
   * @notice Test basic encoding and decoding with a single validator
   */
  function test_SingleValidatorEncodingDecoding() public {
    // Create arrays with single validator
    address[] memory validators = new address[](1);
    validators[0] = testValidators[0];
    uint96[] memory amounts = new uint96[](1);
    amounts[0] = testAmounts[0];

    // Encode arguments
    bytes memory immutableArgs = SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, validators, amounts);

    // Deploy clone
    bytes32 salt = keccak256("test_single");
    address clone = Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, salt);

    // Get actions and verify
    IPayload.Action[] memory actions = SlashPayloadCloneable(clone).getActions();

    assertEq(actions.length, 1, "Should have 1 action");
    assertEq(actions[0].target, mockValidatorSelection, "Target should be validator selection");

    // Decode the call data to verify validator and amount
    (bytes4 selector, address validator, uint96 amount) = decodeSlashCallData(actions[0].data);
    assertEq(selector, IStakingCore.slash.selector, "Should be slash selector");
    assertEq(validator, validators[0], "Validator should match");
    assertEq(amount, amounts[0], "Amount should match");
  }

  /**
   * @notice Test encoding and decoding with multiple validators
   */
  function test_MultipleValidatorsEncodingDecoding() public {
    // Encode arguments with all test validators
    bytes memory immutableArgs =
      SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, testValidators, testAmounts);

    // Deploy clone
    bytes32 salt = keccak256("test_multiple");
    address clone = Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, salt);

    // Get actions and verify
    IPayload.Action[] memory actions = SlashPayloadCloneable(clone).getActions();

    assertEq(actions.length, testValidators.length, "Should have matching number of actions");

    // Verify each action
    for (uint256 i = 0; i < testValidators.length; i++) {
      assertEq(actions[i].target, mockValidatorSelection, "Target should be validator selection");

      (bytes4 selector, address validator, uint96 amount) = decodeSlashCallData(actions[i].data);
      assertEq(selector, IStakingCore.slash.selector, "Should be slash selector");
      assertEq(validator, testValidators[i], string.concat("Validator should match at index ", vm.toString(i)));
      assertEq(amount, testAmounts[i], string.concat("Amount should match at index ", vm.toString(i)));
    }
  }

  /**
   * @notice Test that getURI returns expected value
   */
  function test_GetURI() public {
    // Deploy any clone to test URI
    bytes memory immutableArgs =
      SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, testValidators, testAmounts);

    address clone =
      Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, keccak256("test_uri"));

    string memory uri = SlashPayloadCloneable(clone).getURI();
    assertEq(uri, "SlashPayload", "URI should be 'SlashPayload'");
  }

  /**
   * @notice Test with edge case: empty validators array
   */
  function test_EmptyValidatorsArray() public {
    address[] memory emptyValidators = new address[](0);
    uint96[] memory emptyAmounts = new uint96[](0);

    bytes memory immutableArgs =
      SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, emptyValidators, emptyAmounts);

    address clone =
      Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, keccak256("test_empty"));

    IPayload.Action[] memory actions = SlashPayloadCloneable(clone).getActions();
    assertEq(actions.length, 0, "Should have no actions for empty arrays");
  }

  /**
   * @notice Test with large amounts (near uint96 max)
   */
  function test_LargeAmounts() public {
    address[] memory validators = new address[](2);
    validators[0] = makeAddr("validator_large1");
    validators[1] = makeAddr("validator_large2");

    uint96[] memory amounts = new uint96[](2);
    amounts[0] = type(uint96).max - 1; // Near max uint96
    amounts[1] = type(uint96).max; // Max uint96

    bytes memory immutableArgs = SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, validators, amounts);

    address clone =
      Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, keccak256("test_large"));

    IPayload.Action[] memory actions = SlashPayloadCloneable(clone).getActions();

    // Verify large amounts are preserved correctly
    for (uint256 i = 0; i < 2; i++) {
      (, address validator, uint96 amount) = decodeSlashCallData(actions[i].data);
      assertEq(validator, validators[i], "Large amount validator should match");
      assertEq(amount, amounts[i], "Large amount should be preserved");
    }
  }

  /**
   * @notice Test deterministic address prediction
   */
  function test_DeterministicAddressPrediction() public {
    bytes memory immutableArgs =
      SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, testValidators, testAmounts);

    bytes32 salt = keccak256("deterministic_test");

    // Predict address before deployment
    address predictedAddress =
      Clones.predictDeterministicAddressWithImmutableArgs(address(implementation), immutableArgs, salt, address(this));

    // Deploy clone
    address actualAddress = Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, salt);

    assertEq(actualAddress, predictedAddress, "Predicted address should match actual address");
  }

  /**
   * @notice Test that different salts produce different addresses
   */
  function test_DifferentSaltsProduceDifferentAddresses() public {
    bytes memory immutableArgs =
      SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, testValidators, testAmounts);

    address clone1 =
      Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, keccak256("salt1"));

    address clone2 =
      Clones.cloneDeterministicWithImmutableArgs(address(implementation), immutableArgs, keccak256("salt2"));

    assertTrue(clone1 != clone2, "Different salts should produce different addresses");

    // But both should have the same actions
    IPayload.Action[] memory actions1 = SlashPayloadCloneable(clone1).getActions();
    IPayload.Action[] memory actions2 = SlashPayloadCloneable(clone2).getActions();

    assertEq(actions1.length, actions2.length, "Both clones should have same number of actions");
    for (uint256 i = 0; i < actions1.length; i++) {
      assertEq(actions1[i].target, actions2[i].target, "Targets should match");
      assertEq(keccak256(actions1[i].data), keccak256(actions2[i].data), "Data should match");
    }
  }

  /**
   * @notice Test array length mismatch error in encoding
   */
  function test_RevertOnArrayLengthMismatch() public {
    address[] memory validators = new address[](2);
    validators[0] = testValidators[0];
    validators[1] = testValidators[1];

    uint96[] memory amounts = new uint96[](3); // Mismatched length
    amounts[0] = testAmounts[0];
    amounts[1] = testAmounts[1];
    amounts[2] = testAmounts[2];

    // Create a wrapper to test the library function revert
    TestLibraryWrapper wrapper = new TestLibraryWrapper();
    vm.expectPartialRevert(Errors.SlashPayload_ArraySizeMismatch.selector);
    wrapper.encodeArgs(mockValidatorSelection, validators, amounts);
  }

  /**
   * @notice Fuzz test with random validators and amounts
   */
  function testFuzz_RandomValidatorsAndAmounts(uint8 validatorCount, bytes32 seedValidators, bytes32 seedAmounts)
    public
  {
    // Bound validator count to reasonable range
    validatorCount = uint8(bound(validatorCount, 1, 50));

    // Generate random validators and amounts
    address[] memory validators = new address[](validatorCount);
    uint96[] memory amounts = new uint96[](validatorCount);

    for (uint256 i = 0; i < validatorCount; i++) {
      validators[i] = address(uint160(uint256(keccak256(abi.encodePacked(seedValidators, i)))));
      amounts[i] = uint96(uint256(keccak256(abi.encodePacked(seedAmounts, i))) % type(uint96).max);
    }

    // Test encoding/decoding
    bytes memory immutableArgs = SlashPayloadLib.encodeImmutableArgs(mockValidatorSelection, validators, amounts);

    address clone = Clones.cloneDeterministicWithImmutableArgs(
      address(implementation), immutableArgs, keccak256(abi.encodePacked("fuzz", validatorCount))
    );

    IPayload.Action[] memory actions = SlashPayloadCloneable(clone).getActions();

    // Verify all actions are correct
    assertEq(actions.length, validatorCount, "Action count should match validator count");

    for (uint256 i = 0; i < validatorCount; i++) {
      assertEq(actions[i].target, mockValidatorSelection, "Target should be validator selection");

      (, address validator, uint96 amount) = decodeSlashCallData(actions[i].data);
      assertEq(validator, validators[i], "Fuzz validator should match");
      assertEq(amount, amounts[i], "Fuzz amount should match");
    }
  }
}

/**
 * @notice Mock contract that implements the slash function for testing
 */
contract MockValidatorSelection {
  event SlashCalled(address indexed validator, uint96 amount);

  function slash(address validator, uint96 amount) external {
    emit SlashCalled(validator, amount);
  }
}

/**
 * @notice Wrapper contract to test library functions that can revert
 */
contract TestLibraryWrapper {
  function encodeArgs(address _validatorSelection, address[] memory _validators, uint96[] memory _amounts)
    external
    pure
    returns (bytes memory)
  {
    return SlashPayloadLib.encodeImmutableArgs(_validatorSelection, _validators, _amounts);
  }
}
