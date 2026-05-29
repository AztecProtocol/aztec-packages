// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IVerifier} from "./../interfaces/IVerifier.sol";
import {CommitmentSchemeLib} from "./CommitmentScheme.sol";
import {
    SUBGROUP_GENERATOR,
    SUBGROUP_GENERATOR_INVERSE,
    SUBGROUP_SIZE,
    Fr,
    FrLib,
    ONE,
    NUM_SMALL_IPA_OPENING_CLAIMS,
    SMALL_IPA_BOUNDARY_OPENING_IDX
} from "./Fr.sol";
import {
    Honk,
    NUMBER_OF_ENTITIES,
    NUMBER_OF_ENTITIES_ZK,
    NUM_MASKING_POLYNOMIALS,
    NUMBER_UNSHIFTED_ZK,
    NUMBER_TO_BE_SHIFTED,
    ZK_BATCHED_RELATION_PARTIAL_LENGTH,
    CONST_PROOF_SIZE_LOG_N,
    PAIRING_POINTS_SIZE
} from "./HonkTypes.sol";
import {RelationsLib} from "./Relations.sol";
import {negateInplace, pairing, arePairingPointsDefault} from "./utils.sol";
import {
    generateRecursionSeparator,
    convertPairingPointsToG1,
    mulWithSeperator,
    rejectPointAtInfinity
} from "./utils.sol";
import {ZKTranscript, ZKTranscriptLib} from "./ZKTranscript.sol";
import {Errors} from "./Errors.sol";

abstract contract BaseZKHonkVerifier is IVerifier {
    using FrLib for Fr;

    struct PairingInputs {
        Honk.G1Point P_0;
        Honk.G1Point P_1;
    }

    struct SmallSubgroupIpaIntermediates {
        Fr[SUBGROUP_SIZE] challengePolyLagrange;
        Fr challengePolyEval;
        Fr lagrangeFirst;
        Fr lagrangeLast;
        Fr rootPower;
        Fr[SUBGROUP_SIZE] denominators; // this has to disappear
        Fr diff;
    }

    // Constants for proof length calculation (matching UltraKeccakZKFlavor)
    uint256 internal constant NUM_WITNESS_ENTITIES = 8 + NUM_MASKING_POLYNOMIALS;
    uint256 internal constant NUM_ELEMENTS_COMM = 2; // uint256 elements for curve points
    uint256 internal constant NUM_ELEMENTS_FR = 1; // uint256 elements for field elements
    uint256 internal constant NUM_LIBRA_EVALUATIONS = 4; // libra evaluations

    uint256 internal constant LIBRA_COMMITMENTS = 3;
    uint256 internal constant LIBRA_EVALUATIONS = 4;
    uint256 internal constant LIBRA_UNIVARIATES_LENGTH = 9;

    uint256 internal constant SHIFTED_COMMITMENTS_START = 30;
    uint256 internal constant PERMUTATION_ARGUMENT_VALUE_SEPARATOR = 1 << 28;

    uint256 internal immutable $N;
    uint256 internal immutable $LOG_N;
    uint256 internal immutable $VK_HASH;
    uint256 internal immutable $NUM_PUBLIC_INPUTS;
    uint256 internal immutable $MSMSize;

    constructor(uint256 _N, uint256 _logN, uint256 _vkHash, uint256 _numPublicInputs) {
        $N = _N;
        $LOG_N = _logN;
        $VK_HASH = _vkHash;
        $NUM_PUBLIC_INPUTS = _numPublicInputs;
        $MSMSize = NUMBER_UNSHIFTED_ZK + _logN + LIBRA_COMMITMENTS + 2;
    }

    function verify(bytes calldata proof, bytes32[] calldata publicInputs)
        public
        view
        override
        returns (bool verified)
    {
        // Calculate expected proof size based on $LOG_N
        uint256 expectedProofSize = calculateProofSize($LOG_N);

        // Check the received proof is the expected size where each field element is 32 bytes
        require(
            proof.length == expectedProofSize, Errors.ProofLengthWrongWithLogN($LOG_N, proof.length, expectedProofSize)
        );

        Honk.VerificationKey memory vk = loadVerificationKey();
        Honk.ZKProof memory p = ZKTranscriptLib.loadProof(proof, $LOG_N);

        require(publicInputs.length == vk.publicInputsSize - PAIRING_POINTS_SIZE, Errors.PublicInputsLengthWrong());

        // Generate the fiat shamir challenges for the whole protocol
        ZKTranscript memory t =
            ZKTranscriptLib.generateTranscript(p, publicInputs, $VK_HASH, $NUM_PUBLIC_INPUTS, $LOG_N);

        // Derive public input delta
        t.relationParameters.publicInputsDelta = computePublicInputDelta(
            publicInputs,
            p.pairingPointObject,
            t.relationParameters.beta,
            t.relationParameters.gamma,
            5 // pubInputsOffset = NUM_DISABLED_ROWS_IN_SUMCHECK + NUM_ZERO_ROWS = 4 + 1
        );

        // Sumcheck
        require(verifySumcheck(p, t), Errors.SumcheckFailed());
        require(verifyShplemini(p, vk, t), Errors.ShpleminiFailed());

        verified = true;
    }

    function computePublicInputDelta(
        bytes32[] memory publicInputs,
        Fr[PAIRING_POINTS_SIZE] memory pairingPointObject,
        Fr beta,
        Fr gamma,
        uint256 offset
    ) internal view returns (Fr publicInputDelta) {
        Fr numerator = Fr.wrap(1);
        Fr denominator = Fr.wrap(1);

        Fr numeratorAcc = gamma + (beta * FrLib.from(PERMUTATION_ARGUMENT_VALUE_SEPARATOR + offset));
        Fr denominatorAcc = gamma - (beta * FrLib.from(offset + 1));

        {
            for (uint256 i = 0; i < $NUM_PUBLIC_INPUTS - PAIRING_POINTS_SIZE; i++) {
                Fr pubInput = FrLib.fromBytes32(publicInputs[i]);

                numerator = numerator * (numeratorAcc + pubInput);
                denominator = denominator * (denominatorAcc + pubInput);

                numeratorAcc = numeratorAcc + beta;
                denominatorAcc = denominatorAcc - beta;
            }

            for (uint256 i = 0; i < PAIRING_POINTS_SIZE; i++) {
                Fr pubInput = pairingPointObject[i];

                numerator = numerator * (numeratorAcc + pubInput);
                denominator = denominator * (denominatorAcc + pubInput);

                numeratorAcc = numeratorAcc + beta;
                denominatorAcc = denominatorAcc - beta;
            }
        }

        // Fr delta = numerator / denominator; // TOOO: batch invert later?
        publicInputDelta = FrLib.div(numerator, denominator);
    }

    function verifySumcheck(Honk.ZKProof memory proof, ZKTranscript memory tp) internal view returns (bool verified) {
        Fr roundTargetSum = tp.libraChallenge * proof.libraSum; // default 0
        Fr powPartialEvaluation = Fr.wrap(1);

        // We perform sumcheck reductions over log n rounds ( the multivariate degree )
        for (uint256 round; round < $LOG_N; ++round) {
            Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate = proof.sumcheckUnivariates[round];
            Fr totalSum = roundUnivariate[0] + roundUnivariate[1];
            require(totalSum == roundTargetSum, Errors.SumcheckFailed());

            Fr roundChallenge = tp.sumCheckUChallenges[round];

            // Update the round target for the next rounf
            roundTargetSum = computeNextTargetSum(roundUnivariate, roundChallenge);
            powPartialEvaluation =
                powPartialEvaluation * (Fr.wrap(1) + roundChallenge * (tp.gateChallenges[round] - Fr.wrap(1)));
        }

        // Last round
        // For ZK flavors: sumcheckEvaluations has 42 elements
        // Index 0 is gemini_masking_poly, indices 1-41 are the regular entities used in relations
        Fr[NUMBER_OF_ENTITIES] memory relationsEvaluations;
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            relationsEvaluations[i] = proof.sumcheckEvaluations[i + NUM_MASKING_POLYNOMIALS]; // Skip gemini_masking_poly at index 0
        }
        Fr grandHonkRelationSum = RelationsLib.accumulateRelationEvaluations(
            relationsEvaluations, tp.relationParameters, tp.alphas, powPartialEvaluation
        );

        // Row-disabling polynomial: 1 - ∏_{i≥2}(1 - u_i)
        Fr evaluation = Fr.wrap(1);
        for (uint256 i = 2; i < $LOG_N; i++) {
            evaluation = evaluation * (Fr.wrap(1) - tp.sumCheckUChallenges[i]);
        }

        grandHonkRelationSum =
            grandHonkRelationSum * (Fr.wrap(1) - evaluation) + proof.libraEvaluation * tp.libraChallenge;
        verified = (grandHonkRelationSum == roundTargetSum);
    }

    // Return the new target sum for the next sumcheck round
    function computeNextTargetSum(Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariates, Fr roundChallenge)
        internal
        view
        returns (Fr targetSum)
    {
        // TODO: inline
        Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH] memory BARYCENTRIC_LAGRANGE_DENOMINATORS = [
            Fr.wrap(0x0000000000000000000000000000000000000000000000000000000000009d80),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffec51),
            Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000005a0),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffd31),
            Fr.wrap(0x0000000000000000000000000000000000000000000000000000000000000240),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593effffd31),
            Fr.wrap(0x00000000000000000000000000000000000000000000000000000000000005a0),
            Fr.wrap(0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593efffec51),
            Fr.wrap(0x0000000000000000000000000000000000000000000000000000000000009d80)
        ];

        // To compute the next target sum, we evaluate the given univariate at a point u (challenge).

        // TODO: opt: use same array mem for each iteratioon
        // Performing Barycentric evaluations
        // Compute B(x)
        Fr numeratorValue = Fr.wrap(1);
        for (uint256 i = 0; i < ZK_BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            numeratorValue = numeratorValue * (roundChallenge - Fr.wrap(i));
        }

        // Calculate domain size $N of inverses -- TODO: montgomery's trick
        Fr[ZK_BATCHED_RELATION_PARTIAL_LENGTH] memory denominatorInverses;
        for (uint256 i = 0; i < ZK_BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            denominatorInverses[i] = FrLib.invert(BARYCENTRIC_LAGRANGE_DENOMINATORS[i] * (roundChallenge - Fr.wrap(i)));
        }

        for (uint256 i = 0; i < ZK_BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            targetSum = targetSum + roundUnivariates[i] * denominatorInverses[i];
        }

        // Scale the sum by the value of B(x)
        targetSum = targetSum * numeratorValue;
    }

    function verifyShplemini(Honk.ZKProof memory proof, Honk.VerificationKey memory vk, ZKTranscript memory tp)
        internal
        view
        returns (bool verified)
    {
        CommitmentSchemeLib.ShpleminiIntermediates memory mem; // stack

        // - Compute vector (r, r², ... , r²⁽ⁿ⁻¹⁾), where n = log_circuit_size
        Fr[] memory powers_of_evaluation_challenge = CommitmentSchemeLib.computeSquares(tp.geminiR, $LOG_N);
        // Arrays hold values that will be linearly combined for the gemini and shplonk batch openings
        Fr[] memory scalars = new Fr[]($MSMSize);
        Honk.G1Point[] memory commitments = new Honk.G1Point[]($MSMSize);

        mem.posInvertedDenominator = (tp.shplonkZ - powers_of_evaluation_challenge[0]).invert();
        mem.negInvertedDenominator = (tp.shplonkZ + powers_of_evaluation_challenge[0]).invert();

        mem.unshiftedScalar = mem.posInvertedDenominator + (tp.shplonkNu * mem.negInvertedDenominator);
        mem.shiftedScalar =
            tp.geminiR.invert() * (mem.posInvertedDenominator - (tp.shplonkNu * mem.negInvertedDenominator));

        scalars[0] = Fr.wrap(1);
        commitments[0] = proof.shplonkQ;

        /* Batch multivariate opening claims, shifted and unshifted
        * The vector of scalars is populated as follows:
        * \f[
        * \left(
        * - \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right),
        * \ldots,
        * - \rho^{i+k-1} \times \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right),
        * - \rho^{i+k} \times \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right),
        * \ldots,
        * - \rho^{k+m-1} \times \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
        * \right)
        * \f]
        *
        * The following vector is concatenated to the vector of commitments:
        * \f[
        * f_0, \ldots, f_{m-1}, f_{\text{shift}, 0}, \ldots, f_{\text{shift}, k-1}
        * \f]
        *
        * Simultaneously, the evaluation of the multilinear polynomial
        * \f[
        * \sum \rho^i \cdot f_i + \sum \rho^{i+k} \cdot f_{\text{shift}, i}
        * \f]
        * at the challenge point \f$ (u_0,\ldots, u_{n-1}) \f$ is computed.
        *
        * This approach minimizes the number of iterations over the commitments to multilinear polynomials
        * and eliminates the need to store the powers of \f$ \rho \f$.
        */
        // For ZK flavors: evaluations array is [gemini_masking_poly, qm, qc, ql, qr, ...]
        // Start batching challenge at 1, not rho, to match non-ZK pattern
        mem.batchingChallenge = Fr.wrap(1);
        mem.batchedEvaluation = Fr.wrap(0);

        mem.unshiftedScalarNeg = mem.unshiftedScalar.neg();
        mem.shiftedScalarNeg = mem.shiftedScalar.neg();

        // Process all NUMBER_UNSHIFTED_ZK evaluations (includes gemini_masking_poly at index 0)
        for (uint256 i = 1; i <= NUMBER_UNSHIFTED_ZK; ++i) {
            scalars[i] = mem.unshiftedScalarNeg * mem.batchingChallenge;
            mem.batchedEvaluation = mem.batchedEvaluation
                + (proof.sumcheckEvaluations[i - NUM_MASKING_POLYNOMIALS] * mem.batchingChallenge);
            mem.batchingChallenge = mem.batchingChallenge * tp.rho;
        }
        // g commitments are accumulated at r
        // For each of the to be shifted commitments perform the shift in place by
        // adding to the unshifted value.
        // We do so, as the values are to be used in batchMul later, and as
        // `a * c + b * c = (a + b) * c` this will allow us to reduce memory and compute.
        // Applied to w1, w2, w3, w4 and zPerm
        for (uint256 i = 0; i < NUMBER_TO_BE_SHIFTED; ++i) {
            uint256 scalarOff = i + SHIFTED_COMMITMENTS_START;
            uint256 evaluationOff = i + NUMBER_UNSHIFTED_ZK;

            scalars[scalarOff] = scalars[scalarOff] + (mem.shiftedScalarNeg * mem.batchingChallenge);
            mem.batchedEvaluation =
                mem.batchedEvaluation + (proof.sumcheckEvaluations[evaluationOff] * mem.batchingChallenge);
            mem.batchingChallenge = mem.batchingChallenge * tp.rho;
        }

        commitments[1] = proof.geminiMaskingPoly;

        commitments[2] = vk.s1;
        commitments[3] = vk.s2;
        commitments[4] = vk.s3;
        commitments[5] = vk.s4;
        commitments[6] = vk.id1;
        commitments[7] = vk.id2;
        commitments[8] = vk.id3;
        commitments[9] = vk.id4;
        commitments[10] = vk.lagrangeFirst;
        commitments[11] = vk.lagrangeLast;
        commitments[12] = vk.qLookup;
        commitments[13] = vk.t1;
        commitments[14] = vk.t2;
        commitments[15] = vk.t3;
        commitments[16] = vk.t4;
        commitments[17] = vk.qm;
        commitments[18] = vk.qr;
        commitments[19] = vk.qo;
        commitments[20] = vk.qc;
        commitments[21] = vk.ql;
        commitments[22] = vk.q4;
        commitments[23] = vk.qArith;
        commitments[24] = vk.qDeltaRange;
        commitments[25] = vk.qElliptic;
        commitments[26] = vk.qMemory;
        commitments[27] = vk.qNnf;
        commitments[28] = vk.qPoseidon2External;
        commitments[29] = vk.qPoseidon2Internal;

        // Accumulate proof points
        commitments[30] = proof.w1;
        commitments[31] = proof.w2;
        commitments[32] = proof.w3;
        commitments[33] = proof.w4;
        commitments[34] = proof.zPerm;
        commitments[35] = proof.lookupInverses;
        commitments[36] = proof.lookupReadCounts;
        commitments[37] = proof.lookupReadTags;

        /* Batch gemini claims from the prover
         * place the commitments to gemini aᵢ to the vector of commitments, compute the contributions from
         * aᵢ(−r²ⁱ) for i=1, … , n−1 to the constant term accumulator, add corresponding scalars
         *
         * 1. Moves the vector
         * \f[
         * \left( \text{com}(A_1), \text{com}(A_2), \ldots, \text{com}(A_{n-1}) \right)
         * \f]
        * to the 'commitments' vector.
        *
        * 2. Computes the scalars:
        * \f[
        * \frac{\nu^{2}}{z + r^2}, \frac{\nu^3}{z + r^4}, \ldots, \frac{\nu^{n-1}}{z + r^{2^{n-1}}}
        * \f]
        * and places them into the 'scalars' vector.
        *
        * 3. Accumulates the summands of the constant term:
         * \f[
         * \sum_{i=2}^{n-1} \frac{\nu^{i} \cdot A_i(-r^{2^i})}{z + r^{2^i}}
         * \f]
         * and adds them to the 'constant_term_accumulator'.
         */

        // Add contributions from A₀(r) and A₀(-r) to constant_term_accumulator:
        // Compute the evaluations Aₗ(r^{2ˡ}) for l = 0, ..., $LOG_N - 1
        Fr[] memory foldPosEvaluations = CommitmentSchemeLib.computeFoldPosEvaluations(
            tp.sumCheckUChallenges,
            mem.batchedEvaluation,
            proof.geminiAEvaluations,
            powers_of_evaluation_challenge,
            $LOG_N
        );

        mem.constantTermAccumulator = foldPosEvaluations[0] * mem.posInvertedDenominator;
        mem.constantTermAccumulator =
            mem.constantTermAccumulator + (proof.geminiAEvaluations[0] * tp.shplonkNu * mem.negInvertedDenominator);

        mem.batchingChallenge = tp.shplonkNu.sqr();
        uint256 boundary = NUMBER_UNSHIFTED_ZK + 1;

        // Compute Shplonk constant term contributions from Aₗ(± r^{2ˡ}) for l = 1, ..., m-1;
        // Compute scalar multipliers for each fold commitment
        for (uint256 i = 0; i < $LOG_N - 1; ++i) {
            bool dummy_round = i >= ($LOG_N - 1);

            if (!dummy_round) {
                // Update inverted denominators
                mem.posInvertedDenominator = (tp.shplonkZ - powers_of_evaluation_challenge[i + 1]).invert();
                mem.negInvertedDenominator = (tp.shplonkZ + powers_of_evaluation_challenge[i + 1]).invert();

                // Compute the scalar multipliers for Aₗ(± r^{2ˡ}) and [Aₗ]
                mem.scalingFactorPos = mem.batchingChallenge * mem.posInvertedDenominator;
                mem.scalingFactorNeg = mem.batchingChallenge * tp.shplonkNu * mem.negInvertedDenominator;
                scalars[boundary + i] = mem.scalingFactorNeg.neg() + mem.scalingFactorPos.neg();

                // Accumulate the const term contribution given by
                // v^{2l} * Aₗ(r^{2ˡ}) /(z-r^{2^l}) + v^{2l+1} * Aₗ(-r^{2ˡ}) /(z+ r^{2^l})
                Fr accumContribution = mem.scalingFactorNeg * proof.geminiAEvaluations[i + 1];
                accumContribution = accumContribution + mem.scalingFactorPos * foldPosEvaluations[i + 1];
                mem.constantTermAccumulator = mem.constantTermAccumulator + accumContribution;
            }
            // Update the running power of v
            mem.batchingChallenge = mem.batchingChallenge * tp.shplonkNu * tp.shplonkNu;

            commitments[boundary + i] = proof.geminiFoldComms[i];
        }

        boundary += $LOG_N - 1;

        // Denominators 1/(z - point_i) for the five opening points {r, g*r, r, 1, r}.
        mem.denominators[0] = ONE.div(tp.shplonkZ - tp.geminiR);
        mem.denominators[1] = ONE.div(tp.shplonkZ - SUBGROUP_GENERATOR * tp.geminiR);
        mem.denominators[2] = mem.denominators[0];
        mem.denominators[SMALL_IPA_BOUNDARY_OPENING_IDX] = ONE.div(tp.shplonkZ - ONE);
        mem.denominators[NUM_SMALL_IPA_OPENING_CLAIMS - 1] = mem.denominators[0];

        // Iterate the opening claims in three segments — the inner loops can't be merged without an extra induction
        // variable, which pushes us into stack-too-deep.
        for (uint256 i = 0; i < SMALL_IPA_BOUNDARY_OPENING_IDX; i++) {
            Fr scalingFactor = mem.denominators[i] * mem.batchingChallenge;
            mem.batchingScalars[i] = scalingFactor.neg();
            mem.batchingChallenge = mem.batchingChallenge * tp.shplonkNu;
            mem.constantTermAccumulator = mem.constantTermAccumulator + scalingFactor * proof.libraPolyEvals[i];
        }

        // Boundary slot: claimed value is hardcoded 0, so no constantTermAccumulator contribution.
        {
            Fr scalingFactor = mem.denominators[SMALL_IPA_BOUNDARY_OPENING_IDX] * mem.batchingChallenge;
            mem.batchingScalars[SMALL_IPA_BOUNDARY_OPENING_IDX] = scalingFactor.neg();
            mem.batchingChallenge = mem.batchingChallenge * tp.shplonkNu;
        }

        for (uint256 i = SMALL_IPA_BOUNDARY_OPENING_IDX + 1; i < NUM_SMALL_IPA_OPENING_CLAIMS; i++) {
            Fr scalingFactor = mem.denominators[i] * mem.batchingChallenge;
            mem.batchingScalars[i] = scalingFactor.neg();
            mem.batchingChallenge = mem.batchingChallenge * tp.shplonkNu;
            mem.constantTermAccumulator = mem.constantTermAccumulator + scalingFactor * proof.libraPolyEvals[i - 1];
        }

        // Group per-claim batching scalars by commitment: [G], [A] (three openings), [Q].
        scalars[boundary] = mem.batchingScalars[0];
        scalars[boundary + 1] =
            mem.batchingScalars[1] + mem.batchingScalars[2] + mem.batchingScalars[SMALL_IPA_BOUNDARY_OPENING_IDX];
        scalars[boundary + 2] = mem.batchingScalars[NUM_SMALL_IPA_OPENING_CLAIMS - 1];

        for (uint256 i = 0; i < LIBRA_COMMITMENTS; i++) {
            commitments[boundary++] = proof.libraCommitments[i];
        }

        commitments[boundary] = Honk.G1Point({x: 1, y: 2});
        scalars[boundary++] = mem.constantTermAccumulator;

        require(
            checkEvalsConsistency(proof.libraPolyEvals, tp.geminiR, tp.sumCheckUChallenges, proof.libraEvaluation),
            Errors.ConsistencyCheckFailed()
        );

        Honk.G1Point memory quotient_commitment = proof.kzgQuotient;

        commitments[boundary] = quotient_commitment;
        scalars[boundary] = tp.shplonkZ; // evaluation challenge

        PairingInputs memory pair;
        pair.P_0 = batchMul(commitments, scalars);
        pair.P_1 = negateInplace(quotient_commitment);

        // Aggregate pairing points (skip if default/infinity — no recursive verification occurred)
        if (!arePairingPointsDefault(proof.pairingPointObject)) {
            Fr recursionSeparator = generateRecursionSeparator(proof.pairingPointObject, pair.P_0, pair.P_1);
            (Honk.G1Point memory P_0_other, Honk.G1Point memory P_1_other) =
                convertPairingPointsToG1(proof.pairingPointObject);

            // Validate the points from the proof are on the curve
            rejectPointAtInfinity(P_0_other);
            rejectPointAtInfinity(P_1_other);

            // accumulate with aggregate points in proof
            pair.P_0 = mulWithSeperator(pair.P_0, P_0_other, recursionSeparator);
            pair.P_1 = mulWithSeperator(pair.P_1, P_1_other, recursionSeparator);
        }

        return pairing(pair.P_0, pair.P_1);
    }

    function checkEvalsConsistency(
        Fr[LIBRA_EVALUATIONS] memory libraPolyEvals,
        Fr geminiR,
        Fr[CONST_PROOF_SIZE_LOG_N] memory uChallenges,
        Fr libraEval
    ) internal view returns (bool check) {
        Fr one = Fr.wrap(1);
        Fr vanishingPolyEval = geminiR.pow(SUBGROUP_SIZE) - one;
        require(vanishingPolyEval != Fr.wrap(0), Errors.GeminiChallengeInSubgroup());

        SmallSubgroupIpaIntermediates memory mem;
        mem.challengePolyLagrange[0] = one;
        for (uint256 round = 0; round < $LOG_N; round++) {
            uint256 currIdx = 1 + LIBRA_UNIVARIATES_LENGTH * round;
            mem.challengePolyLagrange[currIdx] = one;
            for (uint256 idx = currIdx + 1; idx < currIdx + LIBRA_UNIVARIATES_LENGTH; idx++) {
                mem.challengePolyLagrange[idx] = mem.challengePolyLagrange[idx - 1] * uChallenges[round];
            }
        }

        mem.rootPower = one;
        mem.challengePolyEval = Fr.wrap(0);
        for (uint256 idx = 0; idx < SUBGROUP_SIZE; idx++) {
            mem.denominators[idx] = mem.rootPower * geminiR - one;
            mem.denominators[idx] = mem.denominators[idx].invert();
            mem.challengePolyEval = mem.challengePolyEval + mem.challengePolyLagrange[idx] * mem.denominators[idx];
            mem.rootPower = mem.rootPower * SUBGROUP_GENERATOR_INVERSE;
        }

        Fr numerator = vanishingPolyEval * Fr.wrap(SUBGROUP_SIZE).invert();
        mem.challengePolyEval = mem.challengePolyEval * numerator;
        mem.lagrangeFirst = mem.denominators[0] * numerator;
        mem.lagrangeLast = mem.denominators[SUBGROUP_SIZE - 1] * numerator;

        mem.diff = mem.lagrangeFirst * libraPolyEvals[2];

        mem.diff = mem.diff + (geminiR - SUBGROUP_GENERATOR_INVERSE)
            * (libraPolyEvals[1] - libraPolyEvals[2] - libraPolyEvals[0] * mem.challengePolyEval);
        mem.diff = mem.diff + mem.lagrangeLast * (libraPolyEvals[2] - libraEval) - vanishingPolyEval * libraPolyEvals[3];

        check = mem.diff == Fr.wrap(0);
    }

    // This implementation is the same as above with different constants
    function batchMul(Honk.G1Point[] memory base, Fr[] memory scalars)
        internal
        view
        returns (Honk.G1Point memory result)
    {
        uint256 limit = $MSMSize;

        // Identity bases are accepted: VK selector/table polys may be identically zero,
        // and the ecAdd/ecMul precompiles treat (0,0) as the additive identity per EIP-196.
        // Soundness against an attacker substituting (0,0) for a non-zero commitment is
        // upheld by sumcheck/Shplemini, which would fail on inconsistent evaluations.

        bool success = true;
        assembly {
            let free := mload(0x40)

            let count := 0x01
            for {} lt(count, add(limit, 1)) { count := add(count, 1) } {
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

            // Return the result
            mstore(result, mload(free))
            mstore(add(result, 0x20), mload(add(free, 0x20)))
        }

        require(success, Errors.ShpleminiFailed());
    }

    // Calculate proof size based on log_n (matching UltraKeccakZKFlavor formula)
    function calculateProofSize(uint256 logN) internal pure returns (uint256) {
        // Witness and Libra commitments
        uint256 proofLength = NUM_WITNESS_ENTITIES * NUM_ELEMENTS_COMM; // witness commitments
        proofLength += NUM_ELEMENTS_COMM * 3; // Libra concat, grand sum, quotient comms + Gemini masking

        // Sumcheck
        proofLength += logN * ZK_BATCHED_RELATION_PARTIAL_LENGTH * NUM_ELEMENTS_FR; // sumcheck univariates
        proofLength += NUMBER_OF_ENTITIES_ZK * NUM_ELEMENTS_FR; // sumcheck evaluations

        // Libra and Gemini
        proofLength += NUM_ELEMENTS_FR * 2; // Libra sum, claimed eval
        proofLength += logN * NUM_ELEMENTS_FR; // Gemini a evaluations
        proofLength += NUM_LIBRA_EVALUATIONS * NUM_ELEMENTS_FR; // libra evaluations

        // PCS commitments
        proofLength += (logN - 1) * NUM_ELEMENTS_COMM; // Gemini Fold commitments
        proofLength += NUM_ELEMENTS_COMM * 2; // Shplonk Q and KZG W commitments

        // Pairing points
        proofLength += PAIRING_POINTS_SIZE; // pairing inputs carried on public inputs

        return proofLength * 32;
    }

    function loadVerificationKey() internal pure virtual returns (Honk.VerificationKey memory);
}
