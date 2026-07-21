// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "./Errors.sol";
import {Fr, FrLib, P} from "./Fr.sol";
import {
    Honk,
    NUMBER_OF_ALPHAS,
    NUMBER_OF_ENTITIES_ZK,
    ZK_BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N,
    PAIRING_POINTS_SIZE,
    GROUP_ELEMENT_SIZE,
    FIELD_ELEMENT_SIZE
} from "./HonkTypes.sol";
import {bytesToG1Point, bytesToFr} from "./utils.sol";

// ZKTranscript library to generate fiat shamir challenges, the ZK transcript only differest
/// forge-lint: disable-next-item(pascal-case-struct)
struct ZKTranscript {
    // Oink
    Honk.RelationParameters relationParameters;
    Fr[NUMBER_OF_ALPHAS] alphas; // Powers of alpha: [alpha, alpha^2, ..., alpha^(NUM_SUBRELATIONS-1)]
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
        uint256 vkHash,
        uint256 publicInputsSize,
        uint256 logN
    ) external pure returns (ZKTranscript memory t) {
        Fr previousChallenge;
        (t.relationParameters, previousChallenge) =
            generateRelationParametersChallenges(proof, publicInputs, vkHash, publicInputsSize, previousChallenge);

        (t.alphas, previousChallenge) = generateAlphaChallenges(previousChallenge, proof);

        (t.gateChallenges, previousChallenge) = generateGateChallenges(previousChallenge, logN);
        (t.libraChallenge, previousChallenge) = generateLibraChallenge(previousChallenge, proof);
        (t.sumCheckUChallenges, previousChallenge) = generateSumcheckChallenges(proof, previousChallenge, logN);

        (t.rho, previousChallenge) = generateRhoChallenge(proof, previousChallenge);

        (t.geminiR, previousChallenge) = generateGeminiRChallenge(proof, previousChallenge, logN);

        (t.shplonkNu, previousChallenge) = generateShplonkNuChallenge(proof, previousChallenge, logN);

        (t.shplonkZ, previousChallenge) = generateShplonkZChallenge(proof, previousChallenge);
        return t;
    }

    function generateRelationParametersChallenges(
        Honk.ZKProof memory proof,
        bytes32[] calldata publicInputs,
        uint256 vkHash,
        uint256 publicInputsSize,
        Fr previousChallenge
    ) internal pure returns (Honk.RelationParameters memory rp, Fr nextPreviousChallenge) {
        (rp.eta, rp.romLogupGamma, previousChallenge) =
            generateEtaChallenge(proof, publicInputs, vkHash, publicInputsSize);

        (rp.beta, rp.gamma, nextPreviousChallenge) = generateBetaGammaChallenges(previousChallenge, proof);
    }

    function generateEtaChallenge(
        Honk.ZKProof memory proof,
        bytes32[] calldata publicInputs,
        uint256 vkHash,
        uint256 publicInputsSize
    ) internal pure returns (Fr eta, Fr romLogupGamma, Fr previousChallenge) {
        // Size: 1 (vkHash) + publicInputsSize + 8 (geminiMask(2) + 3 wires(6))
        bytes32[] memory round0 = new bytes32[](1 + publicInputsSize + 8);
        round0[0] = bytes32(vkHash);

        for (uint256 i = 0; i < publicInputsSize - PAIRING_POINTS_SIZE; i++) {
            require(uint256(publicInputs[i]) < P, Errors.ValueGeFieldOrder());
            round0[1 + i] = publicInputs[i];
        }
        for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
            round0[1 + publicInputsSize - PAIRING_POINTS_SIZE + i] = FrLib.toBytes32(proof.pairingPointObject[i]);
        }

        // For ZK flavors: hash the gemini masking poly commitment (sent right after public inputs)
        round0[1 + publicInputsSize] = bytes32(proof.geminiMaskingPoly.x);
        round0[1 + publicInputsSize + 1] = bytes32(proof.geminiMaskingPoly.y);

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        round0[1 + publicInputsSize + 2] = bytes32(proof.w1.x);
        round0[1 + publicInputsSize + 3] = bytes32(proof.w1.y);
        round0[1 + publicInputsSize + 4] = bytes32(proof.w2.x);
        round0[1 + publicInputsSize + 5] = bytes32(proof.w2.y);
        round0[1 + publicInputsSize + 6] = bytes32(proof.w3.x);
        round0[1 + publicInputsSize + 7] = bytes32(proof.w3.y);

        eta = FrLib.from(uint256(keccak256(abi.encodePacked(round0))) % P);
        romLogupGamma = FrLib.from(uint256(keccak256(abi.encodePacked(Fr.unwrap(eta)))) % P);
        previousChallenge = romLogupGamma;
    }

    function generateBetaGammaChallenges(Fr previousChallenge, Honk.ZKProof memory proof)
        internal
        pure
        returns (Fr beta, Fr gamma, Fr nextPreviousChallenge)
    {
        bytes32[7] memory round1;
        round1[0] = FrLib.toBytes32(previousChallenge);
        round1[1] = bytes32(proof.lookupReadCounts.x);
        round1[2] = bytes32(proof.lookupReadCounts.y);
        round1[3] = bytes32(proof.lookupReadTags.x);
        round1[4] = bytes32(proof.lookupReadTags.y);
        round1[5] = bytes32(proof.w4.x);
        round1[6] = bytes32(proof.w4.y);

        beta = FrLib.from(uint256(keccak256(abi.encodePacked(round1))) % P);
        gamma = FrLib.from(uint256(keccak256(abi.encodePacked(Fr.unwrap(beta)))) % P);
        nextPreviousChallenge = gamma;
    }

    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(Fr previousChallenge, Honk.ZKProof memory proof)
        internal
        pure
        returns (Fr[NUMBER_OF_ALPHAS] memory alphas, Fr nextPreviousChallenge)
    {
        // Generate the original sumcheck alpha 0 by hashing zPerm and zLookup
        uint256[5] memory alpha0;
        alpha0[0] = Fr.unwrap(previousChallenge);
        alpha0[1] = proof.lookupInverses.x;
        alpha0[2] = proof.lookupInverses.y;
        alpha0[3] = proof.zPerm.x;
        alpha0[4] = proof.zPerm.y;

        nextPreviousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(alpha0))) % P);
        Fr alpha = nextPreviousChallenge;

        // Compute powers of alpha for batching subrelations
        alphas[0] = alpha;
        for (uint256 i = 1; i < NUMBER_OF_ALPHAS; i++) {
            alphas[i] = alphas[i - 1] * alpha;
        }
    }

    function generateGateChallenges(Fr previousChallenge, uint256 logN)
        internal
        pure
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory gateChallenges, Fr nextPreviousChallenge)
    {
        previousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge)))) % P);
        gateChallenges[0] = previousChallenge;
        for (uint256 i = 1; i < logN; i++) {
            gateChallenges[i] = gateChallenges[i - 1] * gateChallenges[i - 1];
        }
        nextPreviousChallenge = previousChallenge;
    }

    function generateLibraChallenge(Fr previousChallenge, Honk.ZKProof memory proof)
        internal
        pure
        returns (Fr libraChallenge, Fr nextPreviousChallenge)
    {
        // 2 comm, 1 sum, 1 challenge
        uint256[4] memory challengeData;
        challengeData[0] = Fr.unwrap(previousChallenge);
        challengeData[1] = proof.libraCommitments[0].x;
        challengeData[2] = proof.libraCommitments[0].y;
        challengeData[3] = Fr.unwrap(proof.libraSum);
        nextPreviousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(challengeData))) % P);
        libraChallenge = nextPreviousChallenge;
    }

    function generateSumcheckChallenges(Honk.ZKProof memory proof, Fr prevChallenge, uint256 logN)
        internal
        pure
        returns (Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckChallenges, Fr nextPreviousChallenge)
    {
        for (uint256 i = 0; i < logN; i++) {
            Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1098): memcpy
            for (uint256 j = 0; j < ZK_BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }
            prevChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(univariateChal))) % P);
            sumcheckChallenges[i] = prevChallenge;
        }
        nextPreviousChallenge = prevChallenge;
    }

    // We add Libra claimed eval + 2 libra commitments (grand_sum, quotient)
    function generateRhoChallenge(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr rho, Fr nextPreviousChallenge)
    {
        uint256[NUMBER_OF_ENTITIES_ZK + 6] memory rhoChallengeElements;
        rhoChallengeElements[0] = Fr.unwrap(prevChallenge);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1098): memcpy
        uint256 i;
        for (i = 1; i <= NUMBER_OF_ENTITIES_ZK; i++) {
            rhoChallengeElements[i] = Fr.unwrap(proof.sumcheckEvaluations[i - 1]);
        }
        rhoChallengeElements[i] = Fr.unwrap(proof.libraEvaluation);
        i += 1;
        rhoChallengeElements[i] = proof.libraCommitments[1].x;
        rhoChallengeElements[i + 1] = proof.libraCommitments[1].y;
        i += 2;
        rhoChallengeElements[i] = proof.libraCommitments[2].x;
        rhoChallengeElements[i + 1] = proof.libraCommitments[2].y;

        nextPreviousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(rhoChallengeElements))) % P);
        rho = nextPreviousChallenge;
    }

    function generateGeminiRChallenge(Honk.ZKProof memory proof, Fr prevChallenge, uint256 logN)
        internal
        pure
        returns (Fr geminiR, Fr nextPreviousChallenge)
    {
        uint256[] memory gR = new uint256[]((logN - 1) * 2 + 1);
        gR[0] = Fr.unwrap(prevChallenge);

        for (uint256 i = 0; i < logN - 1; i++) {
            gR[1 + i * 2] = proof.geminiFoldComms[i].x;
            gR[2 + i * 2] = proof.geminiFoldComms[i].y;
        }

        nextPreviousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(gR))) % P);
        geminiR = nextPreviousChallenge;
    }

    function generateShplonkNuChallenge(Honk.ZKProof memory proof, Fr prevChallenge, uint256 logN)
        internal
        pure
        returns (Fr shplonkNu, Fr nextPreviousChallenge)
    {
        uint256[] memory shplonkNuChallengeElements = new uint256[](logN + 1 + 4);
        shplonkNuChallengeElements[0] = Fr.unwrap(prevChallenge);

        for (uint256 i = 1; i <= logN; i++) {
            shplonkNuChallengeElements[i] = Fr.unwrap(proof.geminiAEvaluations[i - 1]);
        }

        uint256 libraIdx = 0;
        for (uint256 i = logN + 1; i <= logN + 4; i++) {
            shplonkNuChallengeElements[i] = Fr.unwrap(proof.libraPolyEvals[libraIdx]);
            libraIdx++;
        }

        nextPreviousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(shplonkNuChallengeElements))) % P);
        shplonkNu = nextPreviousChallenge;
    }

    function generateShplonkZChallenge(Honk.ZKProof memory proof, Fr prevChallenge)
        internal
        pure
        returns (Fr shplonkZ, Fr nextPreviousChallenge)
    {
        uint256[3] memory shplonkZChallengeElements;
        shplonkZChallengeElements[0] = Fr.unwrap(prevChallenge);

        shplonkZChallengeElements[1] = proof.shplonkQ.x;
        shplonkZChallengeElements[2] = proof.shplonkQ.y;

        nextPreviousChallenge = FrLib.from(uint256(keccak256(abi.encodePacked(shplonkZChallengeElements))) % P);
        shplonkZ = nextPreviousChallenge;
    }

    function loadProof(bytes calldata proof, uint256 logN) internal pure returns (Honk.ZKProof memory p) {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1332): Optimize this away when we finalize.
        uint256 boundary = 0x0;

        // Pairing point object
        for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
            uint256 limb = uint256(bytes32(proof[boundary:boundary + FIELD_ELEMENT_SIZE]));
            // lo limbs (even index) < 2^136, hi limbs (odd index) < 2^120
            require(limb < 2 ** (i % 2 == 0 ? 136 : 120), Errors.ValueGeLimbMax());
            p.pairingPointObject[i] = FrLib.from(limb);
            boundary += FIELD_ELEMENT_SIZE;
        }

        // Gemini masking polynomial commitment (sent first in ZK flavors, right after pairing points)
        p.geminiMaskingPoly = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;

        // Commitments
        p.w1 = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.w2 = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.w3 = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;

        // Lookup / Permutation Helper Commitments
        p.lookupReadCounts = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.lookupReadTags = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.w4 = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.lookupInverses = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.zPerm = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.libraCommitments[0] = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;

        p.libraSum = bytesToFr(proof[boundary:boundary + FIELD_ELEMENT_SIZE]);
        boundary += FIELD_ELEMENT_SIZE;
        // Sumcheck univariates
        for (uint256 i = 0; i < logN; i++) {
            for (uint256 j = 0; j < ZK_BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                p.sumcheckUnivariates[i][j] = bytesToFr(proof[boundary:boundary + FIELD_ELEMENT_SIZE]);
                boundary += FIELD_ELEMENT_SIZE;
            }
        }

        // Sumcheck evaluations (includes gemini_masking_poly eval at index 0 for ZK flavors)
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES_ZK; i++) {
            p.sumcheckEvaluations[i] = bytesToFr(proof[boundary:boundary + FIELD_ELEMENT_SIZE]);
            boundary += FIELD_ELEMENT_SIZE;
        }

        p.libraEvaluation = bytesToFr(proof[boundary:boundary + FIELD_ELEMENT_SIZE]);
        boundary += FIELD_ELEMENT_SIZE;

        p.libraCommitments[1] = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        p.libraCommitments[2] = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;

        // Gemini
        // Read gemini fold univariates
        for (uint256 i = 0; i < logN - 1; i++) {
            p.geminiFoldComms[i] = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
            boundary += GROUP_ELEMENT_SIZE;
        }

        // Read gemini a evaluations
        for (uint256 i = 0; i < logN; i++) {
            p.geminiAEvaluations[i] = bytesToFr(proof[boundary:boundary + FIELD_ELEMENT_SIZE]);
            boundary += FIELD_ELEMENT_SIZE;
        }

        for (uint256 i = 0; i < 4; i++) {
            p.libraPolyEvals[i] = bytesToFr(proof[boundary:boundary + FIELD_ELEMENT_SIZE]);
            boundary += FIELD_ELEMENT_SIZE;
        }

        // Shplonk
        p.shplonkQ = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
        boundary += GROUP_ELEMENT_SIZE;
        // KZG
        p.kzgQuotient = bytesToG1Point(proof[boundary:boundary + GROUP_ELEMENT_SIZE]);
    }
}
