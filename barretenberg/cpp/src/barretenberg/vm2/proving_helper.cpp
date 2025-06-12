#include "barretenberg/vm2/proving_helper.hpp"

#include <cstdint>
#include <cstdlib>
#include <memory>
#include <stdexcept>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/check_circuit.hpp"
#include "barretenberg/vm2/constraining/polynomials.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

namespace {

// TODO: This doesn't need to be a shared_ptr, but BB requires it.
std::shared_ptr<AvmProver::ProvingKey> create_proving_key(AvmProver::ProverPolynomials& polynomials)
{
    // TODO: Why is num_public_inputs 0?
    auto proving_key = std::make_shared<AvmProver::ProvingKey>(CIRCUIT_SUBGROUP_SIZE, /*num_public_inputs=*/0);

    for (auto [key_poly, prover_poly] : zip_view(proving_key->get_all(), polynomials.get_unshifted())) {
        ASSERT(flavor_get_label(*proving_key, key_poly) == flavor_get_label(polynomials, prover_poly));
        key_poly = std::move(prover_poly);
    }

    proving_key->commitment_key = AvmProver::PCSCommitmentKey(CIRCUIT_SUBGROUP_SIZE);

    return proving_key;
}

} // namespace

// Create AvmVerifier::VerificationKey based on VkData and returns shared pointer.
std::shared_ptr<AvmVerifier::VerificationKey> AvmProvingHelper::create_verification_key(const VkData& vk_data)
{
    using VerificationKey = AvmVerifier::VerificationKey;
    std::vector<fr> vk_as_fields = many_from_buffer<AvmFlavorSettings::FF>(vk_data);

    auto circuit_size = static_cast<uint64_t>(vk_as_fields[0]);
    auto num_public_inputs = static_cast<uint64_t>(vk_as_fields[1]);
    std::span vk_span(vk_as_fields);

    vinfo("vk fields size: ", vk_as_fields.size());
    vinfo("circuit size: ",
          circuit_size,
          " (next or eq power: 2^",
          numeric::get_msb(numeric::round_up_power_2(circuit_size)),
          ")");

    // WARNING: The number of public inputs in the verification key is always 0!
    // Apparently we use some other mechanism to check the public inputs.
    vinfo("num of pub inputs: ", num_public_inputs);

    std::array<VerificationKey::Commitment, VerificationKey::NUM_PRECOMPUTED_COMMITMENTS> precomputed_cmts;
    for (size_t i = 0; i < VerificationKey::NUM_PRECOMPUTED_COMMITMENTS; i++) {
        // Start at offset 2 and adds 4 (NUM_FRS_COM) fr elements per commitment. Therefore, index = 4 * i + 2.
        precomputed_cmts[i] = field_conversion::convert_from_bn254_frs<VerificationKey::Commitment>(
            vk_span.subspan(AvmFlavor::NUM_FRS_COM * i + 2, AvmFlavor::NUM_FRS_COM));
    }

    return std::make_shared<VerificationKey>(circuit_size, num_public_inputs, precomputed_cmts);
}

std::pair<AvmProvingHelper::Proof, AvmProvingHelper::VkData> AvmProvingHelper::prove(tracegen::TraceContainer&& trace)
{
    info("computing polynomials");
    auto polynomials = AVM_TRACK_TIME_V("proving/prove:compute_polynomials", constraining::compute_polynomials(trace));
    info("creating proving key");
    auto proving_key = AVM_TRACK_TIME_V("proving/prove:proving_key", create_proving_key(polynomials));
    info("constructing prover");
    auto prover =
        AVM_TRACK_TIME_V("proving/prove:construct_prover", AvmProver(proving_key, proving_key->commitment_key));
    info("creating verification key");
    auto verification_key =
        AVM_TRACK_TIME_V("proving/prove:verification_key", std::make_shared<AvmVerifier::VerificationKey>(proving_key));
    info("constructing proof");
    auto proof = AVM_TRACK_TIME_V("proving/construct_proof", prover.construct_proof());
    info("serializing verification key");
    auto serialized_vk = to_buffer(verification_key->to_field_elements());
    info("done");

    return { std::move(proof), std::move(serialized_vk) };
}

bool AvmProvingHelper::check_circuit(tracegen::TraceContainer&& trace)
{
    // The proof is done over the whole circuit (2^21 rows).
    // However, for check-circuit purposes we run only over the trace rows
    // PLUS one extra row to catch any possible errors in the empty remainder
    // of the circuit.
    const size_t num_rows = trace.get_num_rows_without_clk() + 1;
    info("Running check circuit over ", num_rows, " rows.");

    // Warning: this destroys the trace.
    auto polynomials = AVM_TRACK_TIME_V("proving/prove:compute_polynomials", constraining::compute_polynomials(trace));
    try {
        AVM_TRACK_TIME("proving/check_circuit", constraining::run_check_circuit(polynomials, num_rows));
    } catch (std::runtime_error& e) {
        // FIXME: This exception is never caught because it's thrown in a different thread.
        // Execution never gets here!
        info("Circuit check failed: ", e.what());
    }

    return true;
}

bool AvmProvingHelper::verify(const AvmProvingHelper::Proof& proof, const PublicInputs& pi, const VkData& vk_data)
{
    auto vk = AVM_TRACK_TIME_V("proving/verify:create_verification_key", create_verification_key(vk_data));
    auto verifier = AVM_TRACK_TIME_V("proving/verify:construct_verifier", AvmVerifier(std::move(vk)));
    return AVM_TRACK_TIME_V("proving/verify_proof", verifier.verify_proof(proof, pi.to_columns()));
}

} // namespace bb::avm2
