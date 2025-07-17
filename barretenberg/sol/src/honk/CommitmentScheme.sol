// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs
pragma solidity >=0.8.21;

import {IVerifier} from "../interfaces/IVerifier.sol";
import {
    Honk,
    WIRE,
    NUMBER_OF_ENTITIES,
    NUMBER_OF_SUBRELATIONS,
    NUMBER_OF_ALPHAS,
    NUMBER_UNSHIFTED,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N
} from "./HonkTypes.sol";

// Field arithmetic libraries - prevent littering the code with modmul / addmul
import {MODULUS as P, MINUS_ONE, ONE, ZERO, Fr, FrLib} from "./Fr.sol";

import {logFr} from "./Debug.sol";

library CommitmentSchemeLib {
    using FrLib for Fr;

    // Avoid stack too deep
    struct ShpleminiIntermediates {
        Fr unshiftedScalar;
        Fr shiftedScalar;
        // Scalar to be multiplied by [1]₁
        Fr constantTermAccumulator;
        // Accumulator for powers of rho
        Fr batchingChallenge;
        // Linear combination of multilinear (sumcheck) evaluations and powers of rho
        Fr batchedEvaluation;
        Fr[4] denominators;
        Fr[4] batchingScalars;
        // 1/(z - r^{2^i}) for i = 0, ..., logSize, dynamically updated
        Fr posInvertedDenominator;
        // 1/(z + r^{2^i}) for i = 0, ..., logSize, dynamically updated
        Fr negInvertedDenominator;
        // ν^{2i} * 1/(z - r^{2^i})
        Fr scalingFactorPos;
        // ν^{2i+1} * 1/(z + r^{2^i})
        Fr scalingFactorNeg;
        // Fold_i(r^{2^i}) reconstructed by Verifier
        Fr[CONST_PROOF_SIZE_LOG_N] foldPosEvaluations;
    }

    function computeSquares(Fr r) internal pure returns (Fr[CONST_PROOF_SIZE_LOG_N] memory squares) {
        logFr("gemini R", r);
        squares[0] = r;
        for (uint256 i = 1; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            squares[i] = squares[i - 1].sqr();
        }
    }
    // Compute the evaluations Aₗ(r^{2ˡ}) for l = 0, ..., m-1

    function computeFoldPosEvaluations(
        Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckUChallenges,
        Fr batchedEvalAccumulator,
        Fr[CONST_PROOF_SIZE_LOG_N] memory geminiEvaluations,
        Fr[CONST_PROOF_SIZE_LOG_N] memory geminiEvalChallengePowers,
        uint256 logSize
    ) internal view returns (Fr[] memory) {
        Fr[] memory foldPosEvaluations = new Fr[](logSize);
        for (uint256 i = logSize; i > 0; --i) {
            Fr challengePower = geminiEvalChallengePowers[i - 1];
            Fr u = sumcheckUChallenges[i - 1];

            logFr("batchedEvalAccumulator", i - 1, batchedEvalAccumulator);

            Fr batchedEvalRoundAcc = (
                (challengePower * batchedEvalAccumulator * Fr.wrap(2))
                    - geminiEvaluations[i - 1] * (challengePower * (ONE - u) - u)
            );
            // Divide by the denominator
            batchedEvalRoundAcc = batchedEvalRoundAcc * (challengePower * (ONE - u) + u).invert();

            batchedEvalAccumulator = batchedEvalRoundAcc;
            foldPosEvaluations[i - 1] = batchedEvalRoundAcc;
            logFr("foldPosEvaluations", i - 1, batchedEvalRoundAcc);
        }
        return foldPosEvaluations;
    }

}

