import {BlakeHonkVerifier} from "../../src/honk/instance/BlakeHonk.sol";
import {BlakeOptHonkVerifier} from "../../src/honk/optimised/blake-opt.sol";
import {DifferentialFuzzer} from "../base/DifferentialFuzzer.sol";
import {TestBaseHonk} from "./TestBaseHonk.sol";
import {IVerifier} from "../../src/interfaces/IVerifier.sol";

contract BlakeOptTest is TestBaseHonk {
    BlakeHonkVerifier referenceVerifier;

    function setUp() public override {
        super.setUp();

        referenceVerifier = new BlakeHonkVerifier();
        verifier = IVerifier(address(new BlakeOptHonkVerifier()));
        fuzzer = fuzzer.with_circuit_type(DifferentialFuzzer.CircuitType.Blake);

        PUBLIC_INPUT_COUNT = 4;

        uint256[] memory defaultInputs = new uint256[](4);
        defaultInputs[0] = 0x0000000000000000000000000000000000000000000000000000000000000001;
        defaultInputs[1] = 0x0000000000000000000000000000000000000000000000000000000000000002;
        defaultInputs[2] = 0x0000000000000000000000000000000000000000000000000000000000000003;
        defaultInputs[3] = 0x0000000000000000000000000000000000000000000000000000000000000004;

        fuzzer = fuzzer.with_inputs(defaultInputs);
    }

    function testFuzzProof(uint16 input1, uint16 input2, uint16 input3, uint16 input4) public {
        // A vector of the public inputs
        uint256[] memory inputs = new uint256[](4);
        inputs[0] = uint256(input1);
        inputs[1] = uint256(input2);
        inputs[2] = uint256(input3);
        inputs[3] = uint256(input4);

        bytes memory proofData = fuzzer.with_inputs(inputs).generate_proof();

        (bytes32[] memory publicInputs, bytes memory proof) = splitProofHonk(proofData, PUBLIC_INPUT_COUNT);

        bool baseVerified = referenceVerifier.verify(proof, publicInputs);
        bool optVerified = verifier.verify(proof, publicInputs);

        assertEq(optVerified, true);
        assertEq(baseVerified, optVerified);
    }
}
