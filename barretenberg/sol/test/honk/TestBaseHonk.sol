// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {TestBase} from "../base/TestBase.sol";
import {DifferentialFuzzer} from "../base/DifferentialFuzzer.sol";
import {IVerifier} from "../../src/interfaces/IVerifier.sol";

import "forge-std/console.sol";

contract TestBaseHonk is TestBase {
    IVerifier public verifier;
    DifferentialFuzzer public fuzzer;
    uint256 public PUBLIC_INPUT_COUNT;

    function setUp() public virtual {
        fuzzer = new DifferentialFuzzer().with_plonk_flavour(DifferentialFuzzer.PlonkFlavour.Honk);
    }

    function testValidProof() public {
        bytes memory proofData = fuzzer.with_circuit_flavour(DifferentialFuzzer.CircuitFlavour.Blake).generate_proof();
        (bytes32[] memory publicInputs, bytes memory proof) = splitProof(proofData, PUBLIC_INPUT_COUNT);
        console.logBytes(proof);
        assertTrue(verifier.verify(proof, publicInputs), "The proof is not valid");
    }
}
