// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {HonkVerifier} from "../generated/HonkVerifier.sol";

/**
 * @notice  This test is used to ensure that changes to L1 contracts don't go unnoticed.
 *          While still allowing the addition of more tests etc without having to update it.
 *          The test is fairly simple, check if the creation code has changed for the important
 *          contracts. If it has, the test will fail, so it needs to be updated.
 *          This should not be needed for master, so if you have a diff, it probably have to go to NEXT.
 */
contract ScreamAndShoutTest is Test {
  string internal constant ERR_STRING = "This belongs in NEXT!";

  function test_GovernanceCreationCode() public pure {
    bytes memory creationCode = type(Governance).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0xf302136f8b3a84d3c36be87e283cda0d6ad04392b7e3c5379c55b2d5b2634c1c, ERR_STRING
    );
  }

  function test_HonkVerifierCreationCode() public pure {
    bytes memory creationCode = type(HonkVerifier).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0xe64a1670c48b0e0f03d405cdf00a7bc6823a47f89851e02680f827e055fd3c60, ERR_STRING
    );
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0x2cb444995a1644607bd5bdeb3ce0027a8484849810c28b57e641cdf61d786c4c, ERR_STRING
    );
  }

  function test_RollupCreationCode() public pure {
    bytes memory creationCode = type(Rollup).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0x86b91c31175542a55a9822a5a1eb74b05ea2deb27a30f1db9a21514162dd2a4b, ERR_STRING
    );
  }
}
