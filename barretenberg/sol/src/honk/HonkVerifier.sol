
import { HonkTypes } from "./HonkVerifierTypes.sol";

// TODO: this should be somewhat dynamic across the board
import { Add2HonkVerificationKey } from "./keys/Add2HonkVerificationKey.sol";

import "forge-std/console.sol";

/// Smart contract verifier of honk proofs
contract HonkVerifier {

    /// Plan of action
    /// We want to implement the non goblinised version of the protocol

    /// 0. Implement loading the verification key

    /// 1. Generate challenges 
    /// 2. Perform the public inputs delta calculations

    /// 3. Implement the sumcheck verifier
    /// 4. Implement the zero morph verifier

    // TODO: increase this number accordingly
    uint256 constant NUMBER_OF_SUBRELATIONS = 4;
    uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
    uint256 constant NUMBER_OF_ENTITIES = 43;

    /// Log of the circuit size - precomputed
    uint256 constant LOG_N = 4;

    struct ProofParameters {
        uint256 logCircuitSize;

    }

    struct TranscriptParameters {
        // Relation Challenges
        uint256[NUMBER_OF_SUBRELATIONS] alphas;
        uint256[LOG_N] gateChallenges;

        // perm challenges
        uint256 beta;
        uint256 gamma;
        uint256 eta; // Challenge for sorted list batching and w4 memory records
        uint256 publicInputsDelta;
        uint256 lookupGrandProductDelta;
    }

    /// Check how the challenges are calculated on the otherside
    function loadVerificationKey() internal returns (HonkTypes.VerificationKey memory) {
        // Load the verification key -> this can be hardcoded
        return Add2HonkVerificationKey.loadVerificationKey();
    } 

    function loadProof(bytes calldata proof) internal returns (HonkTypes.Proof memory) {
        HonkTypes.Proof memory p;

        // Metadata
        p.circuitSize = uint256(bytes32(proof[0x00:0x20]));
        p.publicInputsSize = uint256(bytes32(proof[0x20:0x40]));
        p.publicInputsOffset = uint256(bytes32(proof[0x40:0x60]));

        // Commitments
        p.w1 =  HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x60:0x80])),
            y: uint256(bytes32(proof[0x80:0xa0]))
        });
        p.w2 = HonkTypes.G1Point({
            x: uint256(bytes32(proof[0xa0:0xc0])),
            y: uint256(bytes32(proof[0xc0:0xe0]))
        });
        p.w3 = HonkTypes.G1Point({

            x: uint256(bytes32(proof[0xe0:0x100])),
            y: uint256(bytes32(proof[0x100:0x120]))
        });

        // Lookup / Permutation Helper Commitments
        p.sortedAccum =  HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x120:0x140])),
            y: uint256(bytes32(proof[0x140:0x160]))
        });
        p.w4 =  HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x160:0x180])),
            y: uint256(bytes32(proof[0x180:0x1a0]))
        });
        p.zPerm =  HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x1a0:0x1c0])),
            y: uint256(bytes32(proof[0x1c0:0x1e0]))
        });
        p.zLookup = HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x1e0:0x200])),
            y: uint256(bytes32(proof[0x200:0x220]))
        });

        // Sumcheck univariates
        // TODO: in this case we know what log_n is - so we hard code it, we would want this to be included in
        // a cpp template for different circuit sizes
        for (uint256 i = 0; i < LOG_N; i++) {
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                uint256 start = 0x220 + i * BATCHED_RELATION_PARTIAL_LENGTH * 0x20 + j * 0x20;
                uint256 end = start + 0x20;
                p.sumcheckUnivariates[i][j] = uint256(bytes32(proof[start:end]));
            }
        }

        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            uint256 start = 0x220 + LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20 + i * 0x20;
            uint256 end = start + 0x20;
            p.sumcheckEvaluations[i] = uint256(bytes32(proof[start:end]));
        }

        // Zero morph Commitments
        for (uint256 i = 0; i < LOG_N; i++) {
            uint256 xStart = 0x220 + LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20 + NUMBER_OF_ENTITIES * 0x20 + i * 0x40;
            uint256 xEnd = xStart + 0x20;
            uint256 yStart = xEnd;
            uint256 yEnd = yStart + 0x20;
            p.zmCqs[i] = HonkTypes.G1Point({
                x: uint256(bytes32(proof[xStart:xEnd])),
                y: uint256(bytes32(proof[yStart:yEnd]))
            });
        }

        // TODO: the hardcoded figures here will be wrong
        // Probably worth just preprocessing these
        p.zmCq =  HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x220 + LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20 + NUMBER_OF_ENTITIES * 0x20 + LOG_N * 0x40:0x240])),
            y: uint256(bytes32(proof[0x240:0x260]))
        });
        p.zmPi =  HonkTypes.G1Point({
            x: uint256(bytes32(proof[0x260:0x280])),
            y: uint256(bytes32(proof[0x280:0x2a0]))
        });

        return p;
    }



    error PublicInputsLengthWrong();

    function verify(bytes calldata proof, uint256[] calldata publicInputs) public returns (bool) {
        HonkTypes.VerificationKey memory vk = loadVerificationKey();
        HonkTypes.Proof memory p = loadProof(proof);

        if (vk.publicInputsSize != publicInputs.length) {
            revert PublicInputsLengthWrong();
        }

        // Perform each of the rounds 
        TranscriptParameters memory tp = computeChallenges(p, vk, publicInputs);

        // Compute the public input delta
        uint256 publicInputDelta = computePublicInputDelta(
            publicInputs, 
            tp.beta, 
            tp.gamma,
            vk.circuitSize,
            p.publicInputsOffset
        );

        uint256 grandProductPlookupDelta = computeLookupGrandProductDelta(
            tp.beta,
            tp.gamma,
            vk.circuitSize
        );


    }

    function computeChallenges(HonkTypes.Proof memory proof, HonkTypes.VerificationKey memory vk, uint256[] calldata publicInputs) internal returns (TranscriptParameters memory) {
        TranscriptParameters memory tp;

        // We generate the first challenge by hashing the public inputs
        // TODO: check the length here
        
        // publicInputs.length = 3 - this will be templated in the end!!!
        bytes32[3 + 6] memory round0;
        round0[0] = bytes32(proof.circuitSize);
        round0[1] = bytes32(proof.publicInputsSize);
        round0[2] = bytes32(proof.publicInputsOffset); 
        for (uint256 i = 0; i < publicInputs.length; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        round0[3 + publicInputs.length] = bytes32(proof.w1.x);
        round0[3 + publicInputs.length + 1] = bytes32(proof.w1.y);
        round0[3 + publicInputs.length + 2] = bytes32(proof.w2.x);
        round0[3 + publicInputs.length + 3] = bytes32(proof.w2.y);
        round0[3 + publicInputs.length + 4] = bytes32(proof.w3.x);
        round0[3 + publicInputs.length + 5] = bytes32(proof.w3.y);

        uint256 eta = uint256(keccak256(abi.encodePacked(round0)));

        // We generate the beta and gamma challenges by appending eta with the sorted_accumulator and w4
        bytes32[5] memory round1;
        round1[0] = bytes32(eta);
        round1[1] = bytes32(proof.sortedAccum.x);
        round1[2] = bytes32(proof.sortedAccum.y);
        round1[3] = bytes32(proof.w4.x);
        round1[4] = bytes32(proof.w4.y);

        uint256 beta = uint256(keccak256(abi.encodePacked(round1)));

        // We generate the gamma challenge by hashing beta
        // TODO: Check this is how we create spare challenges 
        uint256 gamma = uint256(keccak256(abi.encodePacked(beta))); 

        // WORKTODO: there are more items pushed to the sumcheck challenges 1
        uint256[NUMBER_OF_SUBRELATIONS] memory alphas = generateAlphaChallenges(gamma);
        tp.alphas = alphas;

        uint256[LOG_N] memory gateChallenges = generateGateChallenges(alphas[NUMBER_OF_SUBRELATIONS - 1]);
        tp.gateChallenges = gateChallenges;

        uint256[LOG_N] memory sumCheckUChallenges = generateSumcheckChallenges(proof, gateChallenges[LOG_N - 1]);
        uint256 rhoChallenge = generateRhoChallenge(proof, sumCheckUChallenges[LOG_N - 1]);

        // uint256 zmY = generateZmYChallenge(proof, rhoChallenge);



    }

    // Alpha challenges non-linearise the gate contributions 
    function generateAlphaChallenges(uint256 previousChallenge) internal returns (uint256[NUMBER_OF_SUBRELATIONS] memory) {
        uint256[NUMBER_OF_SUBRELATIONS] memory alphas;
        uint256 prevChallenge = previousChallenge;
        for (uint256 i = 0; i < NUMBER_OF_SUBRELATIONS; i++) {
            prevChallenge = uint256(keccak256(abi.encodePacked(prevChallenge)));
            alphas[i] = prevChallenge;
        }
        return alphas;
    }

    function generateGateChallenges(uint256 previousChalenge) internal returns (uint256[LOG_N] memory) {
        uint256[LOG_N] memory gate_challanges;
        uint256 prevChallenge = previousChalenge;
        for (uint256 i = 0; i < LOG_N; i++) {
            prevChallenge = uint256(keccak256(abi.encodePacked(prevChallenge)));
            gate_challanges[i] = prevChallenge;
        }
        return gate_challanges;
    }

    function generateSumcheckChallenges(HonkTypes.Proof memory proof, uint256 prevChallenge) internal returns (uint256[LOG_N] memory) {
        uint256[LOG_N] memory sumcheckChallenges;
        uint256 prevChallenge = prevChallenge;
        for (uint256 i = 0; i < LOG_N; i++) {
            uint256[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory multivariateChal;
            multivariateChal[0] = prevChallenge;

            // TODO(opt): memcpy
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                multivariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }

            // TOOD(md): not too sure about the encode here
            sumcheckChallenges[i] = uint256(keccak256(abi.encodePacked(multivariateChal)));
        }

        return sumcheckChallenges;
    }

    function generateRhoChallenge(HonkTypes.Proof memory proof, uint256 prevChallenge) internal returns (uint256) {
        uint256[NUMBER_OF_ENTITIES + 1] memory rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        // TODO: memcpy
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }
        return uint256(keccak256(abi.encodePacked(rhoChallengeElements)));
    }

    // We add an offset to the public inputs, this adds the values of our public inputs
    // to the copy constraints
    function computePublicInputDelta(uint256[] memory publicInputs, uint256 beta, uint256 gamma, 
        // TODO: check how to deal with this Domain size and offset are somewhat new 
        uint256 domainSize, uint256 offset
    ) internal returns (uint256) {
        uint256 numerator = 1;
        uint256 denominator = 1;

        // TODO: all of this needs to be mod p
        uint256 numeratorAcc = gamma + beta * (domainSize + offset);
        uint256 denominatorAcc = gamma - beta * (offset + 1);

        for (uint256 i = 0; i < publicInputs.length; i++) {
            numerator = numerator * (numeratorAcc + publicInputs[i]);
            denominator = denominator * (denominatorAcc + publicInputs[i]);

            // TODO: mod p
            numeratorAcc += beta;
            denominatorAcc -= beta;
        }
        // mod p this shit
        return numerator / denominator;
    }

    // Incorportate the original plookup construction into honk
    function computeLookupGrandProductDelta(uint256 beta, uint256 gamma, 
        // Again double check - i think it comes from the proving key
        uint256 domainSize
    ) internal returns (uint256) {
        uint256 gammaByOnePlusBeta = gamma * (beta + 1);
        return gammaByOnePlusBeta ** domainSize;
    }

    // function verifySumcheck() {}

    // function verifyZeroMorph() {}

}