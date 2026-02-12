// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @notice  Library of error codes
 * @dev     You can run `forge inspect Errors errors` to get the selectors for the optimised verifier
 */
library Errors {
    error ValueGeLimbMax();
    error ValueGeGroupOrder();
    error ValueGeFieldOrder();

    error InvertOfZero();
    error NotPowerOfTwo();
    error ModExpFailed();

    error ProofLengthWrong();
    error ProofLengthWrongWithLogN(uint256 logN, uint256 actualLength, uint256 expectedLength);
    error PublicInputsLengthWrong();
    error SumcheckFailed();
    error ShpleminiFailed();

    error PointAtInfinity();

    error ConsistencyCheckFailed();
    error GeminiChallengeInSubgroup();
}
