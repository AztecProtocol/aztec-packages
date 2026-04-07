#include "poseidon2_final_prover.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

using Params = crypto::Poseidon2Bn254ScalarFieldParams;
using Perm = crypto::Poseidon2Permutation<Params>;

Poseidon2FinalProver::Poseidon2FinalProver(const std::vector<Poseidon2OpQueue::Poseidon2Op>& ops,
                                           const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{
    key = std::make_shared<ProvingKey>(ops.size());
    build_witness(ops);
    key->commitment_key = CommitmentKey(key->circuit_size);
}

/**
 * @brief Build all witness polynomials from the Poseidon2 op list.
 * @details For each op, populates w_l/w_r/w_o/w_4 with the 4 input values,
 * q_poseidon2_single_row with 1, and the 88 poseidon2_state columns
 * with the intermediate witness data for the Poseidon2SingleRowRelation.
 */
void Poseidon2FinalProver::build_witness(const std::vector<Poseidon2OpQueue::Poseidon2Op>& ops)
{
    const size_t num_ops = ops.size();
    const size_t circuit_size = key->circuit_size;
    auto& polys = key->polynomials;

    // Allocate polynomials with active range = num_ops + 1 (for zero row), virtual size = circuit_size
    const size_t active_size = num_ops + 1;
    polys.q_poseidon2_single_row = Polynomial(active_size, circuit_size);
    polys.w_l = Polynomial(active_size, circuit_size);
    polys.w_r = Polynomial(active_size, circuit_size);
    polys.w_o = Polynomial(active_size, circuit_size);
    polys.w_4 = Polynomial(active_size, circuit_size);
    for (auto& p : polys.poseidon2_state) {
        p = Polynomial(active_size, circuit_size);
    }

    // Populate witness for each hash (1 row per hash, starting at row 1 to skip zero row)
    for (size_t i = 0; i < num_ops; i++) {
        const size_t row = i + 1; // skip zero row
        const auto& op = ops[i];

        // Set selector
        polys.q_poseidon2_single_row.at(row) = FF(1);

        // Set wire inputs
        polys.w_l.at(row) = op.input[0];
        polys.w_r.at(row) = op.input[1];
        polys.w_o.at(row) = op.input[2];
        polys.w_4.at(row) = op.input[3];

        // Compute and set intermediate witness (88 columns)
        std::array<FF, 4> state = op.input;

        // Initial M_E (no columns)
        Perm::matrix_multiplication_external(state);

        // First 4 external rounds → columns [0..15] (x^5 before M_E)
        for (size_t r = 0; r < 4; r++) {
            for (size_t j = 0; j < 4; j++) {
                auto s = state[j] + Params::round_constants[r][j];
                auto x2 = s.sqr();
                x2.self_sqr();
                state[j] = x2 * s;
                polys.poseidon2_state[r * 4 + j].at(row) = state[j];
            }
            Perm::matrix_multiplication_external(state);
        }

        // 56 internal rounds → columns [16..71] (x^5 before M_I)
        for (size_t r = 4; r < 60; r++) {
            auto s0 = state[0] + Params::round_constants[r][0];
            auto x2 = s0.sqr();
            x2.self_sqr();
            state[0] = x2 * s0;
            polys.poseidon2_state[r - 4 + 16].at(row) = state[0];
            Perm::matrix_multiplication_internal(state);
        }

        // Last 4 external rounds → columns [72..87] (x^5 before M_E)
        for (size_t r = 60; r < 64; r++) {
            for (size_t j = 0; j < 4; j++) {
                auto s = state[j] + Params::round_constants[r][j];
                auto x2 = s.sqr();
                x2.self_sqr();
                state[j] = x2 * s;
                polys.poseidon2_state[(r - 60) * 4 + 72 + j].at(row) = state[j];
            }
            Perm::matrix_multiplication_external(state);
        }
    }
}

void Poseidon2FinalProver::execute_commitments_round()
{
    // Commit to all polynomials (precomputed + witness)
    auto batch = key->commitment_key.start_batch();
    auto all_polys = key->polynomials.get_unshifted();
    auto all_labels = commitment_labels.get_unshifted();
    for (auto [poly, label] : zip_view(all_polys, all_labels)) {
        batch.add_to_batch(poly, label, /*mask?*/ false);
    }
    batch.commit_and_send_to_verifier(transcript);
}

void Poseidon2FinalProver::execute_relation_check_rounds()
{
    using Sumcheck = SumcheckProver<Flavor>;

    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    std::vector<FF> gate_challenges(key->log_circuit_size);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] =
            transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    Sumcheck sumcheck(key->circuit_size,
                      key->polynomials,
                      transcript,
                      alpha,
                      gate_challenges,
                      relation_parameters,
                      key->log_circuit_size);

    sumcheck_output = sumcheck.prove();
}

void Poseidon2FinalProver::execute_pcs_rounds()
{
    using Curve = typename Flavor::Curve;
    using OpeningClaim = ProverOpeningClaim<Curve>;
    using PolynomialBatcher = GeminiProver_<Curve>::PolynomialBatcher;

    auto& ck = key->commitment_key;

    PolynomialBatcher polynomial_batcher(key->circuit_size);
    polynomial_batcher.set_unshifted(key->polynomials.get_unshifted());
    // No shifted polynomials in this flavor

    const OpeningClaim prover_opening_claim = ShpleminiProver_<Curve>::prove(
        key->circuit_size, polynomial_batcher, sumcheck_output.challenge, ck, transcript);

    PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
}

HonkProof Poseidon2FinalProver::export_proof()
{
    return transcript->export_proof();
}

HonkProof Poseidon2FinalProver::construct_proof()
{
    auto t0 = std::chrono::high_resolution_clock::now();

    execute_commitments_round();
    auto t1 = std::chrono::high_resolution_clock::now();

    execute_relation_check_rounds();
    auto t2 = std::chrono::high_resolution_clock::now();

    execute_pcs_rounds();
    auto t3 = std::chrono::high_resolution_clock::now();

    auto ms = [](auto a, auto b) { return std::chrono::duration_cast<std::chrono::milliseconds>(b - a).count(); };
    info("Poseidon2FinalProver: commit=", ms(t0, t1), "ms sumcheck=", ms(t1, t2), "ms pcs=", ms(t2, t3), "ms");

    return export_proof();
}

} // namespace bb
