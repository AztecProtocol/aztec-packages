// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Governance} from "@aztec/governance/Governance.sol";

/**
 * @notice  This test is used to ensure that changes to L1 contracts don't go unnoticed.
 *          While still allowing the addition of more tests etc without having to update it.
 *          The test is fairly simple, check if the creation code has changed for the important
 *          contracts. If it has, the test will fail, so it needs to be updated.
 *          Updating this file should then notify the turtles, as they are the code owners of this file.
 */
contract ScreamAndShoutTest is Test {
  function test_RollupCreationCode() public pure {
    bytes memory creationCode = type(Rollup).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash,
      0x50b28136248e507de540df733a32ea0b858dc07d1bda73e4b198b03054177096,
      "You have changed the rollup!"
    );
  }

  function test_GovernanceCreationCode() public pure {
    bytes memory creationCode = type(Governance).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash,
      0x218e51520c96c1aa4e4cba4cf6d5a20df0b25cf9ed22b53d2a94cee2763d0d06,
      "You have changed the governance!"
    );
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash,
      0xb7676cf0ac84a997a57a50e8dffbfad20b6a40a5d634e3987597a826c99a0bcd,
      "You have changed the registry!"
    );
  }
}
