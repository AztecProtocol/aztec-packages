// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {TestBase} from "test/base/TestBase.sol";
import {DifferentialFuzzer} from "test/base/DifferentialFuzzer.sol";
import {IVerifier} from "src/interfaces/IVerifier.sol";

import {Errors} from "src/honk/Errors.sol";

/**
 * @title NegativeTestBase
 * @notice Abstract base class for negative tests on non-ZK Honk verifiers
 *
 * @dev Provides common test infrastructure and attack vectors for:
 * - Standard Blake Honk verifier (BaseHonkVerifier)
 * - Optimized Blake Honk verifier (BlakeOptHonkVerifier)
 *
 * SECURITY OBSERVATION:
 * Both verifiers reject the point at infinity (0,0) at the input boundary:
 * - Standard: bytesToG1Point checks (x | y) != 0 during deserialization
 * - Optimized: inline point-at-infinity check after calldatacopy
 *
 * On-curve validation (y² = x³ + 3) is delegated to the ecAdd/ecMul precompiles
 * per EIP-196. Off-curve points that pass the (0,0) check are caught when
 * precompile operations fail, or indirectly via transcript corruption → SumcheckFailed.
 *
 * Test categories:
 * 1. Basic validation (proof length, public inputs length)
 * 2. Sumcheck failures (round check, final check)
 * 3. Point validation (point-at-infinity + off-curve via precompiles)
 * 4. Shplemini/pairing failures
 * 5. Q+1 attacks (field modulus aliasing)
 * 6. Pairing point limb overflow
 * 7. Field element >= P attacks
 *
 *
 * Note on gas:
 * We pass "only" 15M gas, since the pre-compile failure will consume remaining gas for the call
 * and with "infinite" gas available that makes it possible to reach the following error (for example
 * failing shplimini that is directly dependent on the pre-compile [so also correct] but the potential for
 * multiple different errors here is painful for test).
 */
abstract contract NegativeTestBase is TestBase {
    IVerifier public verifier;
    DifferentialFuzzer public fuzzer;
    uint256 public PUBLIC_INPUT_COUNT;

    bytes internal cachedProof;
    bytes32[] internal cachedPublicInputs;

    // BN254 curve field modulus (for EC points)
    uint256 constant Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // BN254 scalar field modulus (for Fr elements)
    uint256 constant P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Blake circuit has LOG_N = 15
    uint256 constant LOG_N = 15;

    // Non-ZK proof structure offsets (from proof start)
    // Pairing points: 8 limbs × 32 bytes = 256 bytes at offset 0
    uint256 constant PAIRING_POINTS_OFFSET = 0;
    uint256 constant PAIRING_POINTS_SIZE = 256;

    // Witness commitments start after pairing points (8 commitments × 64 bytes each)
    // Serialization order: w1, w2, w3, lookupReadCounts, lookupReadTags, w4, lookupInverses, zPerm
    uint256 constant W_L_OFFSET = 256;
    uint256 constant W_R_OFFSET = 320;
    uint256 constant W_O_OFFSET = 384;

    // Each G1 point is 64 bytes (x, y)
    uint256 constant G1_POINT_SIZE = 64;

    /*//////////////////////////////////////////////////////////////
                        VIRTUAL FUNCTIONS - OVERRIDE THESE
    //////////////////////////////////////////////////////////////*/

    /// @notice Create the verifier instance
    function _createVerifier() internal virtual returns (IVerifier);

    /*//////////////////////////////////////////////////////////////
                              SETUP
    //////////////////////////////////////////////////////////////*/

    function setUp() public virtual {
        fuzzer = new DifferentialFuzzer().with_flavor(DifferentialFuzzer.Flavor.Honk);
        fuzzer = fuzzer.with_circuit_type(DifferentialFuzzer.CircuitType.Blake);

        verifier = _createVerifier();

        PUBLIC_INPUT_COUNT = 4;

        uint256[] memory defaultInputs = new uint256[](4);
        defaultInputs[0] = 0x0000000000000000000000000000000000000000000000000000000000000001;
        defaultInputs[1] = 0x0000000000000000000000000000000000000000000000000000000000000002;
        defaultInputs[2] = 0x0000000000000000000000000000000000000000000000000000000000000003;
        defaultInputs[3] = 0x0000000000000000000000000000000000000000000000000000000000000004;

        fuzzer = fuzzer.with_inputs(defaultInputs);

        bytes memory proofData = fuzzer.generate_proof();
        (cachedPublicInputs, cachedProof) = splitProofHonk(proofData, PUBLIC_INPUT_COUNT);
    }

    /*//////////////////////////////////////////////////////////////
                          HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Helper to modify a G1 point in the proof
    function setG1Point(bytes memory proof, uint256 offset, uint256 x, uint256 y) internal pure {
        assembly {
            mstore(add(add(proof, 0x20), offset), x)
            mstore(add(add(proof, 0x20), add(offset, 32)), y)
        }
    }

    /// @notice Helper to modify a single 32-byte value in the proof
    function setValue(bytes memory proof, uint256 offset, uint256 value) internal pure {
        assembly {
            mstore(add(add(proof, 0x20), offset), value)
        }
    }

    /// @notice Helper to read a 32-byte value from the proof
    function getValue(bytes memory proof, uint256 offset) internal pure returns (uint256 value) {
        assembly {
            value := mload(add(add(proof, 0x20), offset))
        }
    }

    /// @notice Copy cached proof to avoid mutation across tests
    function copyProof() internal view returns (bytes memory) {
        return cachedProof;
    }

    /*//////////////////////////////////////////////////////////////
                           SANITY CHECK
    //////////////////////////////////////////////////////////////*/

    function test_ValidProof() public {
        assertTrue(verifier.verify{gas: 15_000_000}(cachedProof, cachedPublicInputs), "Valid proof should verify");
    }

    /*//////////////////////////////////////////////////////////////
                        BASIC VALIDATION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_InvalidProofLength(uint256 _size) public virtual {
        uint256 expectedLength = cachedProof.length;
        uint256 size = bound(_size, 0, expectedLength * 2);
        vm.assume(size != expectedLength);

        bytes memory proof = new bytes(size);

        vm.expectRevert(
            abi.encodeWithSelector(Errors.ProofLengthWrongWithLogN.selector, LOG_N, size, cachedProof.length)
        );
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    function test_InvalidPublicInputsLength(uint256 _size) public virtual {
        uint256 size = bound(_size, 0, cachedPublicInputs.length * 2);
        vm.assume(size != cachedPublicInputs.length);

        bytes32[] memory publicInputs = new bytes32[](size);

        vm.expectRevert(Errors.PublicInputsLengthWrong.selector);
        verifier.verify{gas: 15_000_000}(cachedProof, publicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                          SUMCHECK FAILURES
    //////////////////////////////////////////////////////////////*/

    // Sumcheck verifies that polynomial evaluations are consistent.
    // Two failure modes: round check (univariate consistency) and final check (evaluation match).

    /// @notice Corrupt sumcheck univariate - triggers round check failure
    /// @dev Each round, the verifier checks: univariate(0) + univariate(1) = previous_sum
    ///      Corrupting a univariate coefficient breaks this invariant.
    function testRevertSumcheckFailedRoundCheck() public virtual {
        bytes memory proof = copyProof();

        // sumcheckUnivariates start after witness commitments (8 * 64 = 512 bytes after pairing points)
        uint256 univariateOffset = PAIRING_POINTS_SIZE + (8 * G1_POINT_SIZE);

        assembly {
            let loc := add(add(proof, 0x20), univariateOffset)
            mstore(loc, add(mload(loc), 1))
        }

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Corrupt sumcheck evaluation - triggers final check failure
    /// @dev After all rounds, verifier checks evaluations match claimed polynomial values.
    ///      Corrupting an evaluation breaks the final consistency check.
    function testRevertSumcheckFailedFinalCheck() public virtual {
        bytes memory proof = copyProof();

        // Work backwards: kzg_w(64) + shplonk_q(64) + gemini_evals(LOG_N*32) + gemini_comms((LOG_N-1)*64)
        uint256 evalsEndOffset = proof.length - 64 - 64 - LOG_N * 32 - (LOG_N - 1) * 64;
        uint256 lastEvalOffset = evalsEndOffset - 32;

        assembly {
            let loc := add(add(proof, 0x20), lastEvalOffset)
            mstore(loc, add(mload(loc), 1))
        }

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    POINT VALIDATION - OFF-CURVE REJECTION
    //////////////////////////////////////////////////////////////*/

    // Off-curve points (with coordinates < Q and not (0,0)) pass input validation.
    // They are caught downstream by EVM precompile rejection (ecAdd/ecMul per EIP-196)
    // or indirectly via transcript corruption causing SumcheckFailed.
    //
    // - Transcript points (W_L, etc.): wrong challenges → SumcheckFailed
    // - Non-transcript points (kzgQuotient, shplonkQ, geminiFoldComm):
    //   precompile rejects off-curve input → empty revert

    /// @notice Off-curve kzgQuotient - precompile rejects during Shplemini
    /// @dev kzgQuotient is NOT in the Fiat-Shamir transcript, so sumcheck
    ///      passes with correct challenges. The ecMul precompile rejects the
    ///      off-curve point during Shplemini verification.
    function test_OffCurve_KzgQuotient() public virtual {
        bytes memory proof = copyProof();
        uint256 xOffset = proof.length - 64;
        uint256 y = getValue(proof, xOffset + 32);
        // +7 breaks the curve equation while staying < Q
        setValue(proof, xOffset + 32, y + 7);

        // Precompile rejection, but because there is gas leftover and this value is used
        // right after the revert, the 1/64 of gas left is sufficient to give us that error
        // instead...
        vm.expectRevert(Errors.ShpleminiFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Off-curve W_L - caught via transcript corruption
    /// @dev W_L is hashed into the transcript to derive the eta challenge.
    ///      Corrupting its y-coordinate changes all downstream challenges,
    ///      causing sumcheck to fail before any EC operation touches W_L.
    function test_OffCurve_WL() public virtual {
        bytes memory proof = copyProof();
        uint256 y = getValue(proof, W_L_OFFSET + 32);
        // +7 breaks the curve equation while staying < Q
        setValue(proof, W_L_OFFSET + 32, y + 7);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Off-curve shplonkQ - precompile rejects during Shplemini
    /// @dev shplonkQ is NOT in the transcript. The ecMul precompile rejects it.
    function test_OffCurve_ShplonkQ() public virtual {
        bytes memory proof = copyProof();
        uint256 xOffset = proof.length - 128;
        uint256 y = getValue(proof, xOffset + 32);
        setValue(proof, xOffset + 32, y + 7);

        // Precompile rejection: revert(0, 0) → empty revert data
        vm.expectRevert(bytes(""));
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Off-curve gemini fold commitment - precompile rejects during Shplemini
    /// @dev Gemini fold commitments are hashed for gemini_r AFTER sumcheck passes.
    ///      The keccak256 hash works fine on raw bytes, but the subsequent ecMul
    ///      precompile rejects the off-curve point.
    function test_OffCurve_GeminiFoldComm() public virtual {
        bytes memory proof = copyProof();
        // Last gemini fold comm y offset
        uint256 geminiFoldYOffset = proof.length - 64 - 64 - LOG_N * 32 - 32;
        uint256 y = getValue(proof, geminiFoldYOffset);
        setValue(proof, geminiFoldYOffset, y + 7);

        // Precompile rejection: revert(0, 0) → empty revert data
        vm.expectRevert(bytes(""));
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    SHPLEMINI / PAIRING FAILURES
    //////////////////////////////////////////////////////////////*/

    // Shplemini is the polynomial commitment verification step.
    // Different proof elements cause different failure modes depending on
    // whether they affect the transcript (challenges) or not.

    /// @notice Corrupt witness commitment - fails at SUMCHECK, not Shplemini
    /// @dev KEY INSIGHT: Witness commitments are hashed into transcript.
    ///      Corrupting them changes challenges, failing sumcheck BEFORE pairing.
    ///      This documents the verification order dependency.
    function testRevertSumcheckFailedWitnessCommitment() public virtual {
        bytes memory proof = copyProof();

        // Negate W_L's y-coordinate (point negation is still on curve but wrong)
        uint256 y = getValue(proof, W_L_OFFSET + 32);
        setValue(proof, W_L_OFFSET + 32, Q - y);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Corrupt gemini fold commitment - fails at Shplemini
    /// @dev Gemini commitments are NOT in transcript, so challenges unaffected.
    ///      The pairing check fails because commitment doesn't match.
    function testRevertShpleminiFailedGeminiFoldComm() public virtual {
        bytes memory proof = copyProof();

        // Last gemini fold comm y offset
        uint256 geminiFoldYOffset = proof.length - 64 - 64 - LOG_N * 32 - 32;

        uint256 y = getValue(proof, geminiFoldYOffset);
        setValue(proof, geminiFoldYOffset, Q - y);

        vm.expectRevert(Errors.ShpleminiFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Replace kzgQuotient with valid but wrong point - fails at pairing
    /// @dev Adds generator G=(1,2) to the original kzgQuotient.
    ///      Result is still on-curve (passes on-curve check) but wrong value.
    ///      This tests the actual pairing equation: e(P, Q) = e(R, S) fails.
    function testRevertShpleminiFailedPairing() public virtual {
        bytes memory proof = copyProof();

        uint256 xOffset = proof.length - 64;
        uint256 yOffset = proof.length - 32;

        uint256 px = getValue(proof, xOffset);
        uint256 py = getValue(proof, yOffset);

        // Add generator G = (1, 2) using ecAdd precompile
        uint256 rx;
        uint256 ry;
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, px)
            mstore(add(ptr, 0x20), py)
            mstore(add(ptr, 0x40), 1)
            mstore(add(ptr, 0x60), 2)
            if iszero(staticcall(gas(), 0x06, ptr, 0x80, ptr, 0x40)) { revert(0, 0) }
            rx := mload(ptr)
            ry := mload(add(ptr, 0x20))
        }

        setG1Point(proof, xOffset, rx, ry);

        vm.expectRevert(Errors.ShpleminiFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    POINT OF INFINITY (0,0) INJECTION
    //////////////////////////////////////////////////////////////*/

    // ATTACK VECTOR: Point of Infinity Injection
    //
    // EVM precompiles silently treat (0,0) as the identity element instead of reverting.
    // This could zero out commitments and allow a forged proof to pass.
    //
    // Both verifiers explicitly reject (0,0) at the input boundary:
    // - Standard: bytesToG1Point checks (x | y) != 0
    // - Optimized: inline point-at-infinity check after calldatacopy
    // This catches (0,0) with PointAtInfinity before any computation begins.

    /// @notice (0,0) in W_L - caught by point-at-infinity check at deserialization
    function test_PointOfInfinity_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, 0, 0);

        vm.expectRevert(Errors.PointAtInfinity.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice (0,0) in W_R - caught by point-at-infinity check at deserialization
    function test_PointOfInfinity_WR() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_R_OFFSET, 0, 0);

        vm.expectRevert(Errors.PointAtInfinity.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice (0,0) in W_O - caught by point-at-infinity check at deserialization
    function test_PointOfInfinity_WO() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_O_OFFSET, 0, 0);

        vm.expectRevert(Errors.PointAtInfinity.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice (0,0) in kzgQuotient - caught by point-at-infinity check
    function test_PointOfInfinity_KzgQuotient() public virtual {
        bytes memory proof = copyProof();
        uint256 xOffset = proof.length - 64;
        setG1Point(proof, xOffset, 0, 0);

        vm.expectRevert(Errors.PointAtInfinity.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice (0,0) in shplonkQ - caught by point-at-infinity check
    function test_PointOfInfinity_ShplonkQ() public virtual {
        bytes memory proof = copyProof();
        uint256 xOffset = proof.length - 128;
        setG1Point(proof, xOffset, 0, 0);

        vm.expectRevert(Errors.PointAtInfinity.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice (0,0) in pairing points - no explicit check, caught via computation
    function test_PointOfInfinity_PairingPoint() public virtual {
        bytes memory proof = copyProof();

        for (uint256 i = 0; i < 8; i++) {
            setValue(proof, PAIRING_POINTS_OFFSET + i * 32, 0);
        }

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    Q+1 ATTACKS (FIELD MODULUS ALIASING)
    //////////////////////////////////////////////////////////////*/

    // ATTACK VECTOR: Field modulus aliasing
    //
    // Without validation, the BN254 curve field modulus Q would cause values >= Q
    // to reduce via % Q. E.g., (Q+1, 2) would become (1, 2) - the generator point.
    // This is a valid curve point, so it would pass on-curve checks.
    //
    // Security property tested: The verifier explicitly checks all point coordinates
    // are < Q and rejects with ValueGeGroupOrder BEFORE any reduction or EC operation.
    // This prevents attackers from using non-canonical representations.
    //
    // We test multiple witness wires (W_L, W_R, W_O) to ensure all commitment
    // positions are properly validated at the input boundary.

    /// @notice Q+1 attack on W_L - tests left wire commitment validation
    /// @dev (Q+1, 2) would reduce to (1, 2) - the generator point - but the verifier
    ///      rejects with ValueGeGroupOrder before any reduction occurs.
    function test_QPlusOne_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Q+1 attack on W_R - tests right wire commitment validation
    function test_QPlusOne_WR() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_R_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Q+1 attack on W_O - tests output wire commitment validation
    function test_QPlusOne_WO() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_O_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Q+1 in kzgQuotient - tests non-transcript commitment validation
    /// @dev kzgQuotient is NOT hashed into the transcript, but the explicit >= Q check
    ///      catches it at the input boundary just like transcript commitments.
    function test_QPlusOne_KzgQuotient() public virtual {
        bytes memory proof = copyProof();
        uint256 xOffset = proof.length - 64;
        setG1Point(proof, xOffset, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice 2Q attack - tests values well beyond modulus boundary
    function test_TwoQ_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, 2 * Q, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Exact Q attack - tests boundary case
    /// @dev (Q, 2) would reduce to (0, 2) but is caught by ValueGeGroupOrder at exact boundary.
    function test_ExactQ_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, Q, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Y-coordinate aliasing - tests both x and y are checked against Q
    function test_YCoordinateExactQ() public virtual {
        bytes memory proof = copyProof();
        uint256 originalX = getValue(proof, W_L_OFFSET);
        setG1Point(proof, W_L_OFFSET, originalX, Q);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Maximum uint256 attack - tests extreme value handling
    function test_MaxUint256Coordinate() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, type(uint256).max, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    PAIRING POINT LIMB OVERFLOW
    //////////////////////////////////////////////////////////////*/

    // SECURITY OBSERVATION: Pairing Point Representation
    //
    // Pairing points use 136-bit limb encoding: 2 limbs per field element (lo, hi).
    // Reconstruction: value = lo | (hi << 136)
    // 4 coordinates (P0.x, P0.y, P1.x, P1.y) = 8 meaningful limbs (indices 0-7).
    //
    // Differentiated validation: lo limbs (even indices) < 2^136, hi limbs (odd indices) < 2^120.
    // This ensures reconstructed coordinates cannot exceed ~2^256 and stay within valid range.
    // Values exceeding their respective bounds are rejected with ValueGeLimbMax error.
    // Valid but corrupted limbs flow through and are caught via sumcheck failure.

    /// @notice Bit 136 overflow - first invalid bit position
    /// @dev Valid limbs use bits 0-135. Bit 136 overflows the limb boundary.
    function test_PairingLimbOverflow_Limb0Bit136() public virtual {
        bytes memory proof = copyProof();
        uint256 malformedLimb = 1 << 136;
        setValue(proof, PAIRING_POINTS_OFFSET, malformedLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Maximum uint256 - extreme overflow across all bit positions
    function test_PairingLimbOverflow_MaxUint256() public virtual {
        bytes memory proof = copyProof();
        setValue(proof, PAIRING_POINTS_OFFSET, type(uint256).max);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Hi limb corruption - tests second limb of first coordinate (P0.x_hi)
    /// @dev With 2-limb encoding, offset 32 is the hi limb of P0.x.
    ///      A corrupted value < 2^136 passes limb validation but produces wrong reconstruction.
    function test_PairingLimbTruncation_HiLimb() public virtual {
        bytes memory proof = copyProof();
        uint256 hiLimbOffset = PAIRING_POINTS_OFFSET + 32;
        uint256 truncatingValue = 1 << 52;
        setValue(proof, hiLimbOffset, truncatingValue);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Cross-limb bit collision - set bit 136 in lo limb to overflow into hi limb's space
    /// @dev With 136-bit limbs, bit 136 in the lo limb (index 0) overlaps with bit 0 of
    ///      the hi limb (index 1). This creates the same reconstructed value as adding 1
    ///      to the hi limb, but with a non-canonical representation.
    ///      Now caught by explicit limb validation (>= 2^136).
    function test_PairingLimbOverlap() public virtual {
        bytes memory proof = copyProof();

        // Read original lo limb and set bit 136 (overflows into hi limb's space)
        uint256 limb0 = getValue(proof, PAIRING_POINTS_OFFSET);
        uint256 newLimb0 = limb0 | (1 << 136);

        setValue(proof, PAIRING_POINTS_OFFSET, newLimb0);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice All 8 meaningful limbs overflowing - comprehensive corruption
    /// @dev Sets all limbs used by convertPairingPointsToG1 to >= 2^136
    function test_PairingLimbs_AllOverflowing() public virtual {
        bytes memory proof = copyProof();
        for (uint256 i = 0; i < 8; i++) {
            setValue(proof, PAIRING_POINTS_OFFSET + i * 32, 1 << 136);
        }

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Hi limb >= 2^120 but < 2^136 - tests differentiated limb bounds
    /// @dev Hi limbs (odd indices: 1,3,5,7) are the upper 120 bits of each coordinate.
    ///      A value >= 2^120 would pass the old uniform 2^136 check but is now rejected.
    ///      This validates that lo limbs use 136-bit bound and hi limbs use 120-bit bound.
    function test_PairingHiLimbOverflow_Bit120() public virtual {
        bytes memory proof = copyProof();

        // Hi limb of P0.x is at index 1 (offset 32)
        uint256 hiLimbOffset = PAIRING_POINTS_OFFSET + 32;
        uint256 malformedHiLimb = 1 << 120; // exactly 2^120, valid under old 2^136 check
        setValue(proof, hiLimbOffset, malformedHiLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Hi limb just below 2^136 - tests that the tighter bound catches it
    /// @dev 2^136 - 1 is valid under old check but >> 2^120 so caught by new check
    function test_PairingHiLimbOverflow_Max136() public virtual {
        bytes memory proof = copyProof();

        // Hi limb of P0.y is at index 3 (offset 96)
        uint256 hiLimbOffset = PAIRING_POINTS_OFFSET + 96;
        uint256 malformedHiLimb = (1 << 136) - 1; // max valid under old check
        setValue(proof, hiLimbOffset, malformedHiLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Lo limb just below 2^136 - should still be accepted (caught later by sumcheck)
    /// @dev Validates that lo limbs retain the full 136-bit range
    function test_PairingLoLimbMaxValid() public virtual {
        bytes memory proof = copyProof();

        // Lo limb of P0.x is at index 0 (offset 0)
        uint256 loLimbOffset = PAIRING_POINTS_OFFSET;
        uint256 maxLoLimb = (1 << 136) - 1; // max valid lo limb
        setValue(proof, loLimbOffset, maxLoLimb);

        // Should pass limb validation but fail somewhere in sumcheck (not ValueGeLimbMax)
        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice All hi limbs at 2^120 - comprehensive check of all 4 hi limb positions
    function test_PairingHiLimbOverflow_AllHiLimbs() public virtual {
        bytes memory proof = copyProof();

        uint256 malformedHiLimb = 1 << 120;
        // Hi limbs are at odd indices: 1, 3, 5, 7 (offsets 32, 96, 160, 224)
        setValue(proof, PAIRING_POINTS_OFFSET + 32, malformedHiLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 96, malformedHiLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 160, malformedHiLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 224, malformedHiLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Field aliasing + limb attack combined
    /// @dev Q ≈ 2^254 >> 2^136, so all limbs fail the limb validation check
    function test_PairingLimbs_AllQPlusOne() public virtual {
        bytes memory proof = copyProof();
        for (uint256 i = 0; i < 8; i++) {
            setValue(proof, PAIRING_POINTS_OFFSET + i * 32, Q + 1);
        }

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
            PAIRING POINT RECONSTRUCTED COORDINATE >= Q
    //////////////////////////////////////////////////////////////*/

    // ATTACK VECTOR: Limb-level aliasing
    //
    // Individual limbs can pass their bounds (lo < 2^136, hi < 2^120) while
    // the reconstructed coordinate lo | (hi << 136) >= Q.
    //
    // An explicit < Q check exists in convertPairingPointsToG1 (defense-in-depth against
    // a malicious prover using non-canonical coordinates). However, since the pairing point
    // limbs are hashed into the eta challenge BEFORE sumcheck, mutating limbs in an existing
    // proof always corrupts the transcript first - causing SumcheckFailed before we reach
    // the reconstruction check. These tests document that rejection path.
    //
    // Q >> 136 ≈ 2^118 which is well under 2^120, so a hi limb of (Q >> 136) + 1
    // passes the hi limb check but pushes the reconstructed coordinate above Q.

    /// @notice Reconstructed P0.x >= Q - caught by sumcheck (transcript corruption)
    /// @dev hi = (Q >> 136) + 1 is ~118 bits (passes < 2^120 check), lo = 0.
    ///      Reconstructed value = ((Q >> 136) + 1) << 136 > Q.
    ///      The modified limb changes the eta challenge, so sumcheck fails before
    ///      the explicit < Q check in convertPairingPointsToG1 is reached.
    function test_PairingReconstructedCoordGeQ() public virtual {
        bytes memory proof = copyProof();

        // Set P0.x: lo = 0 (index 0), hi = (Q >> 136) + 1 (index 1)
        uint256 hiLimb = (Q >> 136) + 1;
        setValue(proof, PAIRING_POINTS_OFFSET, 0); // lo
        setValue(proof, PAIRING_POINTS_OFFSET + 32, hiLimb); // hi

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Reconstructed P0.x just above Q - minimal overflow
    /// @dev Uses exact Q >> 136 as hi limb with lo chosen to push total just past Q.
    ///      Same transcript corruption path as above - sumcheck fails first.
    function test_PairingReconstructedCoordJustAboveQ() public virtual {
        bytes memory proof = copyProof();

        uint256 hiLimb = Q >> 136;
        // Remainder: Q - (hiLimb << 136). Adding 1 to lo pushes total to Q + 1.
        uint256 loLimb = Q - (hiLimb << 136) + 1;

        setValue(proof, PAIRING_POINTS_OFFSET, loLimb); // lo
        setValue(proof, PAIRING_POINTS_OFFSET + 32, hiLimb); // hi

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    FIELD ELEMENT >= P ATTACKS
    //////////////////////////////////////////////////////////////*/

    // ATTACK VECTOR: Scalar Field Modulus Aliasing
    //
    // Field elements (Fr) use scalar field modulus P (different from curve field Q).
    // Values >= P get reduced via % P. Like Q+1 attacks on curve points,
    // these are sanitized but still cause proof rejection.

    /// @notice Public input value >= P - tests input validation
    /// @dev Sets first public input to P+1. Behavior differs by verifier:
    ///      - Standard: FrLib.fromBytes32 reduces P+1 → 1, but transcript hashes
    ///        the raw value P+1, causing challenge mismatch → sumcheck failure.
    ///      - Optimized: Explicit check (input < p) → PUBLIC_INPUT_TOO_LARGE.
    function test_PublicInputGreaterThanP() public virtual {
        bytes32[] memory publicInputs = new bytes32[](cachedPublicInputs.length);
        for (uint256 i = 0; i < cachedPublicInputs.length; i++) {
            publicInputs[i] = cachedPublicInputs[i];
        }
        // Set first public input to P + 1 (valid uint256, but >= scalar field modulus)
        publicInputs[0] = bytes32(P + 1);

        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        verifier.verify{gas: 15_000_000}(cachedProof, publicInputs);
    }

    /// @notice P+1 in sumcheck evaluation - tests Fr sanitization
    /// @dev Targets QM polynomial evaluation. P+1 % P = 1.
    function test_EvaluationGreaterThanP() public virtual {
        bytes memory proof = copyProof();
        uint256 qmEvalOffset = PAIRING_POINTS_SIZE + 8 * G1_POINT_SIZE + (LOG_N * 8 * 32);
        setValue(proof, qmEvalOffset, P + 1);

        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice P+1 in sumcheck univariate - tests round check with aliased value
    function test_SumcheckUnivariateGreaterThanP() public virtual {
        bytes memory proof = copyProof();
        uint256 univariateOffset = PAIRING_POINTS_SIZE + 8 * G1_POINT_SIZE;
        setValue(proof, univariateOffset, P + 1);

        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    DEBUG HELPERS
    //////////////////////////////////////////////////////////////*/

    function testDebugProofStructure() public {
        bytes memory proof = cachedProof;

        emit log_named_uint("Proof length", proof.length);
        emit log_named_uint("LOG_N", LOG_N);

        uint256 kzgX = getValue(proof, proof.length - 64);
        uint256 kzgY = getValue(proof, proof.length - 32);

        emit log_named_uint("kzgQuotient.x", kzgX);
        emit log_named_uint("kzgQuotient.y", kzgY);

        uint256 lhs = mulmod(kzgY, kzgY, Q);
        uint256 xx = mulmod(kzgX, kzgX, Q);
        uint256 rhs = addmod(mulmod(kzgX, xx, Q), 3, Q);

        emit log_named_uint("y^2 mod Q", lhs);
        emit log_named_uint("x^3+3 mod Q", rhs);
        emit log_named_string("On curve", lhs == rhs ? "YES" : "NO");
    }
}
