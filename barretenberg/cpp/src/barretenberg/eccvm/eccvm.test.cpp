#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <vector>

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_test_utils.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/flavor/test_utils/proof_structures.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation_impl.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"

using namespace bb;
using FF = ECCVMFlavor::FF;
using PK = ECCVMFlavor::ProvingKey;
using Transcript = ECCVMFlavor::Transcript;
using ECCVMVerifier = ECCVMVerifier_<ECCVMFlavor>;
using PCS = IPA<ECCVMFlavor::Curve, CONST_ECCVM_LOG_N>;
using eccvm_test_utils::add_hiding_op_for_test;

// Test helper: Create a VK by committing to proving key polynomials (for comparing with fixed VK)
ECCVMFlavor::VerificationKey create_vk_from_proving_key(const std::shared_ptr<PK>& proving_key)
{
    ECCVMFlavor::VerificationKey vk;
    // Overwrite fixed commitments with computed commitments from the proving key
    for (auto [polynomial, commitment] : zip_view(proving_key->polynomials.get_precomputed(), vk.get_all())) {
        commitment = proving_key->commitment_key.commit(polynomial);
    }
    return vk;
}

// Compute VK hash from fixed commitments (for test verification that vk_hash() is correct)
ECCVMFlavor::BF compute_eccvm_vk_hash()
{
    std::vector<ECCVMFlavor::BF> elements;
    // Serialize commitments using the Codec
    for (const auto& commitment : ECCVMHardcodedVKAndHash::get_all()) {
        auto frs = ECCVMFlavor::Codec::serialize_to_fields(commitment);
        for (const auto& fr : frs) {
            elements.push_back(fr);
        }
    }
    return ECCVMFlavor::HashFunction::hash(elements);
}

class ECCVMTests : public ::testing::Test {
  protected:
    void SetUp() override
    {
        srs::init_file_crs_factory(bb::srs::bb_crs_path());
        static const bool grumpkin_srs_initialized = []() {
            srs::init_grumpkin_mem_crs_factory(srs::generate_grumpkin_srs(ECCVMFlavor::ECCVM_FIXED_SIZE));
            return true;
        }();
        static_cast<void>(grumpkin_srs_initialized);
    };
};
namespace {
auto& engine = numeric::get_debug_randomness();
} // namespace

/**
 * @brief Adds operations in BN254 to the op_queue and then constructs and ECCVM circuit from the op_queue.
 *
 * @param engine
 * @return ECCVMCircuitBuilder
 */
ECCVMCircuitBuilder generate_circuit(numeric::RNG* engine = nullptr)
{
    using Curve = curve::BN254;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;

    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    G1 a = G1::random_element(engine);
    G1 b = G1::random_element(engine);
    G1 c = G1::random_element(engine);
    Fr x = Fr::random_element(engine);
    Fr y = Fr::random_element(engine);

    op_queue->add_accumulate(a);
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, x);
    op_queue->mul_accumulate(b, y);
    op_queue->add_accumulate(a);
    op_queue->mul_accumulate(b, x);
    op_queue->eq_and_reset();
    op_queue->add_accumulate(c);
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, x);
    op_queue->eq_and_reset();
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(b, x);
    op_queue->mul_accumulate(c, x);
    op_queue->merge();
    add_hiding_op_for_test(op_queue);
    ECCVMCircuitBuilder builder{ op_queue };
    return builder;
}

// returns a CircuitBuilder consisting of mul_add ops of the following form: either 0*g, for a group element, or
// x * e, where x is a scalar and e is the identity element of the group.
ECCVMCircuitBuilder generate_zero_circuit([[maybe_unused]] numeric::RNG* engine = nullptr, bool zero_scalars = 1)
{
    using Curve = curve::BN254;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;

    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();

    if (!zero_scalars) {
        for (auto i = 0; i < 8; i++) {
            Fr x = Fr::random_element(engine);
            op_queue->mul_accumulate(Curve::Group::affine_point_at_infinity, x);
        }
    } else {
        for (auto i = 0; i < 8; i++) {
            G1 g = G1::random_element(engine);
            op_queue->mul_accumulate(g, 0);
        }
    }
    op_queue->merge();
    add_hiding_op_for_test(op_queue);

    ECCVMCircuitBuilder builder{ op_queue };
    return builder;
}

void complete_proving_key_for_test(bb::RelationParameters<FF>& relation_parameters,
                                   std::shared_ptr<PK>& pk,
                                   std::vector<FF>& gate_challenges)
{
    // Prepare the inputs for the sumcheck prover:
    // Compute and add beta to relation parameters
    const FF beta = FF::random_element();
    const FF gamma = FF::random_element();
    const FF beta_sqr = beta * beta;
    const FF beta_quartic = beta_sqr * beta_sqr;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta_sqr;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.beta_quartic = beta_quartic;
    auto first_term_tag = beta_quartic; // FIRST_TERM_TAG (= 1) * beta_quartic
    relation_parameters.eccvm_set_permutation_delta = (gamma + first_term_tag) * (gamma + beta_sqr + first_term_tag) *
                                                      (gamma + beta_sqr + beta_sqr + first_term_tag) *
                                                      (gamma + beta_sqr + beta_sqr + beta_sqr + first_term_tag);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();

    // Compute z_perm and inverse polynomial for our logarithmic-derivative lookup method
    // Skip the disabled head region to preserve masking values
    compute_logderivative_inverse<FF, ECCVMFlavor::LookupRelation, ECCVMFlavor::ProverPolynomials, true>(
        pk->polynomials, relation_parameters, ECCVMFlavor::TRACE_OFFSET);
    compute_grand_products<ECCVMFlavor>(pk->polynomials, relation_parameters);

    // Generate gate challenges
    for (size_t idx = 0; idx < CONST_ECCVM_LOG_N; idx++) {
        gate_challenges[idx] = FF::random_element();
    }
}
TEST_F(ECCVMTests, ZeroesCoefficients)
{
    ECCVMCircuitBuilder builder = generate_zero_circuit(&engine, 1);

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    ASSERT_TRUE(eccvm_result.reduction_succeeded);
}

// Calling get_eccvm_ops without a hiding op should throw
TEST_F(ECCVMTests, MissingHidingOpThrows)
{
    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    // get_eccvm_ops() requires a hiding op to have been set; throws "Hiding op must be set before calling
    // get_eccvm_ops()"
    EXPECT_THROW(op_queue->get_eccvm_ops(), std::runtime_error);
}

// Note that `NullOpQueue` is somewhat misleading, as we add a hiding operation.
TEST_F(ECCVMTests, NullOpQUeue)
{
    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    add_hiding_op_for_test(op_queue);
    ECCVMCircuitBuilder builder{ op_queue };
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    ASSERT_TRUE(eccvm_result.reduction_succeeded);
}

TEST_F(ECCVMTests, PointAtInfinity)
{
    ECCVMCircuitBuilder builder = generate_zero_circuit(&engine, 0);

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    ASSERT_TRUE(eccvm_result.reduction_succeeded);
}

TEST_F(ECCVMTests, ShortMonomialProverVerifies)
{
    ECCVMCircuitBuilder builder = generate_circuit(&engine);

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    EXPECT_EQ(proof.size(), ECCVMFlavor::PROOF_LENGTH);

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    // The TripleIPA opening is produced inside construct_proof and carried on prover.ipa_proof; discharge it
    // against the reconstructed claim.
    auto ipa_verifier_transcript = std::make_shared<Transcript>(prover.ipa_proof);
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    bool ipa_verified =
        ECCVMVerifier::TripleIPA::reduce_verify(ipa_vk, eccvm_result.triple_ipa_claim, ipa_verifier_transcript);

    ASSERT_TRUE(ipa_verified && eccvm_result.reduction_succeeded);
}

namespace {
// Build a length-2 edge input (one ProverUnivariate per entity), mirroring the translator equivalence test.
ECCVMFlavor::ProverUnivariates<2> get_short_edge_input(bool random_inputs)
{
    ECCVMFlavor::ProverUnivariates<2> result;
    FF value = 0;
    for (auto& edge : result.get_all()) {
        if (random_inputs) {
            edge = bb::Univariate<FF, 2>({ FF::random_element(), FF::random_element() });
        } else {
            value += 1;
            edge = bb::Univariate<FF, 2>({ value, value + 1 });
            value += 1;
        }
    }
    return result;
}

template <typename ShortRelation>
auto accumulate_short_relation(const ECCVMFlavor::ProverUnivariates<2>& in,
                               const RelationParameters<FF>& params,
                               const FF& scaling_factor)
{
    typename ShortRelation::SumcheckTupleOfUnivariatesOverSubrelations accumulators{};
    ShortRelation::accumulate(accumulators, in, params, scaling_factor);
    return accumulators;
}

// Compare one short relation's subrelations against the full relation's subrelations starting at `Offset`. ECCVM
// legacy relations over-provision every subrelation to a uniform length while the short relations declare the true
// (smaller) per-subrelation degree, so each short subrelation is extended up to the legacy length before comparison.
template <size_t Offset, typename FullTuple, typename ShortTuple, size_t... Js>
void compare_subrelation_block(const FullTuple& full_acc, const ShortTuple& short_acc, std::index_sequence<Js...>)
{
    (
        [&] {
            constexpr size_t full_idx = Offset + Js;
            constexpr size_t full_length = std::tuple_element_t<full_idx, FullTuple>::LENGTH;
            EXPECT_EQ(std::get<Js>(short_acc).template extend_to<full_length>(), std::get<full_idx>(full_acc));
        }(),
        ...);
}

// Base case: every legacy subrelation must have been covered by exactly one short subrelation.
template <size_t Offset, typename FullTuple> void compare_short_blocks(const FullTuple&)
{
    static_assert(Offset == std::tuple_size_v<FullTuple>,
                  "short relations must cover exactly the legacy relation's subrelations");
}

// Walk the short relations in flavor order, matching each against the corresponding contiguous slice of the full
// relation's subrelations. Index-aligned equality also confirms the split short relations reproduce the legacy
// global subrelation ordering (and hence the alpha batching).
template <size_t Offset, typename FullTuple, typename ShortHead, typename... ShortTail>
void compare_short_blocks(const FullTuple& full_acc, const ShortHead& head, const ShortTail&... tail)
{
    constexpr size_t head_size = std::tuple_size_v<ShortHead>;
    compare_subrelation_block<Offset>(full_acc, head, std::make_index_sequence<head_size>{});
    compare_short_blocks<Offset + head_size>(full_acc, tail...);
}

template <typename FullRelation, typename... ShortRelations>
void expect_short_relations_match_full_edges(const ECCVMFlavor::ProverUnivariates<2>& in,
                                             const RelationParameters<FF>& params,
                                             const FF& scaling_factor)
{
    ECCVMFlavor::ExtendedEdges extended_edges;
    for (auto [extended_edge, short_edge] : zip_view(extended_edges.get_all(), in.get_all())) {
        extended_edge = short_edge.template extend_to<ECCVMFlavor::MAX_PARTIAL_RELATION_LENGTH>();
    }

    typename FullRelation::SumcheckTupleOfUnivariatesOverSubrelations full_acc{};
    FullRelation::accumulate(full_acc, extended_edges, params, scaling_factor);

    compare_short_blocks<0>(full_acc, accumulate_short_relation<ShortRelations>(in, params, scaling_factor)...);
}
} // namespace

// Each ECCVM short relation (some of which split a single legacy relation across several short relations) must
// produce, edge-for-edge, the same per-subrelation contributions as its legacy counterpart. This is the soundness
// guard for the prover-only short path: the legacy verifier (native and recursive) only ever evaluates the full
// relations, so a divergence here would make the short-prover's proof unverifiable.
TEST_F(ECCVMTests, ShortMonomialRelationsMatchFullEdgeRelations)
{
    const auto run_test = [&](bool random_inputs) {
        const auto input = get_short_edge_input(random_inputs);
        const auto params = RelationParameters<FF>::get_random();
        const FF scaling_factor = random_inputs ? FF::random_element() : FF(7);

        expect_short_relations_match_full_edges<ECCVMTranscriptRelation<FF>,
                                                ECCVMTranscriptShortRelation<FF>,
                                                ECCVMTranscriptMsmTransitionShortRelation<FF>>(
            input, params, scaling_factor);
        expect_short_relations_match_full_edges<ECCVMPointTableRelation<FF>,
                                                ECCVMPointTableDoubleShortRelation<FF>,
                                                ECCVMPointTableShortRelation<FF>>(input, params, scaling_factor);
        expect_short_relations_match_full_edges<ECCVMWnafRelation<FF>, ECCVMWnafShortRelation<FF>>(
            input, params, scaling_factor);
        expect_short_relations_match_full_edges<ECCVMMSMRelation<FF>,
                                                ECCVMMSMAddShortRelation<FF>,
                                                ECCVMMSMDoubleShortRelation<FF>,
                                                ECCVMMSMSkewShortRelation<FF>,
                                                ECCVMMSMShortRelation<FF>>(input, params, scaling_factor);
        expect_short_relations_match_full_edges<ECCVMSetRelation<FF>, ECCVMSetShortRelation<FF>>(
            input, params, scaling_factor);
        expect_short_relations_match_full_edges<ECCVMLookupRelation<FF>, ECCVMLookupShortRelation<FF>>(
            input, params, scaling_factor);
        expect_short_relations_match_full_edges<ECCVMBoolsRelation<FF>,
                                                ECCVMBoolsTranscriptShortRelation<FF>,
                                                ECCVMBoolsMsmShortRelation<FF>>(input, params, scaling_factor);
    };

    run_test(/*random_inputs=*/false);
    run_test(/*random_inputs=*/true);
}

TEST_F(ECCVMTests, ScalarEdgeCase)
{
    using Curve = curve::BN254;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;

    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    G1 a = G1::one();

    op_queue->mul_accumulate(a, Fr(uint256_t(1) << 128));
    op_queue->eq_and_reset();
    op_queue->merge();
    add_hiding_op_for_test(op_queue);
    ECCVMCircuitBuilder builder{ op_queue };

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    ASSERT_TRUE(eccvm_result.reduction_succeeded);
}
/**
 * @brief Check that size of a ECCVM proof matches the corresponding constant
 *@details If this test FAILS, then the following (non-exhaustive) list should probably be updated as well:
 * - Proof length formula in eccvm_flavor.hpp, etc...
 * - eccvm_transcript.test.cpp
 * - constants in yarn-project in: constants.nr, constants.gen.ts, ConstantsGen.sol
 */
TEST_F(ECCVMTests, ProofLengthCheck)
{
    ECCVMCircuitBuilder builder = generate_circuit(&engine);

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();
    EXPECT_EQ(proof.size(), ECCVMFlavor::PROOF_LENGTH);
}

TEST_F(ECCVMTests, BaseCaseFixedSize)
{
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover = [&]() {
        ECCVMCircuitBuilder builder = generate_circuit(&engine);
        return ECCVMProver(builder, prover_transcript);
    }();

    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    ASSERT_TRUE(eccvm_result.reduction_succeeded);
}

TEST_F(ECCVMTests, EqFailsFixedSize)
{
    auto builder = generate_circuit(&engine);
    // Tamper with the eq op such that the expected value is incorect
    builder.op_queue->add_erroneous_equality_op_for_testing();
    builder.op_queue->merge();

    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);

    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    ASSERT_FALSE(eccvm_result.reduction_succeeded);
}

TEST_F(ECCVMTests, CommittedSumcheck)
{
    using Flavor = ECCVMFlavor;
    using ProvingKey = ECCVMFlavor::ProvingKey;
    using FF = ECCVMFlavor::FF;
    using Transcript = Flavor::Transcript;
    using ZKData = ZKSumcheckData<Flavor>;

    bb::RelationParameters<FF> relation_parameters;
    std::vector<FF> gate_challenges(CONST_ECCVM_LOG_N);

    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto pk = std::make_shared<ProvingKey>(builder);

    // Prepare the inputs for the sumcheck prover:
    // Compute and add beta to relation parameters
    const FF alpha = FF::random_element();
    complete_proving_key_for_test(relation_parameters, pk, gate_challenges);

    // Clear the transcript
    prover_transcript = std::make_shared<Transcript>();

    // Run Sumcheck on the ECCVM Prover polynomials
    using SumcheckProver = SumcheckProver<ECCVMFlavor>;
    SumcheckProver sumcheck_prover(pk->circuit_size,
                                   pk->polynomials,
                                   prover_transcript,
                                   alpha,
                                   gate_challenges,
                                   relation_parameters,
                                   CONST_ECCVM_LOG_N);

    ZKData zk_sumcheck_data = ZKData(CONST_ECCVM_LOG_N, prover_transcript);
    auto prover_output = sumcheck_prover.prove(zk_sumcheck_data);

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>(prover_transcript->export_proof());

    // Execute Sumcheck Verifier
    SumcheckVerifier<Flavor> sumcheck_verifier(verifier_transcript, alpha, CONST_ECCVM_LOG_N);
    SumcheckOutput<ECCVMFlavor> verifier_output = sumcheck_verifier.verify(relation_parameters, gate_challenges);

    // Evaluate prover's round univariates at corresponding challenges and compare them with the claimed evaluations
    // computed by the verifier
    for (size_t idx = 0; idx < CONST_ECCVM_LOG_N; idx++) {
        FF true_eval_at_the_challenge = prover_output.round_univariates[idx].evaluate(prover_output.challenge[idx]);
        FF verifier_eval_at_the_challenge = verifier_output.round_univariate_evaluations[idx][2];
        EXPECT_TRUE(true_eval_at_the_challenge == verifier_eval_at_the_challenge);
    }

    // Check that the first sumcheck univariate is consistent with the claimed ZK Sumchek Sum
    FF prover_target_sum = zk_sumcheck_data.libra_challenge * zk_sumcheck_data.libra_total_sum;

    EXPECT_TRUE(prover_target_sum == verifier_output.round_univariate_evaluations[0][0] +
                                         verifier_output.round_univariate_evaluations[0][1]);

    EXPECT_TRUE(verifier_output.verified);
}

/**
 * @brief Regression test: transcript_base_infinity soundness vulnerability.
 *
 * @details Constructs 2 MULs: mul(a, x) and mul(infinity, y). The honest
 * computation yields a*x (since infinity*y contributes nothing). After building
 * the prover, we replace transcript_Px/Py at the infinity-mul row with a valid
 * on-curve point b. This makes the committed transcript look like:
 *     mul(a, x), mul(b, y), eq(a*x)
 * where the honest result should be a*x + b*y, not a*x.
 *
 * We then generate a full ECCVM proof and verify it (IPA included).
 * Before the fix (constraining Px/Py = 0 when base_infinity = 1), this proof
 * would VERIFY, demonstrating a soundness break. After the fix, the proof
 * must FAIL verification.
 */
TEST_F(ECCVMTests, BaseInfinityForgedCoordinatesRejected)
{
    using Curve = curve::BN254;
    using G1 = Curve::Element;
    using Fr = Curve::ScalarField;

    auto generators = Curve::Group::derive_generators("base_infinity_regression", 2);
    G1 a = generators[0];
    G1 b = generators[1]; // the point the attacker tries to smuggle in
    Fr x = Fr::random_element(&engine);
    Fr y = Fr::random_element(&engine);

    // Honest vs forged results
    G1 honest_result = a * x + b * y;
    G1 forged_result = a * x;
    ASSERT_NE(honest_result, forged_result) << "Need b*y != 0 for a meaningful attack";

    // Build the circuit: mul(a, x), mul(infinity, y), eq_and_reset()
    // The op queue honestly computes a*x + infinity*y = a*x. Eq point = a*x.
    // The builder sets base_infinity=1 at the second mul row.
    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    op_queue->mul_accumulate(a, x);
    op_queue->mul_accumulate(Curve::Group::affine_point_at_infinity, y);
    op_queue->eq_and_reset();
    op_queue->merge();
    add_hiding_op_for_test(op_queue);

    ECCVMCircuitBuilder builder{ op_queue };

    // Create prover (polynomials are built in the constructor)
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);

    // Find the mul row with base_infinity=1
    auto& polys = prover.key->polynomials;
    const size_t num_rows = polys.get_polynomial_size();
    size_t forged_row = 0;
    for (size_t i = 0; i < num_rows; i++) {
        if (polys.transcript_op[i] == FF(4) && polys.transcript_base_infinity[i] == FF(1)) {
            forged_row = i;
            break;
        }
    }
    ASSERT_GT(forged_row, size_t(0)) << "Could not find infinity mul row";

    // Replace transcript_Px/Py with valid on-curve point b.
    // After this, the committed transcript says: mul(a,x), mul(b,y), eq(a*x)
    // Honest result = a*x + b*y, but the proof will claim a*x.
    auto b_affine = Curve::Group::affine_element(b);
    polys.transcript_Px.at(forged_row) = b_affine.x;
    polys.transcript_Py.at(forged_row) = b_affine.y;

    // Generate proof from modified polynomials
    auto proof = prover.construct_proof();

    // Verify the ECCVM proof
    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);
    auto eccvm_result = verifier.reduce_to_triple_ipa_claim();

    bool proof_verified = eccvm_result.reduction_succeeded;

    EXPECT_FALSE(proof_verified)
        << "REGRESSION: Forged ECCVM proof must NOT verify after base_infinity coordinate constraints";
}

/**
 * @brief Test that the fixed VK from the default constructor agrees with the one computed for an arbitrary circuit.
 * @note If this test fails, it may be because the constant ECCVM_FIXED_SIZE has changed and the fixed VK commitments in
 * ECCVMHardcodedVKAndHash must be updated accordingly. Their values can be taken right from the output of this test.
 *
 */
TEST_F(ECCVMTests, FixedVK)
{
    // Generate a circuit and its verification key (computed at runtime from the proving key)
    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
    ECCVMProver prover(builder, prover_transcript);
    auto proof = prover.construct_proof();

    std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
    ECCVMVerifier verifier(verifier_transcript, proof);

    // Generate the default fixed VK
    ECCVMFlavor::VerificationKey fixed_vk{};
    // Generate a VK from PK
    ECCVMFlavor::VerificationKey vk_computed_by_prover = create_vk_from_proving_key(prover.key);

    const auto& labels = bb::ECCVMFlavor::VerificationKey::get_labels();
    size_t index = 0;
    for (auto [vk_commitment, fixed_commitment] : zip_view(vk_computed_by_prover.get_all(), fixed_vk.get_all())) {
        EXPECT_EQ(vk_commitment, fixed_commitment)
            << "Mismatch between vk_commitment and fixed_commitment at label: " << labels[index];
        ++index;
    }

    // Check that the fixed VK is equal to the generated VK
    EXPECT_EQ(fixed_vk, vk_computed_by_prover);

    // Verify that the hardcoded VK hash matches the computed hash
    auto computed_hash = compute_eccvm_vk_hash();
    auto hardcoded_hash = ECCVMHardcodedVKAndHash::vk_hash();
    if (computed_hash != hardcoded_hash) {
        info("VK hash mismatch! Update ECCVMHardcodedVKAndHash::vk_hash() with:");
        info("0x", computed_hash);
    }
    EXPECT_EQ(computed_hash, hardcoded_hash) << "Hardcoded VK hash does not match computed hash";
}

/**
 * @brief Verify that every ECCVM witness polynomial has masking values in the reserved head region.
 * @details All witness polynomials (wires, z_perm, lookup_inverses) should have non-zero random values
 * at rows 1..NUM_MASKED_ROWS (the masking region). Precomputed polynomials should NOT be masked.
 */
TEST_F(ECCVMTests, WitnessPolynomialsMasked)
{
    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    ECCVMFlavor::ProverPolynomials polynomials(builder);

    // Every witness polynomial should have at least one non-zero masking value
    auto check_masked = [](const auto& poly, const std::string& label) {
        bool has_masking = false;
        for (size_t j = 0; j < NUM_MASKED_ROWS; j++) {
            has_masking |= !poly[NUM_ZERO_ROWS + j].is_zero();
        }
        EXPECT_TRUE(has_masking) << label << " should be masked but has all zeros in masking region";
    };

    ECCVMFlavor::CommitmentLabels labels;
    for (auto [poly, label] : zip_view(polynomials.get_wires(), labels.get_wires())) {
        check_masked(poly, label);
    }
    check_masked(polynomials.z_perm, "z_perm");
    check_masked(polynomials.lookup_inverses, "lookup_inverses");
}

/**
 * @brief Verify that REPEATED_COMMITMENTS indices correctly pair to-be-shifted and shifted commitments.
 * @details Mirrors the Shplemini commitment vector construction: [Q, unshifted_comms..., to_be_shifted_comms...],
 * then applies offset = HasZK ? 2 : 1, and checks commitments[original_start + offset + i] ==
 * commitments[duplicate_start + offset + i]. This is a one-time substitute for the runtime BB_ASSERTs
 * in remove_repeated_commitments.
 */
TEST_F(ECCVMTests, RepeatedCommitmentsIndicesCorrect)
{
    ECCVMCircuitBuilder builder = generate_circuit(&engine);
    auto pk = std::make_shared<PK>(builder);
    pk->commitment_key = ECCVMFlavor::CommitmentKey(pk->circuit_size);

    auto unshifted = pk->polynomials.get_unshifted();
    auto to_be_shifted = pk->polynomials.get_to_be_shifted();

    constexpr auto repeated = ECCVMFlavor::REPEATED_COMMITMENTS;
    ASSERT_EQ(to_be_shifted.size(), repeated.first.count);

    // Build the commitment vector exactly as Shplemini does: [Q, unshifted..., to_be_shifted...]
    const auto& ck = pk->commitment_key;
    std::vector<ECCVMFlavor::Commitment> commitments;
    commitments.push_back(ECCVMFlavor::Commitment::one()); // dummy Q
    for (auto& poly : unshifted) {
        commitments.push_back(ck.commit(poly));
    }
    for (auto& poly : to_be_shifted) {
        commitments.push_back(ck.commit(poly));
    }

    // Same offset logic as remove_repeated_commitments
    constexpr size_t offset = ECCVMFlavor::HasZK ? 2 : 1;
    for (size_t i = 0; i < repeated.first.count; i++) {
        EXPECT_EQ(commitments[repeated.first.original_start + offset + i],
                  commitments[repeated.first.duplicate_start + offset + i])
            << "REPEATED_COMMITMENTS commitment mismatch at index " << i;
    }
}
