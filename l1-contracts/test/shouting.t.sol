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
      codeHash, 0x2be94eac2f9209cdf4afdb75482df289d04c8162d5643c848eebf2299f5bcd55, ERR_STRING
    );
  }

  function test_HonkVerifierCreationCode() public pure {
    bytes memory creationCode = type(HonkVerifier).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0xc8174b45cbb1bbd52b859b8bc8e991bd16fd0735c3419c55cc7089bbd3b4845e, ERR_STRING
    );
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0x25e5b52d3083fc14f7b5e6d6c0360e2ca39f19935f9faee67815ae6cb3255915, ERR_STRING
    );
  }

  function test_RollupCreationCode() public pure {
    bytes memory creationCode = type(Rollup).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0xc94782792e5d266d01c3be572c6e1e3c43b17d900df47d4d8affd7c13d3f43fc, ERR_STRING
    );
  }
}
