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

import {ecMul, ecAdd, ecSub, negateInplace, convertProofPoint} from "./utils.sol";

// Field arithmetic libraries - prevent littering the code with modmul / addmul
import {MODULUS as P, MINUS_ONE, Fr, FrLib} from "./Fr.sol";

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
    }

    function computeSquares(Fr r) internal pure returns (Fr[CONST_PROOF_SIZE_LOG_N] memory squares) {
        squares[0] = r;
        for (uint256 i = 1; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            squares[i] = squares[i - 1].sqr();
        }
    }

    function computeInvertedGeminiDenominators(
        Fr shplonkZ,
        Fr[CONST_PROOF_SIZE_LOG_N] memory eval_challenge_powers,
        uint256 logSize
    ) internal view returns (Fr[CONST_PROOF_SIZE_LOG_N + 1] memory inverse_vanishing_evals) {
        Fr eval_challenge = shplonkZ;
        inverse_vanishing_evals[0] = (eval_challenge - eval_challenge_powers[0]).invert();

        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            Fr round_inverted_denominator = Fr.wrap(0);
            if (i <= logSize + 1) {
                round_inverted_denominator = (eval_challenge + eval_challenge_powers[i]).invert();
            }
            inverse_vanishing_evals[i + 1] = round_inverted_denominator;
        }
    }

    function computeGeminiBatchedUnivariateEvaluation(
        Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckUChallenges,
        Fr batchedEvalAccumulator,
        Fr[CONST_PROOF_SIZE_LOG_N] memory geminiEvaluations,
        Fr[CONST_PROOF_SIZE_LOG_N] memory geminiEvalChallengePowers,
        uint256 logSize
    ) internal view returns (Fr a_0_pos) {
        for (uint256 i = CONST_PROOF_SIZE_LOG_N; i > 0; --i) {
            Fr challengePower = geminiEvalChallengePowers[i - 1];
            Fr u = sumcheckUChallenges[i - 1];
            Fr evalNeg = geminiEvaluations[i - 1];

            Fr batchedEvalRoundAcc = (
                (challengePower * batchedEvalAccumulator * Fr.wrap(2))
                    - evalNeg * (challengePower * (Fr.wrap(1) - u) - u)
            );
            // Divide by the denominator
            batchedEvalRoundAcc = batchedEvalRoundAcc * (challengePower * (Fr.wrap(1) - u) + u).invert();

            bool is_dummy_round = (i > logSize);
            if (!is_dummy_round) {
                batchedEvalAccumulator = batchedEvalRoundAcc;
            }
        }

        a_0_pos = batchedEvalAccumulator;
    }
}
