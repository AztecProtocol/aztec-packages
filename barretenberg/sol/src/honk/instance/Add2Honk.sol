// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs
pragma solidity >=0.8.21;

import {IVerifier} from "../../interfaces/IVerifier.sol";
import {Add2HonkVerificationKey as VK, N, LOG_N, NUMBER_OF_PUBLIC_INPUTS} from "../keys/Add2HonkVerificationKey.sol";

import {
    Honk,
    WIRE,
    NUMBER_OF_ENTITIES,
    NUMBER_OF_SUBRELATIONS,
    NUMBER_OF_ALPHAS,
    NUMBER_UNSHIFTED,
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
error ZeromorphFailed();

/// Smart contract verifier of honk proofs
contract Add2HonkVerifier is IVerifier {
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

        // Zeromorph
        bool zeromorphVerified = verifyZeroMorph(p, vk, t);
        if (!zeromorphVerified) revert ZeromorphFailed();

        return sumcheckVerified && zeromorphVerified; // Boolean condition not required - nice for vanity :)
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
        Fr univariateEval = Fr.wrap(1) + (roundChallenge * (tp.gateChallenges[round] - Fr.wrap(1)));
        newEvaluation = currentEvaluation * univariateEval;
    }

    function verifyZeroMorph(Honk.Proof memory proof, Honk.VerificationKey memory vk, Transcript memory tp)
        internal
        view
        returns (bool verified)
    {
        // Construct batched evaluation v = sum_{i=0}^{m-1}\rho^i*f_i(u) + sum_{i=0}^{l-1}\rho^{m+i}*h_i(u)
        Fr batchedEval = Fr.wrap(0);
        Fr batchedScalar = Fr.wrap(1);

        // We linearly combine all evaluations (unshifted first, then shifted)
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; ++i) {
            batchedEval = batchedEval + proof.sumcheckEvaluations[i] * batchedScalar;
            batchedScalar = batchedScalar * tp.rho;
        }

        // Get k commitments
        Honk.G1Point memory c_zeta = computeCZeta(proof, tp);
        Honk.G1Point memory c_zeta_x = computeCZetaX(proof, vk, tp, batchedEval);
        Honk.G1Point memory c_zeta_Z = ecAdd(c_zeta, ecMul(c_zeta_x, tp.zmZ));

        // KZG pairing accumulator
        Fr evaluation = Fr.wrap(0);
        verified = zkgReduceVerify(proof, tp, evaluation, c_zeta_Z);
    }

    // Compute commitment to lifted degree quotient identity
    function computeCZeta(Honk.Proof memory proof, Transcript memory tp) internal view returns (Honk.G1Point memory) {
        Fr[LOG_N + 1] memory scalars;
        Honk.G1ProofPoint[LOG_N + 1] memory commitments;

        // Initial contribution
        commitments[0] = proof.zmCq;
        scalars[0] = Fr.wrap(1);

        // TODO: optimize pow operations here ? batch mulable
        for (uint256 k = 0; k < LOG_N; ++k) {
            Fr degree = Fr.wrap((1 << k) - 1);
            Fr scalar = FrLib.pow(tp.zmY, k);
            scalar = scalar * FrLib.pow(tp.zmX, (1 << LOG_N) - Fr.unwrap(degree) - 1);
            scalar = scalar * MINUS_ONE;

            scalars[k + 1] = scalar;
            commitments[k + 1] = proof.zmCqs[k];
        }

        // Convert all commitments for batch mul
        Honk.G1Point[LOG_N + 1] memory comms = convertPoints(commitments);

        return batchMul(comms, scalars);
    }

    struct CZetaXParams {
        Fr phi_numerator;
        Fr phi_n_x;
        Fr rho_pow;
        Fr phi_1;
        Fr phi_2;
        Fr x_pow_2k;
        Fr x_pow_2kp1;
    }

    function computeCZetaX(
        Honk.Proof memory proof,
        Honk.VerificationKey memory vk,
        Transcript memory tp,
        Fr batchedEval
    ) internal view returns (Honk.G1Point memory) {
        Fr[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] memory scalars;
        Honk.G1Point[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] memory commitments;
        CZetaXParams memory cp;

        // Phi_n(x) = (x^N - 1) / (x - 1)
        cp.phi_numerator = FrLib.pow(tp.zmX, (1 << LOG_N)) - Fr.wrap(1);
        cp.phi_n_x = FrLib.div(cp.phi_numerator, tp.zmX - Fr.wrap(1));

        // Add contribution: -v * x * \Phi_n(x) * [1]_1
        // Add base
        scalars[0] = MINUS_ONE * batchedEval * tp.zmX * cp.phi_n_x;
        commitments[0] = Honk.G1Point({x: 1, y: 2}); // One

        // f - Add all unshifted commitments
        // g - Add add to be shifted commitments

        // f commitments are accumulated at (zm_x * r)
        cp.rho_pow = Fr.wrap(1);
        for (uint256 i = 1; i <= NUMBER_UNSHIFTED; ++i) {
            scalars[i] = tp.zmX * cp.rho_pow;
            cp.rho_pow = cp.rho_pow * tp.rho;
        }
        // g commitments are accumulated at r
        for (uint256 i = NUMBER_UNSHIFTED + 1; i <= NUMBER_OF_ENTITIES; ++i) {
            scalars[i] = cp.rho_pow;
            cp.rho_pow = cp.rho_pow * tp.rho;
        }

        // TODO: dont accumulate these into the comms array, just accumulate directly
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

        // Add scalar contributions
        // Add contributions: scalar * [q_k],  k = 0,...,log_N, where
        // scalar = -x * (x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k * \Phi_{n-k}(x^{2^k}))
        cp.x_pow_2k = tp.zmX;
        cp.x_pow_2kp1 = tp.zmX * tp.zmX;
        for (uint256 k; k < CONST_PROOF_SIZE_LOG_N; ++k) {
            bool dummy_round = k >= LOG_N;

            // note: defaults to 0
            Fr scalar;
            if (!dummy_round) {
                cp.phi_1 = FrLib.div(cp.phi_numerator, cp.x_pow_2kp1 - Fr.wrap(1));
                cp.phi_2 = FrLib.div(cp.phi_numerator, cp.x_pow_2k - Fr.wrap(1));

                scalar = cp.x_pow_2k * cp.phi_1;
                scalar = scalar - (tp.sumCheckUChallenges[k] * cp.phi_2);
                scalar = scalar * tp.zmX;
                scalar = scalar * MINUS_ONE;

                cp.x_pow_2k = cp.x_pow_2kp1;
                cp.x_pow_2kp1 = cp.x_pow_2kp1 * cp.x_pow_2kp1;
            }

            scalars[NUMBER_OF_ENTITIES + 1 + k] = scalar;
            commitments[NUMBER_OF_ENTITIES + 1 + k] = convertProofPoint(proof.zmCqs[k]);
        }

        return batchMul2(commitments, scalars);
    }

    // TODO: TODO: TODO: optimize
    // Scalar Mul and acumulate into total
    function batchMul(Honk.G1Point[LOG_N + 1] memory base, Fr[LOG_N + 1] memory scalars)
        internal
        view
        returns (Honk.G1Point memory result)
    {
        uint256 limit = LOG_N + 1;
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
                success := and(success, staticcall(gas(), 6, free, 0x80, free, 0x40))
            }

            mstore(result, mload(free))
            mstore(add(result, 0x20), mload(add(free, 0x20)))
        }
    }

    // This implementation is the same as above with different constants
    function batchMul2(
        Honk.G1Point[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] memory base,
        Fr[NUMBER_OF_ENTITIES + CONST_PROOF_SIZE_LOG_N + 1] memory scalars
    ) internal view returns (Honk.G1Point memory result) {
        uint256 limit = NUMBER_OF_ENTITIES + LOG_N + 1;
        assembly {
            let success := 0x01
            let free := mload(0x40)

            // Write the original into the accumulator
            // Load into memory for ecMUL, leave offset for eccAdd result
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

    function zkgReduceVerify(
        Honk.Proof memory proof,
        Transcript memory tp,
        Fr evaluation,
        Honk.G1Point memory commitment
    ) internal view returns (bool) {
        Honk.G1Point memory quotient_commitment = convertProofPoint(proof.zmPi);
        Honk.G1Point memory ONE = Honk.G1Point({x: 1, y: 2});

        Honk.G1Point memory P0 = commitment;
        P0 = ecAdd(P0, ecMul(quotient_commitment, tp.zmX));

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
