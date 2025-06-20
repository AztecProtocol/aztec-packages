pragma solidity >=0.8.21;

import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES,
    ZK_BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N,
    PAIRING_POINTS_SIZE
} from "./HonkTypes.sol";
import {Fr, FrLib} from "./Fr.sol";

import {bytesToG1ProofPoint, bytesToFr, logFr, logG} from "./utils.sol";

// ZKTranscript library to generate fiat shamir challenges, the ZK transcript only differest
struct ZKTranscript {
    // Oink
    Honk.RelationParameters relationParameters;
    Fr[NUMBER_OF_ALPHAS] alphas;
    Fr[CONST_PROOF_SIZE_LOG_N] gateChallenges;
    // Sumcheck
    Fr libraChallenge;
    Fr[CONST_PROOF_SIZE_LOG_N] sumCheckUChallenges;
    // Shplemini
    Fr rho;
    Fr geminiR;
    Fr shplonkNu;
    Fr shplonkZ;
    // Derived
    Fr publicInputsDelta;
}

library ZKTranscriptLib {
    function generateTranscript(
        Honk.ZKProof memory proof,
        bytes32[] calldata publicInputs,
        uint256 circuitSize,
        uint256 publicInputsSize,
        uint256 pubInputsOffset
    ) internal pure returns (ZKTranscript memory t) {
        Fr previousChallenge;
        (t.relationParameters, previousChallenge) = generateRelationParametersChallenges(
            proof, publicInputs, circuitSize, publicInputsSize, pubInputsOffset, previousChallenge
        );

        (t.alphas, previousChallenge) = generateAlphaChallenges(previousChallenge, proof);

        (t.gateChallenges, previousChallenge) = generateGateChallenges(previousChallenge);
        (t.libraChallenge, previousChallenge) = generateLibraChallenge(previousChallenge, proof);
        (t.sumCheckUChallenges, previousChallenge) = generateSumcheckChallenges(proof, previousChallenge);

        (t.rho, previousChallenge) = generateRhoChallenge(proof, previousChallenge);

        (t.geminiR, previousChallenge) = generateGeminiRChallenge(proof, previousChallenge);

        (t.shplonkNu, previousChallenge) = generateShplonkNuChallenge(proof, previousChallenge);

        (t.shplonkZ, previousChallenge) = generateShplonkZChallenge(proof, previousChallenge);
        return t;
    }

    function splitChallenge(Fr challenge) internal pure returns (Fr first, Fr second) {
        uint256 challengeU256 = uint256(Fr.unwrap(challenge));
        uint256 lo = challengeU256 & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;
        uint256 hi = challengeU256 >> 128;
        first = FrLib.fromBytes32(bytes32(lo));
        second = FrLib.fromBytes32(bytes32(hi));
    }

    function generateRelationParametersChallenges(
        Honk.ZKProof memory proof,
        bytes32[] calldata publicInputs,
        uint256 circuitSize,
        uint256 publicInputsSize,
        uint256 pubInputsOffset,
        Fr previousChallenge
    ) internal pure returns (Honk.RelationParameters memory rp, Fr nextPreviousChallenge) {
        (rp.eta, rp.etaTwo, rp.etaThree, previousChallenge) =
            generateEtaChallenge(proof, publicInputs, circuitSize, publicInputsSize, pubInputsOffset);

        (rp.beta, rp.gamma, nextPreviousChallenge) = generateBetaAndGammaChallenges(previousChallenge, proof);
    }

    function generateEtaChallenge(
        Honk.ZKProof memory proof,
        bytes32[] calldata publicInputs,
        uint256 circuitSize,
        uint256 publicInputsSize,
        uint256 pubInputsOffset
    ) internal pure returns (Fr eta, Fr etaTwo, Fr etaThree, Fr previousChallenge) {
        bytes32[] memory round0 = new bytes32[](3 + publicInputsSize + 12);
        round0[0] = bytes32(circuitSize);
        round0[1] = bytes32(publicInputsSize);
        round0[2] = bytes32(pubInputsOffset);
        for (uint256 i = 0; i < publicInputsSize - PAIRING_POINTS_SIZE; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }
        for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
            round0[3 + publicInputsSize - PAIRING_POINTS_SIZE + i] = FrLib.toBytes32(proof.pairingPointObject[i]);
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

        previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(round0)));
        (eta, etaTwo) = splitChallenge(previousChallenge);
        previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));

        (etaThree,) = splitChallenge(previousChallenge);
    }

    function generateBetaAndGammaChallenges(Fr previousChallenge, Honk.ZKProof memory proof)
        internal
        pure
        returns (Fr beta, Fr gamma, Fr nextPreviousChallenge)
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

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(round1)));
        (beta, gamma) = splitChallenge(nextPreviousChallenge);
    }

    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(Fr previousChallenge, Honk.ZKProof memory proof)
        internal
        pure
        returns (Fr[NUMBER_OF_ALPHAS] memory alphas, Fr nextPreviousChallenge)
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

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(alpha0)));
        (alphas[0], alphas[1]) = splitChallenge(nextPreviousChallenge);

        for (uint256 i = 1; i < NUMBER_OF_ALPHAS / 2; i++) {
            nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(nextPreviousChallenge))));
            (alphas[2 * i], alphas[2 * i + 1]) = splitChallenge(nextPreviousChallenge);
        }
        if (((NUMBER_OF_ALPHAS & 1) == 1) && (NUMBER_OF_ALPHAS > 2)) {
            nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(nextPreviousChallenge))));

            (alphas[NUMBER_OF_ALPHAS - 1],) = splitChallenge(nextPreviousChallenge);
        }
    }

    function generateGateChallenges(Fr previousChallenge)
        internal
        pure
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory gateChallenges, Fr nextPreviousChallenge)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));

            (gateChallenges[i],) = splitChallenge(previousChallenge);
        }
        nextPreviousChallenge = previousChallenge;
    }

    function generateLibraChallenge(Fr previousChallenge, Honk.ZKProof memory proof)
        internal
        pure
        returns (Fr libraChallenge, Fr nextPreviousChallenge)
    {
        // 4 comm, 1 sum, 1 challenge
        uint256[6] memory challengeData;
        challengeData[0] = Fr.unwrap(previousChallenge);
        challengeData[1] = proof.libraCommitments[0].x_0;
        challengeData[2] = proof.libraCommitments[0].x_1;
        challengeData[3] = proof.libraCommitments[0].y_0;
        challengeData[4] = proof.libraCommitments[0].y_1;
        challengeData[5] = Fr.unwrap(proof.libraSum);
        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(challengeData)));
        (libraChallenge,) = splitChallenge(nextPreviousChallenge);
    }

    function generateSumcheckChallenges(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckChallenges, Fr nextPreviousChallenge)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1098): memcpy
            for (uint256 j = 0; j < ZK_BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }
            prevChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(univariateChal)));

            (sumcheckChallenges[i],) = splitChallenge(prevChallenge);
        }
        nextPreviousChallenge = prevChallenge;
    }

    // We add Libra claimed eval + 3 comm + 1 more eval
    function generateRhoChallenge(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr rho, Fr nextPreviousChallenge)
    {
        uint256[NUMBER_OF_ENTITIES + 15] memory rhoChallengeElements;
        rhoChallengeElements[0] = Fr.unwrap(prevChallenge);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1098): memcpy
        uint256 i;
        for (i = 1; i <= NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i] = Fr.unwrap(proof.sumcheckEvaluations[i - 1]);
        }
        rhoChallengeElements[i] = Fr.unwrap(proof.libraEvaluation);

        i += 1;
        rhoChallengeElements[i] = proof.libraCommitments[1].x_0;
        rhoChallengeElements[i + 1] = proof.libraCommitments[1].x_1;
        rhoChallengeElements[i + 2] = proof.libraCommitments[1].y_0;
        rhoChallengeElements[i + 3] = proof.libraCommitments[1].y_1;
        i += 4;
        rhoChallengeElements[i] = proof.libraCommitments[2].x_0;
        rhoChallengeElements[i + 1] = proof.libraCommitments[2].x_1;
        rhoChallengeElements[i + 2] = proof.libraCommitments[2].y_0;
        rhoChallengeElements[i + 3] = proof.libraCommitments[2].y_1;
        i += 4;
        rhoChallengeElements[i] = proof.geminiMaskingPoly.x_0;
        rhoChallengeElements[i + 1] = proof.geminiMaskingPoly.x_1;
        rhoChallengeElements[i + 2] = proof.geminiMaskingPoly.y_0;
        rhoChallengeElements[i + 3] = proof.geminiMaskingPoly.y_1;

        i += 4;
        rhoChallengeElements[i] = Fr.unwrap(proof.geminiMaskingEval);

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(rhoChallengeElements)));
        (rho,) = splitChallenge(nextPreviousChallenge);
    }

    function generateGeminiRChallenge(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr geminiR, Fr nextPreviousChallenge)
    {
        uint256[(CONST_PROOF_SIZE_LOG_N - 1) * 4 + 1] memory gR;
        gR[0] = Fr.unwrap(prevChallenge);

        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; i++) {
            gR[1 + i * 4] = proof.geminiFoldComms[i].x_0;
            gR[2 + i * 4] = proof.geminiFoldComms[i].x_1;
            gR[3 + i * 4] = proof.geminiFoldComms[i].y_0;
            gR[4 + i * 4] = proof.geminiFoldComms[i].y_1;
        }

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(gR)));

        (geminiR,) = splitChallenge(nextPreviousChallenge);
    }

    function generateShplonkNuChallenge(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr shplonkNu, Fr nextPreviousChallenge)
    {
        uint256[(CONST_PROOF_SIZE_LOG_N) + 1 + 4] memory shplonkNuChallengeElements;
        shplonkNuChallengeElements[0] = Fr.unwrap(prevChallenge);

        for (uint256 i = 1; i <= CONST_PROOF_SIZE_LOG_N; i++) {
            shplonkNuChallengeElements[i] = Fr.unwrap(proof.geminiAEvaluations[i - 1]);
        }

        uint256 libraIdx = 0;
        for (uint256 i = CONST_PROOF_SIZE_LOG_N + 1; i <= CONST_PROOF_SIZE_LOG_N + 4; i++) {
            shplonkNuChallengeElements[i] = Fr.unwrap(proof.libraPolyEvals[libraIdx]);
            libraIdx++;
        }

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(shplonkNuChallengeElements)));
        (shplonkNu,) = splitChallenge(nextPreviousChallenge);
    }

    function generateShplonkZChallenge(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr shplonkZ, Fr nextPreviousChallenge)
    {
        uint256[5] memory shplonkZChallengeElements;
        shplonkZChallengeElements[0] = Fr.unwrap(prevChallenge);

        shplonkZChallengeElements[1] = proof.shplonkQ.x_0;
        shplonkZChallengeElements[2] = proof.shplonkQ.x_1;
        shplonkZChallengeElements[3] = proof.shplonkQ.y_0;
        shplonkZChallengeElements[4] = proof.shplonkQ.y_1;

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(shplonkZChallengeElements)));
        (shplonkZ,) = splitChallenge(nextPreviousChallenge);
    }

    function loadProof(bytes calldata proof) internal pure returns (Honk.ZKProof memory p) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1332): Optimize this away when we finalize.
        uint256 boundary = 0x0;

        // Pairing point object
        for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
            p.pairingPointObject[i] = bytesToFr(proof[boundary:boundary + 0x20]);
            boundary += 0x20;
        }
        // Commitments
        p.w1 = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.w2 = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.w3 = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;

        // Lookup / Permutation Helper Commitments
        p.lookupReadCounts = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.lookupReadTags = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.w4 = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.lookupInverses = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.zPerm = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.libraCommitments[0] = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;

        p.libraSum = bytesToFr(proof[boundary:boundary + 0x20]);
        boundary += 0x20;
        // Sumcheck univariates
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            for (uint256 j = 0; j < ZK_BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                p.sumcheckUnivariates[i][j] = bytesToFr(proof[boundary:boundary + 0x20]);
                boundary += 0x20;
            }
        }

        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            p.sumcheckEvaluations[i] = bytesToFr(proof[boundary:boundary + 0x20]);
            boundary += 0x20;
        }

        p.libraEvaluation = bytesToFr(proof[boundary:boundary + 0x20]);
        boundary += 0x20;

        p.libraCommitments[1] = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.libraCommitments[2] = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.geminiMaskingPoly = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        p.geminiMaskingEval = bytesToFr(proof[boundary:boundary + 0x20]);
        boundary += 0x20;

        // Gemini
        // Read gemini fold univariates
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; i++) {
            p.geminiFoldComms[i] = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
            boundary += 0x80;
        }

        // Read gemini a evaluations
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            p.geminiAEvaluations[i] = bytesToFr(proof[boundary:boundary + 0x20]);
            boundary += 0x20;
        }

        for (uint256 i = 0; i < 4; i++) {
            p.libraPolyEvals[i] = bytesToFr(proof[boundary:boundary + 0x20]);
            boundary += 0x20;
        }

        // Shplonk
        p.shplonkQ = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        // KZG
        p.kzgQuotient = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
    }
}
