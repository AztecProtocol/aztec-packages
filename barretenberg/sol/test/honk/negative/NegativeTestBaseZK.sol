// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.21;

import {TestBase} from "test/base/TestBase.sol";
import {DifferentialFuzzer} from "test/base/DifferentialFuzzer.sol";
import {IVerifier} from "src/interfaces/IVerifier.sol";
import {Errors} from "src/honk/Errors.sol";

/**
 * @title NegativeTestBaseZK
 * @notice Base contract for ZK verifier negative tests
 *
 * @dev Uses Blake circuit so the same proof can be tested against both:
 * - BlakeHonkZKVerifier (standard ZK)
 * - BlakeOptHonkVerifier (optimized ZK)
 *
 * Error selectors are virtual so optimized verifier can override them.
 * The optimized verifier uses different error types (SUMCHECK_FAILED vs BaseZKHonkVerifier.SumcheckFailed).
 *
 * SECURITY OBSERVATION:
 * The verifier accepts (0,0) (the EIP-196 identity encoding) for commitment-position
 * points: legitimate polynomial commitments to identically-zero polynomials encode this
 * way, and the ecAdd/ecMul precompiles treat it as the additive identity. Soundness
 * against (0,0) substitution for a non-zero commitment is upheld downstream by
 * sumcheck/Shplemini, which fails on inconsistent evaluations.
 *
 * Pairing points (136-bit limb encoded) have their limbs validated for bounds
 * and reconstructed coordinates checked < Q. Corrupted limbs that produce
 * valid-looking but wrong points are caught indirectly via sumcheck failure.
 *
 * Test categories:
 * 1. Basic validation (proof length, public inputs length)
 * 2. Sumcheck failures (round check, final check, libra eval)
 * 3. Point validation (on-curve check - only kzgQuotient/shplonkQ)
 * 4. Shplemini/pairing failures
 * 5. Consistency check failures (ZK-specific)
 * 6. Q+1 attacks (field modulus aliasing)
 * 7. Pairing point limb overflow
 * 8. Field element >= P attacks
 * 9. ZK-specific commitment corruption (geminiMaskingPoly, libraCommitments)
 *
 * Note on gas:
 * We pass "only" 15M gas, since the pre-compile failure will consume remaining gas for the call
 * and with "infinite" gas available that makes it possible to reach the following error (for example
 * failing shplimini that is directly dependent on the pre-compile [so also correct] but the potential for
 * multiple different errors here is painful for test).
 */
abstract contract NegativeTestBaseZK is TestBase {
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

    // ZK proof structure offsets (from proof start)
    // Based on ZKTranscript.loadProof serialization order:
    //
    // Layout:
    //   pairingPointObject(256) + geminiMaskingPoly(64) +
    //   w1(64) + w2(64) + w3(64) +
    //   lookupReadCounts(64) + lookupReadTags(64) + w4(64) + lookupInverses(64) + zPerm(64) +
    //   libraCommitments[0](64) + libraSum(32) + sumcheckUnivariates...
    //
    // NOTE: libraCommitments[1] and [2] are serialized LATE (after sumcheck evals + libraEval),
    //       so they cannot be expressed as static offset constants.

    // Pairing points: 8 limbs × 32 bytes = 256 bytes at offset 0
    uint256 constant PAIRING_POINTS_OFFSET = 0;
    uint256 constant PAIRING_POINTS_SIZE = 256;

    // ZK-specific: geminiMaskingPoly commitment after pairing points
    uint256 constant GEMINI_MASKING_POLY_OFFSET = 256;

    // Witness commitments start after geminiMaskingPoly
    // NOTE: serialization order differs from struct layout (w4 comes after lookupReadTags)
    uint256 constant W_L_OFFSET = 320; // 256 + 64 (w1)
    uint256 constant W_R_OFFSET = 384; // 320 + 64 (w2)
    uint256 constant W_O_OFFSET = 448; // 384 + 64 (w3)
    uint256 constant LOOKUP_READ_COUNTS_OFFSET = 512; // 448 + 64
    uint256 constant LOOKUP_READ_TAGS_OFFSET = 576; // 512 + 64
    uint256 constant W_4_OFFSET = 640; // 576 + 64
    uint256 constant LOOKUP_INVERSES_OFFSET = 704; // 640 + 64
    uint256 constant Z_PERM_OFFSET = 768; // 704 + 64

    // ZK-specific: only libraCommitments[0] is serialized here
    uint256 constant LIBRA_COMM_0_OFFSET = 832; // 768 + 64

    // libraSum (Fr element) after libraCommitments[0]
    uint256 constant LIBRA_SUM_OFFSET = 896; // 832 + 64

    // sumcheckUnivariates start after libraSum
    uint256 constant SUMCHECK_UNIVARIATES_OFFSET = 928; // 896 + 32

    // Each G1 point is 64 bytes (x, y)
    uint256 constant G1_POINT_SIZE = 64;

    // ZK-specific constants
    uint256 constant NUMBER_OF_ENTITIES_ZK = 44;
    uint256 constant ZK_BATCHED_RELATION_PARTIAL_LENGTH = 9; // 9 coefficients per round for ZK

    /// @notice Override in concrete test to return the verifier instance
    function _createVerifier() internal virtual returns (IVerifier);

    /// @notice Override to return expected proof length for this circuit
    function _expectedProofLength() internal view virtual returns (uint256) {
        return cachedProof.length;
    }

    function setUp() public virtual {
        fuzzer = new DifferentialFuzzer().with_flavor(DifferentialFuzzer.Flavor.HonkZK);
        fuzzer = fuzzer.with_circuit_type(DifferentialFuzzer.CircuitType.Blake);

        verifier = _createVerifier();

        PUBLIC_INPUT_COUNT = 4;

        // Add default inputs to the fuzzer
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
        uint256 expectedLength = _expectedProofLength();
        uint256 size = bound(_size, 0, expectedLength * 2);
        vm.assume(size != expectedLength);

        bytes memory proof = new bytes(size);

        vm.expectRevert(abi.encodeWithSelector(Errors.ProofLengthWrongWithLogN.selector, LOG_N, size, expectedLength));
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

    /// @notice Calculate offset to sumcheck univariates for ZK proof
    /// @dev ZK layout: pairingPoints(256) + geminiMaskingPoly(64) + witnesses(8*64) +
    ///                 libraCommitments[0](64) + libraSum(32) = 928
    function _sumcheckUnivariateOffset() internal pure virtual returns (uint256) {
        return SUMCHECK_UNIVARIATES_OFFSET;
    }

    function testRevertSumcheckFailedRoundCheck() public virtual {
        bytes memory proof = copyProof();
        uint256 univariateOffset = _sumcheckUnivariateOffset();

        assembly {
            let loc := add(add(proof, 0x20), univariateOffset)
            mstore(loc, add(mload(loc), 1))
        }

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Corrupting a libraPolyEval triggers ConsistencyCheckFailed
    /// @dev The ZK verifier runs: verifySumcheck → verifyShplemini (which includes consistency check).
    ///      libraPolyEvals are NOT used by sumcheck, so sumcheck passes.
    ///      The consistency check (checkEvalsConsistency) validates that libraPolyEvals are
    ///      consistent with libraEvaluation - corrupting one breaks this invariant.
    ///
    ///      Proof layout (from end): kzgQuotient(64) + shplonkQ(64) + libraPolyEvals(4×32=128)
    function testRevertConsistencyCheckFailedFinalCheck() public virtual {
        bytes memory proof = copyProof();

        // First libraPolyEval is at proof.length - 256 (after kzg(64) + shplonk(64) + 4 evals(128))
        uint256 libraPolyEvalOffset = proof.length - 256;

        assembly {
            let loc := add(add(proof, 0x20), libraPolyEvalOffset)
            mstore(loc, add(mload(loc), 1))
        }

        vm.expectRevert(Errors.ConsistencyCheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Corrupting witness commitment causes SumcheckFailed
    /// @dev Witness commitments are hashed into transcript challenges.
    ///      The corrupted point changes the challenges, causing sumcheck to fail.
    function testRevertSumcheckFailedWitnessCommitment() public virtual {
        bytes memory proof = copyProof();

        // Negate W_L's y-coordinate (point negation is still on curve but wrong)
        uint256 y = getValue(proof, W_L_OFFSET + 32);
        setValue(proof, W_L_OFFSET + 32, Q - y);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    POINT VALIDATION - COORDINATE >= Q
    //////////////////////////////////////////////////////////////*/

    /// @notice Corrupting kzgQuotient's y MSB with 0xff pushes it >= Q
    /// @dev XORing the most significant byte with 0xff creates a value exceeding the
    ///      curve field modulus Q, caught by bytesToG1Point's x < Q && y < Q check.
    function test_failedCoordinateGeQ() public virtual {
        bytes memory proof = copyProof();

        // Corrupt kzgQuotient's y-coordinate MSB - pushes value >= Q
        proof[proof.length - 32] ^= 0xff;

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice An off-curve shplonkQ still rejects the proof despite seeding the MSM accumulator.
    /// @dev shplonkQ is the first batchMul term and its scalar is statically 1, so it seeds the
    ///      accumulator without an ecMul. Its on-curve validity is still enforced by the first
    ///      in-loop ecAdd: feeding the off-curve point (1, 1) makes the bn256 precompile fail and
    ///      consume all forwarded gas, so the call reverts without data (mirroring the non-ZK
    ///      test_OffCurve_ShplonkQ). shplonkQ occupies bytes [len-128, len-64) (kzgQuotient is last).
    function test_OffCurve_ShplonkQ() public virtual {
        bytes memory proof = copyProof();

        // (1, 1) is < Q on both coordinates but not on the curve (1 != 1 + 3).
        setG1Point(proof, proof.length - 128, 1, 1);

        vm.expectRevert(bytes(""));
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    SHPLEMINI / PAIRING FAILURES
    //////////////////////////////////////////////////////////////*/

    function testRevertShpleminiFailedPairing() public virtual {
        bytes memory proof = copyProof();

        // kzgQuotient is last 64 bytes
        uint256 xOffset = proof.length - 64;
        uint256 yOffset = proof.length - 32;

        uint256 px = getValue(proof, xOffset);
        uint256 py = getValue(proof, yOffset);

        // Add generator G = (1, 2)
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

    /// @notice Corrupting gemini fold commitment causes ConsistencyCheckFailed in ZK verifier
    /// @dev Gemini fold comms are used in consistency check validation
    function testRevertConsistencyCheckFailedGeminiFoldComm() public virtual {
        bytes memory proof = copyProof();

        // Last gemini fold comm y offset
        // Work backwards for ZK: kzg(64) + shplonk(64) + libraPolyEvals(128) + gemini_evals(LOG_N*32) + last_gemini_fold_y
        uint256 geminiFoldYOffset = proof.length - 64 - 64 - 128 - LOG_N * 32 - 32;

        uint256 y = getValue(proof, geminiFoldYOffset);
        setValue(proof, geminiFoldYOffset, Q - y);

        vm.expectRevert(Errors.ConsistencyCheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Invalid pairing points - no explicit check, caught via computation
    function test_InvalidPairingPoints() public virtual {
        bytes memory proof = copyProof();

        for (uint256 i = 0; i < 8; i++) {
            setValue(proof, PAIRING_POINTS_OFFSET + i * 32, 1);
        }

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    ZK-SPECIFIC COMMITMENT CORRUPTION
    //////////////////////////////////////////////////////////////*/

    /// @notice Corrupting geminiMaskingPoly causes SumcheckFailed
    function test_GeminiMaskingPoly_Negated() public virtual {
        bytes memory proof = copyProof();

        uint256 y = getValue(proof, GEMINI_MASKING_POLY_OFFSET + 32);
        setValue(proof, GEMINI_MASKING_POLY_OFFSET + 32, Q - y);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Q+1 in geminiMaskingPoly - caught by bytesToG1Point coordinate validation
    function test_QPlusOne_GeminiMaskingPoly() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, GEMINI_MASKING_POLY_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    Q+1 ATTACKS (FIELD MODULUS ALIASING)
    //////////////////////////////////////////////////////////////*/

    /// @dev Q+1 >= Q, caught by bytesToG1Point coordinate validation
    function test_QPlusOne_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    function test_QPlusOne_WR() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_R_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    function test_QPlusOne_WO() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_O_OFFSET, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Q+1 in kzgQuotient - caught by bytesToG1Point coordinate validation
    /// @dev Caught during loadProof before any verification logic runs.
    function test_QPlusOne_KzgQuotient() public virtual {
        bytes memory proof = copyProof();
        uint256 xOffset = proof.length - 64;
        setG1Point(proof, xOffset, Q + 1, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @dev 2Q >= Q, caught by bytesToG1Point coordinate validation
    function test_TwoQ_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, 2 * Q, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @dev Q >= Q, caught by bytesToG1Point coordinate validation
    function test_ExactQ_WL() public virtual {
        bytes memory proof = copyProof();
        setG1Point(proof, W_L_OFFSET, Q, 2);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @dev y = Q >= Q, caught by bytesToG1Point coordinate validation
    function test_YCoordinateExactQ() public virtual {
        bytes memory proof = copyProof();
        uint256 originalX = getValue(proof, W_L_OFFSET);
        setG1Point(proof, W_L_OFFSET, originalX, Q);

        vm.expectRevert(Errors.ValueGeGroupOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @dev max uint256 >= Q, caught by bytesToG1Point coordinate validation
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

    /// @notice Maximum uint256 - exceeds both limb boundary and field modulus
    /// @dev type(uint256).max > MODULUS, caught by FrLib.fromBytes32 during bytesToFr
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
    ///      the hi limb (index 1). Caught by explicit limb validation (>= 2^136).
    function test_PairingLimbOverlap() public virtual {
        bytes memory proof = copyProof();
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
    function test_PairingHiLimbOverflow_Bit120() public virtual {
        bytes memory proof = copyProof();
        uint256 hiLimbOffset = PAIRING_POINTS_OFFSET + 32; // P0.x hi limb
        uint256 malformedHiLimb = 1 << 120;
        setValue(proof, hiLimbOffset, malformedHiLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Hi limb just below 2^136 - tests that the tighter bound catches it
    /// @dev 2^136 - 1 is valid under old check but >> 2^120 so caught by new check
    function test_PairingHiLimbOverflow_Max136() public virtual {
        bytes memory proof = copyProof();
        uint256 hiLimbOffset = PAIRING_POINTS_OFFSET + 96; // P0.y hi limb
        uint256 malformedHiLimb = (1 << 136) - 1;
        setValue(proof, hiLimbOffset, malformedHiLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Lo limb just below 2^136 - should still be accepted (caught later by sumcheck)
    /// @dev Validates that lo limbs retain the full 136-bit range
    function test_PairingLoLimbMaxValid() public virtual {
        bytes memory proof = copyProof();
        uint256 loLimbOffset = PAIRING_POINTS_OFFSET; // P0.x lo limb
        uint256 maxLoLimb = (1 << 136) - 1;
        setValue(proof, loLimbOffset, maxLoLimb);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice All hi limbs at 2^120 - comprehensive check of all 4 hi limb positions
    function test_PairingHiLimbOverflow_AllHiLimbs() public virtual {
        bytes memory proof = copyProof();
        uint256 malformedHiLimb = 1 << 120;
        setValue(proof, PAIRING_POINTS_OFFSET + 32, malformedHiLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 96, malformedHiLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 160, malformedHiLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 224, malformedHiLimb);

        vm.expectRevert(Errors.ValueGeLimbMax.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Field aliasing + limb attack combined
    /// @dev Q+1 > MODULUS (P), caught by FrLib.fromBytes32 during bytesToFr
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

    /// @notice Reconstructed P0.x >= Q - caught by sumcheck (transcript corruption)
    /// @dev hi = (Q >> 136) + 1 is ~118 bits (passes < 2^120 check), lo = 0.
    ///      The modified limb changes the eta challenge, so sumcheck fails before
    ///      the explicit < Q check in convertPairingPointsToG1 is reached.
    function test_PairingReconstructedCoordGeQ() public virtual {
        bytes memory proof = copyProof();

        uint256 hiLimb = (Q >> 136) + 1;
        setValue(proof, PAIRING_POINTS_OFFSET, 0);
        setValue(proof, PAIRING_POINTS_OFFSET + 32, hiLimb);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice Reconstructed P0.x just above Q - minimal overflow
    /// @dev Same transcript corruption path - sumcheck fails first.
    function test_PairingReconstructedCoordJustAboveQ() public virtual {
        bytes memory proof = copyProof();

        uint256 hiLimb = Q >> 136;
        uint256 loLimb = Q - (hiLimb << 136) + 1;

        setValue(proof, PAIRING_POINTS_OFFSET, loLimb);
        setValue(proof, PAIRING_POINTS_OFFSET + 32, hiLimb);

        vm.expectRevert(Errors.SumcheckFailed.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /*//////////////////////////////////////////////////////////////
                    FIELD ELEMENT >= P ATTACKS
    //////////////////////////////////////////////////////////////*/

    /// @notice Evaluation >= P caught by FrLib.fromBytes32 during loadProof
    /// @dev P+1 >= MODULUS, so bytesToFr rejects it with ValueGeFieldOrder
    function test_EvaluationGreaterThanP() public virtual {
        bytes memory proof = copyProof();

        // Work backwards to find first sumcheck evaluation
        // End structure: kzgQuotient(64) + shplonkQ(64) + libraPolyEvals(128) = 256 bytes
        // Before that: geminiAEvaluations(LOG_N * 32) = 480 bytes
        // Before that: geminiFoldComms((LOG_N-1) * 64) = 896 bytes
        // Before that: libraComm2(64) + libraComm1(64) + libraEvaluation(32) = 160 bytes
        // Before that: sumcheckEvaluations(NUMBER_OF_ENTITIES_ZK * 32)
        uint256 evalsEndOffset = proof.length - 256 - LOG_N * 32 - (LOG_N - 1) * 64 - 160;
        uint256 firstEvalOffset = evalsEndOffset - NUMBER_OF_ENTITIES_ZK * 32;

        setValue(proof, firstEvalOffset, P + 1);

        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        verifier.verify{gas: 15_000_000}(proof, cachedPublicInputs);
    }

    /// @notice P+1 in sumcheck univariate - caught by FrLib.fromBytes32 validation
    function test_SumcheckUnivariateGreaterThanP() public virtual {
        bytes memory proof = copyProof();
        uint256 univariateOffset = _sumcheckUnivariateOffset();
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

        // Offsets from start
        emit log_named_uint("PAIRING_POINTS_OFFSET", PAIRING_POINTS_OFFSET);
        emit log_named_uint("GEMINI_MASKING_POLY_OFFSET", GEMINI_MASKING_POLY_OFFSET);
        emit log_named_uint("W_L_OFFSET", W_L_OFFSET);
        emit log_named_uint("W_4_OFFSET", W_4_OFFSET);
        emit log_named_uint("Z_PERM_OFFSET", Z_PERM_OFFSET);
        emit log_named_uint("LIBRA_COMM_0_OFFSET", LIBRA_COMM_0_OFFSET);
        emit log_named_uint("LIBRA_SUM_OFFSET", LIBRA_SUM_OFFSET);
        emit log_named_uint("SUMCHECK_UNIVARIATES_OFFSET", SUMCHECK_UNIVARIATES_OFFSET);

        // Calculated offsets (work backwards from end)
        uint256 evalsEndOffset = proof.length - 256 - LOG_N * 32 - (LOG_N - 1) * 64;
        emit log_named_uint("Calculated sumcheckEvals end offset", evalsEndOffset);
        emit log_named_uint("Calculated sumcheckEvals start offset", evalsEndOffset - NUMBER_OF_ENTITIES_ZK * 32);

        // kzgQuotient validation
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
