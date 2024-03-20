import {HonkTypes} from "./HonkVerifierTypes.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";

// TODO: this should be somewhat dynamic across the board
import {Add2HonkVerificationKey} from "./keys/Add2HonkVerificationKey.sol";

import "forge-std/console.sol";
import "forge-std/console2.sol";

/// Smart contract verifier of honk proofs
contract HonkVerifier is IVerifier {
    /// Plan of action
    /// We want to implement the non goblinised version of the protocol

    /// 0. Implement loading the verification key

    /// 1. Generate challenges
    /// 2. Perform the public inputs delta calculations

    /// 3. Implement the sumcheck verifier
    /// 4. Implement the zero morph verifier

    // TODO: increase this number accordingly
    uint256 constant NUMBER_OF_SUBRELATIONS = 17;
    uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
    uint256 constant NUMBER_OF_ENTITIES = 43;

    uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order

    /// Log of the circuit size - precomputed
    uint256 constant LOG_N = 5;

    struct ProofParameters {
        uint256 logCircuitSize;
    }

    struct TranscriptParameters {
        // Relation Challenges
        uint256[NUMBER_OF_SUBRELATIONS] alphas;
        uint256[LOG_N] gateChallenges;
        uint256[LOG_N] sumCheckUChallenges;

        uint256 eta;
        
        // perm challenges
        uint256 beta;
        uint256 gamma;

        uint256 rho;

        // Zero morph
        uint256 zmX;
        uint256 zmY;
        uint256 zmZ;
        // TODO: Zero morph quotient
        uint256 zmQuotient;

        uint256 publicInputsDelta;
        uint256 lookupGrandProductDelta;
    }

    /// Check how the challenges are calculated on the otherside
    function loadVerificationKey() internal view returns (HonkTypes.VerificationKey memory) {
        // Load the verification key -> this can be hardcoded
        return Add2HonkVerificationKey.loadVerificationKey();
    }

    function bytes32ToString(bytes32 value) public pure returns(string memory) {
    bytes memory alphabet = "0123456789abcdef";

    bytes memory str = new bytes(66);
    str[0] = '0';
    str[1] = 'x';
    for (uint i = 0; i < 32; i++) {
        str[2+i*2] = alphabet[uint8(value[i] >> 4)];
        str[3+i*2] = alphabet[uint8(value[i] & 0x0f)];
    }
    return string(str);
}

    function logG1(string memory name, HonkTypes.G1ProofPoint memory point) internal pure {
        // TODO: convert both to hex before printing to line up with cpp
        string memory x_0 = bytes32ToString(bytes32(point.x_0));
        string memory x_1 = bytes32ToString(bytes32(point.x_1));
        string memory y_0 = bytes32ToString(bytes32(point.y_0));
        string memory y_1 = bytes32ToString(bytes32(point.y_1));

        string memory message = string(abi.encodePacked(name, " x: ", x_0, x_1, " y: ",  y_0, y_1));
        console2.log(message);
    }

    function logUint(string memory name, uint256 value) internal pure {
        string memory as_hex = bytes32ToString(bytes32(value));
        console2.log(name, as_hex);
    }

    function loadProof(bytes calldata proof) internal view returns (HonkTypes.Proof memory) {
        // TODO: mod all of the points by q!!
        HonkTypes.Proof memory p;

        // NOTE: Start of eta challenege

        // Metadata
        p.circuitSize = uint256(bytes32(proof[0x00:0x20]));
        console.log("circuitSize");
        console.log(p.circuitSize);
        p.publicInputsSize = uint256(bytes32(proof[0x20:0x40]));
        console.log("publicInputsSize");
        console.log(p.publicInputsSize);
        p.publicInputsOffset = uint256(bytes32(proof[0x40:0x60]));
        console.log("publicInputsOffset");
        console.log(p.publicInputsOffset);

        // TODO: Assset sizes are the same as vk - maybe not required actually

        // Commitments
        p.w1 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x60:0x80])), x_1: uint256(bytes32(proof[0x80:0xa0])),
            y_0: uint256(bytes32(proof[0xa0:0xc0])), y_1: uint256(bytes32(proof[0xc0:0xe0]))});

        logG1("w1", p.w1);
        p.w2 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0xe0:0x100])), x_1: uint256(bytes32(proof[0x100:0x120])), 
            y_0: uint256(bytes32(proof[0x120:0x140])), y_1: uint256(bytes32(proof[0x140:0x160]))});
        logG1("w2", p.w2);
        p.w3 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x160:0x180])), x_1: uint256(bytes32(proof[0x180:0x1a0])),
            y_0: uint256(bytes32(proof[0x1a0:0x1c0])), y_1: uint256(bytes32(proof[0x1c0:0x1e0]))});
        logG1("w3", p.w3);

        // Lookup / Permutation Helper Commitments
        p.sortedAccum =
            HonkTypes.G1ProofPoint({
                x_0: uint256(bytes32(proof[0x1e0:0x200])), x_1: uint256(bytes32(proof[0x200:0x220])),
                y_0: uint256(bytes32(proof[0x220:0x240])), y_1: uint256(bytes32(proof[0x240:0x260]))
            });
        logG1("sortedAccum", p.sortedAccum);
        p.w4 = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x260:0x280])), x_1: uint256(bytes32(proof[0x280:0x2a0])),
            y_0: uint256(bytes32(proof[0x2a0:0x2c0])), y_1: uint256(bytes32(proof[0x2c0:0x2e0]))
        });
        logG1("w4", p.w4);

        p.zPerm = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x2e0:0x300])), x_1: uint256(bytes32(proof[0x300:0x320])),
            y_0: uint256(bytes32(proof[0x320:0x340])), y_1: uint256(bytes32(proof[0x340:0x360]))
        });
        logG1("zperm", p.zPerm);

        p.zLookup =
            HonkTypes.G1ProofPoint({
                x_0: uint256(bytes32(proof[0x360:0x380])), x_1: uint256(bytes32(proof[0x380:0x3a0])),
                y_0: uint256(bytes32(proof[0x3a0:0x3c0])), y_1: uint256(bytes32(proof[0x3c0:0x3e0]))
            });
        logG1("zLookup", p.zLookup);

        // TEMP the boundary of what has already been read
        uint256 boundary = 0x3e0;

        // Sumcheck univariates
        // TODO: in this case we know what log_n is - so we hard code it, we would want this to be included in
        // a cpp template for different circuit sizes
        for (uint256 i = 0; i < LOG_N; i++) {
            // The loop boundary of i, this will shift forward on each evaluation
            uint256 loop_boundary = boundary + (i * 0x20 * BATCHED_RELATION_PARTIAL_LENGTH);

            console.log(i);
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {

                uint256 start = loop_boundary + (j * 0x20);
                uint256 end = start + 0x20;
                p.sumcheckUnivariates[i][j] = uint256(bytes32(proof[start:end]));

                string memory name = string(abi.encodePacked("sumcheckUnivariates", i, " ", j));
                logUint(name, p.sumcheckUnivariates[i][j]);

            }
        }

        boundary = boundary + (LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20);
        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            uint256 start = boundary + (i * 0x20);
            uint256 end = start + 0x20;
            p.sumcheckEvaluations[i] = uint256(bytes32(proof[start:end]));

            console.log("sumcheck evaluations", i);
            console.logBytes32(bytes32(p.sumcheckEvaluations[i]));
        }

        boundary = boundary + (NUMBER_OF_ENTITIES * 0x20);
        // Zero morph Commitments
        for (uint256 i = 0; i < LOG_N; i++) {

            // Explicitly stating the x0, x1, y0, y1 start and end boundaries to make the calldata slicing bearable
            uint256 xStart = boundary + (i * 0x80);
            uint256 xEnd = xStart + 0x20;

            uint256 x1Start = xEnd;
            uint256 x1End = x1Start + 0x20;

            uint256 yStart = x1End;
            uint256 yEnd = yStart + 0x20;

            uint256 y1Start = yEnd;
            uint256 y1End = y1Start + 0x20;

            p.zmCqs[i] =
                HonkTypes.G1ProofPoint({
                    x_0: uint256(bytes32(proof[xStart:xEnd])), x_1: uint256(bytes32(proof[x1Start:x1End])), 
                    y_0: uint256(bytes32(proof[yStart:yEnd])), y_1: uint256(bytes32(proof[y1Start:y1End]))
                });
            console.log(i);
            logG1("zmCqs", p.zmCqs[i]);
        }

        boundary = boundary + (LOG_N * 0x80);

        // TODO: the hardcoded figures here will be wrong
        // Probably worth just preprocessing these
        p.zmCq = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary:boundary + 0x20])), x_1: uint256(bytes32(proof[boundary + 0x20:boundary + 0x40])),
            y_0: uint256(bytes32(proof[boundary + 0x40:boundary + 0x60])), y_1: uint256(bytes32(proof[boundary + 0x60:boundary + 0x80]))
        });

        logG1("zmCq", p.zmCq);

        p.zmPi = HonkTypes.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary + 0x80:boundary + 0xa0])), x_1: uint256(bytes32(proof[boundary + 0xa0:boundary + 0xc0])),
            y_0: uint256(bytes32(proof[boundary + 0xc0:boundary + 0xe0])), y_1: uint256(bytes32(proof[boundary + 0xe0:boundary + 0x100]))
        });

        logG1("zmPi", p.zmPi);

        return p;
    }

    error PublicInputsLengthWrong();

    // TODO(md): I would perfer the publicInputs to be uint256
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) override view public returns (bool) {
        HonkTypes.VerificationKey memory vk = loadVerificationKey();
        HonkTypes.Proof memory p = loadProof(proof);

        console.log("We have loaded the proof");

        if (vk.publicInputsSize != publicInputs.length) {
            revert PublicInputsLengthWrong();
        }

        // Perform each of the rounds
        TranscriptParameters memory tp = computeChallenges(p, vk, publicInputs);

        // Compute the public input delta
        uint256 publicInputDelta =
            computePublicInputDelta(publicInputs, tp.beta, tp.gamma, vk.circuitSize, p.publicInputsOffset);

        uint256 grandProductPlookupDelta = computeLookupGrandProductDelta(tp.beta, tp.gamma, vk.circuitSize);
    }

    function computeChallenges(
        HonkTypes.Proof memory proof,
        HonkTypes.VerificationKey memory vk,
        bytes32[] calldata publicInputs
    ) internal view returns (TranscriptParameters memory) {
        TranscriptParameters memory tp;

        // TODO: move eta into its own function
        // We generate the first challenge by hashing the public inputs

        tp.eta = generateEtaChallenge(proof, publicInputs);

        // We generate the beta and gamma challenges by appending eta with the sorted_accumulator and w4
        (tp.beta, tp.gamma) = generateBetaAndGammaChallenges(tp.eta, proof);

        // WORKTODO: there are more items pushed to the sumcheck challenges 1
        tp.alphas = generateAlphaChallenges(tp.gamma, proof);

        tp.gateChallenges = generateGateChallenges(tp.alphas[NUMBER_OF_SUBRELATIONS - 1]);

        tp.sumCheckUChallenges = generateSumcheckChallenges(proof, tp.gateChallenges[LOG_N - 1]);
        tp.rho = generateRhoChallenge(proof, tp.sumCheckUChallenges[LOG_N - 1]);

        tp.zmY =  generateZMYChallenge(tp.rho, proof);

        (tp.zmX, tp.zmZ) = generateZMXZChallenges(tp.zmY, proof);
    }

    function generateEtaChallenge(HonkTypes.Proof memory proof, bytes32[] calldata publicInputs) internal view returns (uint256) {
        // publicInputs.length = 3 - this will be templated in the end!!!
        // TODO(md): the 12 here will need to be halved when we fix the transcript to not be over field elements
        // TODO(md): the 3 here is hardcoded for the number of public inputs - this will need to be generated / use asm
        // TODO: use assembly 
        bytes32[3 + 3 + 12] memory round0;
        round0[0] = bytes32(proof.circuitSize);
        round0[1] = bytes32(proof.publicInputsSize);
        round0[2] = bytes32(proof.publicInputsOffset);
        for (uint256 i = 0; i < publicInputs.length; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        // TODO: UPDATE ALL VALUES IN HERE
        round0[3 + publicInputs.length] = bytes32(proof.w1.x_0);
        round0[3 + publicInputs.length + 1] = bytes32(proof.w1.x_1);
        round0[3 + publicInputs.length + 2] = bytes32(proof.w1.y_0);
        round0[3 + publicInputs.length + 3] = bytes32(proof.w1.y_1);
        round0[3 + publicInputs.length + 4] = bytes32(proof.w2.x_0);
        round0[3 + publicInputs.length + 5] = bytes32(proof.w2.x_1);
        round0[3 + publicInputs.length + 6] = bytes32(proof.w2.y_0);
        round0[3 + publicInputs.length + 7] = bytes32(proof.w2.y_1);
        round0[3 + publicInputs.length + 8] = bytes32(proof.w3.x_0);
        round0[3 + publicInputs.length + 9] = bytes32(proof.w3.x_1);
        round0[3 + publicInputs.length + 10] = bytes32(proof.w3.y_0);
        round0[3 + publicInputs.length + 11] = bytes32(proof.w3.y_1);
        
        for (uint256 i = 0; i < 18; i++) {
            console.logBytes32(round0[i]);
        }

        uint256 eta = uint256(keccak256(abi.encodePacked(round0))) % P;
        logUint("eta", eta);
        return eta;
    }

    function generateBetaAndGammaChallenges(uint256 previousChallenge, HonkTypes.Proof memory proof) internal view returns (uint256, uint256) {
        // TODO(md): adjust round size when the proof points are generated correctly - 5
        bytes32[9] memory round1;
        round1[0] = bytes32(previousChallenge);
        round1[1] = bytes32(proof.sortedAccum.x_0);
        round1[2] = bytes32(proof.sortedAccum.x_1);
        round1[3] = bytes32(proof.sortedAccum.y_0);
        round1[4] = bytes32(proof.sortedAccum.y_1);
        round1[5] = bytes32(proof.w4.x_0);
        round1[6] = bytes32(proof.w4.x_1);
        round1[7] = bytes32(proof.w4.y_0);
        round1[8] = bytes32(proof.w4.y_1);

        uint256 beta = uint256(keccak256(abi.encodePacked(round1))) % P;
        logUint("beta", beta);
        uint256 gamma = uint256(keccak256(abi.encodePacked(beta))) % P;
        logUint("gamma", gamma);
        return (beta, gamma);
    }

    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(uint256 previousChallenge, HonkTypes.Proof memory proof) 
        internal view
        returns (uint256[NUMBER_OF_SUBRELATIONS] memory)
    {
        uint256[NUMBER_OF_SUBRELATIONS] memory alphas;

        // Generate the original sumcheck alpha 0 by hashing zPerm and zLookup
        // TODO(md): 5 post correct proof size fix
        uint256[9] memory alpha0;
        alpha0[0] = previousChallenge;
        alpha0[1] = proof.zPerm.x_0;
        alpha0[2] = proof.zPerm.x_1;
        alpha0[3] = proof.zPerm.y_0;
        alpha0[4] = proof.zPerm.y_1;
        alpha0[5] = proof.zLookup.x_0;
        alpha0[6] = proof.zLookup.x_1;
        alpha0[7] = proof.zLookup.y_0;
        alpha0[8] = proof.zLookup.y_1;

        alphas[0] = uint256(keccak256(abi.encodePacked(alpha0))) % P;
        logUint("alpha0", alphas[0]);


        uint256 prevChallenge = alphas[0];
        for (uint256 i = 1; i < NUMBER_OF_SUBRELATIONS; i++) {
            prevChallenge = uint256(keccak256(abi.encodePacked(prevChallenge))) % P;
            alphas[i] = prevChallenge;
            logUint("alpha", alphas[i]);
        }
        return alphas;
    }

    function generateGateChallenges(uint256 previousChalenge) internal view returns (uint256[LOG_N] memory) {
        uint256[LOG_N] memory gateChallanges;
        uint256 prevChallenge = previousChalenge;
        for (uint256 i = 0; i < LOG_N; i++) {
            prevChallenge = uint256(keccak256(abi.encodePacked(prevChallenge))) % P;
            gateChallanges[i] = prevChallenge;
            logUint("gate", gateChallanges[i]);
        }
        return gateChallanges;
    }

    function generateSumcheckChallenges(HonkTypes.Proof memory proof, uint256 prevChallenge)
        internal view
        returns (uint256[LOG_N] memory)
    {
        uint256[LOG_N] memory sumcheckChallenges;
        uint256 prevChallenge = prevChallenge;
        for (uint256 i = 0; i < LOG_N; i++) {
            uint256[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            // TODO(opt): memcpy
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }

            // TOOD(md): not too sure about the encode here
            sumcheckChallenges[i] = uint256(keccak256(abi.encodePacked(univariateChal))) % P;
            prevChallenge = sumcheckChallenges[i];
            logUint("sumcheck chal", sumcheckChallenges[i]);
        }

        return sumcheckChallenges;
    }

    function generateRhoChallenge(HonkTypes.Proof memory proof, uint256 prevChallenge) internal view returns (uint256) {
        uint256[NUMBER_OF_ENTITIES + 1] memory rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        // TODO: memcpy
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }

        uint256 rho = uint256(keccak256(abi.encodePacked(rhoChallengeElements))) % P;

        logUint("rho", rho);
        return rho;
    }

    function generateZMYChallenge(uint256 previousChallenge, HonkTypes.Proof memory proof) internal view returns (uint256) {
        uint256[LOG_N * 4 + 1] memory zmY;
        zmY[0] = previousChallenge;

        for (uint256 i; i < LOG_N; ++i) {
            zmY[1 + i * 4] = proof.zmCqs[i].x_0;
            zmY[2 + i * 4] = proof.zmCqs[i].x_1;
            zmY[3 + i * 4] = proof.zmCqs[i].y_0;
            zmY[4 + i * 4] = proof.zmCqs[i].y_1;
        }

        uint256 zmy = uint256(keccak256(abi.encodePacked(zmY))) % P;
        logUint("zmy", zmy);
        return zmy;
    }

    function generateZMXZChallenges(uint256 previousChallenge, HonkTypes.Proof memory proof) internal view returns (uint256, uint256) {
        uint256[4 + 1] memory buf;
        buf[0] = previousChallenge;

        buf[1] = proof.zmCq.x_0;
        buf[2] = proof.zmCq.x_1;
        buf[3] = proof.zmCq.y_0;
        buf[4] = proof.zmCq.y_1;

        uint256 zmX = uint256(keccak256(abi.encodePacked(buf))) % P;
        logUint("zmX", zmX);
        uint256 zmZ = uint256(keccak256(abi.encodePacked(zmX))) % P;
        logUint("zmZ", zmZ);
        return (zmX, zmZ);
    }

    // We add an offset to the public inputs, this adds the values of our public inputs
    // to the copy constraints
    function computePublicInputDelta(
        bytes32[] memory publicInputs,
        uint256 beta,
        uint256 gamma,
        // TODO: check how to deal with this Domain size and offset are somewhat new
        uint256 domainSize,
        uint256 offset
    ) internal view returns (uint256) {
        uint256 numerator = 1;
        uint256 denominator = 1;

        // TODO: all of this needs to be mod p
        uint256 numeratorAcc = gamma + beta * (domainSize + offset);
        uint256 denominatorAcc = gamma - beta * (offset + 1);

        for (uint256 i = 0; i < publicInputs.length; i++) {
            // TODO(md): remove casts when back to uint256 public inputs
            numerator = numerator * (numeratorAcc + uint256(publicInputs[i]));
            denominator = denominator * (denominatorAcc + uint256(publicInputs[i]));

            // TODO: mod p
            numeratorAcc += beta;
            denominatorAcc -= beta;
        }
        // mod p this shit
        return numerator / denominator;
    }

    // Incorportate the original plookup construction into honk
    function computeLookupGrandProductDelta(
        uint256 beta,
        uint256 gamma,
        // Again double check - i think it comes from the proving key
        uint256 domainSize
    ) internal view returns (uint256) {
        uint256 gammaByOnePlusBeta = gamma * (beta + 1);
        return gammaByOnePlusBeta ** domainSize;
    }

    // function verifySumcheck() {}

    // function verifyZeroMorph() {}
}
