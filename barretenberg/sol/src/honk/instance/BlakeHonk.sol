// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs
pragma solidity >=0.8.21;

import {IVerifier} from "../../interfaces/IVerifier.sol";
import {BlakeHonkVerificationKey as VK, N, LOG_N, NUMBER_OF_PUBLIC_INPUTS} from "../keys/BlakeHonkVerificationKey.sol";

import {
    Honk,
    WIRE,
    NUMBER_OF_ENTITIES,
    NUMBER_OF_SUBRELATIONS,
    NUMBER_OF_ALPHAS,
    NUMBER_UNSHIFTED,
    NUMBER_TO_BE_SHIFTED,
    BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N
} from "../HonkTypes.sol";

import {ecMul, ecAdd, ecSub, negateInplace, convertProofPoint} from "../utils.sol";

// Field arithmetic libraries - prevent littering the code with modmul / addmul
import {MODULUS as P, MINUS_ONE, Fr, FrLib} from "../Fr.sol";

import {Transcript, TranscriptLib} from "../Transcript.sol";

import {RelationsLib} from "../Relations.sol";

// Errors
error PublicInputsLengthWrong();
error SumcheckFailed();
error ShpleminiFailed();

/// Smart contract verifier of honk proofs
contract BlakeHonkVerifier is IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) public view override returns (bool) {
        Honk.VerificationKey memory vk = loadVerificationKey();
        Honk.Proof memory p = TranscriptLib.loadProof(proof);

        if (publicInputs.length != vk.publicInputsSize) {
            revert PublicInputsLengthWrong();
        }

        // Generate the fiat shamir challenges for the whole protocol
        Transcript memory t = TranscriptLib.generateTranscript(p, publicInputs, vk.publicInputsSize);

        // Compute the public input delta
        t.publicInputsDelta =
            computePublicInputDelta(publicInputs, t.beta, t.gamma, vk.circuitSize, p.publicInputsOffset);

        // Sumcheck
        bool sumcheckVerified = verifySumcheck(p, t);
        if (!sumcheckVerified) revert SumcheckFailed();

        bool shpleminiVerified = verifyShplemini(p, t);
        if (!shpleminiVerified) revert ShpleminiFailed();

        return sumcheckVerified && shpleminiVerified; // Boolean condition not required - nice for vanity :)
    }

    function loadVerificationKey() internal view returns (Honk.VerificationKey memory) {
        return VK.loadVerificationKey();
    }

    function computePublicInputDelta(
        bytes32[] memory publicInputs,
        Fr beta,
        Fr gamma,
        uint256 domainSize,
        uint256 offset
    ) internal view returns (Fr publicInputDelta) {
        Fr numerator = Fr.wrap(1);
        Fr denominator = Fr.wrap(1);

        Fr numeratorAcc = gamma + (beta * FrLib.from(domainSize + offset));
        Fr denominatorAcc = gamma - (beta * FrLib.from(offset + 1));

        {
            for (uint256 i = 0; i < NUMBER_OF_PUBLIC_INPUTS; i++) {
                Fr pubInput = FrLib.fromBytes32(publicInputs[i]);

                numerator = numerator * (numeratorAcc + pubInput);
                denominator = denominator * (denominatorAcc + pubInput);

                numeratorAcc = numeratorAcc + beta;
                denominatorAcc = denominatorAcc - beta;
            }
        }

        // Fr delta = numerator / denominator; // TOOO: batch invert later?
        publicInputDelta = FrLib.div(numerator, denominator);
    }

    uint256 constant ROUND_TARGET = 0;

    function verifySumcheck(Honk.Proof memory proof, Transcript memory tp) internal view returns (bool verified) {
        Fr roundTarget;
        Fr powPartialEvaluation = Fr.wrap(1);

        // We perform sumcheck reductions over log n rounds ( the multivariate degree )
        for (uint256 round; round < LOG_N; ++round) {
            Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate = proof.sumcheckUnivariates[round];
            bool valid = checkSum(roundUnivariate, roundTarget);
            if (!valid) revert SumcheckFailed();

            Fr roundChallenge = tp.sumCheckUChallenges[round];

            // Update the round target for the next rounf
            roundTarget = computeNextTargetSum(roundUnivariate, roundChallenge);
            powPartialEvaluation = partiallyEvaluatePOW(tp, powPartialEvaluation, roundChallenge, round);
        }

        // Last round
        Fr grandHonkRelationSum = RelationsLib.accumulateRelationEvaluations(proof, tp, powPartialEvaluation);
        verified = (grandHonkRelationSum == roundTarget);
    }

    function checkSum(Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate, Fr roundTarget)
        internal
        view
        returns (bool checked)
    {
        Fr totalSum = roundUnivariate[0] + roundUnivariate[1];
        checked = totalSum == roundTarget;
    }

    // Return the new target sum for the next sumcheck round
    function computeNextTargetSum(Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariates, Fr roundChallenge)
        internal
        view
        returns (Fr targetSum)
    {
        // TODO: inline
        Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory BARYCENTRIC_LAGRANGE_DENOMINATORS = [
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffec51),
            Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000002d0),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff11),
            Fr.wrap(0x0000000000000000000000000000000000000000000000000000000000000090),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffff71),
            Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000000f0),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffd31),
            Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000013b0)
        ];

        Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory BARYCENTRIC_DOMAIN = [
            Fr.wrap(0x00),
            Fr.wrap(0x01),
            Fr.wrap(0x02),
            Fr.wrap(0x03),
            Fr.wrap(0x04),
            Fr.wrap(0x05),
            Fr.wrap(0x06),
            Fr.wrap(0x07)
        ];
        // To compute the next target sum, we evaluate the given univariate at a point u (challenge).

        // TODO: opt: use same array mem for each iteratioon
        // Performing Barycentric evaluations
        // Compute B(x)
        Fr numeratorValue = Fr.wrap(1);
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            numeratorValue = numeratorValue * (roundChallenge - Fr.wrap(i));
        }

        // Calculate domain size N of inverses -- TODO: montgomery's trick
        Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory denominatorInverses;
        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr inv = BARYCENTRIC_LAGRANGE_DENOMINATORS[i];
            inv = inv * (roundChallenge - BARYCENTRIC_DOMAIN[i]);
            inv = FrLib.invert(inv);
            denominatorInverses[i] = inv;
        }

        for (uint256 i; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr term = roundUnivariates[i];
            term = term * denominatorInverses[i];
            targetSum = targetSum + term;
        }

        // Scale the sum by the value of B(x)
        targetSum = targetSum * numeratorValue;
    }

    // Univariate evaluation of the monomial ((1-X_l) + X_l.B_l) at the challenge point X_l=u_l
    function partiallyEvaluatePOW(Transcript memory tp, Fr currentEvaluation, Fr roundChallenge, uint256 round)
        internal
        pure
        returns (Fr newEvaluation)
    {
        Fr univariateEval = Fr.ONE() + (roundChallenge * (tp.gateChallenges[round] - Fr.ONE()));
        newEvaluation = currentEvaluation * univariateEval;
    }

    function verifyShplemini(Honk.Proof memory proof, Transcript memory tp) internal view returns (bool verified) {
        Fr[CONST_PROOF_SIZE_LOG_N] memory squares = computeSquares(tp.rChallenge);


        // Remember to convert this from a proof point
        // Honk.G1Point[CONST_PROOF_SIZE_LOG_N + 1] memory commitments;
        // TODO: check size of scalars
        Fr[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] memory scalars;
        Honk.G1Point[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] memory commitments;




        Fr[CONST_PROOF_SIZE_LOG_N + 1] memory inverse_vanishing_evals =
            computeInvertedGeminiDenominators(tp, squares);

        Fr unshifted_scalar = inverse_vanishing_evals[0] + (tp.shplonkZ * inverse_vanishing_evals[1]);
        Fr shifted_scalar = tp.geminiR.invert() * (inverse_vanishing_evals[0] - (tp.shplonkZ * inverse_vanishing_evals[1]));

        scalars[0] = Fr.ONE();
        commitments[0] = convertProofPoint(proof.shplonkQ);

        // Batch multivariate opening claims
        Fr batchingChallenge = Fr.ONE();
        Fr batchedEvaluation = Fr.ZERO();
       for (uint256 i = 1; i <= NUMBER_UNSHIFTED; ++i) {
            scalars[i] = -unshiftedScalar * batchingChallenge;
            batchingChallenge = batchingChallenge * tp.rho;
            batchedEvaluation += proof.sumcheckEvaluations[i] * batchingChallenge;
        }
        // g commitments are accumulated at r
        for (uint256 i = NUMBER_UNSHIFTED + 1; i <= NUMBER_OF_ENTITIES; ++i) {
            scalars[i] = -shiftedScalar * batchingChallenge;
            batchingChallenge = batchingChallenge * tp.rho;
            batchedEvaluation += proof.sumcheckEvaluations[i] * batchingChallenge;
        }

        commitments[1] = vk.qm;
        commitments[2] = vk.qc;
        commitments[3] = vk.ql;
        commitments[4] = vk.qr;
        commitments[5] = vk.qo;
        commitments[6] = vk.q4;
        commitments[7] = vk.qArith;
        commitments[8] = vk.qDeltaRange;
        commitments[9] = vk.qElliptic;
        commitments[10] = vk.qAux;
        commitments[11] = vk.qLookup;
        commitments[12] = vk.qPoseidon2External;
        commitments[13] = vk.qPoseidon2Internal;
        commitments[14] = vk.s1;
        commitments[15] = vk.s2;
        commitments[16] = vk.s3;
        commitments[17] = vk.s4;
        commitments[18] = vk.id1;
        commitments[19] = vk.id2;
        commitments[20] = vk.id3;
        commitments[21] = vk.id4;
        commitments[22] = vk.t1;
        commitments[23] = vk.t2;
        commitments[24] = vk.t3;
        commitments[25] = vk.t4;
        commitments[26] = vk.lagrangeFirst;
        commitments[27] = vk.lagrangeLast;

        // Accumulate proof points
        commitments[28] = convertProofPoint(proof.w1);
        commitments[29] = convertProofPoint(proof.w2);
        commitments[30] = convertProofPoint(proof.w3);
        commitments[31] = convertProofPoint(proof.w4);
        commitments[32] = convertProofPoint(proof.zPerm);
        commitments[33] = convertProofPoint(proof.lookupInverses);
        commitments[34] = convertProofPoint(proof.lookupReadCounts);
        commitments[35] = convertProofPoint(proof.lookupReadTags);

        // to be Shifted
        commitments[36] = vk.t1;
        commitments[37] = vk.t2;
        commitments[38] = vk.t3;
        commitments[39] = vk.t4;
        commitments[40] = convertProofPoint(proof.w1);
        commitments[41] = convertProofPoint(proof.w2);
        commitments[42] = convertProofPoint(proof.w3);
        commitments[43] = convertProofPoint(proof.w4);
        commitments[44] = convertProofPoint(proof.zPerm);


        // Batch gemini claims from the prover
        Fr constant_term_accumulator = Fr.ZERO();
        batchingChallenge = tp.shplonkNu.sqr();

        for (uint256 i; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            bool dummy_round = i >= LOG_N;

            Fr scalingFactor = 0;
            if (!dummy_round) {
                scaling_factor = batchingChallenge * inverse_vanishing_evals[i + 2];
            }

            constant_term_accumulator += scaling_factor * proof.geminiAEvaluations[i + 1];
            batchingChallenge = batchingChallenge * tp.shplonkNu;

            scalars[NUMBER_OF_ENTITIES + 1 + i] = -scalingFactor;
            commitments[NUMBER_OF_ENTITIES + 1 + i] = convertProofPoint(proof.geminiFoldUnivariates[i]);
        }

        // Compute evaluation A₀(r)
        Fr a_0_pos = computeGeminiBatchedUnivariateEvaluation(tp, constant_term_accumulator, proof.geminiAEvaluations, squares);

        constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
        constant_term_accumulator += proof.geminiAEvaluations[0] * tp.shplonkNu * inverse_vanishing_evals[1];

        // Finalise the batch opening claim
        commitments[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] = Honk.G1Point({x: 1, y: 2});
        scalars[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] = constant_term_accumulator;

        // TODO: put below into the reduce verify function
        Honk.G1Point memory quotient_commitment = convertProofPoint(proof.kzgQuotient);

        commitments[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 2] = quotient_commitment;
        scalars[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 2] = tp.shplonkZ; // evaluation challenge

        Honk.G1Point memory P_0 = batchMul(commitments, scalars);
        Honk.G1Point memory P_1 = negateInplace(quotient_commitment);

        return pairing(P_0, P_1);
    }

    function computeSquares(Fr r) internal view returns (Fr[CONST_PROOF_SIZE_LOG_N] memory squares) {
        squares[0] = r;
        for (uint256 i = 1; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            squares[i] = squares[i - 1].sqr();
        }
    }

    function computeInvertedGeminiDenominators(Transcript memory tp, Fr[CONST_PROOF_SIZE_LOG_N] memory eval_challenge_powers)
        internal
        view
        returns (Fr[CONST_PROOF_SIZE_LOG_N + 1] memory inverse_vanishing_evals)
    {
        Fr eval_challenge = tp.shplonkZ;
        inverse_vanishing_evals[0] = (eval_challenge - eval_challenge_powers[0]).invert();

        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N + 1; ++i) {
            Fr round_inverted_denominator = 0;
            if (i < LOG_N + 1) {
                round_inverted_denominator = (eval_challenge + eval_challenge_powers[i]).invert();
            }
            inverse_vanishing_evals[i] = round_inverted_denominator;
        }
    }

    function computeGeminiBatchedUnivariateEvaluation(Transcript memory tp, Fr batched_evaluation_accumulator, Fr[CONST_PROOF_SIZE_LOG_N] memory gemini_evaluations, Fr[CONST_PROOF_SIZE_LOG_N] memory gemini_eval_challenge_powers) internal view returns (Fr a_0_pos) {

        for (uint256 i = CONST_PROOF_SIZE_LOG_N; i > 0; --i) {
            Fr challenge_power = gemini_eval_challenge_powers[i - 1];
            Fr u = tp.sumCheckUChallenges[i - 1];
            Fr eval_neg = gemini_evaluations[i - 1];

            Fr batched_eval_round_acc =
                ((challenge_power * batched_eval_accumulator * 2) - eval_neg * (challenge_power * (Fr.ONE() - u) - u));
            // Divide by the denominator
            batched_eval_round_acc *= (challenge_power * (Fr.ONE() - u) + u).invert();

            bool is_dummy_round = (i > LOG_N);
            if (!is_dummy_round) {
                batched_eval_accumulator = batched_eval_round_acc;
            }
        }

        a_0_pos =batched_eval_accumulator;
    }


    // This implementation is the same as above with different constants
    function batchMul(
        Honk.G1Point[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 2] memory base,
        Fr[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 2] memory scalars
    ) internal view returns (Honk.G1Point memory result) {
        uint256 limit = NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 2;
        assembly {
            let success := 0x01
            let free := mload(0x40)

            // Write the original into the accumulator
            // Load into memory forecMUL, leave offset foreccAdd result
            // base is an array of pointers, so we have to dereference them
            mstore(add(free, 0x40), mload(mload(base)))
            mstore(add(free, 0x60), mload(add(0x20, mload(base))))
            // Add scalar
            mstore(add(free, 0x80), mload(scalars))
            success := and(success, staticcall(gas(), 7, add(free, 0x40), 0x60, free, 0x40))

            let count := 0x01
            for {} lt(count, limit) { count := add(count, 1) } {
                // Get loop offsets
                let base_base := add(base, mul(count, 0x20))
                let scalar_base := add(scalars, mul(count, 0x20))

                mstore(add(free, 0x40), mload(mload(base_base)))
                mstore(add(free, 0x60), mload(add(0x20, mload(base_base))))
                // Add scalar
                mstore(add(free, 0x80), mload(scalar_base))

                success := and(success, staticcall(gas(), 7, add(free, 0x40), 0x60, add(free, 0x40), 0x40))
                // accumulator = accumulator + accumulator_2
                success := and(success, staticcall(gas(), 6, free, 0x80, free, 0x40))
            }

            // Return the result - i hate this
            mstore(result, mload(free))
            mstore(add(result, 0x20), mload(add(free, 0x20)))
        }
    }

    function kzgReduceVerify(
        Honk.Proof memory proof,
        Transcript memory tp,
        Fr evaluation,
        Honk.G1Point memory commitment
    ) internal view returns (bool) {
        Honk.G1Point memory quotient_commitment = convertProofPoint(proof.kzgQuotient);
        Honk.G1Point memory ONE = Honk.G1Point({x: 1, y: 2});


        Honk.G1Point memory evalAsPoint = ecMul(ONE, evaluation);
        P0 = ecSub(P0, evalAsPoint);

        Honk.G1Point memory P1 = negateInplace(quotient_commitment);

        // Perform pairing check
        return pairing(P0, P1);
    }

    function pairing(Honk.G1Point memory rhs, Honk.G1Point memory lhs) internal view returns (bool) {
        bytes memory input = abi.encodePacked(
            rhs.x,
            rhs.y,
            // Fixed G1 point
            uint256(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2),
            uint256(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed),
            uint256(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b),
            uint256(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa),
            lhs.x,
            lhs.y,
            // G1 point from VK
            uint256(0x260e01b251f6f1c7e7ff4e580791dee8ea51d87a358e038b4efe30fac09383c1),
            uint256(0x0118c4d5b837bcc2bc89b5b398b5974e9f5944073b32078b7e231fec938883b0),
            uint256(0x04fc6369f7110fe3d25156c1bb9a72859cf2a04641f99ba4ee413c80da6a5fe4),
            uint256(0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55)
        );

        (bool success, bytes memory result) = address(0x08).staticcall(input);
        return abi.decode(result, (bool));
    }
}

// Conversion util - Duplicated as we cannot template LOG_N
function convertPoints(Honk.G1ProofPoint[LOG_N + 1] memory commitments)
    pure
    returns (Honk.G1Point[LOG_N + 1] memory converted)
{
    for (uint256 i; i < LOG_N + 1; ++i) {
        converted[i] = convertProofPoint(commitments[i]);
    }
}
