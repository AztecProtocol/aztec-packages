/**
 * @brief Gate count estimation for the BaseFold recursive verifier circuit.
 *
 * Simulates the verifier's in-circuit operations for a 2^15 MSM with
 * FRI blowup factor 8 (domain size 2^18, 18 fold rounds, 43 queries).
 *
 * Reports gate counts for:
 *   - Single fold consistency check (4 Grumpkin scalar muls)
 *   - Single Merkle path verification (Poseidon2 hashes)
 *   - One complete query (18 rounds of fold + Merkle)
 *   - Full verifier (43 queries)
 *
 * Also computes native proof size.
 */
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

namespace {

using Builder = bb::UltraCircuitBuilder;
using field_ct = bb::stdlib::field_t<Builder>;
using witness_ct = bb::stdlib::witness_t<Builder>;
using cycle_group_ct = bb::stdlib::cycle_group<Builder>;
using cycle_scalar_ct = bb::stdlib::cycle_scalar<Builder>;
using Poseidon2 = bb::stdlib::poseidon2<Builder>;
using Fq_native = bb::fq; // Grumpkin scalar field = BN254 base field (domain elements live here)
using Fr_native = bb::fr; // BN254 scalar field = Grumpkin base field (circuit native field)
using Grumpkin = bb::grumpkin::g1;

// Parameters for 2^15 MSM with blowup 8
constexpr size_t LOG_MSM_SIZE = 15;
constexpr size_t BLOWUP_BITS = 3;
constexpr size_t LOG_DOMAIN_SIZE = LOG_MSM_SIZE + BLOWUP_BITS; // 18
constexpr size_t NUM_FOLD_ROUNDS = LOG_DOMAIN_SIZE;            // 18
constexpr size_t NUM_QUERIES = 43;                             // ~128 bits security

/**
 * @brief Measure gates for a single fold consistency check.
 *
 * The fold formula (when e > 0) does 4 operations on group elements:
 *   a      = G_0 · s0^{-e}     (witness point × constant scalar)
 *   b      = G_1 · s1^{-e}     (witness point × constant scalar)
 *   slope  = (b - a) · diff_inv (witness point × constant scalar)
 *   result = a + slope · (z-s0) (witness point × witness scalar)
 *
 * Three of these use constant scalars (precomputed from the domain), which
 * cycle_group handles more cheaply than witness scalars.  Only the final
 * multiplication by (z - s0) involves a witness scalar.
 *
 * When e == 0 (last round, degree_bound == 2), no normalization is needed
 * and there are only 2 operations.
 *
 * Note: the α,β reformulation (fold = G_0·α + G_1·β) was benchmarked and is
 * SLOWER (~10,200 gates) because α,β are witness bigfield values requiring
 * expensive non-native field arithmetic (~5,100 gates).  The 4-mul form wins
 * because constant-scalar muls are cheap in cycle_group.
 */
size_t measure_fold_check_gates(bool e_is_zero)
{
    auto& engine = bb::numeric::get_debug_randomness();
    Builder builder;

    // Two witness Grumpkin points (the opened pair)
    auto p0_native = Grumpkin::element::random_element(&engine).normalize();
    auto p1_native = Grumpkin::element::random_element(&engine).normalize();
    auto G0 = cycle_group_ct::from_witness(&builder, p0_native);
    auto G1 = cycle_group_ct::from_witness(&builder, p1_native);

    // Constant scalars (precomputed from domain)
    auto s0_e_inv_native = Fq_native::random_element(&engine);
    auto s1_e_inv_native = Fq_native::random_element(&engine);
    auto diff_inv_native = Fq_native::random_element(&engine);
    auto s0_native = Fq_native::random_element(&engine);

    // Witness challenge z (from transcript)
    auto z_native = Fq_native::random_element(&engine);

    using BigScalarField = bb::stdlib::bigfield<Builder, bb::Bn254FqParams>;

    if (e_is_zero) {
        // slope = (G1 - G0) · diff_inv     [witness point × constant scalar]
        auto diff = G1 - G0;
        auto diff_inv_scalar = BigScalarField(diff_inv_native); // constant
        auto slope = diff * diff_inv_scalar;

        // result = G0 + slope · (z - s0)   [witness point × witness scalar]
        auto z_scalar = BigScalarField::from_witness(&builder, z_native);
        auto s0_scalar = BigScalarField(s0_native); // constant
        auto z_minus_s0 = z_scalar - s0_scalar;
        auto result = G0 + slope * z_minus_s0;

        static_cast<void>(result.get_value());
    } else {
        // a = G0 · s0^{-e}                 [witness point × constant scalar]
        auto s0_e_inv_scalar = BigScalarField(s0_e_inv_native); // constant
        auto a = G0 * s0_e_inv_scalar;

        // b = G1 · s1^{-e}                 [witness point × constant scalar]
        auto s1_e_inv_scalar = BigScalarField(s1_e_inv_native); // constant
        auto b = G1 * s1_e_inv_scalar;

        // slope = (b - a) · diff_inv        [witness point × constant scalar]
        auto diff = b - a;
        auto diff_inv_scalar = BigScalarField(diff_inv_native); // constant
        auto slope = diff * diff_inv_scalar;

        // result = a + slope · (z - s0)     [witness point × witness scalar]
        auto z_scalar = BigScalarField::from_witness(&builder, z_native);
        auto s0_scalar = BigScalarField(s0_native); // constant
        auto z_minus_s0 = z_scalar - s0_scalar;
        auto result = a + slope * z_minus_s0;

        static_cast<void>(result.get_value());
    }

    builder.finalize_circuit(/*ensure_nonzero=*/false);
    return builder.get_num_finalized_gates();
}

/**
 * @brief Measure gates for Merkle path verification of depth `depth`.
 *
 * Each level: Poseidon2 hash of 2 field elements.
 * Leaf hash: Poseidon2(x, y) for a Grumpkin point.
 * We hash x,y as circuit witnesses (the full point).
 *
 * For the "x-only" variant, leaf hash is Poseidon2(x) and we do
 * an on-curve check: y^2 == x^3 + b.
 */
size_t measure_merkle_path_gates(size_t depth, bool x_only_leaves)
{
    auto& engine = bb::numeric::get_debug_randomness();
    Builder builder;

    // Leaf element (witness Grumpkin point)
    auto pt_native = Grumpkin::element::random_element(&engine).normalize();
    field_ct x_ct = witness_ct(&builder, pt_native.x);
    field_ct y_ct = witness_ct(&builder, pt_native.y);

    // Leaf hash
    field_ct current;
    if (x_only_leaves) {
        // Hash only x, then constrain y^2 = x^3 + b
        current = Poseidon2::hash({ x_ct });
        auto x3 = x_ct * x_ct * x_ct;
        auto b_ct = field_ct(&builder, bb::grumpkin::g1::curve_b);
        auto y_sq = y_ct * y_ct;
        auto rhs = x3 + b_ct;
        y_sq.assert_equal(rhs);
    } else {
        current = Poseidon2::hash({ x_ct, y_ct });
    }

    // Path hashes
    for (size_t i = 0; i < depth; i++) {
        field_ct sibling = witness_ct(&builder, Fr_native::random_element(&engine));
        // Alternate left/right (doesn't matter for gate count)
        if (i % 2 == 0) {
            current = Poseidon2::hash({ current, sibling });
        } else {
            current = Poseidon2::hash({ sibling, current });
        }
    }

    // Constrain root
    field_ct expected_root = witness_ct(&builder, Fr_native::random_element(&engine));
    current.assert_equal(expected_root);

    builder.finalize_circuit(/*ensure_nonzero=*/false);
    return builder.get_num_finalized_gates();
}

/**
 * @brief Compute native proof size for the BaseFold protocol.
 *
 * Proof elements (all in BN254 Fr):
 *   - num_rounds Merkle roots: num_rounds * 1 Fr
 *   - 1 final group element: 2 Fr (x, y)
 *   - Per query, per round:
 *       - 2 group element openings: 2 * 2 Fr = 4 Fr
 *       - 2 Merkle paths of depth log2(oracle_size): 2 * depth Fr
 *       - 1 fold result: 2 Fr
 *     Total per query per round: 6 + 2*depth Fr
 */
void print_proof_size()
{
    size_t num_rounds = NUM_FOLD_ROUNDS;
    size_t num_queries = NUM_QUERIES;

    // Fixed part
    size_t fixed_fr = num_rounds + 2; // roots + final element

    // Per-query part
    size_t per_query_fr = 0;
    for (size_t round = 0; round < num_rounds; round++) {
        size_t log_oracle = LOG_DOMAIN_SIZE - round;
        size_t depth = log_oracle;
        // 2 openings (2 Fr each) + 2 paths (depth Fr each) + 1 fold result (2 Fr)
        per_query_fr += 4 + 2 * depth + 2;
    }

    size_t total_fr = fixed_fr + num_queries * per_query_fr;
    size_t total_bytes = total_fr * 32; // each Fr is 32 bytes

    info("=== Native Proof Size ===");
    info("  Rounds: ", num_rounds);
    info("  Queries: ", num_queries);
    info("  Fixed overhead: ", fixed_fr, " Fr elements");
    info("  Per query: ", per_query_fr, " Fr elements");
    info("  Total: ", total_fr, " Fr elements = ", total_bytes, " bytes = ", total_bytes / 1024, " KiB");
}

class BaseFoldCircuitCostTest : public ::testing::Test {};

TEST_F(BaseFoldCircuitCostTest, FoldCheckGates)
{
    size_t gates_e_nonzero = measure_fold_check_gates(/*e_is_zero=*/false);
    size_t gates_e_zero = measure_fold_check_gates(/*e_is_zero=*/true);

    info("=== Fold Consistency Check Gates ===");
    info("  e > 0 (4 ops: 3 const-scalar + 1 witness-scalar): ", gates_e_nonzero, " gates");
    info("  e == 0 (2 ops: 1 const-scalar + 1 witness-scalar): ", gates_e_zero, " gates");
}

TEST_F(BaseFoldCircuitCostTest, MerklePathGates)
{
    info("=== Merkle Path Verification Gates ===");
    info("  (hash x,y leaves):");
    for (size_t depth : { size_t(1), size_t(5), size_t(10), size_t(18) }) {
        size_t gates = measure_merkle_path_gates(depth, /*x_only_leaves=*/false);
        info("    depth ", depth, ": ", gates, " gates");
    }
    info("  (hash x-only leaves, with on-curve check):");
    for (size_t depth : { size_t(1), size_t(5), size_t(10), size_t(18) }) {
        size_t gates = measure_merkle_path_gates(depth, /*x_only_leaves=*/true);
        info("    depth ", depth, ": ", gates, " gates");
    }
}

TEST_F(BaseFoldCircuitCostTest, FullVerifierEstimate)
{
    // Measure building blocks
    size_t fold_e_nonzero = measure_fold_check_gates(false);
    size_t fold_e_zero = measure_fold_check_gates(true);

    // Merkle depth per round: round r has oracle size 2^{18-r}, depth = 18-r.
    // Two paths per round per query.
    size_t merkle_total_per_query = 0;
    for (size_t round = 0; round < NUM_FOLD_ROUNDS; round++) {
        size_t depth = LOG_DOMAIN_SIZE - round;
        size_t gates = measure_merkle_path_gates(depth, /*x_only_leaves=*/false);
        merkle_total_per_query += 2 * gates; // 2 paths per round
    }

    // Fold gates per query: 17 rounds with e>0, 1 round with e==0
    size_t fold_per_query = ((NUM_FOLD_ROUNDS - 1) * fold_e_nonzero) + fold_e_zero;

    size_t per_query_total = fold_per_query + merkle_total_per_query;

    info("=== Full Verifier Gate Estimate (", LOG_MSM_SIZE, "-bit MSM, blowup ", (1 << BLOWUP_BITS), ") ===");
    info("  Fold rounds: ", NUM_FOLD_ROUNDS);
    info("  Queries: ", NUM_QUERIES);
    info("");
    info("  Fold gates per query: ", fold_per_query);
    info("    (", NUM_FOLD_ROUNDS - 1, " rounds e>0 @ ", fold_e_nonzero, " + 1 round e==0 @ ", fold_e_zero, ")");
    info("  Merkle gates per query (hash x,y): ", merkle_total_per_query);
    info("");
    info("  Per query total: ", per_query_total);
    info("  Full verifier (", NUM_QUERIES, " queries): ", NUM_QUERIES * per_query_total, " gates");
    info("  Log2: ", std::log2(static_cast<double>(NUM_QUERIES * per_query_total)));

    // Also print proof size
    info("");
    print_proof_size();
}

} // anonymous namespace
