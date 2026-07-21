#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/check_circuit.hpp"
#include "barretenberg/vm2/constraining/polynomials.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {

class AvmVerifierTests : public ::testing::Test {
  public:
    using Prover = AvmProvingHelper;
    using Verifier = AvmVerifier;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper function to create and verify native proof
    struct NativeProofResult {
        typename Prover::Proof proof;
        std::vector<std::vector<FF>> public_inputs_cols;
    };

    // Helper function to create proof.
    static NativeProofResult create_proof()
    {
        auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();

        Prover prover;
        auto public_inputs_cols = public_inputs.to_columns();
        const auto proof = prover.prove(std::move(trace));

        return { proof, public_inputs_cols };
    }
};

TEST_F(AvmVerifierTests, GoodPublicInputs)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_cols] = create_proof();

    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);

    ASSERT_TRUE(verified) << "native proof verification failed";
}

TEST_F(AvmVerifierTests, NegativeBadPublicInputs)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_cols] = create_proof();
    auto verify_with_corrupt_pi_col = [&](size_t col_idx) {
        public_inputs_cols[col_idx][5] += FF::one();
        Verifier verifier;
        const bool verified = verifier.verify_proof(proof, public_inputs_cols);
        ASSERT_FALSE(verified)
            << "native proof verification succeeded, but should have failed due to corruption of public inputs col "
            << col_idx;
        public_inputs_cols[col_idx][5] -= FF::one(); // reset
    };
    for (size_t col_idx = 0; col_idx < 4; col_idx++) {
        verify_with_corrupt_pi_col(col_idx);
    }
    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);
    ASSERT_TRUE(verified) << "native proof verification failed, but should have succeeded";
}

// Attacker simulation: commit honestly to keccak_memory_addr, but in sumcheck use a DIFFERENT
// (independent) polynomial for keccak_memory_addr_shift whose last-row value is non-zero.
// The honest prover's `key_poly.shifted()` shares memory with the unshifted polynomial and its
// end_index is (unshifted.end_index - 1) <= N - 1, so the last-row shifted value is always past
// the shifted polynomial's end and thus virtually zero.
// A malicious prover can replace this shifted view after AvmProver construction to try and
// smuggle a non-zero value at the last row. This test verifies that the PCS (Shplemini) catches
// the mismatch between the malicious shifted evaluation used in sumcheck and the real shift of
// the commitment, causing the verifier to reject.
TEST_F(AvmVerifierTests, ProvingSystemSecurityShiftedLastRowMustBeZero)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();
    // Capture the number of witness rows before compute_polynomials consumes the trace.
    const size_t num_witness_rows = trace.get_num_witness_rows() + 1;

    auto polynomials = constraining::compute_polynomials(trace);
    auto proving_key = constraining::proving_key_from_polynomials(polynomials);
    auto verification_key = std::make_shared<AvmVerifier::VerificationKey>();

    AvmProver prover(proving_key, verification_key, proving_key->commitment_key);

    // Attacker: overwrite the shifted view with an independent polynomial carrying a non-zero
    // value at the last row of the circuit. The shared-memory link to the unshifted polynomial
    // is severed, so the unshifted commitment no longer "agrees" with what sumcheck uses.
    using Polynomial = AvmFlavor::Polynomial;
    auto make_malicious_shift = [] {
        Polynomial p(/*size=*/1, /*virtual_size=*/MAX_AVM_TRACE_SIZE, /*start_index=*/MAX_AVM_TRACE_SIZE - 1);
        p.at(MAX_AVM_TRACE_SIZE - 1) = FF(FF::modulus - 1);
        return p;
    };
    prover.prover_polynomials.get(ColumnAndShifts::keccak_memory_addr_shift) = make_malicious_shift();

    // Sanity: all relations (main + lookup/permutation) still hold with the attacker's
    // polynomials. This demonstrates that any subsequent verification failure is NOT due to a
    // relation violation but to the proving system's cryptographic shift-consistency check
    // catching the forged shifted value.
    AvmFlavor::ProverPolynomials check_polys(*proving_key);
    check_polys.get(ColumnAndShifts::keccak_memory_addr_shift) = make_malicious_shift();
    ASSERT_NO_THROW(constraining::run_check_circuit(check_polys, num_witness_rows, /*skippable_enabled=*/true));

    const auto proof = prover.construct_proof();

    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs.to_columns());

    ASSERT_FALSE(verified)
        << "verifier accepted a proof where keccak_memory_addr_shift at the last row was forged to be non-zero";
}

// Symmetric attacker simulation for the UNSHIFTED polynomial at its first row (index 0).
// Unlike the shifted-last-row case, this test is DISABLED by default because it cannot run
// against an unmodified barretenberg tree. The attack path uses a polynomial with
// start_index = 0, which triggers invariants enforced by the honest prover's polynomial
// library. To run this test the following safeguards in
// `barretenberg/cpp/src/barretenberg/polynomials/polynomial.cpp` must be relaxed:
//
//   1. `Polynomial::add_scaled` (and `Polynomial::operator+=`): the two asserts
//      `BB_ASSERT_LTE(start_index(), other.start_index)` and
//      `BB_ASSERT_GTE(end_index(), other.end_index())` fire during the PCS batching step in
//      `execute_pcs_rounds` because the accumulator has start_index = 1 while the malicious
//      polynomial has start_index = 0. Replace the asserts with a left/right expansion of
//      self's backing memory (using `_clone(..., left_expansion)` /
//      `_clone(..., right_expansion)`) so that the malicious value at index 0 contributes
//      to the batched polynomial consistently.
//
//   2. `Polynomial::shifted`: asserts `start_ >= 1` because the Gemini shift
//      (`A_0 = F + G/X`) is only well-defined when the polynomial has zero constant term.
//      To keep the attacker-prover running past this point, special-case start_ == 0 by
//      cloning the backing memory and dropping the first element. This is the same
//      algebraic step that, on the verifier side, makes the proof unverifiable: the
//      committed polynomial and the PCS-derived shifted opening cannot both be consistent
//      when f[0] != 0.
//
// Once those patches are applied, this test passes (the verifier rejects the forged proof),
// confirming that the proving system structurally enforces `f[0] = 0` for any polynomial
// that is referenced in shifted form — independent of any PIL relation — thanks to the
// non-cyclic multilinear shift in the PCS.
TEST_F(AvmVerifierTests, DISABLED_ProvingSystemSecurityUnshiftedFirstRowMustBeZero)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();
    const size_t num_witness_rows = trace.get_num_witness_rows() + 1;

    auto polynomials = constraining::compute_polynomials(trace);
    auto proving_key = constraining::proving_key_from_polynomials(polynomials);
    auto verification_key = std::make_shared<AvmVerifier::VerificationKey>();

    AvmProver prover(proving_key, verification_key, proving_key->commitment_key);

    // Attacker: overwrite the unshifted polynomial with an independent polynomial carrying a
    // non-zero value at index 0. The honest shifted view is left untouched in
    // prover_polynomials so we can observe what the verifier does with an inconsistent pair.
    using Polynomial = AvmFlavor::Polynomial;
    auto make_malicious_addr = [] {
        Polynomial p(/*size=*/1024, /*virtual_size=*/MAX_AVM_TRACE_SIZE, /*start_index=*/0);
        p.at(0) = FF(FF::modulus - 1);
        return p;
    };
    prover.prover_polynomials.get(ColumnAndShifts::keccak_memory_addr) = make_malicious_addr();

    // Sanity: all relations (main + lookup/permutation) still hold with the attacker's
    // polynomials. This demonstrates that any subsequent verification failure is NOT due to a
    // relation violation but to the proving system's cryptographic shift-consistency check
    // catching the forged first-row value.
    AvmFlavor::ProverPolynomials check_polys(*proving_key);
    check_polys.get(ColumnAndShifts::keccak_memory_addr) = make_malicious_addr();
    ASSERT_NO_THROW(constraining::run_check_circuit(check_polys, num_witness_rows, /*skippable_enabled=*/true));

    const auto proof = prover.construct_proof();

    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs.to_columns());

    ASSERT_FALSE(verified)
        << "verifier accepted a proof where keccak_memory_addr at the first row was forged to be non-zero";
}

// Verify that the actual proof size matches COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS
TEST_F(AvmVerifierTests, ProofSizeMatchesComputedConstant)
{
    auto [proof, public_inputs_cols] = create_proof();

    const size_t actual_proof_size = proof.size();
    const size_t computed_proof_size = AvmFlavor::COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS;

    EXPECT_EQ(actual_proof_size, computed_proof_size)
        << "Actual proof size (" << actual_proof_size << ") does not match COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS ("
        << computed_proof_size << "). The formula in flavor.hpp needs to be updated.";
}

// Reject a proof with extra trailing fields. Closes the transcript-completeness gap that the AVM padding once
// permitted: appending arbitrary field(s) past COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS must fail verification.
TEST_F(AvmVerifierTests, NegativeRejectsProofWithTrailingFields)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_cols] = create_proof();
    proof.push_back(FF::zero());

    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);

    ASSERT_FALSE(verified) << "verifier accepted a proof with one extra trailing field";
}

// Reject a proof that is shorter than COMPUTED_AVM_PROOF_LENGTH_IN_FIELDS.
TEST_F(AvmVerifierTests, NegativeRejectsTruncatedProof)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    auto [proof, public_inputs_cols] = create_proof();
    ASSERT_FALSE(proof.empty());
    proof.pop_back();

    Verifier verifier;
    const bool verified = verifier.verify_proof(proof, public_inputs_cols);

    ASSERT_FALSE(verified) << "verifier accepted a truncated proof";
}

} // namespace bb::avm2::constraining
