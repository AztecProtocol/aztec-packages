// SPDX-License-Identifier: MIT
pragma solidity >=0.8.21;

import {Fr} from "./Fr.sol";

uint256 internal constant NUMBER_OF_SUBRELATIONS = 18;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 7;
uint256 constant NUMBER_OF_ENTITIES = 43;

/// Log of the circuit size - precomputed
uint256 constant N = 32;
uint256 constant LOG_N = 5;

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
        G1ProofPoint  w1;
        G1ProofPoint  w2;
        G1ProofPoint  w3;
        G1ProofPoint w4;
        // Lookup helpers - classic plookup
        G1ProofPoint sortedAccum;
        G1ProofPoint zPerm;
        G1ProofPoint zLookup;
        // Sumcheck
        // TODO: [uinvariate[batched_relation_partial_length]] - not sure how to represent a univariate
        Fr[BATCHED_RELATION_PARTIAL_LENGTH][LOG_N] sumcheckUnivariates;
        Fr[NUMBER_OF_ENTITIES] sumcheckEvaluations;
        // Zero morph
        G1ProofPoint[LOG_N] zmCqs;
        G1ProofPoint zmCq;
        G1ProofPoint zmPi;
    }
}
