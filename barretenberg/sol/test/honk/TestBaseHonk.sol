// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {TestBase} from "../base/TestBase.sol";
import {DifferentialFuzzer} from "../base/DifferentialFuzzer.sol";
import {IVerifier} from "../../src/interfaces/IVerifier.sol";

contract TestBaseHonk is TestBase {
    IVerifier public verifier;
    DifferentialFuzzer public fuzzer;
    uint256 public PUBLIC_INPUT_COUNT;

    function setUp() public virtual {
        fuzzer = new DifferentialFuzzer().with_flavor(DifferentialFuzzer.Flavor.Honk);
    }

    function testValidProof() public {
        bytes memory proofData = fuzzer.generate_proof();
        (bytes32[] memory publicInputs, bytes memory proof) = splitProofHonk(proofData, PUBLIC_INPUT_COUNT);
        assertTrue(verifier.verify(proof, publicInputs), "The proof is not valid");
    }
}
