// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {TestBase} from "../base/TestBase.sol";
import {DifferentialFuzzer} from "../base/DifferentialFuzzer.sol";
import {IVerifier} from "../../src/interfaces/IVerifier.sol";

import "forge-std/console.sol";

contract TestBaseUltra is TestBase {
    IVerifier public verifier;
    DifferentialFuzzer public fuzzer;
    uint256 public PUBLIC_INPUT_COUNT;

    function setUp() public virtual {
        fuzzer = new DifferentialFuzzer().with_plonk_flavour(DifferentialFuzzer.PlonkFlavour.Ultra);
    }

    function testValidProof() public {
        bytes memory proofData = fuzzer.generate_proof();
        console.log("proofData");
        console.logBytes(proofData);
        (bytes32[] memory publicInputs, bytes memory proof) = splitProof(proofData, PUBLIC_INPUT_COUNT);
        console.log("proof");
        console.logBytes(proof);
        assertTrue(verifier.verify(proof, publicInputs), "The proof is not valid");
    }
}
