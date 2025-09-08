// SPDX-License-Identifier: Apache-2.0
// Copyright 2022 Aztec
pragma solidity >=0.8.21;

import {TestBaseHonk} from "./TestBaseHonk.sol";

// TODO(md): need to generalize the verifier instances
import {RecursiveHonkVerifier} from "../../src/honk/instance/RecursiveHonk.sol";
import {DifferentialFuzzer} from "../base/DifferentialFuzzer.sol";
import {IVerifier} from "../../src/interfaces/IVerifier.sol";

/// forge-lint: disable-next-item(unaliased-plain-import)
import "forge-std/console.sol";

contract RecursiveHonkTest is TestBaseHonk {
    function setUp() public override(TestBaseHonk) {
        super.setUp();

        verifier = IVerifier(address(new RecursiveHonkVerifier()));
        fuzzer = fuzzer.with_circuit_type(DifferentialFuzzer.CircuitType.Recursive);

        // Inputs below are for the inner proof, outer has no public inputs
        PUBLIC_INPUT_COUNT = 0;

        // Add default inputs to the fuzzer (we will override these in fuzz test)
        uint256[] memory defaultInputs = new uint256[](3);
        defaultInputs[0] = 5;
        defaultInputs[1] = 10;
        defaultInputs[2] = 15;

        fuzzer = fuzzer.with_inputs(defaultInputs);
    }

    function testFuzzProof(uint16 input1, uint16 input2) public {
        uint256[] memory inputs = new uint256[](3);
        inputs[0] = uint256(input1);
        inputs[1] = uint256(input2);
        inputs[2] = inputs[0] + inputs[1];

        bytes memory proofData = fuzzer.with_inputs(inputs).generate_proof();

        (bytes32[] memory publicInputs, bytes memory proof) = splitProofHonk(proofData, PUBLIC_INPUT_COUNT);

        assertTrue(verifier.verify(proof, publicInputs), "The proof is not valid");
        console.log("Proof verified");
    }
}
