// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import {Fr} from "./Fr.sol";
import {LOG_N} from "./keys/Add2HonkVerificationKey.sol";

uint256 constant NUMBER_OF_SUBRELATIONS = 18;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
uint256 constant NUMBER_OF_ENTITIES = 43;
uint256 constant NUMBER_OF_ALPHAS = 17;

// Prime field order
uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order
uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order

// ENUM FOR WIRES
enum WIRE {
    Q_C,
    Q_L,
    Q_R,
    Q_O,
    Q_4,
    Q_M,
    Q_ARITH,
    Q_SORT,
    Q_ELLIPTIC,
    Q_AUX,
    Q_LOOKUP,
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
    SORTED_ACCUM,
    Z_PERM,
    Z_LOOKUP,
    TABLE_1_SHIFT,
    TABLE_2_SHIFT,
    TABLE_3_SHIFT,
    TABLE_4_SHIFT,
    W_L_SHIFT,
    W_R_SHIFT,
    W_O_SHIFT,
    W_4_SHIFT,
    SORTED_ACCUM_SHIFT,
    Z_PERM_SHIFT,
    Z_LOOKUP_SHIFT
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
        G1Point qArith; // Arithmetic widget
        G1Point qSort; // Gen perm sort
        G1Point qAux; // Auxillary
        G1Point qElliptic; // Auxillary
        G1Point qLookup; // Lookup
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

    struct Proof {
        uint256 circuitSize;
        uint256 publicInputsSize;
        uint256 publicInputsOffset;
        // Free wires
        G1ProofPoint w1;
        G1ProofPoint w2;
        G1ProofPoint w3;
        G1ProofPoint w4;
        // Lookup helpers - classic plookup
        G1ProofPoint sortedAccum;
        G1ProofPoint zPerm;
        G1ProofPoint zLookup;
        // Sumcheck
        Fr[BATCHED_RELATION_PARTIAL_LENGTH][LOG_N] sumcheckUnivariates;
        Fr[NUMBER_OF_ENTITIES] sumcheckEvaluations;
        // Zero morph
        G1ProofPoint[LOG_N] zmCqs;
        G1ProofPoint zmCq;
        G1ProofPoint zmPi;
    }

}