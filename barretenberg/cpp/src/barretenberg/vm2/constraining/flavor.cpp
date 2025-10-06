#include "flavor.hpp"
#include "barretenberg/common/assert.hpp"

namespace bb::avm2 {

AvmFlavor::ProverPolynomials::ProverPolynomials(ProvingKey& proving_key)
{
    for (auto [prover_poly, key_poly] : zip_view(this->get_unshifted(), proving_key.get_all())) {
        BB_ASSERT_EQ(flavor_get_label(*this, prover_poly), flavor_get_label(proving_key, key_poly));
        prover_poly = key_poly.share();
    }
    for (auto [prover_poly, key_poly] : zip_view(this->get_shifted(), proving_key.get_to_be_shifted())) {
        BB_ASSERT_EQ(flavor_get_label(*this, prover_poly), (flavor_get_label(proving_key, key_poly) + "_shift"));
        prover_poly = key_poly.shifted();
    }
}

void AvmFlavor::Transcript::deserialize_full_transcript()
{
    size_t num_frs_read = 0;

    for (auto& commitment : commitments) {
        commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
    }

    for (size_t i = 0; i < log_circuit_size; ++i) {
        sumcheck_univariates.emplace_back(deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
            Transcript::proof_data, num_frs_read));
    }

    sumcheck_evaluations =
        deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(Transcript::proof_data, num_frs_read);

    for (size_t i = 0; i < log_circuit_size - 1; ++i) {
        gemini_fold_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
    }

    for (size_t i = 0; i < log_circuit_size; ++i) {
        gemini_fold_evals.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
    }

    shplonk_q_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

    kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
}

void AvmFlavor::Transcript::serialize_full_transcript()
{
    size_t old_proof_length = proof_data.size();
    Transcript::proof_data.clear();

    for (const auto& commitment : commitments) {
        serialize_to_buffer(commitment, Transcript::proof_data);
    }

    for (size_t i = 0; i < log_circuit_size; ++i) {
        serialize_to_buffer(sumcheck_univariates[i], Transcript::proof_data);
    }

    serialize_to_buffer(sumcheck_evaluations, Transcript::proof_data);

    for (size_t i = 0; i < log_circuit_size - 1; ++i) {
        serialize_to_buffer(gemini_fold_comms[i], proof_data);
    }

    for (size_t i = 0; i < log_circuit_size; ++i) {
        serialize_to_buffer(gemini_fold_evals[i], proof_data);
    }

    serialize_to_buffer(shplonk_q_comm, proof_data);
    serialize_to_buffer(kzg_w_comm, proof_data);

    // sanity check to make sure we generate the same length of proof as before.
    BB_ASSERT_EQ(proof_data.size(), old_proof_length);
}

AvmFlavor::ProverPolynomials::ProverPolynomials(const ProverPolynomials& full_polynomials, size_t circuit_size)
{
    for (auto [poly, full_poly] : zip_view(get_all(), full_polynomials.get_all())) {
        // After the initial sumcheck round, the new size is CEIL(size/2).
        size_t desired_size = (full_poly.end_index() / 2) + (full_poly.end_index() % 2);
        poly = Polynomial(desired_size, circuit_size / 2);
    }
}

AvmFlavor::ProvingKey::ProvingKey()
    : commitment_key(circuit_size + 1) {
        // The proving key's polynomials are not allocated here because they are later overwritten
        // AvmComposer::compute_witness(). We should probably refactor this flow.
    };

void AvmFlavor::LazilyExtendedProverUnivariates::set_current_edge(size_t edge_idx)
{
    current_edge = edge_idx;
    // If the current edge changed, we need to clear all the cached univariates.
    dirty = true;
}

const bb::Univariate<AvmFlavor::FF, AvmFlavor::MAX_PARTIAL_RELATION_LENGTH>& AvmFlavor::
    LazilyExtendedProverUnivariates::get(ColumnAndShifts c) const
{
    const auto& multivariate = multivariates.get(c);
    if (multivariate.is_empty() || multivariate.end_index() < current_edge) {
        static const auto zero_univariate = bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>::zero();
        return zero_univariate;
    } else {
        auto& mutable_entities = const_cast<decltype(entities)&>(entities);
        if (dirty) {
            // If the current edge changed, we need to clear all the cached univariates.
            for (auto& extended_ptr : mutable_entities) {
                extended_ptr.reset();
            }
            dirty = false;
        }
        auto& extended_ptr = mutable_entities[static_cast<size_t>(c)];
        if (extended_ptr.get() == nullptr) {
            extended_ptr = std::make_unique<bb::Univariate<FF, MAX_PARTIAL_RELATION_LENGTH>>(
                bb::Univariate<FF, 2>({ multivariate[current_edge], multivariate[current_edge + 1] })
                    .template extend_to<MAX_PARTIAL_RELATION_LENGTH>());
        }
        return *extended_ptr;
    }
}

} // namespace bb::avm2
