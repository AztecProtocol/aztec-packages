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
      0x1c94a3ea879b87e354831c2c42495661e6dab14b7f741370f25882704e7a26c2,
      "You have changed the rollup!"
    );
  }

  function test_GovernanceCreationCode() public pure {
    bytes memory creationCode = type(Governance).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash,
      0x349b3b4efae2d8139f18b0458a23fc1f08d41714cf6bef73ebfa95e4e0e0554e,
      "You have changed the governance!"
    );
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash,
      0x2d5383ffd216a8b1c945b9db534b7363b9cd0b9757b59125a77159a6abc637db,
      "You have changed the registry!"
    );
  }
}
