pragma solidity >=0.8.21;

import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N,
    PAIRING_POINTS_SIZE,
    VERIFICATION_KEY_LENGTH
} from "./HonkTypes.sol";
import {Fr, FrLib} from "./Fr.sol";
import {bytesToG1ProofPoint, bytesToFr} from "./utils.sol";

// Transcript library to generate fiat shamir challenges
struct Transcript {
    // Oink
    Honk.RelationParameters relationParameters;
    Fr[NUMBER_OF_ALPHAS] alphas;
    Fr[CONST_PROOF_SIZE_LOG_N] gateChallenges;
    // Sumcheck
    Fr[CONST_PROOF_SIZE_LOG_N] sumCheckUChallenges;
    // Gemini
    Fr rho;
    Fr geminiR;
    // Shplonk
    Fr shplonkNu;
    Fr shplonkZ;
}

library TranscriptLib {
    function generateTranscript(
        Honk.Proof memory proof,
        bytes32[] calldata publicInputs,
        Honk.VerificationKey memory vkey
    ) internal pure returns (Transcript memory t) {
        Fr previousChallenge;
        (t.relationParameters, previousChallenge) =
            generateRelationParametersChallenges(proof, publicInputs, vkey, previousChallenge);

        (t.alphas, previousChallenge) = generateAlphaChallenges(previousChallenge, proof);

        (t.gateChallenges, previousChallenge) = generateGateChallenges(previousChallenge);

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
        Honk.Proof memory proof,
        bytes32[] calldata publicInputs,
        Honk.VerificationKey memory vkey,
        Fr previousChallenge
    ) internal pure returns (Honk.RelationParameters memory rp, Fr nextPreviousChallenge) {
        (rp.eta, rp.etaTwo, rp.etaThree, previousChallenge) = generateEtaChallenge(proof, publicInputs, vkey);

        (rp.beta, rp.gamma, nextPreviousChallenge) = generateBetaAndGammaChallenges(previousChallenge, proof);
    }

    function generateEtaChallenge(
        Honk.Proof memory proof,
        bytes32[] calldata publicInputs,
        Honk.VerificationKey memory vkey
    ) internal pure returns (Fr eta, Fr etaTwo, Fr etaThree, Fr previousChallenge) {
        bytes32[] memory round0 = new bytes32[](VERIFICATION_KEY_LENGTH + vkey.publicInputsSize + 12);
        uint256 idx = 0;
        round0[idx++] = bytes32(vkey.circuitSize);
        round0[idx++] = bytes32(vkey.publicInputsSize);
        round0[idx++] = bytes32(uint256(1));

        round0[idx++] = bytes32(vkey.qm.x_0);
        round0[idx++] = bytes32(vkey.qm.x_1);
        round0[idx++] = bytes32(vkey.qm.y_0);
        round0[idx++] = bytes32(vkey.qm.y_1);

        round0[idx++] = bytes32(vkey.qc.x_0);
        round0[idx++] = bytes32(vkey.qc.x_1);
        round0[idx++] = bytes32(vkey.qc.y_0);
        round0[idx++] = bytes32(vkey.qc.y_1);

        round0[idx++] = bytes32(vkey.ql.x_0);
        round0[idx++] = bytes32(vkey.ql.x_1);
        round0[idx++] = bytes32(vkey.ql.y_0);
        round0[idx++] = bytes32(vkey.ql.y_1);

        round0[idx++] = bytes32(vkey.qr.x_0);
        round0[idx++] = bytes32(vkey.qr.x_1);
        round0[idx++] = bytes32(vkey.qr.y_0);
        round0[idx++] = bytes32(vkey.qr.y_1);

        round0[idx++] = bytes32(vkey.qo.x_0);
        round0[idx++] = bytes32(vkey.qo.x_1);
        round0[idx++] = bytes32(vkey.qo.y_0);
        round0[idx++] = bytes32(vkey.qo.y_1);

        round0[idx++] = bytes32(vkey.q4.x_0);
        round0[idx++] = bytes32(vkey.q4.x_1);
        round0[idx++] = bytes32(vkey.q4.y_0);
        round0[idx++] = bytes32(vkey.q4.y_1);

        round0[idx++] = bytes32(vkey.qLookup.x_0);
        round0[idx++] = bytes32(vkey.qLookup.x_1);
        round0[idx++] = bytes32(vkey.qLookup.y_0);
        round0[idx++] = bytes32(vkey.qLookup.y_1);

        round0[idx++] = bytes32(vkey.qArith.x_0);
        round0[idx++] = bytes32(vkey.qArith.x_1);
        round0[idx++] = bytes32(vkey.qArith.y_0);
        round0[idx++] = bytes32(vkey.qArith.y_1);

        round0[idx++] = bytes32(vkey.qDeltaRange.x_0);
        round0[idx++] = bytes32(vkey.qDeltaRange.x_1);
        round0[idx++] = bytes32(vkey.qDeltaRange.y_0);
        round0[idx++] = bytes32(vkey.qDeltaRange.y_1);

        round0[idx++] = bytes32(vkey.qAux.x_0);
        round0[idx++] = bytes32(vkey.qAux.x_1);
        round0[idx++] = bytes32(vkey.qAux.y_0);
        round0[idx++] = bytes32(vkey.qAux.y_1);

        round0[idx++] = bytes32(vkey.qElliptic.x_0);
        round0[idx++] = bytes32(vkey.qElliptic.x_1);
        round0[idx++] = bytes32(vkey.qElliptic.y_0);
        round0[idx++] = bytes32(vkey.qElliptic.y_1);

        round0[idx++] = bytes32(vkey.qPoseidon2External.x_0);
        round0[idx++] = bytes32(vkey.qPoseidon2External.x_1);
        round0[idx++] = bytes32(vkey.qPoseidon2External.y_0);
        round0[idx++] = bytes32(vkey.qPoseidon2External.y_1);

        round0[idx++] = bytes32(vkey.qPoseidon2Internal.x_0);
        round0[idx++] = bytes32(vkey.qPoseidon2Internal.x_1);
        round0[idx++] = bytes32(vkey.qPoseidon2Internal.y_0);
        round0[idx++] = bytes32(vkey.qPoseidon2Internal.y_1);

        round0[idx++] = bytes32(vkey.s1.x_0);
        round0[idx++] = bytes32(vkey.s1.x_1);
        round0[idx++] = bytes32(vkey.s1.y_0);
        round0[idx++] = bytes32(vkey.s1.y_1);

        round0[idx++] = bytes32(vkey.s2.x_0);
        round0[idx++] = bytes32(vkey.s2.x_1);
        round0[idx++] = bytes32(vkey.s2.y_0);
        round0[idx++] = bytes32(vkey.s2.y_1);

        round0[idx++] = bytes32(vkey.s3.x_0);
        round0[idx++] = bytes32(vkey.s3.x_1);
        round0[idx++] = bytes32(vkey.s3.y_0);
        round0[idx++] = bytes32(vkey.s3.y_1);

        round0[idx++] = bytes32(vkey.s4.x_0);
        round0[idx++] = bytes32(vkey.s4.x_1);
        round0[idx++] = bytes32(vkey.s4.y_0);
        round0[idx++] = bytes32(vkey.s4.y_1);

        round0[idx++] = bytes32(vkey.id1.x_0);
        round0[idx++] = bytes32(vkey.id1.x_1);
        round0[idx++] = bytes32(vkey.id1.y_0);
        round0[idx++] = bytes32(vkey.id1.y_1);

        round0[idx++] = bytes32(vkey.id2.x_0);
        round0[idx++] = bytes32(vkey.id2.x_1);
        round0[idx++] = bytes32(vkey.id2.y_0);
        round0[idx++] = bytes32(vkey.id2.y_1);

        round0[idx++] = bytes32(vkey.id3.x_0);
        round0[idx++] = bytes32(vkey.id3.x_1);
        round0[idx++] = bytes32(vkey.id3.y_0);
        round0[idx++] = bytes32(vkey.id3.y_1);

        round0[idx++] = bytes32(vkey.id4.x_0);
        round0[idx++] = bytes32(vkey.id4.x_1);
        round0[idx++] = bytes32(vkey.id4.y_0);
        round0[idx++] = bytes32(vkey.id4.y_1);

        round0[idx++] = bytes32(vkey.t1.x_0);
        round0[idx++] = bytes32(vkey.t1.x_1);
        round0[idx++] = bytes32(vkey.t1.y_0);
        round0[idx++] = bytes32(vkey.t1.y_1);

        round0[idx++] = bytes32(vkey.t2.x_0);
        round0[idx++] = bytes32(vkey.t2.x_1);
        round0[idx++] = bytes32(vkey.t2.y_0);
        round0[idx++] = bytes32(vkey.t2.y_1);

        round0[idx++] = bytes32(vkey.t3.x_0);
        round0[idx++] = bytes32(vkey.t3.x_1);
        round0[idx++] = bytes32(vkey.t3.y_0);
        round0[idx++] = bytes32(vkey.t3.y_1);

        round0[idx++] = bytes32(vkey.t4.x_0);
        round0[idx++] = bytes32(vkey.t4.x_1);
        round0[idx++] = bytes32(vkey.t4.y_0);
        round0[idx++] = bytes32(vkey.t4.y_1);

        round0[idx++] = bytes32(vkey.lagrangeFirst.x_0);
        round0[idx++] = bytes32(vkey.lagrangeFirst.x_1);
        round0[idx++] = bytes32(vkey.lagrangeFirst.y_0);
        round0[idx++] = bytes32(vkey.lagrangeFirst.y_1);

        round0[idx++] = bytes32(vkey.lagrangeLast.x_0);
        round0[idx++] = bytes32(vkey.lagrangeLast.x_1);
        round0[idx++] = bytes32(vkey.lagrangeLast.y_0);
        round0[idx++] = bytes32(vkey.lagrangeLast.y_1);

        for (uint256 i = 0; i < vkey.publicInputsSize - PAIRING_POINTS_SIZE; i++) {
            round0[VERIFICATION_KEY_LENGTH + i] = bytes32(publicInputs[i]);
        }
        idx = VERIFICATION_KEY_LENGTH + vkey.publicInputsSize;
        for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
            round0[idx - PAIRING_POINTS_SIZE + i] = FrLib.toBytes32(proof.pairingPointObject[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        round0[idx] = bytes32(proof.w1.x_0);
        round0[idx + 1] = bytes32(proof.w1.x_1);
        round0[idx + 2] = bytes32(proof.w1.y_0);
        round0[idx + 3] = bytes32(proof.w1.y_1);
        round0[idx + 4] = bytes32(proof.w2.x_0);
        round0[idx + 5] = bytes32(proof.w2.x_1);
        round0[idx + 6] = bytes32(proof.w2.y_0);
        round0[idx + 7] = bytes32(proof.w2.y_1);
        round0[idx + 8] = bytes32(proof.w3.x_0);
        round0[idx + 9] = bytes32(proof.w3.x_1);
        round0[idx + 10] = bytes32(proof.w3.y_0);
        round0[idx + 11] = bytes32(proof.w3.y_1);

        previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(round0)));
        (eta, etaTwo) = splitChallenge(previousChallenge);
        previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));
        Fr unused;
        (etaThree, unused) = splitChallenge(previousChallenge);
    }

    function generateBetaAndGammaChallenges(Fr previousChallenge, Honk.Proof memory proof)
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
    function generateAlphaChallenges(Fr previousChallenge, Honk.Proof memory proof)
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
            Fr unused;
            (alphas[NUMBER_OF_ALPHAS - 1], unused) = splitChallenge(nextPreviousChallenge);
        }
    }

    function generateGateChallenges(Fr previousChallenge)
        internal
        pure
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory gateChallenges, Fr nextPreviousChallenge)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));
            Fr unused;
            (gateChallenges[i], unused) = splitChallenge(previousChallenge);
        }
        nextPreviousChallenge = previousChallenge;
    }

    function generateSumcheckChallenges(Honk.Proof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckChallenges, Fr nextPreviousChallenge)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            Fr[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1098): memcpy
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }
            prevChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(univariateChal)));
            Fr unused;
            (sumcheckChallenges[i], unused) = splitChallenge(prevChallenge);
        }
        nextPreviousChallenge = prevChallenge;
    }

    function generateRhoChallenge(Honk.Proof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr rho, Fr nextPreviousChallenge)
    {
        Fr[NUMBER_OF_ENTITIES + 1] memory rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1098): memcpy
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(rhoChallengeElements)));
        Fr unused;
        (rho, unused) = splitChallenge(nextPreviousChallenge);
    }

    function generateGeminiRChallenge(Honk.Proof memory proof, Fr prevChallenge)
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
        Fr unused;
        (geminiR, unused) = splitChallenge(nextPreviousChallenge);
    }

    function generateShplonkNuChallenge(Honk.Proof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr shplonkNu, Fr nextPreviousChallenge)
    {
        uint256[(CONST_PROOF_SIZE_LOG_N) + 1] memory shplonkNuChallengeElements;
        shplonkNuChallengeElements[0] = Fr.unwrap(prevChallenge);

        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            shplonkNuChallengeElements[i + 1] = Fr.unwrap(proof.geminiAEvaluations[i]);
        }

        nextPreviousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(shplonkNuChallengeElements)));
        Fr unused;
        (shplonkNu, unused) = splitChallenge(nextPreviousChallenge);
    }

    function generateShplonkZChallenge(Honk.Proof memory proof, Fr prevChallenge)
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
        Fr unused;
        (shplonkZ, unused) = splitChallenge(nextPreviousChallenge);
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1234)
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1235)
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1236)
    function loadProof(bytes calldata proof) internal pure returns (Honk.Proof memory p) {
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

        // Sumcheck univariates
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                p.sumcheckUnivariates[i][j] = bytesToFr(proof[boundary:boundary + 0x20]);
                boundary += 0x20;
            }
        }
        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            p.sumcheckEvaluations[i] = bytesToFr(proof[boundary:boundary + 0x20]);
            boundary += 0x20;
        }

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

        // Shplonk
        p.shplonkQ = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
        boundary += 0x80;
        // KZG
        p.kzgQuotient = bytesToG1ProofPoint(proof[boundary:boundary + 0x80]);
    }
}
