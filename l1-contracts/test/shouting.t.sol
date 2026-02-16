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

    assertEq(codeHash, 0xa203e2daeeca86ed3a98e2c91f670eb6105a681dc12b90fe192e8cf2c552d2ff, ERR_STRING);
  }

  function test_HonkVerifierCreationCode() public pure {
    bytes memory creationCode = type(HonkVerifier).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(codeHash, 0x76d4c44263992208898c3a78d02a7d7ab611d4876d2c644f3ca6c3ccc4a7a0ae, ERR_STRING);
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(codeHash, 0x2b712e7690ded388fd1e1d9863af22179d6c94fae39dd2a31d058b31e32fd9c8, ERR_STRING);
  }

  function test_RollupCreationCode() public pure {
    bytes memory creationCode = type(Rollup).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(codeHash, 0xbc7a3bce77d152425c10e6d437c57bd329d22e4c49bc16176225ab11fc310628, ERR_STRING);
  }
}
