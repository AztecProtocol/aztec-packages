// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

library HonkTypes {
    struct G1Point {
        uint256 x;
        uint256 y;
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

    uint256 constant NUMBER_OF_SUBRELATIONS = 4;
    uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
    uint256 constant NUMBER_OF_ENTITIES = 43;

    /// Log of the circuit size - precomputed
    uint256 constant LOG_N = 4;

    struct Proof {
        uint256 circuitSize;
        uint256 publicInputsSize;
        uint256 publicInputsOffset;

        // Free wires
        G1Point w1;
        G1Point w2;
        G1Point w3;
        G1Point w4;

        // Lookup helpers - classic plookup
        G1Point sortedAccum;
        G1Point zPerm;
        G1Point zLookup;

        // Sumcheck
        // TODO: [uinvariate[batched_relation_partial_length]] - not sure how to represent a univariate
        uint256[LOG_N][BATCHED_RELATION_PARTIAL_LENGTH] sumcheckUnivariates;
        uint256[NUMBER_OF_ENTITIES] sumcheckEvaluations;

        // Zero morph
        G1Point[LOG_N] zmCqs;
        G1Point zmCq;
        G1Point zmPi;
    }
}