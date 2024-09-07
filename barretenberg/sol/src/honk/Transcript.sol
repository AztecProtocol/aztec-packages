pragma solidity >=0.8.21;

import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N
} from "./HonkTypes.sol";
import {Fr, FrLib} from "./Fr.sol";

// Transcript library to generate fiat shamir challenges
struct Transcript {
    Fr eta;
    Fr etaTwo;
    Fr etaThree;
    Fr beta;
    Fr gamma;
    Fr[NUMBER_OF_ALPHAS] alphas;
    Fr[CONST_PROOF_SIZE_LOG_N] gateChallenges;
    Fr[CONST_PROOF_SIZE_LOG_N] sumCheckUChallenges;
    Fr rho;
    // Zero morph
    Fr zmX;
    Fr zmY;
    Fr zmZ;
    Fr zmQuotient;
    // Derived
    Fr publicInputsDelta;
}

library TranscriptLib {
    function generateTranscript(Honk.Proof memory proof, bytes32[] calldata publicInputs, uint256 publicInputsSize)
        internal
        view
        returns (Transcript memory t)
    {
        (t.eta, t.etaTwo, t.etaThree) = generateEtaChallenge(proof, publicInputs, publicInputsSize);

        (t.beta, t.gamma) = generateBetaAndGammaChallenges(t.etaThree, proof);

        t.alphas = generateAlphaChallenges(t.gamma, proof);

        t.gateChallenges = generateGateChallenges(t.alphas[NUMBER_OF_ALPHAS - 1]);

        t.sumCheckUChallenges = generateSumcheckChallenges(proof, t.gateChallenges[CONST_PROOF_SIZE_LOG_N - 1]);
        t.rho = generateRhoChallenge(proof, t.sumCheckUChallenges[CONST_PROOF_SIZE_LOG_N - 1]);

        t.zmY = generateZMYChallenge(t.rho, proof);

        (t.zmX, t.zmZ) = generateZMXZChallenges(t.zmY, proof);

        return t;
    }

    function generateEtaChallenge(Honk.Proof memory proof, bytes32[] calldata publicInputs, uint256 publicInputsSize)
        internal
        view
        returns (Fr eta, Fr etaTwo, Fr etaThree)
    {
        bytes32[] memory round0 = new bytes32[](3 + publicInputsSize + 12);
        round0[0] = bytes32(proof.circuitSize);
        round0[1] = bytes32(proof.publicInputsSize);
        round0[2] = bytes32(proof.publicInputsOffset);
        for (uint256 i = 0; i < publicInputsSize; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        round0[3 + publicInputsSize] = bytes32(proof.w1.x_0);
        round0[3 + publicInputsSize + 1] = bytes32(proof.w1.x_1);
        round0[3 + publicInputsSize + 2] = bytes32(proof.w1.y_0);
        round0[3 + publicInputsSize + 3] = bytes32(proof.w1.y_1);
        round0[3 + publicInputsSize + 4] = bytes32(proof.w2.x_0);
        round0[3 + publicInputsSize + 5] = bytes32(proof.w2.x_1);
        round0[3 + publicInputsSize + 6] = bytes32(proof.w2.y_0);
        round0[3 + publicInputsSize + 7] = bytes32(proof.w2.y_1);
        round0[3 + publicInputsSize + 8] = bytes32(proof.w3.x_0);
        round0[3 + publicInputsSize + 9] = bytes32(proof.w3.x_1);
        round0[3 + publicInputsSize + 10] = bytes32(proof.w3.y_0);
        round0[3 + publicInputsSize + 11] = bytes32(proof.w3.y_1);

        eta = FrLib.fromBytes32(keccak256(abi.encodePacked(round0)));
        etaTwo = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(eta))));
        etaThree = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(etaTwo))));
    }

    function generateBetaAndGammaChallenges(Fr previousChallenge, Honk.Proof memory proof)
        internal
        view
        returns (Fr beta, Fr gamma)
    {
        bytes32[13] memory round1;
        round1[0] = FrLib.toBytes32(previousChallenge);
        round1[1] = bytes32(proof.lookupReadCounts.x_0);
        round1[2] = bytes32(proof.lookupReadCounts.x_1);
        round1[3] = bytes32(proof.lookupReadCounts.y_0);
        round1[4] = bytes32(proof.lookupReadCounts.y_1);
        round1[5] = bytes32(proof.lookupReadTags.x_0);
        round1[6] = bytes32(proof.lookupReadTags.x_1);
        round1[7] = bytes32(proof.lookupReadTags.y_0);
        round1[8] = bytes32(proof.lookupReadTags.y_1);
        round1[9] = bytes32(proof.w4.x_0);
        round1[10] = bytes32(proof.w4.x_1);
        round1[11] = bytes32(proof.w4.y_0);
        round1[12] = bytes32(proof.w4.y_1);

        beta = FrLib.fromBytes32(keccak256(abi.encodePacked(round1)));
        gamma = FrLib.fromBytes32(keccak256(abi.encodePacked(beta)));
    }

    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(Fr previousChallenge, Honk.Proof memory proof)
        internal
        view
        returns (Fr[NUMBER_OF_ALPHAS] memory alphas)
    {
        // Generate the original sumcheck alpha 0 by hashing zPerm and zLookup
        uint256[9] memory alpha0;
        alpha0[0] = Fr.unwrap(previousChallenge);
        alpha0[1] = proof.lookupInverses.x_0;
        alpha0[2] = proof.lookupInverses.x_1;
        alpha0[3] = proof.lookupInverses.y_0;
        alpha0[4] = proof.lookupInverses.y_1;
        alpha0[5] = proof.zPerm.x_0;
        alpha0[6] = proof.zPerm.x_1;
        alpha0[7] = proof.zPerm.y_0;
        alpha0[8] = proof.zPerm.y_1;

        alphas[0] = FrLib.fromBytes32(keccak256(abi.encodePacked(alpha0)));

        Fr prevChallenge = alphas[0];
        for (uint256 i = 1; i < NUMBER_OF_ALPHAS; i++) {
            prevChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(prevChallenge))));
            alphas[i] = prevChallenge;
        }
    }

    function generateGateChallenges(Fr previousChallenge)
        internal
        view
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory gateChallenges)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));
            gateChallenges[i] = previousChallenge;
        }
    }

    function generateSumcheckChallenges(Honk.Proof memory proof, Fr prevChallenge)
        internal
        view
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckChallenges)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            Fr[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            // TODO(opt): memcpy
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }

            sumcheckChallenges[i] = FrLib.fromBytes32(keccak256(abi.encodePacked(univariateChal)));
            prevChallenge = sumcheckChallenges[i];
        }
    }

    function generateRhoChallenge(Honk.Proof memory proof, Fr prevChallenge) internal view returns (Fr rho) {
        Fr[NUMBER_OF_ENTITIES + 1] memory rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        // TODO: memcpy
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }

        rho = FrLib.fromBytes32(keccak256(abi.encodePacked(rhoChallengeElements)));
    }

    function generateZMYChallenge(Fr previousChallenge, Honk.Proof memory proof)
        internal
        view
        returns (Fr zeromorphY)
    {
        uint256[CONST_PROOF_SIZE_LOG_N * 4 + 1] memory zmY;
        zmY[0] = Fr.unwrap(previousChallenge);

        for (uint256 i; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            zmY[1 + i * 4] = proof.zmCqs[i].x_0;
            zmY[2 + i * 4] = proof.zmCqs[i].x_1;
            zmY[3 + i * 4] = proof.zmCqs[i].y_0;
            zmY[4 + i * 4] = proof.zmCqs[i].y_1;
        }

        zeromorphY = FrLib.fromBytes32(keccak256(abi.encodePacked(zmY)));
    }

    function generateZMXZChallenges(Fr previousChallenge, Honk.Proof memory proof)
        internal
        pure
        returns (Fr zeromorphX, Fr zeromorphZ)
    {
        uint256[4 + 1] memory buf;
        buf[0] = Fr.unwrap(previousChallenge);

        buf[1] = proof.zmCq.x_0;
        buf[2] = proof.zmCq.x_1;
        buf[3] = proof.zmCq.y_0;
        buf[4] = proof.zmCq.y_1;

        zeromorphX = FrLib.fromBytes32(keccak256(abi.encodePacked(buf)));
        zeromorphZ = FrLib.fromBytes32(keccak256(abi.encodePacked(zeromorphX)));
    }

    // TODO: mod q proof points
    // TODO: Preprocess all of the memory locations
    // TODO: Adjust proof point serde away from poseidon forced field elements
    // TODO: move this back to probably each instance to avoid dynamic init of arrays in the Transcript Lib
    function loadProof(bytes calldata proof) internal view returns (Honk.Proof memory) {
        Honk.Proof memory p;

        // Metadata
        p.circuitSize = uint256(bytes32(proof[0x00:0x20]));
        p.publicInputsSize = uint256(bytes32(proof[0x20:0x40]));
        p.publicInputsOffset = uint256(bytes32(proof[0x40:0x60]));

        // Commitments
        p.w1 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x60:0x80])),
            x_1: uint256(bytes32(proof[0x80:0xa0])),
            y_0: uint256(bytes32(proof[0xa0:0xc0])),
            y_1: uint256(bytes32(proof[0xc0:0xe0]))
        });

        p.w2 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0xe0:0x100])),
            x_1: uint256(bytes32(proof[0x100:0x120])),
            y_0: uint256(bytes32(proof[0x120:0x140])),
            y_1: uint256(bytes32(proof[0x140:0x160]))
        });
        p.w3 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x160:0x180])),
            x_1: uint256(bytes32(proof[0x180:0x1a0])),
            y_0: uint256(bytes32(proof[0x1a0:0x1c0])),
            y_1: uint256(bytes32(proof[0x1c0:0x1e0]))
        });

        // Lookup / Permutation Helper Commitments
        p.lookupReadCounts = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x1e0:0x200])),
            x_1: uint256(bytes32(proof[0x200:0x220])),
            y_0: uint256(bytes32(proof[0x220:0x240])),
            y_1: uint256(bytes32(proof[0x240:0x260]))
        });
        p.lookupReadTags = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x260:0x280])),
            x_1: uint256(bytes32(proof[0x280:0x2a0])),
            y_0: uint256(bytes32(proof[0x2a0:0x2c0])),
            y_1: uint256(bytes32(proof[0x2c0:0x2e0]))
        });
        p.w4 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x2e0:0x300])),
            x_1: uint256(bytes32(proof[0x300:0x320])),
            y_0: uint256(bytes32(proof[0x320:0x340])),
            y_1: uint256(bytes32(proof[0x340:0x360]))
        });
        p.lookupInverses = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x360:0x380])),
            x_1: uint256(bytes32(proof[0x380:0x3a0])),
            y_0: uint256(bytes32(proof[0x3a0:0x3c0])),
            y_1: uint256(bytes32(proof[0x3c0:0x3e0]))
        });
        p.zPerm = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x3e0:0x400])),
            x_1: uint256(bytes32(proof[0x400:0x420])),
            y_0: uint256(bytes32(proof[0x420:0x440])),
            y_1: uint256(bytes32(proof[0x440:0x460]))
        });

        // TEMP the boundary of what has already been read
        uint256 boundary = 0x460;

        // Sumcheck univariates
        // TODO: in this case we know what log_n is - so we hard code it, we would want this to be included in
        // a cpp template for different circuit sizes
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            // The loop boundary of i, this will shift forward on each evaluation
            uint256 loop_boundary = boundary + (i * 0x20 * BATCHED_RELATION_PARTIAL_LENGTH);

            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                uint256 start = loop_boundary + (j * 0x20);
                uint256 end = start + 0x20;
                p.sumcheckUnivariates[i][j] = FrLib.fromBytes32(bytes32(proof[start:end]));
            }
        }

        boundary = boundary + (CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20);
        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            uint256 start = boundary + (i * 0x20);
            uint256 end = start + 0x20;
            p.sumcheckEvaluations[i] = FrLib.fromBytes32(bytes32(proof[start:end]));
        }

        boundary = boundary + (NUMBER_OF_ENTITIES * 0x20);
        // Zero morph Commitments
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            // Explicitly stating the x0, x1, y0, y1 start and end boundaries to make the calldata slicing bearable
            uint256 xStart = boundary + (i * 0x80);
            uint256 xEnd = xStart + 0x20;

            uint256 x1Start = xEnd;
            uint256 x1End = x1Start + 0x20;

            uint256 yStart = x1End;
            uint256 yEnd = yStart + 0x20;

            uint256 y1Start = yEnd;
            uint256 y1End = y1Start + 0x20;

            p.zmCqs[i] = Honk.G1ProofPoint({
                x_0: uint256(bytes32(proof[xStart:xEnd])),
                x_1: uint256(bytes32(proof[x1Start:x1End])),
                y_0: uint256(bytes32(proof[yStart:yEnd])),
                y_1: uint256(bytes32(proof[y1Start:y1End]))
            });
        }

        boundary = boundary + (CONST_PROOF_SIZE_LOG_N * 0x80);

        p.zmCq = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary:boundary + 0x20])),
            x_1: uint256(bytes32(proof[boundary + 0x20:boundary + 0x40])),
            y_0: uint256(bytes32(proof[boundary + 0x40:boundary + 0x60])),
            y_1: uint256(bytes32(proof[boundary + 0x60:boundary + 0x80]))
        });

        p.zmPi = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary + 0x80:boundary + 0xa0])),
            x_1: uint256(bytes32(proof[boundary + 0xa0:boundary + 0xc0])),
            y_0: uint256(bytes32(proof[boundary + 0xc0:boundary + 0xe0])),
            y_1: uint256(bytes32(proof[boundary + 0xe0:boundary + 0x100]))
        });

        return p;
    }
}
