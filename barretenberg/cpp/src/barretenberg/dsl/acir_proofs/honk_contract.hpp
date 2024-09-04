#pragma once
#include "barretenberg/honk/utils/honk_key_gen.hpp"
#include <iostream>

// Source code for the Ultrahonk Solidity verifier.
// It's expected that the AcirComposer will inject a library which will load the verification key into memory.
const std::string HONK_CONTRACT_SOURCE = R"(
type Fr is uint256;

using { add as + } for Fr global;
using { sub as - } for Fr global;
using { mul as * } for Fr global;
using { exp as ^ } for Fr global;
using { notEqual as != } for Fr global;
using { equal as == } for Fr global;

uint256 constant MODULUS =
    21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order

Fr constant MINUS_ONE = Fr.wrap(MODULUS - 1);

// Instantiation
library FrLib
{
    function from(uint256 value) internal pure returns(Fr)
    {
        return Fr.wrap(value % MODULUS);
    }

    function fromBytes32(bytes32 value) internal pure returns(Fr)
    {
        return Fr.wrap(uint256(value) % MODULUS);
    }

    function toBytes32(Fr value) internal pure returns(bytes32)
    {
        return bytes32(Fr.unwrap(value));
    }

    function invert(Fr value) internal view returns(Fr)
    {
        uint256 v = Fr.unwrap(value);
        uint256 result;

        // Call the modexp precompile to invert in the field
        assembly
        {
            let free := mload(0x40)
            mstore(free, 0x20)
            mstore(add(free, 0x20), 0x20)
            mstore(add(free, 0x40), 0x20)
            mstore(add(free, 0x60), v)
            mstore(add(free, 0x80), sub(MODULUS, 2))
            mstore(add(free, 0xa0), MODULUS)
            let success := staticcall(gas(), 0x05, free, 0xc0, 0x00, 0x20)
            if iszero(success) {
                revert(0, 0)
            }
            result := mload(0x00)
        }

        return Fr.wrap(result);
    }

    function pow(Fr base, uint256 v) internal view returns(Fr)
    {
        uint256 b = Fr.unwrap(base);
        uint256 result;

        // Call the modexp precompile to invert in the field
        assembly
        {
            let free := mload(0x40)
            mstore(free, 0x20)
            mstore(add(free, 0x20), 0x20)
            mstore(add(free, 0x40), 0x20)
            mstore(add(free, 0x60), b)
            mstore(add(free, 0x80), v)
            mstore(add(free, 0xa0), MODULUS)
            let success := staticcall(gas(), 0x05, free, 0xc0, 0x00, 0x20)
            if iszero(success) {
                revert(0, 0)
            }
            result := mload(0x00)
        }

        return Fr.wrap(result);
    }

    function div(Fr numerator, Fr denominator) internal view returns(Fr)
    {
        return numerator * invert(denominator);
    }
}

// Free functions
function add(Fr a, Fr b) pure returns(Fr)
{
    return Fr.wrap(addmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
}

function mul(Fr a, Fr b) pure returns(Fr)
{
    return Fr.wrap(mulmod(Fr.unwrap(a), Fr.unwrap(b), MODULUS));
}

function sub(Fr a, Fr b) pure returns(Fr)
{
    return Fr.wrap(addmod(Fr.unwrap(a), MODULUS - Fr.unwrap(b), MODULUS));
}

function exp(Fr base, Fr exponent) pure returns(Fr)
{
    if (Fr.unwrap(exponent) == 0)
        return Fr.wrap(1);
    // Implement exponent with a loop as we will overflow otherwise
    for (uint256 i = 1; i < Fr.unwrap(exponent); i += i) {
        base = base * base;
    }
    return base;
}

function notEqual(Fr a, Fr b) pure returns(bool)
{
    return Fr.unwrap(a) != Fr.unwrap(b);
}

function equal(Fr a, Fr b) pure returns(bool)
{
    return Fr.unwrap(a) == Fr.unwrap(b);
}

uint256 constant CONST_PROOF_SIZE_LOG_N = 28;

uint256 constant NUMBER_OF_SUBRELATIONS = 26;
uint256 constant BATCHED_RELATION_PARTIAL_LENGTH = 8;
uint256 constant NUMBER_OF_ENTITIES = 44;
uint256 constant NUMBER_UNSHIFTED = 35;
uint256 constant NUMBER_TO_BE_SHIFTED = 9;

// Alphas are used as relation separators so there should be NUMBER_OF_SUBRELATIONS - 1
uint256 constant NUMBER_OF_ALPHAS = 25;

// Prime field order
uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583; // EC group order. F_q
uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617; // Prime field order, F_r

// ENUM FOR WIRES
enum WIRE {
    Q_M,
    Q_C,
    Q_L,
    Q_R,
    Q_O,
    Q_4,
    Q_ARITH,
    Q_RANGE,
    Q_ELLIPTIC,
    Q_AUX,
    Q_LOOKUP,
    Q_POSEIDON2_EXTERNAL,
    Q_POSEIDON2_INTERNAL,
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
    Z_PERM,
    LOOKUP_INVERSES,
    LOOKUP_READ_COUNTS,
    LOOKUP_READ_TAGS,
    TABLE_1_SHIFT,
    TABLE_2_SHIFT,
    TABLE_3_SHIFT,
    TABLE_4_SHIFT,
    W_L_SHIFT,
    W_R_SHIFT,
    W_O_SHIFT,
    W_4_SHIFT,
    Z_PERM_SHIFT
}

library Honk {
    struct G1Point {
        uint256 x;
        uint256 y;
    }

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
        G1Point qDeltaRange; // Delta Range sort
        G1Point qAux; // Auxillary
        G1Point qElliptic; // Auxillary
        G1Point qLookup; // Lookup
        G1Point qPoseidon2External;
        G1Point qPoseidon2Internal;
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
        Honk.G1ProofPoint w1;
        Honk.G1ProofPoint w2;
        Honk.G1ProofPoint w3;
        Honk.G1ProofPoint w4;
        // Lookup helpers - Permutations
        Honk.G1ProofPoint zPerm;
        // Lookup helpers - logup
        Honk.G1ProofPoint lookupReadCounts;
        Honk.G1ProofPoint lookupReadTags;
        Honk.G1ProofPoint lookupInverses;
        // Sumcheck
        Fr[BATCHED_RELATION_PARTIAL_LENGTH][CONST_PROOF_SIZE_LOG_N] sumcheckUnivariates;
        Fr[NUMBER_OF_ENTITIES] sumcheckEvaluations;
        // Zero morph
        Honk.G1ProofPoint[CONST_PROOF_SIZE_LOG_N] zmCqs;
        Honk.G1ProofPoint zmCq;
        Honk.G1ProofPoint zmPi;
    }
}


// Transcript library to generate fiat shamir challenges
struct Transcript {
    Fr eta;
    Fr etaTwo;
    Fr etaThree;
    Fr beta;
    Fr gamma;
    Fr[NUMBER_OF_ALPHAS] alphas;
    Fr[CONST_PROOF_SIZE_LOG_N] gateChallenges;
    Fr[CONST_PROOF_SIZE_LOG_N] sumCheckUChallenges;
    Fr rho;
    // Zero morph
    Fr zmX;
    Fr zmY;
    Fr zmZ;
    Fr zmQuotient;
    // Derived
    Fr publicInputsDelta;
    Fr lookupGrandProductDelta;
}

library TranscriptLib
{
    function generateTranscript(Honk.Proof memory proof,
                                Honk.VerificationKey memory vk,
                                bytes32[] calldata publicInputs) external view returns(Transcript memory t)
    {
        (t.eta, t.etaTwo, t.etaThree) = generateEtaChallenge(proof, publicInputs);

        (t.beta, t.gamma) = generateBetaAndGammaChallenges(t.etaThree, proof);

        t.alphas = generateAlphaChallenges(t.gamma, proof);

        t.gateChallenges = generateGateChallenges(t.alphas[NUMBER_OF_ALPHAS - 1]);

        t.sumCheckUChallenges = generateSumcheckChallenges(proof, t.gateChallenges[CONST_PROOF_SIZE_LOG_N - 1]);
        t.rho = generateRhoChallenge(proof, t.sumCheckUChallenges[CONST_PROOF_SIZE_LOG_N - 1]);

        t.zmY = generateZMYChallenge(t.rho, proof);

        (t.zmX, t.zmZ) = generateZMXZChallenges(t.zmY, proof);

        return t;
    }

    function generateEtaChallenge(Honk.Proof memory proof, bytes32[] calldata publicInputs)
        internal view returns(Fr eta, Fr etaTwo, Fr etaThree)
    {
        bytes32[3 + NUMBER_OF_PUBLIC_INPUTS + 12] memory round0;
        round0[0] = bytes32(proof.circuitSize);
        round0[1] = bytes32(proof.publicInputsSize);
        round0[2] = bytes32(proof.publicInputsOffset);
        for (uint256 i = 0; i < NUMBER_OF_PUBLIC_INPUTS; i++) {
            round0[3 + i] = bytes32(publicInputs[i]);
        }

        // Create the first challenge
        // Note: w4 is added to the challenge later on
        round0[3 + NUMBER_OF_PUBLIC_INPUTS] = bytes32(proof.w1.x_0);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 1] = bytes32(proof.w1.x_1);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 2] = bytes32(proof.w1.y_0);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 3] = bytes32(proof.w1.y_1);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 4] = bytes32(proof.w2.x_0);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 5] = bytes32(proof.w2.x_1);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 6] = bytes32(proof.w2.y_0);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 7] = bytes32(proof.w2.y_1);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 8] = bytes32(proof.w3.x_0);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 9] = bytes32(proof.w3.x_1);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 10] = bytes32(proof.w3.y_0);
        round0[3 + NUMBER_OF_PUBLIC_INPUTS + 11] = bytes32(proof.w3.y_1);

        eta = FrLib.fromBytes32(keccak256(abi.encodePacked(round0)));
        etaTwo = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(eta))));
        etaThree = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(etaTwo))));
    }

    function generateBetaAndGammaChallenges(Fr previousChallenge, Honk.Proof memory proof)
        internal view returns(Fr beta, Fr gamma)
    {
        bytes32[13] memory round1;
        round1[0] = FrLib.toBytes32(previousChallenge);
        round1[1] = bytes32(proof.lookupReadCounts.x_0);
        round1[2] = bytes32(proof.lookupReadCounts.x_1);
        round1[3] = bytes32(proof.lookupReadCounts.y_0);
        round1[4] = bytes32(proof.lookupReadCounts.y_1);
        round1[5] = bytes32(proof.lookupReadTags.x_0);
        round1[6] = bytes32(proof.lookupReadTags.x_1);
        round1[7] = bytes32(proof.lookupReadTags.y_0);
        round1[8] = bytes32(proof.lookupReadTags.y_1);
        round1[9] = bytes32(proof.w4.x_0);
        round1[10] = bytes32(proof.w4.x_1);
        round1[11] = bytes32(proof.w4.y_0);
        round1[12] = bytes32(proof.w4.y_1);

        beta = FrLib.fromBytes32(keccak256(abi.encodePacked(round1)));
        gamma = FrLib.fromBytes32(keccak256(abi.encodePacked(beta)));
    }

    // Alpha challenges non-linearise the gate contributions
    function generateAlphaChallenges(Fr previousChallenge, Honk.Proof memory proof)
        internal view returns(Fr[NUMBER_OF_ALPHAS] memory alphas)
    {
        // Generate the original sumcheck alpha 0 by hashing zPerm and zLookup
        uint256[9] memory alpha0;
        alpha0[0] = Fr.unwrap(previousChallenge);
        alpha0[1] = proof.lookupInverses.x_0;
        alpha0[2] = proof.lookupInverses.x_1;
        alpha0[3] = proof.lookupInverses.y_0;
        alpha0[4] = proof.lookupInverses.y_1;
        alpha0[5] = proof.zPerm.x_0;
        alpha0[6] = proof.zPerm.x_1;
        alpha0[7] = proof.zPerm.y_0;
        alpha0[8] = proof.zPerm.y_1;

        alphas[0] = FrLib.fromBytes32(keccak256(abi.encodePacked(alpha0)));

        Fr prevChallenge = alphas[0];
        for (uint256 i = 1; i < NUMBER_OF_ALPHAS; i++) {
            prevChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(prevChallenge))));
            alphas[i] = prevChallenge;
        }
    }

    function generateGateChallenges(Fr previousChallenge) internal view returns(Fr[CONST_PROOF_SIZE_LOG_N] memory gateChallenges)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            previousChallenge = FrLib.fromBytes32(keccak256(abi.encodePacked(Fr.unwrap(previousChallenge))));
            gateChallenges[i] = previousChallenge;
        }
    }

    function generateSumcheckChallenges(Honk.Proof memory proof, Fr prevChallenge)
        internal view returns(Fr[CONST_PROOF_SIZE_LOG_N] memory sumcheckChallenges)
    {
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            Fr[BATCHED_RELATION_PARTIAL_LENGTH + 1] memory univariateChal;
            univariateChal[0] = prevChallenge;

            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                univariateChal[j + 1] = proof.sumcheckUnivariates[i][j];
            }

            sumcheckChallenges[i] = FrLib.fromBytes32(keccak256(abi.encodePacked(univariateChal)));
            prevChallenge = sumcheckChallenges[i];
        }
    }

    function generateRhoChallenge(Honk.Proof memory proof, Fr prevChallenge) internal view returns(Fr rho)
    {
        Fr[NUMBER_OF_ENTITIES + 1] memory rhoChallengeElements;
        rhoChallengeElements[0] = prevChallenge;

        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            rhoChallengeElements[i + 1] = proof.sumcheckEvaluations[i];
        }

        rho = FrLib.fromBytes32(keccak256(abi.encodePacked(rhoChallengeElements)));
    }

    function generateZMYChallenge(Fr previousChallenge, Honk.Proof memory proof) internal view returns(Fr zeromorphY)
    {
        uint256[CONST_PROOF_SIZE_LOG_N * 4 + 1] memory zmY;
        zmY[0] = Fr.unwrap(previousChallenge);

        for (uint256 i; i < CONST_PROOF_SIZE_LOG_N; ++i) {
            zmY[1 + i * 4] = proof.zmCqs[i].x_0;
            zmY[2 + i * 4] = proof.zmCqs[i].x_1;
            zmY[3 + i * 4] = proof.zmCqs[i].y_0;
            zmY[4 + i * 4] = proof.zmCqs[i].y_1;
        }

        zeromorphY = FrLib.fromBytes32(keccak256(abi.encodePacked(zmY)));
    }

    function generateZMXZChallenges(Fr previousChallenge, Honk.Proof memory proof)
        internal view returns(Fr zeromorphX, Fr zeromorphZ)
    {
        uint256[4 + 1] memory buf;
        buf[0] = Fr.unwrap(previousChallenge);

        buf[1] = proof.zmCq.x_0;
        buf[2] = proof.zmCq.x_1;
        buf[3] = proof.zmCq.y_0;
        buf[4] = proof.zmCq.y_1;

        zeromorphX = FrLib.fromBytes32(keccak256(abi.encodePacked(buf)));
        zeromorphZ = FrLib.fromBytes32(keccak256(abi.encodePacked(zeromorphX)));
    }
}

// EC Point utilities
function convertProofPoint(Honk.G1ProofPoint memory input) pure returns (Honk.G1Point memory) {
    return Honk.G1Point({x: input.x_0 | (input.x_1 << 136), y: input.y_0 | (input.y_1 << 136)});
}

function ecMul(Honk.G1Point memory point, Fr scalar) view returns (Honk.G1Point memory) {
    bytes memory input = abi.encodePacked(point.x, point.y, Fr.unwrap(scalar));
    (bool success, bytes memory result) = address(0x07).staticcall(input);
    require(success, "ecMul failed");

    (uint256 x, uint256 y) = abi.decode(result, (uint256, uint256));
    return Honk.G1Point({x: x, y: y});
}

function ecAdd(Honk.G1Point memory point0, Honk.G1Point memory point1) view returns (Honk.G1Point memory) {
    bytes memory input = abi.encodePacked(point0.x, point0.y, point1.x, point1.y);
    (bool success, bytes memory result) = address(0x06).staticcall(input);
    require(success, "ecAdd failed");

    (uint256 x, uint256 y) = abi.decode(result, (uint256, uint256));
    return Honk.G1Point({x: x, y: y});
}

function ecSub(Honk.G1Point memory point0, Honk.G1Point memory point1) view returns (Honk.G1Point memory) {
    // We negate the second point
    uint256 negativePoint1Y = (Q - point1.y) % Q;
    bytes memory input = abi.encodePacked(point0.x, point0.y, point1.x, negativePoint1Y);
    (bool success, bytes memory result) = address(0x06).staticcall(input);
    require(success, "ecAdd failed");

    (uint256 x, uint256 y) = abi.decode(result, (uint256, uint256));
    return Honk.G1Point({x: x, y: y});
}

function negateInplace(Honk.G1Point memory point) pure returns (Honk.G1Point memory) {
    point.y = (Q - point.y) % Q;
    return point;
}

uint256 constant T = 4;
uint256 constant D = 5;
uint256 constant ROUNDS_F = 8;
uint256 constant ROUNDS_P = 56;
uint256 constant SBOX_SIZE = 254;

struct PoseidonParams {
    Fr[T] internal_matrix_diagonal;
    Fr[T][T] internal_matrix;
    Fr[T][ROUNDS_F + ROUNDS_P] round_constants;
}

library PoseidonParamsLib {
    function loadPoseidionParams() internal pure returns (PoseidonParams memory params) {
        params = PoseidonParams({
            internal_matrix_diagonal: [
                FrLib.from(0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7),
                FrLib.from(0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b),
                FrLib.from(0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15),
                FrLib.from(0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b)
            ],
            internal_matrix: [
                [
                    FrLib.from(0x10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e8),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001)
                ],
                [
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740c),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001)
                ],
                [
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac16),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001)
                ],
                [
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000001),
                    FrLib.from(0x222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428c)
                ]
            ],
            round_constants: [
                [
                    FrLib.from(0x19b849f69450b06848da1d39bd5e4a4302bb86744edc26238b0878e269ed23e5),
                    FrLib.from(0x265ddfe127dd51bd7239347b758f0a1320eb2cc7450acc1dad47f80c8dcf34d6),
                    FrLib.from(0x199750ec472f1809e0f66a545e1e51624108ac845015c2aa3dfc36bab497d8aa),
                    FrLib.from(0x157ff3fe65ac7208110f06a5f74302b14d743ea25067f0ffd032f787c7f1cdf8)
                ],
                [
                    FrLib.from(0x2e49c43c4569dd9c5fd35ac45fca33f10b15c590692f8beefe18f4896ac94902),
                    FrLib.from(0x0e35fb89981890520d4aef2b6d6506c3cb2f0b6973c24fa82731345ffa2d1f1e),
                    FrLib.from(0x251ad47cb15c4f1105f109ae5e944f1ba9d9e7806d667ffec6fe723002e0b996),
                    FrLib.from(0x13da07dc64d428369873e97160234641f8beb56fdd05e5f3563fa39d9c22df4e)
                ],
                [
                    FrLib.from(0x0c009b84e650e6d23dc00c7dccef7483a553939689d350cd46e7b89055fd4738),
                    FrLib.from(0x011f16b1c63a854f01992e3956f42d8b04eb650c6d535eb0203dec74befdca06),
                    FrLib.from(0x0ed69e5e383a688f209d9a561daa79612f3f78d0467ad45485df07093f367549),
                    FrLib.from(0x04dba94a7b0ce9e221acad41472b6bbe3aec507f5eb3d33f463672264c9f789b)
                ],
                [
                    FrLib.from(0x0a3f2637d840f3a16eb094271c9d237b6036757d4bb50bf7ce732ff1d4fa28e8),
                    FrLib.from(0x259a666f129eea198f8a1c502fdb38fa39b1f075569564b6e54a485d1182323f),
                    FrLib.from(0x28bf7459c9b2f4c6d8e7d06a4ee3a47f7745d4271038e5157a32fdf7ede0d6a1),
                    FrLib.from(0x0a1ca941f057037526ea200f489be8d4c37c85bbcce6a2aeec91bd6941432447)
                ],
                [
                    FrLib.from(0x0c6f8f958be0e93053d7fd4fc54512855535ed1539f051dcb43a26fd926361cf),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x123106a93cd17578d426e8128ac9d90aa9e8a00708e296e084dd57e69caaf811),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x26e1ba52ad9285d97dd3ab52f8e840085e8fa83ff1e8f1877b074867cd2dee75),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1cb55cad7bd133de18a64c5c47b9c97cbe4d8b7bf9e095864471537e6a4ae2c5),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1dcd73e46acd8f8e0e2c7ce04bde7f6d2a53043d5060a41c7143f08e6e9055d0),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x011003e32f6d9c66f5852f05474a4def0cda294a0eb4e9b9b12b9bb4512e5574),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2b1e809ac1d10ab29ad5f20d03a57dfebadfe5903f58bafed7c508dd2287ae8c),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2539de1785b735999fb4dac35ee17ed0ef995d05ab2fc5faeaa69ae87bcec0a5),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0c246c5a2ef8ee0126497f222b3e0a0ef4e1c3d41c86d46e43982cb11d77951d),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x192089c4974f68e95408148f7c0632edbb09e6a6ad1a1c2f3f0305f5d03b527b),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1eae0ad8ab68b2f06a0ee36eeb0d0c058529097d91096b756d8fdc2fb5a60d85),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x179190e5d0e22179e46f8282872abc88db6e2fdc0dee99e69768bd98c5d06bfb),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x29bb9e2c9076732576e9a81c7ac4b83214528f7db00f31bf6cafe794a9b3cd1c),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x225d394e42207599403efd0c2464a90d52652645882aac35b10e590e6e691e08),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x064760623c25c8cf753d238055b444532be13557451c087de09efd454b23fd59),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x10ba3a0e01df92e87f301c4b716d8a394d67f4bf42a75c10922910a78f6b5b87),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0e070bf53f8451b24f9c6e96b0c2a801cb511bc0c242eb9d361b77693f21471c),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1b94cd61b051b04dd39755ff93821a73ccd6cb11d2491d8aa7f921014de252fb),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1d7cb39bafb8c744e148787a2e70230f9d4e917d5713bb050487b5aa7d74070b),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2ec93189bd1ab4f69117d0fe980c80ff8785c2961829f701bb74ac1f303b17db),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2db366bfdd36d277a692bb825b86275beac404a19ae07a9082ea46bd83517926),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x062100eb485db06269655cf186a68532985275428450359adc99cec6960711b8),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0761d33c66614aaa570e7f1e8244ca1120243f92fa59e4f900c567bf41f5a59b),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x20fc411a114d13992c2705aa034e3f315d78608a0f7de4ccf7a72e494855ad0d),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x25b5c004a4bdfcb5add9ec4e9ab219ba102c67e8b3effb5fc3a30f317250bc5a),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x23b1822d278ed632a494e58f6df6f5ed038b186d8474155ad87e7dff62b37f4b),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x22734b4c5c3f9493606c4ba9012499bf0f14d13bfcfcccaa16102a29cc2f69e0),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x26c0c8fe09eb30b7e27a74dc33492347e5bdff409aa3610254413d3fad795ce5),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x070dd0ccb6bd7bbae88eac03fa1fbb26196be3083a809829bbd626df348ccad9),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x12b6595bdb329b6fb043ba78bb28c3bec2c0a6de46d8c5ad6067c4ebfd4250da),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x248d97d7f76283d63bec30e7a5876c11c06fca9b275c671c5e33d95bb7e8d729),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1a306d439d463b0816fc6fd64cc939318b45eb759ddde4aa106d15d9bd9baaaa),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x28a8f8372e3c38daced7c00421cb4621f4f1b54ddc27821b0d62d3d6ec7c56cf),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0094975717f9a8a8bb35152f24d43294071ce320c829f388bc852183e1e2ce7e),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x04d5ee4c3aa78f7d80fde60d716480d3593f74d4f653ae83f4103246db2e8d65),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2a6cf5e9aa03d4336349ad6fb8ed2269c7bef54b8822cc76d08495c12efde187),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2304d31eaab960ba9274da43e19ddeb7f792180808fd6e43baae48d7efcba3f3),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x03fd9ac865a4b2a6d5e7009785817249bff08a7e0726fcb4e1c11d39d199f0b0),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x00b7258ded52bbda2248404d55ee5044798afc3a209193073f7954d4d63b0b64),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x159f81ada0771799ec38fca2d4bf65ebb13d3a74f3298db36272c5ca65e92d9a),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1ef90e67437fbc8550237a75bc28e3bb9000130ea25f0c5471e144cf4264431f),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1e65f838515e5ff0196b49aa41a2d2568df739bc176b08ec95a79ed82932e30d),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2b1b045def3a166cec6ce768d079ba74b18c844e570e1f826575c1068c94c33f),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0832e5753ceb0ff6402543b1109229c165dc2d73bef715e3f1c6e07c168bb173),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x02f614e9cedfb3dc6b762ae0a37d41bab1b841c2e8b6451bc5a8e3c390b6ad16),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0e2427d38bd46a60dd640b8e362cad967370ebb777bedff40f6a0be27e7ed705),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0493630b7c670b6deb7c84d414e7ce79049f0ec098c3c7c50768bbe29214a53a),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x22ead100e8e482674decdab17066c5a26bb1515355d5461a3dc06cc85327cea9),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x25b3e56e655b42cdaae2626ed2554d48583f1ae35626d04de5084e0b6d2a6f16),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1e32752ada8836ef5837a6cde8ff13dbb599c336349e4c584b4fdc0a0cf6f9d0),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2fa2a871c15a387cc50f68f6f3c3455b23c00995f05078f672a9864074d412e5),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x2f569b8a9a4424c9278e1db7311e889f54ccbf10661bab7fcd18e7c7a7d83505),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x044cb455110a8fdd531ade530234c518a7df93f7332ffd2144165374b246b43d),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x227808de93906d5d420246157f2e42b191fe8c90adfe118178ddc723a5319025),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x02fcca2934e046bc623adead873579865d03781ae090ad4a8579d2e7a6800355),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x0ef915f0ac120b876abccceb344a1d36bad3f3c5ab91a8ddcbec2e060d8befac),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000),
                    FrLib.from(0x0000000000000000000000000000000000000000000000000000000000000000)
                ],
                [
                    FrLib.from(0x1797130f4b7a3e1777eb757bc6f287f6ab0fb85f6be63b09f3b16ef2b1405d38),
                    FrLib.from(0x0a76225dc04170ae3306c85abab59e608c7f497c20156d4d36c668555decc6e5),
                    FrLib.from(0x1fffb9ec1992d66ba1e77a7b93209af6f8fa76d48acb664796174b5326a31a5c),
                    FrLib.from(0x25721c4fc15a3f2853b57c338fa538d85f8fbba6c6b9c6090611889b797b9c5f)
                ],
                [
                    FrLib.from(0x0c817fd42d5f7a41215e3d07ba197216adb4c3790705da95eb63b982bfcaf75a),
                    FrLib.from(0x13abe3f5239915d39f7e13c2c24970b6df8cf86ce00a22002bc15866e52b5a96),
                    FrLib.from(0x2106feea546224ea12ef7f39987a46c85c1bc3dc29bdbd7a92cd60acb4d391ce),
                    FrLib.from(0x21ca859468a746b6aaa79474a37dab49f1ca5a28c748bc7157e1b3345bb0f959)
                ],
                [
                    FrLib.from(0x05ccd6255c1e6f0c5cf1f0df934194c62911d14d0321662a8f1a48999e34185b),
                    FrLib.from(0x0f0e34a64b70a626e464d846674c4c8816c4fb267fe44fe6ea28678cb09490a4),
                    FrLib.from(0x0558531a4e25470c6157794ca36d0e9647dbfcfe350d64838f5b1a8a2de0d4bf),
                    FrLib.from(0x09d3dca9173ed2faceea125157683d18924cadad3f655a60b72f5864961f1455)
                ],
                [
                    FrLib.from(0x0328cbd54e8c0913493f866ed03d218bf23f92d68aaec48617d4c722e5bd4335),
                    FrLib.from(0x2bf07216e2aff0a223a487b1a7094e07e79e7bcc9798c648ee3347dd5329d34b),
                    FrLib.from(0x1daf345a58006b736499c583cb76c316d6f78ed6a6dffc82111e11a63fe412df),
                    FrLib.from(0x176563472456aaa746b694c60e1823611ef39039b2edc7ff391e6f2293d2c404)
                ]
            ]
        });
    }
}


library RelationsLib {
    Fr internal constant GRUMPKIN_CURVE_B_PARAMETER_NEGATED = Fr.wrap(17); // -(-17)

    function accumulateRelationEvaluations(Honk.Proof memory proof, Transcript memory tp, Fr powPartialEval)
        external
        view
        returns (Fr accumulator)
    {
        Fr[NUMBER_OF_ENTITIES] memory purportedEvaluations = proof.sumcheckEvaluations;
        Fr[NUMBER_OF_SUBRELATIONS] memory evaluations;

        // Accumulate all 6 custom gates - each with varying number of subrelations
        accumulateArithmeticRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulatePermutationRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulateLogDerivativeLookupRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulateDeltaRangeRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulateEllipticRelation(purportedEvaluations, evaluations, powPartialEval);
        accumulateAuxillaryRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulatePoseidonExternalRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        accumulatePoseidonInternalRelation(purportedEvaluations, tp, evaluations, powPartialEval);
        // batch the subrelations with the alpha challenges to obtain the full honk relation
        accumulator = scaleAndBatchSubrelations(evaluations, tp.alphas);
    }

    /**
     * WIRE
     *
     * Wire is an aesthetic helper function that is used to index by enum into proof.sumcheckEvaluations, it avoids
     * the relation checking code being cluttered with uint256 type casting, which is often a different colour in code
     * editors, and thus is noisy.
     */
    function wire(Fr[NUMBER_OF_ENTITIES] memory p, WIRE _wire) internal pure returns(Fr)
    {
        return p[uint256(_wire)];
    }

    /**
     * Ultra Arithmetic Relation
     *
     */
    function accumulateArithmeticRelation(
        Fr[NUMBER_OF_ENTITIES] memory p,
        Fr[NUMBER_OF_SUBRELATIONS] memory evals,
        Fr domainSep
    ) internal view {
        // Relation 0
        Fr q_arith = wire(p, WIRE.Q_ARITH);
        {
            Fr neg_half = Fr.wrap(0) - (FrLib.invert(Fr.wrap(2)));

            Fr accum = (q_arith - Fr.wrap(3)) * (wire(p, WIRE.Q_M) * wire(p, WIRE.W_R) * wire(p, WIRE.W_L)) * neg_half;
            accum = accum + (wire(p, WIRE.Q_L) * wire(p, WIRE.W_L)) + (wire(p, WIRE.Q_R) * wire(p, WIRE.W_R)) +
                    (wire(p, WIRE.Q_O) * wire(p, WIRE.W_O)) + (wire(p, WIRE.Q_4) * wire(p, WIRE.W_4)) +
                    wire(p, WIRE.Q_C);
            accum = accum + (q_arith - Fr.wrap(1)) * wire(p, WIRE.W_4_SHIFT);
            accum = accum * q_arith;
            accum = accum * domainSep;
            evals[0] = accum;
        }

        // Relation 1
        {
            Fr accum = wire(p, WIRE.W_L) + wire(p, WIRE.W_4) - wire(p, WIRE.W_L_SHIFT) + wire(p, WIRE.Q_M);
            accum = accum * (q_arith - Fr.wrap(2));
            accum = accum * (q_arith - Fr.wrap(1));
            accum = accum * q_arith;
            accum = accum * domainSep;
            evals[1] = accum;
        }
    }

    function accumulatePermutationRelation(
        Fr[NUMBER_OF_ENTITIES] memory p,
        Transcript memory tp,
        Fr[NUMBER_OF_SUBRELATIONS] memory evals,
        Fr domainSep
    ) internal pure {
        Fr grand_product_numerator;
        Fr grand_product_denominator;

        {
            Fr num = wire(p, WIRE.W_L) + wire(p, WIRE.ID_1) * tp.beta + tp.gamma;
            num = num * (wire(p, WIRE.W_R) + wire(p, WIRE.ID_2) * tp.beta + tp.gamma);
            num = num * (wire(p, WIRE.W_O) + wire(p, WIRE.ID_3) * tp.beta + tp.gamma);
            num = num * (wire(p, WIRE.W_4) + wire(p, WIRE.ID_4) * tp.beta + tp.gamma);

            grand_product_numerator = num;
        }
        {
            Fr den = wire(p, WIRE.W_L) + wire(p, WIRE.SIGMA_1) * tp.beta + tp.gamma;
            den = den * (wire(p, WIRE.W_R) + wire(p, WIRE.SIGMA_2) * tp.beta + tp.gamma);
            den = den * (wire(p, WIRE.W_O) + wire(p, WIRE.SIGMA_3) * tp.beta + tp.gamma);
            den = den * (wire(p, WIRE.W_4) + wire(p, WIRE.SIGMA_4) * tp.beta + tp.gamma);

            grand_product_denominator = den;
        }

        // Contribution 2
        {
            Fr acc = (wire(p, WIRE.Z_PERM) + wire(p, WIRE.LAGRANGE_FIRST)) * grand_product_numerator;

            acc = acc
                - (
                    (wire(p, WIRE.Z_PERM_SHIFT) + (wire(p, WIRE.LAGRANGE_LAST) * tp.publicInputsDelta))
                        * grand_product_denominator
                );
            acc = acc * domainSep;
            evals[2] = acc;
        }

        // Contribution 3
        {
            Fr acc = (wire(p, WIRE.LAGRANGE_LAST) * wire(p, WIRE.Z_PERM_SHIFT)) * domainSep;
            evals[3] = acc;
        }
    }

    function accumulateLogDerivativeLookupRelation(
        Fr[NUMBER_OF_ENTITIES] memory p, Transcript memory tp, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr domainSep)
        internal view
    {
        Fr write_term;
        Fr read_term;

        // Calculate the write term (the table accumulation)
        {
            write_term = wire(p, WIRE.TABLE_1) + tp.gamma + (wire(p, WIRE.TABLE_2) * tp.eta)
                + (wire(p, WIRE.TABLE_3) * tp.etaTwo) + (wire(p, WIRE.TABLE_4) * tp.etaThree);
        }

        // Calculate the write term
        {
            Fr derived_entry_1 = wire(p, WIRE.W_L) + tp.gamma + (wire(p, WIRE.Q_R) * wire(p, WIRE.W_L_SHIFT));
            Fr derived_entry_2 = wire(p, WIRE.W_R) + wire(p, WIRE.Q_M) * wire(p, WIRE.W_R_SHIFT);
            Fr derived_entry_3 = wire(p, WIRE.W_O) + wire(p, WIRE.Q_C) * wire(p, WIRE.W_O_SHIFT);

            read_term = derived_entry_1 + (derived_entry_2 * tp.eta) + (derived_entry_3 * tp.etaTwo)
                + (wire(p, WIRE.Q_O) * tp.etaThree);
        }

        Fr read_inverse = wire(p, WIRE.LOOKUP_INVERSES) * write_term;
        Fr write_inverse = wire(p, WIRE.LOOKUP_INVERSES) * read_term;

        Fr inverse_exists_xor = wire(p, WIRE.LOOKUP_READ_TAGS) + wire(p, WIRE.Q_LOOKUP)
            - (wire(p, WIRE.LOOKUP_READ_TAGS) * wire(p, WIRE.Q_LOOKUP));

        // Inverse calculated correctly relation
        Fr accumulatorNone = read_term * write_term * wire(p, WIRE.LOOKUP_INVERSES) - inverse_exists_xor;
        accumulatorNone = accumulatorNone * domainSep;

        // Inverse
        Fr accumulatorOne = wire(p, WIRE.Q_LOOKUP) * read_inverse - wire(p, WIRE.LOOKUP_READ_COUNTS) * write_inverse;

        evals[4] = accumulatorNone;
        evals[5] = accumulatorOne;
    }

    function accumulateDeltaRangeRelation(
        Fr[NUMBER_OF_ENTITIES] memory p,
        Fr[NUMBER_OF_SUBRELATIONS] memory evals,
        Fr domainSep
    ) internal view {
        Fr minus_one = Fr.wrap(0) - Fr.wrap(1);
        Fr minus_two = Fr.wrap(0) - Fr.wrap(2);
        Fr minus_three = Fr.wrap(0) - Fr.wrap(3);

        // Compute wire differences
        Fr delta_1 = wire(p, WIRE.W_R) - wire(p, WIRE.W_L);
        Fr delta_2 = wire(p, WIRE.W_O) - wire(p, WIRE.W_R);
        Fr delta_3 = wire(p, WIRE.W_4) - wire(p, WIRE.W_O);
        Fr delta_4 = wire(p, WIRE.W_L_SHIFT) - wire(p, WIRE.W_4);

        // Contribution 6
        {
            Fr acc = delta_1;
            acc = acc * (delta_1 + minus_one);
            acc = acc * (delta_1 + minus_two);
            acc = acc * (delta_1 + minus_three);
            acc = acc * wire(p, WIRE.Q_RANGE);
            acc = acc * domainSep;
            evals[6] = acc;
        }

        // Contribution 7
        {
            Fr acc = delta_2;
            acc = acc * (delta_2 + minus_one);
            acc = acc * (delta_2 + minus_two);
            acc = acc * (delta_2 + minus_three);
            acc = acc * wire(p, WIRE.Q_RANGE);
            acc = acc * domainSep;
            evals[7] = acc;
        }

        // Contribution 8
        {
            Fr acc = delta_3;
            acc = acc * (delta_3 + minus_one);
            acc = acc * (delta_3 + minus_two);
            acc = acc * (delta_3 + minus_three);
            acc = acc * wire(p, WIRE.Q_RANGE);
            acc = acc * domainSep;
            evals[8] = acc;
        }

        // Contribution 9
        {
            Fr acc = delta_4;
            acc = acc * (delta_4 + minus_one);
            acc = acc * (delta_4 + minus_two);
            acc = acc * (delta_4 + minus_three);
            acc = acc * wire(p, WIRE.Q_RANGE);
            acc = acc * domainSep;
            evals[9] = acc;
        }
    }

    struct EllipticParams {
        // Points
        Fr x_1;
        Fr y_1;
        Fr x_2;
        Fr y_2;
        Fr y_3;
        Fr x_3;
        // push accumulators into memory
        Fr x_double_identity;
    }

    function
    accumulateEllipticRelation(Fr[NUMBER_OF_ENTITIES] memory p, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr domainSep)
        internal view
    {
        EllipticParams memory ep;
        ep.x_1 = wire(p, WIRE.W_R);
        ep.y_1 = wire(p, WIRE.W_O);

        ep.x_2 = wire(p, WIRE.W_L_SHIFT);
        ep.y_2 = wire(p, WIRE.W_4_SHIFT);
        ep.y_3 = wire(p, WIRE.W_O_SHIFT);
        ep.x_3 = wire(p, WIRE.W_R_SHIFT);

        Fr q_sign = wire(p, WIRE.Q_L);
        Fr q_is_double = wire(p, WIRE.Q_M);

        // Contribution 10 point addition, x-coordinate check
        // q_elliptic * (x3 + x2 + x1)(x2 - x1)(x2 - x1) - y2^2 - y1^2 + 2(y2y1)*q_sign = 0
        Fr x_diff = (ep.x_2 - ep.x_1);
        Fr y1_sqr = (ep.y_1 * ep.y_1);
        {
            // Move to top
            Fr partialEval = domainSep;

            Fr y2_sqr = (ep.y_2 * ep.y_2);
            Fr y1y2 = ep.y_1 * ep.y_2 * q_sign;
            Fr x_add_identity = (ep.x_3 + ep.x_2 + ep.x_1);
            x_add_identity = x_add_identity * x_diff * x_diff;
            x_add_identity = x_add_identity - y2_sqr - y1_sqr + y1y2 + y1y2;

            evals[10] = x_add_identity * partialEval * wire(p, WIRE.Q_ELLIPTIC) * (Fr.wrap(1) - q_is_double);
        }

        // Contribution 11 point addition, x-coordinate check
        // q_elliptic * (q_sign * y1 + y3)(x2 - x1) + (x3 - x1)(y2 - q_sign * y1) = 0
        {
            Fr y1_plus_y3 = ep.y_1 + ep.y_3;
            Fr y_diff = ep.y_2 * q_sign - ep.y_1;
            Fr y_add_identity = y1_plus_y3 * x_diff + (ep.x_3 - ep.x_1) * y_diff;
            evals[11] = y_add_identity * domainSep * wire(p, WIRE.Q_ELLIPTIC) * (Fr.wrap(1) - q_is_double);
        }

        // Contribution 10 point doubling, x-coordinate check
        // (x3 + x1 + x1) (4y1*y1) - 9 * x1 * x1 * x1 * x1 = 0
        // N.B. we're using the equivalence x1*x1*x1 === y1*y1 - curve_b to reduce degree by 1
        {
            Fr x_pow_4 = (y1_sqr + GRUMPKIN_CURVE_B_PARAMETER_NEGATED) * ep.x_1;
            Fr y1_sqr_mul_4 = y1_sqr + y1_sqr;
            y1_sqr_mul_4 = y1_sqr_mul_4 + y1_sqr_mul_4;
            Fr x1_pow_4_mul_9 = x_pow_4 * Fr.wrap(9);

            // NOTE: pushed into memory (stack >:'( )
            ep.x_double_identity = (ep.x_3 + ep.x_1 + ep.x_1) * y1_sqr_mul_4 - x1_pow_4_mul_9;

            Fr acc = ep.x_double_identity * domainSep * wire(p, WIRE.Q_ELLIPTIC) * q_is_double;
            evals[10] = evals[10] + acc;
        }

        // Contribution 11 point doubling, y-coordinate check
        // (y1 + y1) (2y1) - (3 * x1 * x1)(x1 - x3) = 0
        {
            Fr x1_sqr_mul_3 = (ep.x_1 + ep.x_1 + ep.x_1) * ep.x_1;
            Fr y_double_identity = x1_sqr_mul_3 * (ep.x_1 - ep.x_3) - (ep.y_1 + ep.y_1) * (ep.y_1 + ep.y_3);
            evals[11] = evals[11] + y_double_identity * domainSep * wire(p, WIRE.Q_ELLIPTIC) * q_is_double;
        }
    }

    // Constants for the auxiliary relation
    Fr constant LIMB_SIZE = Fr.wrap(uint256(1) << 68);
    Fr constant SUBLIMB_SHIFT = Fr.wrap(uint256(1) << 14);

    // Parameters used within the Auxiliary Relation
    // A struct is used to work around stack too deep. This relation has alot of variables
    struct AuxParams {
        Fr limb_subproduct;
        Fr non_native_field_gate_1;
        Fr non_native_field_gate_2;
        Fr non_native_field_gate_3;
        Fr limb_accumulator_1;
        Fr limb_accumulator_2;
        Fr memory_record_check;
        Fr partial_record_check;
        Fr next_gate_access_type;
        Fr record_delta;
        Fr index_delta;
        Fr adjacent_values_match_if_adjacent_indices_match;
        Fr adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation;
        Fr access_check;
        Fr next_gate_access_type_is_boolean;
        Fr ROM_consistency_check_identity;
        Fr RAM_consistency_check_identity;
        Fr timestamp_delta;
        Fr RAM_timestamp_check_identity;
        Fr memory_identity;
        Fr index_is_monotonically_increasing;
        Fr auxiliary_identity;
    }

    function
    accumulateAuxillaryRelation(
        Fr[NUMBER_OF_ENTITIES] memory p, Transcript memory tp, Fr[NUMBER_OF_SUBRELATIONS] memory evals, Fr domainSep)
        internal pure
    {
        AuxParams memory ap;

        /**
         * Contribution 12
         * Non native field arithmetic gate 2
         * deg 4
         *
         *             _                                                                               _
         *            /   _                   _                               _       14                \
         * q_2 . q_4 |   (w_1 . w_2) + (w_1 . w_2) + (w_1 . w_4 + w_2 . w_3 - w_3) . 2    - w_3 - w_4   |
         *            \_                                                                               _/
         *
         *
         */
        ap.limb_subproduct = wire(p, WIRE.W_L) * wire(p, WIRE.W_R_SHIFT) + wire(p, WIRE.W_L_SHIFT) * wire(p, WIRE.W_R);
        ap.non_native_field_gate_2 =
            (wire(p, WIRE.W_L) * wire(p, WIRE.W_4) + wire(p, WIRE.W_R) * wire(p, WIRE.W_O) - wire(p, WIRE.W_O_SHIFT));
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 * LIMB_SIZE;
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 - wire(p, WIRE.W_4_SHIFT);
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 + ap.limb_subproduct;
        ap.non_native_field_gate_2 = ap.non_native_field_gate_2 * wire(p, WIRE.Q_4);

        ap.limb_subproduct = ap.limb_subproduct * LIMB_SIZE;
        ap.limb_subproduct = ap.limb_subproduct + (wire(p, WIRE.W_L_SHIFT) * wire(p, WIRE.W_R_SHIFT));
        ap.non_native_field_gate_1 = ap.limb_subproduct;
        ap.non_native_field_gate_1 = ap.non_native_field_gate_1 - (wire(p, WIRE.W_O) + wire(p, WIRE.W_4));
        ap.non_native_field_gate_1 = ap.non_native_field_gate_1 * wire(p, WIRE.Q_O);

        ap.non_native_field_gate_3 = ap.limb_subproduct;
        ap.non_native_field_gate_3 = ap.non_native_field_gate_3 + wire(p, WIRE.W_4);
        ap.non_native_field_gate_3 = ap.non_native_field_gate_3 - (wire(p, WIRE.W_O_SHIFT) + wire(p, WIRE.W_4_SHIFT));
        ap.non_native_field_gate_3 = ap.non_native_field_gate_3 * wire(p, WIRE.Q_M);

        Fr non_native_field_identity =
            ap.non_native_field_gate_1 + ap.non_native_field_gate_2 + ap.non_native_field_gate_3;
        non_native_field_identity = non_native_field_identity * wire(p, WIRE.Q_R);

        // ((((w2' * 2^14 + w1') * 2^14 + w3) * 2^14 + w2) * 2^14 + w1 - w4) * qm
        // deg 2
        ap.limb_accumulator_1 = wire(p, WIRE.W_R_SHIFT) * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_L_SHIFT);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_O);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_R);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * SUBLIMB_SHIFT;
        ap.limb_accumulator_1 = ap.limb_accumulator_1 + wire(p, WIRE.W_L);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 - wire(p, WIRE.W_4);
        ap.limb_accumulator_1 = ap.limb_accumulator_1 * wire(p, WIRE.Q_4);

        // ((((w3' * 2^14 + w2') * 2^14 + w1') * 2^14 + w4) * 2^14 + w3 - w4') * qm
        // deg 2
        ap.limb_accumulator_2 = wire(p, WIRE.W_O_SHIFT) * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_R_SHIFT);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_L_SHIFT);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_4);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * SUBLIMB_SHIFT;
        ap.limb_accumulator_2 = ap.limb_accumulator_2 + wire(p, WIRE.W_O);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 - wire(p, WIRE.W_4_SHIFT);
        ap.limb_accumulator_2 = ap.limb_accumulator_2 * wire(p, WIRE.Q_M);

        Fr limb_accumulator_identity = ap.limb_accumulator_1 + ap.limb_accumulator_2;
        limb_accumulator_identity = limb_accumulator_identity * wire(p, WIRE.Q_O); //  deg 3

        /**
         * MEMORY
         *
         * A RAM memory record contains a tuple of the following fields:
         *  * i: `index` of memory cell being accessed
         *  * t: `timestamp` of memory cell being accessed (used for RAM, set to 0 for ROM)
         *  * v: `value` of memory cell being accessed
         *  * a: `access` type of record. read: 0 = read, 1 = write
         *  * r: `record` of memory cell. record = access + index * eta + timestamp * eta_two + value * eta_three
         *
         * A ROM memory record contains a tuple of the following fields:
         *  * i: `index` of memory cell being accessed
         *  * v: `value1` of memory cell being accessed (ROM tables can store up to 2 values per index)
         *  * v2:`value2` of memory cell being accessed (ROM tables can store up to 2 values per index)
         *  * r: `record` of memory cell. record = index * eta + value2 * eta_two + value1 * eta_three
         *
         *  When performing a read/write access, the values of i, t, v, v2, a, r are stored in the following wires +
         * selectors, depending on whether the gate is a RAM read/write or a ROM read
         *
         *  | gate type | i  | v2/t  |  v | a  | r  |
         *  | --------- | -- | ----- | -- | -- | -- |
         *  | ROM       | w1 | w2    | w3 | -- | w4 |
         *  | RAM       | w1 | w2    | w3 | qc | w4 |
         *
         * (for accesses where `index` is a circuit constant, it is assumed the circuit will apply a copy constraint on
         * `w2` to fix its value)
         *
         *
         */

        /**
         * Memory Record Check
         * Partial degree: 1
         * Total degree: 4
         *
         * A ROM/ROM access gate can be evaluated with the identity:
         *
         * qc + w1 \eta + w2 \eta_two + w3 \eta_three - w4 = 0
         *
         * For ROM gates, qc = 0
         */
        ap.memory_record_check = wire(p, WIRE.W_O) * tp.etaThree;
        ap.memory_record_check = ap.memory_record_check + (wire(p, WIRE.W_R) * tp.etaTwo);
        ap.memory_record_check = ap.memory_record_check + (wire(p, WIRE.W_L) * tp.eta);
        ap.memory_record_check = ap.memory_record_check + wire(p, WIRE.Q_C);
        ap.partial_record_check = ap.memory_record_check; // used in RAM consistency check; deg 1 or 4
        ap.memory_record_check = ap.memory_record_check - wire(p, WIRE.W_4);

        /**
         * Contribution 13 & 14
         * ROM Consistency Check
         * Partial degree: 1
         * Total degree: 4
         *
         * For every ROM read, a set equivalence check is applied between the record witnesses, and a second set of
         * records that are sorted.
         *
         * We apply the following checks for the sorted records:
         *
         * 1. w1, w2, w3 correctly map to 'index', 'v1, 'v2' for a given record value at w4
         * 2. index values for adjacent records are monotonically increasing
         * 3. if, at gate i, index_i == index_{i + 1}, then value1_i == value1_{i + 1} and value2_i == value2_{i + 1}
         *
         */
        ap.index_delta = wire(p, WIRE.W_L_SHIFT) - wire(p, WIRE.W_L);
        ap.record_delta = wire(p, WIRE.W_4_SHIFT) - wire(p, WIRE.W_4);

        ap.index_is_monotonically_increasing = ap.index_delta * ap.index_delta - ap.index_delta; // deg 2

        ap.adjacent_values_match_if_adjacent_indices_match =
            (ap.index_delta * MINUS_ONE + Fr.wrap(1)) * ap.record_delta; // deg 2

        evals[13] = ap.adjacent_values_match_if_adjacent_indices_match * (wire(p, WIRE.Q_L) * wire(p, WIRE.Q_R)) *
                    (wire(p, WIRE.Q_AUX) * domainSep); // deg 5
        evals[14] = ap.index_is_monotonically_increasing * (wire(p, WIRE.Q_L) * wire(p, WIRE.Q_R)) *
                    (wire(p, WIRE.Q_AUX) * domainSep); // deg 5

        ap.ROM_consistency_check_identity =
            ap.memory_record_check * (wire(p, WIRE.Q_L) * wire(p, WIRE.Q_R)); // deg 3 or 7

        /**
         * Contributions 15,16,17
         * RAM Consistency Check
         *
         * The 'access' type of the record is extracted with the expression `w_4 - ap.partial_record_check`
         * (i.e. for an honest Prover `w1 * eta + w2 * eta^2 + w3 * eta^3 - w4 = access`.
         * This is validated by requiring `access` to be boolean
         *
         * For two adjacent entries in the sorted list if _both_
         *  A) index values match
         *  B) adjacent access value is 0 (i.e. next gate is a READ)
         * then
         *  C) both values must match.
         * The gate boolean check is
         * (A && B) => C  === !(A && B) || C ===  !A || !B || C
         *
         * N.B. it is the responsibility of the circuit writer to ensure that every RAM cell is initialized
         * with a WRITE operation.
         */
        Fr access_type = (wire(p, WIRE.W_4) - ap.partial_record_check); // will be 0 or 1 for honest Prover; deg 1 or 4
        ap.access_check = access_type * access_type - access_type;      // check value is 0 or 1; deg 2 or 8

        // deg 1 or 4
        ap.next_gate_access_type = wire(p, WIRE.W_O_SHIFT) * tp.etaThree;
        ap.next_gate_access_type = ap.next_gate_access_type + (wire(p, WIRE.W_R_SHIFT) * tp.etaTwo);
        ap.next_gate_access_type = ap.next_gate_access_type + (wire(p, WIRE.W_L_SHIFT) * tp.eta);
        ap.next_gate_access_type = wire(p, WIRE.W_4_SHIFT) - ap.next_gate_access_type;

        Fr value_delta = wire(p, WIRE.W_O_SHIFT) - wire(p, WIRE.W_O);
        ap.adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation =
            (ap.index_delta * MINUS_ONE + Fr.wrap(1)) * value_delta *
            (ap.next_gate_access_type * MINUS_ONE + Fr.wrap(1)); // deg 3 or 6

        // We can't apply the RAM consistency check identity on the final entry in the sorted list (the wires in the
        // next gate would make the identity fail).  We need to validate that its 'access type' bool is correct. Can't
        // do  with an arithmetic gate because of the  `eta` factors. We need to check that the *next* gate's access
        // type is  correct, to cover this edge case
        // deg 2 or 4
        ap.next_gate_access_type_is_boolean =
            ap.next_gate_access_type * ap.next_gate_access_type - ap.next_gate_access_type;

        // Putting it all together...
        evals[15] = ap.adjacent_values_match_if_adjacent_indices_match_and_next_access_is_a_read_operation *
                    (wire(p, WIRE.Q_ARITH)) * (wire(p, WIRE.Q_AUX) * domainSep); // deg 5 or 8
        evals[16] =
            ap.index_is_monotonically_increasing * (wire(p, WIRE.Q_ARITH)) * (wire(p, WIRE.Q_AUX) * domainSep); // deg 4
        evals[17] = ap.next_gate_access_type_is_boolean * (wire(p, WIRE.Q_ARITH)) *
                    (wire(p, WIRE.Q_AUX) * domainSep); // deg 4 or 6

        ap.RAM_consistency_check_identity = ap.access_check * (wire(p, WIRE.Q_ARITH)); // deg 3 or 9

        /**
         * RAM Timestamp Consistency Check
         *
         * | w1 | w2 | w3 | w4 |
         * | index | timestamp | timestamp_check | -- |
         *
         * Let delta_index = index_{i + 1} - index_{i}
         *
         * Iff delta_index == 0, timestamp_check = timestamp_{i + 1} - timestamp_i
         * Else timestamp_check = 0
         */
        ap.timestamp_delta = wire(p, WIRE.W_R_SHIFT) - wire(p, WIRE.W_R);
        ap.RAM_timestamp_check_identity =
            (ap.index_delta * MINUS_ONE + Fr.wrap(1)) * ap.timestamp_delta - wire(p, WIRE.W_O); // deg 3

        /**
         * Complete Contribution 12
         * The complete RAM/ROM memory identity
         * Partial degree:
         */
        ap.memory_identity = ap.ROM_consistency_check_identity; // deg 3 or 6
        ap.memory_identity =
            ap.memory_identity + ap.RAM_timestamp_check_identity * (wire(p, WIRE.Q_4) * wire(p, WIRE.Q_L)); // deg 4
        ap.memory_identity =
            ap.memory_identity + ap.memory_record_check * (wire(p, WIRE.Q_M) * wire(p, WIRE.Q_L)); // deg 3 or 6
        ap.memory_identity = ap.memory_identity + ap.RAM_consistency_check_identity;               // deg 3 or 9

        // (deg 3 or 9) + (deg 4) + (deg 3)
        ap.auxiliary_identity = ap.memory_identity + non_native_field_identity + limb_accumulator_identity;
        ap.auxiliary_identity = ap.auxiliary_identity * (wire(p, WIRE.Q_AUX) * domainSep); // deg 4 or 10
        evals[12] = ap.auxiliary_identity;
    }

    struct PoseidonExternalParams {
        Fr s1;
        Fr s2;
        Fr s3;
        Fr s4;
        Fr u1;
        Fr u2;
        Fr u3;
        Fr u4;
        Fr t0;
        Fr t1;
        Fr t2;
        Fr t3;
        Fr v1;
        Fr v2;
        Fr v3;
        Fr v4;
        Fr q_pos_by_scaling;
    }

    function accumulatePoseidonExternalRelation(
        Fr[NUMBER_OF_ENTITIES] memory p,
        Transcript memory tp, // I think this is not needed
        Fr[NUMBER_OF_SUBRELATIONS] memory evals,
        Fr domainSep // i guess this is the scaling factor?
    ) internal pure {
        PoseidonExternalParams memory ep;

        ep.s1 = wire(p, WIRE.W_L) + wire(p, WIRE.Q_L);
        ep.s2 = wire(p, WIRE.W_R) + wire(p, WIRE.Q_R);
        ep.s3 = wire(p, WIRE.W_O) + wire(p, WIRE.Q_O);
        ep.s4 = wire(p, WIRE.W_4) + wire(p, WIRE.Q_4);

        ep.u1 = ep.s1 * ep.s1 * ep.s1 * ep.s1 * ep.s1;
        ep.u2 = ep.s2 * ep.s2 * ep.s2 * ep.s2 * ep.s2;
        ep.u3 = ep.s3 * ep.s3 * ep.s3 * ep.s3 * ep.s3;
        ep.u4 = ep.s4 * ep.s4 * ep.s4 * ep.s4 * ep.s4;
        // matrix mul v = M_E * u with 14 additions
        ep.t0 = ep.u1 + ep.u2; // u_1 + u_2
        ep.t1 = ep.u3 + ep.u4; // u_3 + u_4
        ep.t2 = ep.u2 + ep.u2 + ep.t1; // 2u_2
        // ep.t2 += ep.t1; // 2u_2 + u_3 + u_4
        ep.t3 = ep.u4 + ep.u4 + ep.t0; // 2u_4
        // ep.t3 += ep.t0; // u_1 + u_2 + 2u_4
        ep.v4 = ep.t1 + ep.t1;
        ep.v4 = ep.v4 + ep.v4 + ep.t3;
        // ep.v4 += ep.t3; // u_1 + u_2 + 4u_3 + 6u_4
        ep.v2 = ep.t0 + ep.t0;
        ep.v2 = ep.v2 + ep.v2 + ep.t2;
        // ep.v2 += ep.t2; // 4u_1 + 6u_2 + u_3 + u_4
        ep.v1 = ep.t3 + ep.v2; // 5u_1 + 7u_2 + u_3 + 3u_4
        ep.v3 = ep.t2 + ep.v4; // u_1 + 3u_2 + 5u_3 + 7u_4

        ep.q_pos_by_scaling = wire(p, WIRE.Q_POSEIDON2_EXTERNAL) * domainSep;
        evals[18] = evals[18] + ep.q_pos_by_scaling * (ep.v1 - wire(p, WIRE.W_L_SHIFT));

        evals[19] = evals[19] + ep.q_pos_by_scaling * (ep.v2 - wire(p, WIRE.W_R_SHIFT));

        evals[20] = evals[20] + ep.q_pos_by_scaling * (ep.v3 - wire(p, WIRE.W_O_SHIFT));

        evals[21] = evals[21] + ep.q_pos_by_scaling * (ep.v4 - wire(p, WIRE.W_4_SHIFT));
    }

    struct PoseidonInternalParams {
        Fr u1;
        Fr u2;
        Fr u3;
        Fr u4;
        Fr u_sum;
        Fr v1;
        Fr v2;
        Fr v3;
        Fr v4;
        Fr s1;
        Fr q_pos_by_scaling;
    }

    function accumulatePoseidonInternalRelation(
        Fr[NUMBER_OF_ENTITIES] memory p,
        Transcript memory tp, // I think this is not needed
        Fr[NUMBER_OF_SUBRELATIONS] memory evals,
        Fr domainSep // i guess this is the scaling factor?
    ) internal pure {
        PoseidonInternalParams memory ip;
        PoseidonParams memory params = PoseidonParamsLib.loadPoseidionParams();

        // add round constants
        ip.s1 = wire(p, WIRE.W_L) + wire(p, WIRE.Q_L);

        // apply s-box round
        ip.u1 = ip.s1 * ip.s1 * ip.s1 * ip.s1 * ip.s1;
        ip.u2 = wire(p, WIRE.W_R);
        ip.u3 = wire(p, WIRE.W_O);
        ip.u4 = wire(p, WIRE.W_4);

        // matrix mul with v = M_I * u 4 muls and 7 additions
        ip.u_sum = ip.u1 + ip.u2 + ip.u3 + ip.u4;

        ip.q_pos_by_scaling = wire(p, WIRE.Q_POSEIDON2_INTERNAL) * domainSep;

        ip.v1 = ip.u1 * params.internal_matrix_diagonal[0] + ip.u_sum;
        evals[22] = evals[22] + ip.q_pos_by_scaling * (ip.v1 - wire(p, WIRE.W_L_SHIFT));

        ip.v2 = ip.u2 * params.internal_matrix_diagonal[1] + ip.u_sum;
        evals[23] = evals[23] + ip.q_pos_by_scaling * (ip.v2 - wire(p, WIRE.W_R_SHIFT));

        ip.v3 = ip.u3 * params.internal_matrix_diagonal[2] + ip.u_sum;
        evals[24] = evals[24] + ip.q_pos_by_scaling * (ip.v3 - wire(p, WIRE.W_O_SHIFT));

        ip.v4 = ip.u4 * params.internal_matrix_diagonal[3] + ip.u_sum;
        evals[25] = evals[25] + ip.q_pos_by_scaling * (ip.v4 - wire(p, WIRE.W_4_SHIFT));
    }

    function scaleAndBatchSubrelations(
        Fr[NUMBER_OF_SUBRELATIONS] memory evaluations,
        Fr[NUMBER_OF_ALPHAS] memory subrelationChallenges
    ) internal pure returns (Fr accumulator) {
        accumulator = accumulator + evaluations[0];

        for (uint256 i = 1; i < NUMBER_OF_SUBRELATIONS; ++i) {
            accumulator = accumulator + evaluations[i] * subrelationChallenges[i - 1];
        }
    }
}

// Errors
error PublicInputsLengthWrong();
error SumcheckFailed();
error ZeromorphFailed();

interface IVerifier {
    function verify(bytes calldata _proof, bytes32[] calldata _publicInputs) external view returns (bool);
}

// Smart contract verifier of honk proofs
contract HonkVerifier is IVerifier
{

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) public view override returns (bool) {
        Honk.VerificationKey memory vk = loadVerificationKey();
        Honk.Proof memory p = loadProof(proof);

        if (publicInputs.length != vk.publicInputsSize) {
            revert PublicInputsLengthWrong();
        }

        // Generate the fiat shamir challenges for the whole protocol
        Transcript memory t = TranscriptLib.generateTranscript(p, vk, publicInputs);

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
        return HonkVerificationKey.loadVerificationKey();
    }

    // TODO: mod q proof points
    // TODO: Preprocess all of the memory locations
    // TODO: Adjust proof point serde away from poseidon forced field elements
    function loadProof(bytes calldata proof) internal view returns (Honk.Proof memory) {
        Honk.Proof memory p;

        // Metadata
        p.circuitSize = uint256(bytes32(proof[0x00:0x20]));
        p.publicInputsSize = uint256(bytes32(proof[0x20:0x40]));
        p.publicInputsOffset = uint256(bytes32(proof[0x40:0x60]));

        // Commitments
        p.w1 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x60:0x80])),
            x_1: uint256(bytes32(proof[0x80:0xa0])),
            y_0: uint256(bytes32(proof[0xa0:0xc0])),
            y_1: uint256(bytes32(proof[0xc0:0xe0]))
        });

        p.w2 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0xe0:0x100])),
            x_1: uint256(bytes32(proof[0x100:0x120])),
            y_0: uint256(bytes32(proof[0x120:0x140])),
            y_1: uint256(bytes32(proof[0x140:0x160]))
        });
        p.w3 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x160:0x180])),
            x_1: uint256(bytes32(proof[0x180:0x1a0])),
            y_0: uint256(bytes32(proof[0x1a0:0x1c0])),
            y_1: uint256(bytes32(proof[0x1c0:0x1e0]))
        });

        // Lookup / Permutation Helper Commitments
        p.lookupReadCounts = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x1e0:0x200])),
            x_1: uint256(bytes32(proof[0x200:0x220])),
            y_0: uint256(bytes32(proof[0x220:0x240])),
            y_1: uint256(bytes32(proof[0x240:0x260]))
        });
        p.lookupReadTags = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x260:0x280])),
            x_1: uint256(bytes32(proof[0x280:0x2a0])),
            y_0: uint256(bytes32(proof[0x2a0:0x2c0])),
            y_1: uint256(bytes32(proof[0x2c0:0x2e0]))
        });
        p.w4 = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x2e0:0x300])),
            x_1: uint256(bytes32(proof[0x300:0x320])),
            y_0: uint256(bytes32(proof[0x320:0x340])),
            y_1: uint256(bytes32(proof[0x340:0x360]))
        });
        p.lookupInverses = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x360:0x380])),
            x_1: uint256(bytes32(proof[0x380:0x3a0])),
            y_0: uint256(bytes32(proof[0x3a0:0x3c0])),
            y_1: uint256(bytes32(proof[0x3c0:0x3e0]))
        });
        p.zPerm = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[0x3e0:0x400])),
            x_1: uint256(bytes32(proof[0x400:0x420])),
            y_0: uint256(bytes32(proof[0x420:0x440])),
            y_1: uint256(bytes32(proof[0x440:0x460]))
        });

        // TEMP the boundary of what has already been read
        uint256 boundary = 0x460;

        // Sumcheck univariates
        // TODO: in this case we know what log_n is - so we hard code it, we would want this to be included in
        // a cpp template for different circuit sizes
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            // The loop boundary of i, this will shift forward on each evaluation
            uint256 loop_boundary = boundary + (i * 0x20 * BATCHED_RELATION_PARTIAL_LENGTH);

            for (uint256 j = 0; j < BATCHED_RELATION_PARTIAL_LENGTH; j++) {
                uint256 start = loop_boundary + (j * 0x20);
                uint256 end = start + 0x20;
                p.sumcheckUnivariates[i][j] = FrLib.fromBytes32(bytes32(proof[start:end]));
            }
        }

        boundary = boundary + (CONST_PROOF_SIZE_LOG_N * BATCHED_RELATION_PARTIAL_LENGTH * 0x20);
        // Sumcheck evaluations
        for (uint256 i = 0; i < NUMBER_OF_ENTITIES; i++) {
            uint256 start = boundary + (i * 0x20);
            uint256 end = start + 0x20;
            p.sumcheckEvaluations[i] = FrLib.fromBytes32(bytes32(proof[start:end]));
        }

        boundary = boundary + (NUMBER_OF_ENTITIES * 0x20);
        // Zero morph Commitments
        for (uint256 i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
            // Explicitly stating the x0, x1, y0, y1 start and end boundaries to make the calldata slicing bearable
            uint256 xStart = boundary + (i * 0x80);
            uint256 xEnd = xStart + 0x20;

            uint256 x1Start = xEnd;
            uint256 x1End = x1Start + 0x20;

            uint256 yStart = x1End;
            uint256 yEnd = yStart + 0x20;

            uint256 y1Start = yEnd;
            uint256 y1End = y1Start + 0x20;

            p.zmCqs[i] = Honk.G1ProofPoint({
                x_0: uint256(bytes32(proof[xStart:xEnd])),
                x_1: uint256(bytes32(proof[x1Start:x1End])),
                y_0: uint256(bytes32(proof[yStart:yEnd])),
                y_1: uint256(bytes32(proof[y1Start:y1End]))
            });
        }

        boundary = boundary + (CONST_PROOF_SIZE_LOG_N * 0x80);

        p.zmCq = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary:boundary + 0x20])),
            x_1: uint256(bytes32(proof[boundary + 0x20:boundary + 0x40])),
            y_0: uint256(bytes32(proof[boundary + 0x40:boundary + 0x60])),
            y_1: uint256(bytes32(proof[boundary + 0x60:boundary + 0x80]))
        });

        p.zmPi = Honk.G1ProofPoint({
            x_0: uint256(bytes32(proof[boundary + 0x80:boundary + 0xa0])),
            x_1: uint256(bytes32(proof[boundary + 0xa0:boundary + 0xc0])),
            y_0: uint256(bytes32(proof[boundary + 0xc0:boundary + 0xe0])),
            y_1: uint256(bytes32(proof[boundary + 0xe0:boundary + 0x100]))
        });

        return p;
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

    function pairing(Honk.G1Point memory rhs, Honk.G1Point memory lhs) internal view returns(bool)
    {
        bytes memory input =
            abi.encodePacked(rhs.x,
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
                             uint256(0x22febda3c0c0632a56475b4214e5615e11e6dd3f96e6cea2854a87d4dacc5e55));

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
)";

inline std::string get_honk_solidity_verifier(auto const& verification_key)
{
    std::ostringstream stream;
    output_vk_sol_ultra_honk(stream, verification_key, "HonkVerificationKey");
    return stream.str() + HONK_CONTRACT_SOURCE;
}