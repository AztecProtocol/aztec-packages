/**
 * @brief Head-to-head comparison: IPA full_verify_recursive (batch_mul MSM)
 *        vs BaseFold recursive verifier for the 2^15 Grumpkin MSM.
 *
 * Measures wall-clock time for circuit construction (witness generation)
 * and reports gate counts.  Both approaches produce UltraHonk circuits
 * whose proving time scales linearly with gate count.
 */
#include "basefold.hpp"
#include "ecfft_domain.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/pcs_test_utils.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <chrono>
#include <cstdlib>
#include <fstream>
#include <gtest/gtest.h>

namespace {

using NativeCurve = bb::curve::Grumpkin;
using Builder = bb::UltraCircuitBuilder;
using Curve = bb::stdlib::grumpkin<Builder>;
using Fr = typename NativeCurve::ScalarField;
using Commitment = typename NativeCurve::AffineElement;
using GrumpkinPolynomial = bb::Polynomial<Fr>;

class BaseFoldVsIPA : public bb::CommitmentTest<NativeCurve> {};

/**
 * @brief Measure circuit construction time for IPA::full_verify_recursive.
 *
 * This is the CURRENT approach: the recursive verifier does a 2^15-point
 * batch_mul MSM over Grumpkin inside the circuit.
 */
TEST_F(BaseFoldVsIPA, IPAFullVerifyRecursive)
{
    static constexpr size_t log_poly_length = bb::CONST_ECCVM_LOG_N; // 15
    static constexpr size_t poly_length = 1UL << log_poly_length;
    using NativeIPA = bb::IPA<NativeCurve, log_poly_length>;
    using RecursiveIPA = bb::IPA<Curve, log_poly_length>;
    using StdlibTranscript = bb::UltraStdlibTranscript;
    using StdlibProof = bb::stdlib::Proof<Builder>;

    info("=== IPA full_verify_recursive (2^", log_poly_length, " MSM) ===");

    // Generate a random polynomial and commitment
    auto poly = GrumpkinPolynomial::random(poly_length);
    auto x = this->random_element();
    auto eval = poly.evaluate(x);
    auto commitment = this->commit(poly);

    // Native IPA prove
    info("  Native IPA prove...");
    auto t0 = std::chrono::high_resolution_clock::now();

    bb::OpeningPair<NativeCurve> opening_pair = { x, eval };
    bb::ProverOpeningClaim<NativeCurve> prover_claim{ poly, opening_pair };
    auto prover_transcript = std::make_shared<bb::NativeTranscript>();
    NativeIPA::compute_opening_proof(this->ck(), prover_claim, prover_transcript);
    auto proof = prover_transcript->export_proof();

    auto t1 = std::chrono::high_resolution_clock::now();
    auto native_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    info("  Native IPA prove: ", native_ms, " ms");

    // Build recursive verifier circuit
    info("  Building recursive verifier circuit...");
    Builder builder;

    auto stdlib_comm = Curve::Group::from_witness(&builder, commitment);
    auto stdlib_x = Curve::ScalarField::from_witness(&builder, x);
    auto stdlib_eval = Curve::ScalarField::from_witness(&builder, eval);
    bb::OpeningClaim<Curve> stdlib_claim{ { stdlib_x, stdlib_eval }, stdlib_comm };
    auto stdlib_transcript = std::make_shared<StdlibTranscript>(StdlibProof(builder, proof));

    // Load VK (SRS points as constants — same every proof)
    auto t2 = std::chrono::high_resolution_clock::now();
    bb::VerifierCommitmentKey<Curve> stdlib_vk(&builder, poly_length, this->vk());
    auto t2b = std::chrono::high_resolution_clock::now();
    auto vk_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t2b - t2).count();

    // full_verify_recursive (the per-proof work)
    auto t3_start = std::chrono::high_resolution_clock::now();
    auto result = RecursiveIPA::full_verify_recursive(stdlib_vk, stdlib_claim, stdlib_transcript);
    EXPECT_TRUE(result);
    auto t3 = std::chrono::high_resolution_clock::now();
    auto verify_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t3 - t3_start).count();

    builder.finalize_circuit(/*ensure_nonzero=*/false);
    auto t4 = std::chrono::high_resolution_clock::now();
    auto finalize_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t4 - t3).count();

    size_t num_gates = builder.get_num_finalized_gates();

    info("  === IPA RESULTS ===");
    info("  VK loading (fixed, same every proof): ", vk_ms, " ms");
    info("  full_verify_recursive (per-proof): ", verify_ms, " ms");
    info("  Circuit finalization: ", finalize_ms, " ms");
    info("  Total gates: ", num_gates);
    info("  Log2(gates): ", std::log2(static_cast<double>(num_gates)));
}

/**
 * @brief Measure circuit construction time for BaseFold recursive verifier.
 *
 * This is the PROPOSED approach: native BaseFold prover (Merkle + fold),
 * then recursive verifier builds the circuit with cycle_group fold checks.
 *
 * Uses blowup 32 (best configuration: 26 queries, 20 rounds).
 */
TEST_F(BaseFoldVsIPA, BaseFoldRecursiveVerifierBlowup32)
{
    using namespace bb::basefold;

    info("=== BaseFold recursive verifier (2^15 MSM, blowup 32) ===");

    // Load domain
    std::string basefold_dir = std::string(std::getenv("BUILD_DIR") ? std::getenv("BUILD_DIR") : ".") +
                               "/../src/barretenberg/msm_verification/basefold";
    std::string domain_path = basefold_dir + "/ecfft_domain_2_20.bin";
    std::string script_path = basefold_dir + "/ecfft_precompute.py";

    {
        std::ifstream check(domain_path);
        if (!check.good()) {
            info("  Domain binary not found. Skipping.");
            GTEST_SKIP() << "Domain binary not found at " << domain_path;
            return;
        }
    }

    EcfftDomain domain;
    try {
        domain = EcfftDomain::load_binary(domain_path);
    } catch (const std::exception& e) {
        GTEST_SKIP() << "Failed to load domain: " << e.what();
        return;
    }

    size_t n = domain.levels[0].size();
    size_t degree_bound = n;
    size_t num_queries = 26;

    info("  Domain: 2^", domain.log_n, ", queries: ", num_queries, ", rounds: ", domain.num_rounds);

    // Generate random oracle
    info("  Generating random oracle...");
    auto& engine = bb::numeric::get_debug_randomness();
    std::vector<NativeCommitment> g0(n);
    for (size_t i = 0; i < n; i++) {
        g0[i] = bb::grumpkin::g1::element::random_element(&engine).normalize();
    }

    // Native BaseFold prove
    info("  Native BaseFold prove...");
    auto t0 = std::chrono::high_resolution_clock::now();

    auto prover_transcript = std::make_shared<bb::NativeTranscript>();
    prove(g0, domain, degree_bound, num_queries, prover_transcript);
    auto native_proof = prover_transcript->export_proof();

    auto t1 = std::chrono::high_resolution_clock::now();
    auto native_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    info("  Native BaseFold prove: ", native_ms, " ms");
    info("  Proof size: ", native_proof.size() * 32 / 1024, " KiB");

    // Build recursive verifier circuit
    info("  Building recursive verifier circuit...");
    Builder builder;
    auto t2 = std::chrono::high_resolution_clock::now();

    RecursiveBaseFoldVerifier<Builder>::verify(builder, domain, degree_bound, num_queries, native_proof);

    auto t3 = std::chrono::high_resolution_clock::now();
    auto circuit_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t3 - t2).count();

    builder.finalize_circuit(/*ensure_nonzero=*/false);
    auto t4 = std::chrono::high_resolution_clock::now();
    auto finalize_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t4 - t3).count();

    size_t num_gates = builder.get_num_finalized_gates();

    info("  === BASEFOLD RESULTS ===");
    info("  Native prover (ONE-TIME, precomputable): ", native_ms, " ms");
    info("    (The SRS encoding + FRI fold are deterministic from the SRS and domain.");
    info("     The entire proof is a fixed artifact, computed once and reused for every");
    info("     IPA verification.  This cost is NOT per-proof.)");
    info("  Circuit construction (PER-PROOF): ", circuit_ms, " ms");
    info("  Circuit finalization: ", finalize_ms, " ms");
    info("  Total gates: ", num_gates);
    info("  Log2(gates): ", std::log2(static_cast<double>(num_gates)));
    info("");
    info("  === COMPARISON (per-proof only) ===");
    info("  IPA circuit construction:      see IPAFullVerifyRecursive test above");
    info("  BaseFold circuit construction: ", circuit_ms, " ms");
}

TEST_F(BaseFoldVsIPA, BaseFoldRecursiveVerifierBlowup16)
{
    using namespace bb::basefold;

    info("=== BaseFold recursive verifier (2^15 MSM, blowup 16) ===");

    std::string basefold_dir = std::string(std::getenv("BUILD_DIR") ? std::getenv("BUILD_DIR") : ".") +
                               "/../src/barretenberg/msm_verification/basefold";
    std::string domain_path = basefold_dir + "/ecfft_domain_2_19.bin";

    {
        std::ifstream check(domain_path);
        if (!check.good()) {
            GTEST_SKIP() << "Domain binary not found";
            return;
        }
    }

    EcfftDomain domain;
    try {
        domain = EcfftDomain::load_binary(domain_path);
    } catch (const std::exception& e) {
        GTEST_SKIP() << "Failed to load domain";
        return;
    }

    size_t n = domain.levels[0].size();
    size_t num_queries = 32;
    info("  Domain: 2^", domain.log_n, ", queries: ", num_queries, ", rounds: ", domain.num_rounds);

    auto& engine = bb::numeric::get_debug_randomness();
    std::vector<bb::basefold::NativeCommitment> g0(n);
    for (size_t i = 0; i < n; i++) {
        g0[i] = bb::grumpkin::g1::element::random_element(&engine).normalize();
    }

    info("  Native BaseFold prove...");
    auto t0 = std::chrono::high_resolution_clock::now();
    auto prover_transcript = std::make_shared<bb::NativeTranscript>();
    prove(g0, domain, n, num_queries, prover_transcript);
    auto native_proof = prover_transcript->export_proof();
    auto t1 = std::chrono::high_resolution_clock::now();
    auto native_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    info("  Native prover: ", native_ms, " ms");

    info("  Building circuit...");
    Builder builder;
    auto t2 = std::chrono::high_resolution_clock::now();
    RecursiveBaseFoldVerifier<Builder>::verify(builder, domain, n, num_queries, native_proof);
    auto t3 = std::chrono::high_resolution_clock::now();
    auto circuit_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t3 - t2).count();
    builder.finalize_circuit(/*ensure_nonzero=*/false);
    size_t num_gates = builder.get_num_finalized_gates();

    info("  === RESULTS (blowup 16) ===");
    info("  Native prover: ", native_ms, " ms");
    info("  Circuit construction: ", circuit_ms, " ms");
    info("  Gates: ", num_gates);
}

TEST_F(BaseFoldVsIPA, BaseFoldRecursiveVerifierBlowup8)
{
    using namespace bb::basefold;

    info("=== BaseFold recursive verifier (2^15 MSM, blowup 8) ===");

    std::string basefold_dir = std::string(std::getenv("BUILD_DIR") ? std::getenv("BUILD_DIR") : ".") +
                               "/../src/barretenberg/msm_verification/basefold";
    std::string domain_path = basefold_dir + "/ecfft_domain_2_18.bin";

    {
        std::ifstream check(domain_path);
        if (!check.good()) {
            GTEST_SKIP() << "Domain binary not found";
            return;
        }
    }

    EcfftDomain domain;
    try {
        domain = EcfftDomain::load_binary(domain_path);
    } catch (const std::exception& e) {
        GTEST_SKIP() << "Failed to load domain";
        return;
    }

    size_t n = domain.levels[0].size();
    size_t num_queries = 43;
    info("  Domain: 2^", domain.log_n, ", queries: ", num_queries, ", rounds: ", domain.num_rounds);

    auto& engine = bb::numeric::get_debug_randomness();
    std::vector<bb::basefold::NativeCommitment> g0(n);
    for (size_t i = 0; i < n; i++) {
        g0[i] = bb::grumpkin::g1::element::random_element(&engine).normalize();
    }

    info("  Native BaseFold prove...");
    auto t0 = std::chrono::high_resolution_clock::now();
    auto prover_transcript = std::make_shared<bb::NativeTranscript>();
    prove(g0, domain, n, num_queries, prover_transcript);
    auto native_proof = prover_transcript->export_proof();
    auto t1 = std::chrono::high_resolution_clock::now();
    auto native_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t1 - t0).count();
    info("  Native prover: ", native_ms, " ms");

    info("  Building circuit...");
    Builder builder;
    auto t2 = std::chrono::high_resolution_clock::now();
    RecursiveBaseFoldVerifier<Builder>::verify(builder, domain, n, num_queries, native_proof);
    auto t3 = std::chrono::high_resolution_clock::now();
    auto circuit_ms = std::chrono::duration_cast<std::chrono::milliseconds>(t3 - t2).count();
    builder.finalize_circuit(/*ensure_nonzero=*/false);
    size_t num_gates = builder.get_num_finalized_gates();

    info("  === RESULTS (blowup 8) ===");
    info("  Native prover: ", native_ms, " ms");
    info("  Circuit construction: ", circuit_ms, " ms");
    info("  Gates: ", num_gates);
}

} // anonymous namespace
