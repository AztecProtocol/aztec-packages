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
      codeHash, 0x8660a25b0d480424b950324ef5d078cfb12a06d5c807ab09ade301968ac20ae1, ERR_STRING
    );
  }

  function test_HonkVerifierCreationCode() public pure {
    bytes memory creationCode = type(HonkVerifier).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0x892b4a5c70e2e665b147db8ae02a0410ae400adefd02d85feb56847593d4b9dd, ERR_STRING
    );
  }

  function test_RegistryCreationCode() public pure {
    bytes memory creationCode = type(Registry).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0x1c9e54944cd8c92ee57305f1fba26284638268a934f9fab38b7c6a4facb92ee5, ERR_STRING
    );
  }

  function test_RollupCreationCode() public pure {
    bytes memory creationCode = type(Rollup).creationCode;
    bytes32 codeHash = keccak256(creationCode);

    assertEq(
      codeHash, 0xddd8431ed52d33e28fb5072e1dd57fbecb5fd919da403bc20cdad17ca2113726, ERR_STRING
    );
  }
}
