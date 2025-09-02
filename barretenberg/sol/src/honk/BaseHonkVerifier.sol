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
    NUMBER_TO_BE_SHIFTED,
    BATCHED_RELATION_PARTIAL_LENGTH,
    PAIRING_POINTS_SIZE
} from "./HonkTypes.sol";

import {negateInplace, pairing, validateOnCurve} from "./utils.sol";

// Field arithmetic libraries - prevent littering the code with modmul / addmul
import {ONE, ZERO, Fr, FrLib} from "./Fr.sol";

import {Transcript, TranscriptLib} from "./Transcript.sol";

import {RelationsLib} from "./Relations.sol";

import {CommitmentSchemeLib} from "./CommitmentScheme.sol";
import {generateRecursionSeparator, convertPairingPointsToG1, mulWithSeperator} from "./utils.sol";

abstract contract BaseHonkVerifier is IVerifier {
    using FrLib for Fr;

    uint256 immutable $N;
    uint256 immutable $LOG_N;
    uint256 immutable $VK_HASH;
    uint256 immutable $NUM_PUBLIC_INPUTS;

    constructor(uint256 _N, uint256 _logN, uint256 _vkHash, uint256 _numPublicInputs) {
        $N = _N;
        $LOG_N = _logN;
        $VK_HASH = _vkHash;
        $NUM_PUBLIC_INPUTS = _numPublicInputs;
    }

    // Errors
    error ProofLengthWrong();
    error ProofLengthWrongWithLogN(uint256 logN, uint256 actualLength, uint256 expectedLength);
    error PublicInputsLengthWrong();
    error SumcheckFailed();
    error ShpleminiFailed();

    // Constants for proof length calculation (matching UltraKeccakFlavor)
    uint256 constant NUM_WITNESS_ENTITIES = 8;
    uint256 constant NUM_ELEMENTS_COMM = 2; // uint256 elements for curve points
    uint256 constant NUM_ELEMENTS_FR = 1; // uint256 elements for field elements

    // Calculate proof size based on log_n (matching UltraKeccakFlavor formula)
    function calculateProofSize(uint256 logN) internal pure returns (uint256) {
        // Witness commitments
        uint256 proofLength = NUM_WITNESS_ENTITIES * NUM_ELEMENTS_COMM; // witness commitments

        // Sumcheck
        proofLength += logN * BATCHED_RELATION_PARTIAL_LENGTH * NUM_ELEMENTS_FR; // sumcheck univariates
        proofLength += NUMBER_OF_ENTITIES * NUM_ELEMENTS_FR; // sumcheck evaluations

        // Gemini
        proofLength += (logN - 1) * NUM_ELEMENTS_COMM; // Gemini Fold commitments
        proofLength += logN * NUM_ELEMENTS_FR; // Gemini evaluations

        // Shplonk and KZG commitments
        proofLength += NUM_ELEMENTS_COMM * 2; // Shplonk Q and KZG W commitments

        // Pairing points
        proofLength += PAIRING_POINTS_SIZE; // pairing inputs carried on public inputs

        return proofLength;
    }

    // Number of field elements in a ultra keccak honk proof for log_n = 25, including pairing point object.
    uint256 constant PROOF_SIZE = 350; // Legacy constant - will be replaced by calculateProofSize($LOG_N)
    uint256 constant SHIFTED_COMMITMENTS_START = 29;

    function loadVerificationKey() internal pure virtual returns (Honk.VerificationKey memory);

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) public view override returns (bool) {
        // Calculate expected proof size based on $LOG_N
        uint256 expectedProofSize = calculateProofSize($LOG_N);

        // Check the received proof is the expected size where each field element is 32 bytes
        if (proof.length != expectedProofSize * 32) {
            revert ProofLengthWrongWithLogN($LOG_N, proof.length, expectedProofSize * 32);
        }

        Honk.VerificationKey memory vk = loadVerificationKey();
        Honk.Proof memory p = TranscriptLib.loadProof(proof, $LOG_N);
        if (publicInputs.length != vk.publicInputsSize - PAIRING_POINTS_SIZE) {
            revert PublicInputsLengthWrong();
        }

        // Generate the fiat shamir challenges for the whole protocol
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1281): Add pubInputsOffset to VK or remove entirely.
        Transcript memory t = TranscriptLib.generateTranscript(p, publicInputs, $VK_HASH, $NUM_PUBLIC_INPUTS, $LOG_N);

        // Derive public input delta
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1281): Add pubInputsOffset to VK or remove entirely.
        t.relationParameters.publicInputsDelta = computePublicInputDelta(
            publicInputs,
            p.pairingPointObject,
            t.relationParameters.beta,
            t.relationParameters.gamma, /*pubInputsOffset=*/
            1
        );

        // Sumcheck
        bool sumcheckVerified = verifySumcheck(p, t);
        if (!sumcheckVerified) revert SumcheckFailed();

        bool shpleminiVerified = verifyShplemini(p, vk, t);
        if (!shpleminiVerified) revert ShpleminiFailed();

        return sumcheckVerified && shpleminiVerified; // Boolean condition not required - nice for vanity :)
    }

    uint256 constant PERMUTATION_ARGUMENT_VALUE_SEPARATOR = 1 << 28;

    function computePublicInputDelta(
        bytes32[] memory publicInputs,
        Fr[PAIRING_POINTS_SIZE] memory pairingPointObject,
        Fr beta,
        Fr gamma,
        uint256 offset
    ) internal view returns (Fr publicInputDelta) {
        Fr numerator = ONE;
        Fr denominator = ONE;

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

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1219)
        publicInputDelta = FrLib.div(numerator, denominator);
    }

    function verifySumcheck(Honk.Proof memory proof, Transcript memory tp) internal view returns (bool verified) {
        Fr roundTarget;
        Fr powPartialEvaluation = ONE;

        // We perform sumcheck reductions over log n rounds ( the multivariate degree )
        for (uint256 round = 0; round < $LOG_N; ++round) {
            Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate = proof.sumcheckUnivariates[round];
            bool valid = checkSum(roundUnivariate, roundTarget);
            if (!valid) revert SumcheckFailed();

            Fr roundChallenge = tp.sumCheckUChallenges[round];

            // Update the round target for the next rounf
            roundTarget = computeNextTargetSum(roundUnivariate, roundChallenge);
            powPartialEvaluation = partiallyEvaluatePOW(tp.gateChallenges[round], powPartialEvaluation, roundChallenge);
        }

        // Last round
        Fr grandHonkRelationSum = RelationsLib.accumulateRelationEvaluations(
            proof.sumcheckEvaluations, tp.relationParameters, tp.alphas, powPartialEvaluation
        );
        verified = (grandHonkRelationSum == roundTarget);
    }

    function checkSum(Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory roundUnivariate, Fr roundTarget)
        internal
        pure
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
        // To compute the next target sum, we evaluate the given univariate at a point u (challenge).

        // TODO: opt: use same array mem for each iteratioon
        // Performing Barycentric evaluations
        // Compute B(x)
        Fr numeratorValue = ONE;
        for (uint256 i = 0; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            numeratorValue = numeratorValue * (roundChallenge - Fr.wrap(i));
        }

        // Calculate domain size $N of inverses -- TODO: montgomery's trick
        Fr[BATCHED_RELATION_PARTIAL_LENGTH] memory denominatorInverses;
        for (uint256 i = 0; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr inv = BARYCENTRIC_LAGRANGE_DENOMINATORS[i];
            inv = inv * (roundChallenge - Fr.wrap(i));
            inv = FrLib.invert(inv);
            denominatorInverses[i] = inv;
        }

        for (uint256 i = 0; i < BATCHED_RELATION_PARTIAL_LENGTH; ++i) {
            Fr term = roundUnivariates[i];
            term = term * denominatorInverses[i];
            targetSum = targetSum + term;
        }

        // Scale the sum by the value of B(x)
        targetSum = targetSum * numeratorValue;
    }

    // Univariate evaluation of the monomial ((1-X_l) + X_l.B_l) at the challenge point X_l=u_l
    function partiallyEvaluatePOW(Fr gateChallenge, Fr currentEvaluation, Fr roundChallenge)
        internal
        pure
        returns (Fr newEvaluation)
    {
        Fr univariateEval = ONE + (roundChallenge * (gateChallenge - ONE));
        newEvaluation = currentEvaluation * univariateEval;
    }

    function verifyShplemini(Honk.Proof memory proof, Honk.VerificationKey memory vk, Transcript memory tp)
        internal
        view
        returns (bool verified)
    {
        CommitmentSchemeLib.ShpleminiIntermediates memory mem; // stack

        // - Compute vector (r, r², ... , r²⁽ⁿ⁻¹⁾), where n = log_circuit_size
        Fr[] memory powers_of_evaluation_challenge = CommitmentSchemeLib.computeSquares(tp.geminiR, $LOG_N);

        // Arrays hold values that will be linearly combined for the gemini and shplonk batch openings
        Fr[] memory scalars = new Fr[](NUMBER_UNSHIFTED + $LOG_N + 2);
        Honk.G1Point[] memory commitments = new Honk.G1Point[](NUMBER_UNSHIFTED + $LOG_N + 2);

        mem.posInvertedDenominator = (tp.shplonkZ - powers_of_evaluation_challenge[0]).invert();
        mem.negInvertedDenominator = (tp.shplonkZ + powers_of_evaluation_challenge[0]).invert();

        mem.unshiftedScalar = mem.posInvertedDenominator + (tp.shplonkNu * mem.negInvertedDenominator);
        mem.shiftedScalar =
            tp.geminiR.invert() * (mem.posInvertedDenominator - (tp.shplonkNu * mem.negInvertedDenominator));

        scalars[0] = ONE;
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
        mem.batchingChallenge = ONE;
        mem.batchedEvaluation = ZERO;

        mem.unshiftedScalarNeg = mem.unshiftedScalar.neg();
        mem.shiftedScalarNeg = mem.shiftedScalar.neg();
        for (uint256 i = 1; i <= NUMBER_UNSHIFTED; ++i) {
            scalars[i] = mem.unshiftedScalarNeg * mem.batchingChallenge;
            mem.batchedEvaluation = mem.batchedEvaluation + (proof.sumcheckEvaluations[i - 1] * mem.batchingChallenge);
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
            uint256 evaluationOff = i + NUMBER_UNSHIFTED;

            scalars[scalarOff] = scalars[scalarOff] + (mem.shiftedScalarNeg * mem.batchingChallenge);
            mem.batchedEvaluation =
                mem.batchedEvaluation + (proof.sumcheckEvaluations[evaluationOff] * mem.batchingChallenge);
            mem.batchingChallenge = mem.batchingChallenge * tp.rho;
        }

        commitments[1] = vk.qm;
        commitments[2] = vk.qc;
        commitments[3] = vk.ql;
        commitments[4] = vk.qr;
        commitments[5] = vk.qo;
        commitments[6] = vk.q4;
        commitments[7] = vk.qLookup;
        commitments[8] = vk.qArith;
        commitments[9] = vk.qDeltaRange;
        commitments[10] = vk.qElliptic;
        commitments[11] = vk.qMemory;
        commitments[12] = vk.qNnf;
        commitments[13] = vk.qPoseidon2External;
        commitments[14] = vk.qPoseidon2Internal;
        commitments[15] = vk.s1;
        commitments[16] = vk.s2;
        commitments[17] = vk.s3;
        commitments[18] = vk.s4;
        commitments[19] = vk.id1;
        commitments[20] = vk.id2;
        commitments[21] = vk.id3;
        commitments[22] = vk.id4;
        commitments[23] = vk.t1;
        commitments[24] = vk.t2;
        commitments[25] = vk.t3;
        commitments[26] = vk.t4;
        commitments[27] = vk.lagrangeFirst;
        commitments[28] = vk.lagrangeLast;

        // Accumulate proof points
        commitments[29] = proof.w1;
        commitments[30] = proof.w2;
        commitments[31] = proof.w3;
        commitments[32] = proof.w4;
        commitments[33] = proof.zPerm;
        commitments[34] = proof.lookupInverses;
        commitments[35] = proof.lookupReadCounts;
        commitments[36] = proof.lookupReadTags;

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

        // Compute the evaluations Aₗ(r^{2ˡ}) for l = 0, ..., $LOG_N - 1
        Fr[] memory foldPosEvaluations = CommitmentSchemeLib.computeFoldPosEvaluations(
            tp.sumCheckUChallenges,
            mem.batchedEvaluation,
            proof.geminiAEvaluations,
            powers_of_evaluation_challenge,
            $LOG_N
        );

        // Compute the Shplonk constant term contributions from A₀(±r)
        mem.constantTermAccumulator = foldPosEvaluations[0] * mem.posInvertedDenominator;
        mem.constantTermAccumulator =
            mem.constantTermAccumulator + (proof.geminiAEvaluations[0] * tp.shplonkNu * mem.negInvertedDenominator);

        mem.batchingChallenge = tp.shplonkNu.sqr();

        // Compute Shplonk constant term contributions from Aₗ(± r^{2ˡ}) for l = 1, ..., m-1;
        // Compute scalar multipliers for each fold commitment
        for (uint256 i = 0; i < $LOG_N - 1; ++i) {
            // Update inverted denominators
            mem.posInvertedDenominator = (tp.shplonkZ - powers_of_evaluation_challenge[i + 1]).invert();
            mem.negInvertedDenominator = (tp.shplonkZ + powers_of_evaluation_challenge[i + 1]).invert();

            // Compute the scalar multipliers for Aₗ(± r^{2ˡ}) and [Aₗ]
            mem.scalingFactorPos = mem.batchingChallenge * mem.posInvertedDenominator;
            mem.scalingFactorNeg = mem.batchingChallenge * tp.shplonkNu * mem.negInvertedDenominator;
            // [Aₗ] is multiplied by -v^{2l}/(z-r^{2^l}) - v^{2l+1} /(z+ r^{2^l})
            scalars[NUMBER_UNSHIFTED + 1 + i] = mem.scalingFactorNeg.neg() + mem.scalingFactorPos.neg();

            // Accumulate the const term contribution given by
            // v^{2l} * Aₗ(r^{2ˡ}) /(z-r^{2^l}) + v^{2l+1} * Aₗ(-r^{2ˡ}) /(z+ r^{2^l})
            Fr accumContribution = mem.scalingFactorNeg * proof.geminiAEvaluations[i + 1];

            accumContribution = accumContribution + mem.scalingFactorPos * foldPosEvaluations[i + 1];
            mem.constantTermAccumulator = mem.constantTermAccumulator + accumContribution;
            // Update the running power of v
            mem.batchingChallenge = mem.batchingChallenge * tp.shplonkNu * tp.shplonkNu;

            commitments[NUMBER_UNSHIFTED + 1 + i] = proof.geminiFoldComms[i];
        }

        // Finalize the batch opening claim
        commitments[NUMBER_UNSHIFTED + $LOG_N] = Honk.G1Point({x: 1, y: 2});
        scalars[NUMBER_UNSHIFTED + $LOG_N] = mem.constantTermAccumulator;

        Honk.G1Point memory quotient_commitment = proof.kzgQuotient;

        commitments[NUMBER_UNSHIFTED + $LOG_N + 1] = quotient_commitment;
        scalars[NUMBER_UNSHIFTED + $LOG_N + 1] = tp.shplonkZ; // evaluation challenge

        Honk.G1Point memory P_0_agg = batchMul(commitments, scalars);
        Honk.G1Point memory P_1_agg = negateInplace(quotient_commitment);

        // Aggregate pairing points
        Fr recursionSeparator = generateRecursionSeparator(proof.pairingPointObject, P_0_agg, P_1_agg);
        (Honk.G1Point memory P_0_other, Honk.G1Point memory P_1_other) =
            convertPairingPointsToG1(proof.pairingPointObject);

        // Validate the points from the proof are on the curve
        validateOnCurve(P_0_other);
        validateOnCurve(P_1_other);

        // accumulate with aggregate points in proof
        P_0_agg = mulWithSeperator(P_0_agg, P_0_other, recursionSeparator);
        P_1_agg = mulWithSeperator(P_1_agg, P_1_other, recursionSeparator);

        return pairing(P_0_agg, P_1_agg);
    }

    function batchMul(Honk.G1Point[] memory base, Fr[] memory scalars)
        internal
        view
        returns (Honk.G1Point memory result)
    {
        uint256 limit = NUMBER_UNSHIFTED + $LOG_N + 2;

        // Validate all points are on the curve
        for (uint256 i = 0; i < limit; ++i) {
            validateOnCurve(base[i]);
        }

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

        require(success, ShpleminiFailed());
    }
}
