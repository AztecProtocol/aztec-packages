// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <vector>

using namespace bb;

namespace {

using Curve = curve::BN254;
using FF = Curve::ScalarField;
using Commitment = Curve::AffineElement;
using ProverClaim = MultilinearBatchingProverClaim;
using VerifierClaim = MultilinearBatchingVerifierClaim<Curve>;
using NativeTranscriptType = NativeTranscript;

// Size of the slot polynomials used in the tests. The protocol pads every polynomial up to
// 2^VIRTUAL_LOG_N virtual variables, so the actual size only needs to be small.
constexpr size_t LOG_N = 5;
constexpr size_t VIRTUAL_LOG_N = MultilinearBatchingFlavor::VIRTUAL_LOG_N;
// Per-slot round univariate length (the relation is degree 2, so 3 evaluations per round).
constexpr size_t UNIVARIATE_LENGTH = MultilinearBatchingFlavor::BATCHED_RELATION_PARTIAL_LENGTH;
// In production the batching transcript is shared and already holds the group's instance sumchecks, so the first
// batching challenge is never drawn from an empty transcript. The standalone tests reproduce that by sending one seed
// field element first; it occupies index 0 of every exported proof.
constexpr size_t SEED_FRS = 1;
// Offset, in field elements, of the "Sumcheck:evaluations" block within an exported batching proof: it follows the
// seed element and the VIRTUAL_LOG_N round univariates.
constexpr size_t EVALS_OFFSET = SEED_FRS + (VIRTUAL_LOG_N * UNIVARIATE_LENGTH);

/**
 * @brief All the ways a batching proof / its claims can be made unsound.
 */
enum class FaultMode : uint8_t {
    NONE,
    FALSE_NONSHIFTED_EVAL,       // verifier holds a wrong non-shifted input claim -> sumcheck target is wrong
    FALSE_SHIFTED_EVAL,          // verifier holds a wrong shifted input claim -> sumcheck target is wrong
    TAMPER_CLAIMED_EVAL,         // corrupt one claimed evaluation -> sumcheck final relation check fails
    WRONG_NONSHIFTED_COMMITMENT, // verifier holds a wrong input commitment -> output claim is not bound to it
    BREAK_EVAL_BINDING,          // per-slot evals that keep the γ-weighted relation but break the ρ-merge binding
};

/**
 * @brief Evaluate the (zero-padded) multilinear extension of `poly` at the full VIRTUAL_LOG_N-variate point `r`.
 * @details The slot polynomials live on 2^LOG_N points and are implicitly extended by zero to 2^VIRTUAL_LOG_N. The
 * extension multiplies the LOG_N-variate evaluation by ∏_{j >= LOG_N} (1 - r_j).
 */
FF mle_padded(const Polynomial<FF>& poly, const std::vector<FF>& r, bool shift = false)
{
    std::vector<FF> head(r.begin(), r.begin() + LOG_N);
    FF value = poly.evaluate_mle(head, shift);
    for (size_t j = LOG_N; j < r.size(); ++j) {
        value *= (FF(1) - r[j]);
    }
    return value;
}

/**
 * @brief A set of mutually consistent batching claims plus the data needed to re-derive the expected output claim.
 */
struct ClaimSet {
    std::vector<ProverClaim> prover_claims;
    std::vector<VerifierClaim> verifier_claims;
    // Copies of the slot polynomials (the prover consumes prover_claims), used to recompute the honest output claim.
    std::vector<Polynomial<FF>> non_shifted_polynomials;
    std::vector<Polynomial<FF>> shifted_polynomials; // pre-shift form (start index 1)
};

/**
 * @brief Build `num_claims` honest, mutually consistent batching claims with real commitments and evaluations.
 */
ClaimSet build_honest_claims(size_t num_claims)
{
    const size_t dyadic_size = 1UL << LOG_N;
    CommitmentKey<Curve> commitment_key(dyadic_size);

    ClaimSet set;
    for (size_t i = 0; i < num_claims; ++i) {
        // Independent random evaluation point per claim, of full sumcheck length.
        std::vector<FF> challenge(VIRTUAL_LOG_N);
        for (auto& c : challenge) {
            c = FF::random_element();
        }

        Polynomial<FF> non_shifted = Polynomial<FF>::random(dyadic_size);
        // A to-be-shifted polynomial must start at index 1 (index 0 is the implicit zero that the shift drops).
        Polynomial<FF> shifted = Polynomial<FF>::random(dyadic_size - 1, dyadic_size, /*start_index=*/1);

        const FF non_shifted_eval = mle_padded(non_shifted, challenge);
        const FF shifted_eval = mle_padded(shifted, challenge, /*shift=*/true);
        const Commitment non_shifted_commitment = commitment_key.commit(non_shifted);
        const Commitment shifted_commitment = commitment_key.commit(shifted);

        set.non_shifted_polynomials.push_back(non_shifted);
        set.shifted_polynomials.push_back(shifted);

        set.prover_claims.push_back(ProverClaim{ .challenge = challenge,
                                                 .non_shifted_evaluation = non_shifted_eval,
                                                 .shifted_evaluation = shifted_eval,
                                                 .non_shifted_polynomial = std::move(non_shifted),
                                                 .shifted_polynomial = std::move(shifted),
                                                 .non_shifted_commitment = non_shifted_commitment,
                                                 .shifted_commitment = shifted_commitment,
                                                 .dyadic_size = dyadic_size });
        set.verifier_claims.push_back(VerifierClaim{ .challenge = challenge,
                                                     .non_shifted_evaluation = non_shifted_eval,
                                                     .shifted_evaluation = shifted_eval,
                                                     .non_shifted_commitment = non_shifted_commitment,
                                                     .shifted_commitment = shifted_commitment });
    }
    return set;
}

/**
 * @brief Re-derive the batching challenge γ, the sumcheck point r, and the merge challenge ρ from an exported proof.
 * @details Mirrors the verifier's Fiat-Shamir sequence exactly, so it tracks both honest and tampered proofs. The
 * proof layout is [seed][VIRTUAL_LOG_N round univariates][3 * num_claims claimed evaluations], with γ drawn before
 * the sumcheck and ρ drawn after the claimed evaluations are bound to the transcript.
 */
struct DerivedChallenges {
    FF gamma;
    std::vector<FF> r;
    FF rho;
};

DerivedChallenges replay_challenges(const HonkProof& proof, size_t num_claims)
{
    auto transcript = std::make_shared<NativeTranscriptType>();
    transcript->load_proof(proof);
    [[maybe_unused]] FF seed = transcript->template receive_from_prover<FF>("init");

    DerivedChallenges out;
    out.gamma = transcript->template get_challenge<FF>("claim_batching_challenge");
    [[maybe_unused]] FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    for (size_t round = 0; round < VIRTUAL_LOG_N; ++round) {
        for (size_t e = 0; e < UNIVARIATE_LENGTH; ++e) {
            [[maybe_unused]] FF _ = transcript->template receive_from_prover<FF>("u");
        }
        out.r.push_back(transcript->template get_challenge<FF>("Sumcheck:u_" + std::to_string(round)));
    }
    for (size_t e = 0; e < 3 * num_claims; ++e) {
        [[maybe_unused]] FF _ = transcript->template receive_from_prover<FF>("e");
    }
    out.rho = transcript->template get_challenge<FF>("claim_merge_challenge");
    return out;
}

/**
 * @brief Check that the verifier's output claim is a faithful (commitment, evaluation) of the honest batched
 * polynomial Σ ρ^i P_i at the sumcheck point — i.e. exactly what the downstream PCS opening will enforce.
 */
bool output_claim_is_bound(const ClaimSet& set, const HonkProof& proof, const VerifierClaim& new_claim)
{
    auto powers = [](const FF& base, size_t count) {
        std::vector<FF> result(count);
        result[0] = FF(1);
        for (size_t i = 1; i < count; ++i) {
            result[i] = result[i - 1] * base;
        }
        return result;
    };

    const size_t num_claims = set.verifier_claims.size();
    const DerivedChallenges challenges = replay_challenges(proof, num_claims);
    const std::vector<FF> rho_powers = powers(challenges.rho, num_claims);

    FF expected_non_shifted_eval(0);
    FF expected_shifted_eval(0);
    std::vector<Commitment> non_shifted_commitments;
    std::vector<Commitment> shifted_commitments;
    for (size_t i = 0; i < num_claims; ++i) {
        expected_non_shifted_eval += rho_powers[i] * mle_padded(set.non_shifted_polynomials[i], challenges.r);
        expected_shifted_eval += rho_powers[i] * mle_padded(set.shifted_polynomials[i], challenges.r, /*shift=*/true);
        non_shifted_commitments.push_back(set.verifier_claims[i].non_shifted_commitment);
        shifted_commitments.push_back(set.verifier_claims[i].shifted_commitment);
    }
    std::vector<FF> scalars = rho_powers;
    const Commitment expected_non_shifted_commitment = Curve::Element::batch_mul(non_shifted_commitments, scalars);
    const Commitment expected_shifted_commitment = Curve::Element::batch_mul(shifted_commitments, scalars);

    return new_claim.challenge == challenges.r && new_claim.non_shifted_evaluation == expected_non_shifted_eval &&
           new_claim.shifted_evaluation == expected_shifted_eval &&
           new_claim.non_shifted_commitment == expected_non_shifted_commitment &&
           new_claim.shifted_commitment == expected_shifted_commitment;
}

/**
 * @brief Build an honest native proof and apply the requested fault to the proof / verifier-held claims.
 * @details The prover is always native; only the verification path differs between the native and recursive fixtures.
 * @return the (faulted) proof and the verifier-held input claims, plus the original honest ClaimSet for binding.
 */
struct FaultyProof {
    ClaimSet set;
    std::vector<VerifierClaim> verifier_claims; // the verifier-held claims (some faults corrupt these)
    HonkProof proof;
};

FaultyProof build_faulty_proof(size_t num_claims, FaultMode fault)
{
    ClaimSet set = build_honest_claims(num_claims);

    // The verifier-held input claims; some faults corrupt these without touching the proof.
    std::vector<VerifierClaim> verifier_claims = set.verifier_claims;
    if (fault == FaultMode::FALSE_NONSHIFTED_EVAL) {
        verifier_claims[0].non_shifted_evaluation += FF(1);
    } else if (fault == FaultMode::FALSE_SHIFTED_EVAL) {
        verifier_claims[0].shifted_evaluation += FF(1);
    } else if (fault == FaultMode::WRONG_NONSHIFTED_COMMITMENT) {
        verifier_claims[0].non_shifted_commitment = verifier_claims[0].non_shifted_commitment + Commitment::one();
    }

    auto prover_transcript = std::make_shared<NativeTranscriptType>();
    // Seed the transcript so the first batching challenge is not drawn from an empty hash buffer (see SEED_FRS).
    prover_transcript->send_to_verifier("init", FF::random_element());
    MultilinearBatchingProver prover(std::move(set.prover_claims), prover_transcript);
    HonkProof proof = prover.construct_proof();

    // Proof-side faults are applied after the honest proof is built; the verifier re-derives Fiat-Shamir from the
    // tampered bytes, so the proof stays internally consistent.
    if (fault == FaultMode::TAMPER_CLAIMED_EVAL) {
        proof[EVALS_OFFSET] += FF(1);
    } else if (fault == FaultMode::BREAK_EVAL_BINDING) {
        // Perturb the first three non-shifted claimed evals by a δ that lies in the joint kernel of BOTH the sumcheck
        // final relation form (a·δ = 0, with a_i = γ^i·eq_i(r)) AND the γ-weighted merge (b·δ = 0, with b_i = γ^i),
        // while leaving the eq evaluations untouched. Then:
        //   - the sumcheck and eq-consistency checks still pass (a·δ = 0), so `verified` stays true;
        //   - a hypothetical γ-weighted output merge would still be correct (b·δ = 0)
        //   - the fresh merge challenge ρ is drawn only after δ is committed, so Σ ρ^i δ_i ≠ 0 and the bound
        //     output claim is wrong. δ = a × b can be taken to be the cross product of the two vector a, b.
        const DerivedChallenges challenges = replay_challenges(proof, num_claims);
        std::array<FF, 3> eq;
        std::array<FF, 3> b; // b_i = γ^i
        b[0] = FF(1);
        for (size_t i = 0; i < 3; ++i) {
            eq[i] = VerifierEqPolynomial<FF>::eval(set.verifier_claims[i].challenge, challenges.r);
            if (i > 0) {
                b[i] = b[i - 1] * challenges.gamma;
            }
        }
        const std::array<FF, 3> a{ b[0] * eq[0], b[1] * eq[1], b[2] * eq[2] };
        const std::array<FF, 3> delta{ a[1] * b[2] - a[2] * b[1],
                                       a[2] * b[0] - a[0] * b[2],
                                       a[0] * b[1] - a[1] * b[0] };
        for (size_t i = 0; i < 3; ++i) {
            proof[EVALS_OFFSET + i] += delta[i];
        }
    }

    return { std::move(set), std::move(verifier_claims), std::move(proof) };
}

template <bool Recursive, size_t Claims> struct Config {
    static constexpr bool IsRecursive = Recursive;
    static constexpr size_t Width = Claims;
};

template <typename Params> class MultilinearBatchingTests : public ::testing::Test {
  public:
    static constexpr bool IsRecursive = Params::IsRecursive;
    static constexpr size_t Width = Params::Width;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct RunResult {
        bool verified;    // sumcheck + eq-consistency accepted (in-circuit value checks, for the recursive path)
        bool circuit_ok;  // recursive verifier circuit is satisfiable (always true for the native path)
        bool claim_bound; // the resulting accumulator opens to the honest batched polynomial
        bool accepted() const { return verified && circuit_ok && claim_bound; }
    };

    static RunResult run(FaultMode fault)
    {
        FaultyProof faulty = build_faulty_proof(Width, fault);

        bool verified = false;
        bool circuit_ok = true;
        VerifierClaim new_claim;

        if constexpr (!IsRecursive) {
            auto transcript = std::make_shared<NativeTranscriptType>();
            transcript->load_proof(faulty.proof);
            [[maybe_unused]] FF seed = transcript->template receive_from_prover<FF>("init");
            MultilinearBatchingNativeVerifier verifier(transcript);
            std::tie(verified, new_claim) = verifier.verify_proof(faulty.verifier_claims);
        } else {
            using RecursiveVerifier = MultilinearBatchingRecursiveVerifier;
            using RecursiveCurve = typename RecursiveVerifier::Curve;
            using RecursiveClaim = MultilinearBatchingVerifierClaim<RecursiveCurve>;
            using RecursiveFF = typename RecursiveCurve::ScalarField;

            MegaCircuitBuilder builder;
            auto transcript = std::make_shared<typename RecursiveVerifier::Transcript>();
            typename RecursiveVerifier::Proof stdlib_proof(builder, faulty.proof);
            transcript->load_proof(stdlib_proof);
            [[maybe_unused]] RecursiveFF seed = transcript->template receive_from_prover<RecursiveFF>("init");

            std::vector<RecursiveClaim> recursive_claims;
            recursive_claims.reserve(faulty.verifier_claims.size());
            for (const auto& claim : faulty.verifier_claims) {
                RecursiveClaim recursive_claim =
                    RecursiveClaim::template stdlib_from_native<RecursiveCurve>(&builder, claim);
                // The claims stand in for values the kernel would receive already constrained; clear the free-witness
                // tags so the verifier's origin-tag mechanism does not flag them when they mix with transcript values.
                for (auto& challenge_element : recursive_claim.challenge) {
                    challenge_element.unset_free_witness_tag();
                }
                recursive_claim.non_shifted_evaluation.unset_free_witness_tag();
                recursive_claim.shifted_evaluation.unset_free_witness_tag();
                recursive_claim.non_shifted_commitment.unset_free_witness_tag();
                recursive_claim.shifted_commitment.unset_free_witness_tag();
                recursive_claims.push_back(std::move(recursive_claim));
            }

            RecursiveVerifier verifier(transcript);
            auto [verified_in_circuit, recursive_new_claim] = verifier.verify_proof(recursive_claims);
            verified = verified_in_circuit;
            circuit_ok = bb::CircuitChecker::check(builder);
            new_claim = recursive_new_claim.template get_value<VerifierClaim>();
        }

        const bool claim_bound = output_claim_is_bound(faulty.set, faulty.proof, new_claim);
        return { verified, circuit_ok, claim_bound };
    }
};

using TestConfigs = ::testing::Types<Config<false, 2>,
                                     Config<false, 3>,
                                     Config<false, CHONK_MAX_CLAIMS_PER_KERNEL>,
                                     Config<true, 2>,
                                     Config<true, 3>,
                                     Config<true, CHONK_MAX_CLAIMS_PER_KERNEL>>;

TYPED_TEST_SUITE(MultilinearBatchingTests, TestConfigs);

// Completeness: honest claims verify and the output claim is bound to the honest batched polynomial.
TYPED_TEST(MultilinearBatchingTests, ValidProofPasses)
{
    auto result = TestFixture::run(FaultMode::NONE);
    EXPECT_TRUE(result.verified);
    EXPECT_TRUE(result.circuit_ok);
    EXPECT_TRUE(result.claim_bound);
}

// A wrong non-shifted input claim makes the sumcheck target inconsistent with the polynomials.
TYPED_TEST(MultilinearBatchingTests, FalseNonShiftedClaimFails)
{
    BB_DISABLE_ASSERTS();
    EXPECT_FALSE(TestFixture::run(FaultMode::FALSE_NONSHIFTED_EVAL).accepted());
}

// A wrong shifted input claim makes the sumcheck target inconsistent with the polynomials.
TYPED_TEST(MultilinearBatchingTests, FalseShiftedClaimFails)
{
    BB_DISABLE_ASSERTS();
    EXPECT_FALSE(TestFixture::run(FaultMode::FALSE_SHIFTED_EVAL).accepted());
}

// Corrupting a single claimed evaluation breaks the sumcheck final relation check.
TYPED_TEST(MultilinearBatchingTests, TamperedClaimedEvalFails)
{
    BB_DISABLE_ASSERTS();
    EXPECT_FALSE(TestFixture::run(FaultMode::TAMPER_CLAIMED_EVAL).accepted());
}

// A wrong input commitment slips past the sumcheck (which never reads commitments), but the output claim is no longer
// bound to it — the downstream PCS opening would reject it.
TYPED_TEST(MultilinearBatchingTests, WrongInputCommitmentBreaksBinding)
{
    auto result = TestFixture::run(FaultMode::WRONG_NONSHIFTED_COMMITMENT);
    EXPECT_TRUE(result.verified);
    EXPECT_TRUE(result.circuit_ok);
    EXPECT_FALSE(result.claim_bound);
}

// The core soundness property of the fresh-ρ merge: per-slot evaluations crafted to satisfy the γ-weighted sumcheck
// (and eq consistency) still fail to bind, because the merge challenge ρ is drawn only after they are committed.
TYPED_TEST(MultilinearBatchingTests, BrokenEvalBindingIsCaughtByMerge)
{
    if (TestFixture::Width < 3) {
        GTEST_SKIP() << "The eval-binding attack needs >= 3 claims (2 constraints, 3 unknowns) to also satisfy the "
                        "pre-fix γ-weighted merge; with 2 claims no such non-trivial perturbation exists.";
    }
    auto result = TestFixture::run(FaultMode::BREAK_EVAL_BINDING);
    EXPECT_TRUE(result.verified);
    EXPECT_TRUE(result.circuit_ok);
    EXPECT_FALSE(result.claim_bound);
}

} // namespace
