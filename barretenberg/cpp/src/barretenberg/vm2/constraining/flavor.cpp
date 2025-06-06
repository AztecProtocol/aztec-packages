#include "flavor.hpp"

namespace bb::avm2 {

AvmFlavor::ProverPolynomials::ProverPolynomials(ProvingKey& proving_key)
{
    for (auto [prover_poly, key_poly] : zip_view(this->get_unshifted(), proving_key.get_all())) {
        ASSERT(flavor_get_label(*this, prover_poly) == flavor_get_label(proving_key, key_poly));
        prover_poly = key_poly.share();
    }
    for (auto [prover_poly, key_poly] : zip_view(this->get_shifted(), proving_key.get_to_be_shifted())) {
        ASSERT(flavor_get_label(*this, prover_poly) == (flavor_get_label(proving_key, key_poly) + "_shift"));
        prover_poly = key_poly.shifted();
    }
}

void AvmFlavor::Transcript::deserialize_full_transcript()
{
    size_t num_frs_read = 0;
    circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);

    for (auto& commitment : commitments) {
        commitment = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
    }

    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
        sumcheck_univariates.emplace_back(deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(
            Transcript::proof_data, num_frs_read));
    }

    sumcheck_evaluations =
        deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(Transcript::proof_data, num_frs_read);

    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
        gemini_fold_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
    }

    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
        gemini_fold_evals.push_back(deserialize_from_buffer<FF>(proof_data, num_frs_read));
    }

    shplonk_q_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);

    kzg_w_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
}

void AvmFlavor::Transcript::serialize_full_transcript()
{
    size_t old_proof_length = proof_data.size();
    Transcript::proof_data.clear();

    serialize_to_buffer(circuit_size, Transcript::proof_data);

    for (const auto& commitment : commitments) {
        serialize_to_buffer(commitment, Transcript::proof_data);
    }

    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
        serialize_to_buffer(sumcheck_univariates[i], Transcript::proof_data);
    }

    serialize_to_buffer(sumcheck_evaluations, Transcript::proof_data);

    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
        serialize_to_buffer(gemini_fold_comms[i], proof_data);
    }

    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; ++i) {
        serialize_to_buffer(gemini_fold_evals[i], proof_data);
    }

    serialize_to_buffer(shplonk_q_comm, proof_data);
    serialize_to_buffer(kzg_w_comm, proof_data);

    // sanity check to make sure we generate the same length of proof as before.
    ASSERT(proof_data.size() == old_proof_length);
}

AvmFlavor::PartiallyEvaluatedMultivariates::PartiallyEvaluatedMultivariates(const size_t circuit_size)
{
    // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
    for (auto& poly : get_all()) {
        poly = Polynomial(circuit_size / 2);
    }
}

AvmFlavor::PartiallyEvaluatedMultivariates::PartiallyEvaluatedMultivariates(const ProverPolynomials& full_polynomials,
                                                                            size_t circuit_size)
{
    for (auto [poly, full_poly] : zip_view(get_all(), full_polynomials.get_all())) {
        // After the initial sumcheck round, the new size is CEIL(size/2).
        size_t desired_size = full_poly.end_index() / 2 + full_poly.end_index() % 2;
        poly = Polynomial(desired_size, circuit_size / 2);
    }
}

AvmFlavor::ProvingKey::ProvingKey(const size_t circuit_size, const size_t num_public_inputs)
    : circuit_size(circuit_size)
    , log_circuit_size(numeric::get_msb(circuit_size))
    , num_public_inputs(num_public_inputs)
    , evaluation_domain(bb::EvaluationDomain<FF>(circuit_size, circuit_size))
    , commitment_key(std::make_shared<CommitmentKey>(circuit_size + 1)){
        // The proving key's polynomials are not allocated here because they are later overwritten
        // AvmComposer::compute_witness(). We should probably refactor this flow.
    };

/**
 * @brief Serialize verification key to field elements
 *
 * @return std::vector<FF>
 */
std::vector<AvmFlavor::VerificationKey::FF> AvmFlavor::VerificationKey::to_field_elements() const
{
    std::vector<FF> elements = { FF(circuit_size), FF(num_public_inputs) };

    for (auto const& comm : get_all()) {
        std::vector<FF> comm_as_fields = field_conversion::convert_to_bn254_frs(comm);
        elements.insert(elements.end(), comm_as_fields.begin(), comm_as_fields.end());
    }
    return elements;
}

} // namespace bb::avm2
