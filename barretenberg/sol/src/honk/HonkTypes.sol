// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import {Fr} from "./Fr.sol";

uint256 constant CONST_PROOF_SIZE_LOG_N = 28;

uint256 constant NUMBER_OF_SUBRELATIONS = 26;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 8;
uint256 constant ZK_BATCHED_RELATION_PARTIAL_LENGTH = 9;
uint256 constant NUMBER_OF_ENTITIES = 40;
uint256 constant NUMBER_UNSHIFTED = 35;
uint256 constant NUMBER_TO_BE_SHIFTED = 5;
uint256 constant PAIRING_POINTS_SIZE = 16;

// Alphas are used as relation separators so there should be NUMBER_OF_SUBRELATIONS - 1
uint256 constant NUMBER_OF_ALPHAS = 25;

// ENUM FOR WIRES
enum WIRE {
    Q_M,
    Q_C,
    Q_L,
    Q_R,
    Q_O,
    Q_4,
    Q_LOOKUP,
    Q_ARITH,
    Q_RANGE,
    Q_ELLIPTIC,
    Q_AUX,
    Q_POSEIDON2_EXTERNAL,
    Q_POSEIDON2_INTERNAL,
    SIGMA_1,
    SIGMA_2,
    SIGMA_3,
    SIGMA_4,
    ID_1,
    ID_2,
    ID_3,
    ID_4,
    TABLE_1,
    TABLE_2,
    TABLE_3,
    TABLE_4,
    LAGRANGE_FIRST,
    LAGRANGE_LAST,
    W_L,
    W_R,
    W_O,
    W_4,
    Z_PERM,
    LOOKUP_INVERSES,
    LOOKUP_READ_COUNTS,
    LOOKUP_READ_TAGS,
    W_L_SHIFT,
    W_R_SHIFT,
    W_O_SHIFT,
    W_4_SHIFT,
    Z_PERM_SHIFT
}

library Honk {
    struct G1Point {
        uint256 x;
        uint256 y;
    }

    // TODO(md): temporary work around transcript fields
    struct G1ProofPoint {
        uint256 x_0;
        uint256 x_1;
        uint256 y_0;
        uint256 y_1;
    }

    struct VerificationKey {
        // Misc Params
        uint256 circuitSize;
        uint256 logCircuitSize;
        uint256 publicInputsSize;
        // Selectors
        G1Point qm;
        G1Point qc;
        G1Point ql;
        G1Point qr;
        G1Point qo;
        G1Point q4;
        G1Point qLookup; // Lookup
        G1Point qArith; // Arithmetic widget
        G1Point qDeltaRange; // Delta Range sort
        G1Point qAux; // Auxillary
        G1Point qElliptic; // Auxillary
        G1Point qPoseidon2External;
        G1Point qPoseidon2Internal;
        // Copy cnstraints
        G1Point s1;
        G1Point s2;
        G1Point s3;
        G1Point s4;
        // Copy identity
        G1Point id1;
        G1Point id2;
        G1Point id3;
        G1Point id4;
        // Precomputed lookup table
        G1Point t1;
        G1Point t2;
        G1Point t3;
        G1Point t4;
        // Fixed first and last
        G1Point lagrangeFirst;
        G1Point lagrangeLast;
    }

    struct RelationParameters {
        // challenges
        Fr eta;
        Fr etaTwo;
        Fr etaThree;
        Fr beta;
        Fr gamma;
        // derived
        Fr publicInputsDelta;
    }

    struct Proof {
        // Pairing point object
        Fr[PAIRING_POINTS_SIZE] pairingPointObject;
        // Free wires
        Honk.G1ProofPoint w1;
        Honk.G1ProofPoint w2;
        Honk.G1ProofPoint w3;
        Honk.G1ProofPoint w4;
        // Lookup helpers - Permutations
        Honk.G1ProofPoint zPerm;
        // Lookup helpers - logup
        Honk.G1ProofPoint lookupReadCounts;
        Honk.G1ProofPoint lookupReadTags;
        Honk.G1ProofPoint lookupInverses;
        // Sumcheck
        Fr[BATCHED_RELATION_PARTIAL_LENGTH][CONST_PROOF_SIZE_LOG_N] sumcheckUnivariates;
        Fr[NUMBER_OF_ENTITIES] sumcheckEvaluations;
        // Shplemini
        Honk.G1ProofPoint[CONST_PROOF_SIZE_LOG_N - 1] geminiFoldComms;
        Fr[CONST_PROOF_SIZE_LOG_N] geminiAEvaluations;
        Honk.G1ProofPoint shplonkQ;
        Honk.G1ProofPoint kzgQuotient;
    }

    struct ZKProof {
        // Pairing point object
        Fr[PAIRING_POINTS_SIZE] pairingPointObject;
        // Commitments to wire polynomials
        Honk.G1ProofPoint w1;
        Honk.G1ProofPoint w2;
        Honk.G1ProofPoint w3;
        Honk.G1ProofPoint w4;
        // Commitments to logup witness polynomials
        Honk.G1ProofPoint lookupReadCounts;
        Honk.G1ProofPoint lookupReadTags;
        Honk.G1ProofPoint lookupInverses;
        // Commitment to grand permutation polynomial
        Honk.G1ProofPoint zPerm;
        Honk.G1ProofPoint[3] libraCommitments;
        // Sumcheck
        Fr libraSum;
        Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH][CONST_PROOF_SIZE_LOG_N] sumcheckUnivariates;
        Fr[NUMBER_OF_ENTITIES] sumcheckEvaluations;
        Fr libraEvaluation;
        // ZK
        Honk.G1ProofPoint geminiMaskingPoly;
        Fr geminiMaskingEval;
        // Shplemini
        Honk.G1ProofPoint[CONST_PROOF_SIZE_LOG_N - 1] geminiFoldComms;
        Fr[CONST_PROOF_SIZE_LOG_N] geminiAEvaluations;
        Fr[4] libraPolyEvals;
        Honk.G1ProofPoint shplonkQ;
        Honk.G1ProofPoint kzgQuotient;
    }
}
