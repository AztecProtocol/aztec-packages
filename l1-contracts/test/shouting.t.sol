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

    assertEq(codeHash, 0x00, ERR_STRING);
  }

  function test_HonkVerifierCreationCode() public pure {
    bytes memory creationCode = type(HonkVerifier).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(codeHash, 0x00, ERR_STRING);
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(codeHash, 0x00, ERR_STRING);
  }

  function test_RollupCreationCode() public pure {
    bytes memory creationCode = type(Rollup).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(codeHash, 0x00, ERR_STRING);
  }
}
