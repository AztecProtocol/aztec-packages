#include "barretenberg/vm2/proving_helper.hpp"

#include <cstdint>
#include <cstdlib>
#include <memory>
#include <stdexcept>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/avm_fixed_vk.hpp"
#include "barretenberg/vm2/constraining/check_circuit.hpp"
#include "barretenberg/vm2/constraining/polynomials.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

// Create AvmVerifier::VerificationKey based on VkData and returns shared pointer.
std::shared_ptr<AvmVerifier::VerificationKey> AvmProvingHelper::create_verification_key(const VkData& vk_data)
{
    using VerificationKey = AvmVerifier::VerificationKey;
    std::vector<fr> vk_as_fields = many_from_buffer<AvmFlavorSettings::FF>(vk_data);

    std::span vk_span(vk_as_fields);

    vinfo("vk fields size: ", vk_as_fields.size());

    std::array<VerificationKey::Commitment, VerificationKey::NUM_PRECOMPUTED_COMMITMENTS> precomputed_cmts;
    for (size_t i = 0; i < VerificationKey::NUM_PRECOMPUTED_COMMITMENTS; i++) {
        // Adds 4 (NUM_FRS_COM) fr elements per commitment. Therefore, index = 4 * i.
        precomputed_cmts[i] = FrCodec::deserialize_from_fields<VerificationKey::Commitment>(
            vk_span.subspan(AvmFlavor::NUM_FRS_COM * i, AvmFlavor::NUM_FRS_COM));
    }

    return std::make_shared<VerificationKey>(precomputed_cmts);
}

AvmProvingHelper::VkData AvmProvingHelper::get_verification_key()
{
    auto verification_key =
        std::make_shared<AvmVerifier::VerificationKey>(constraining::AvmFixedVKCommitments::get_all());

    info("AVM vk hash: ", verification_key->hash());

    auto serialized_vk = to_buffer(verification_key->to_field_elements());

    return serialized_vk;
}

std::pair<AvmProvingHelper::Proof, AvmProvingHelper::VkData> AvmProvingHelper::prove(tracegen::TraceContainer&& trace)
{
    auto polynomials = AVM_TRACK_TIME_V("proving/prove:compute_polynomials", constraining::compute_polynomials(trace));
    auto proving_key =
        AVM_TRACK_TIME_V("proving/prove:proving_key", constraining::proving_key_from_polynomials(polynomials));

    auto verification_key =
        std::make_shared<AvmVerifier::VerificationKey>(constraining::AvmFixedVKCommitments::get_all());

    auto prover = AVM_TRACK_TIME_V("proving/prove:construct_prover",
                                   AvmProver(proving_key, verification_key, proving_key->commitment_key));

    auto proof = AVM_TRACK_TIME_V("proving/construct_proof", prover.construct_proof());
    auto serialized_vk = to_buffer(verification_key->to_field_elements());

    return { std::move(proof), std::move(serialized_vk) };
}

bool AvmProvingHelper::check_circuit(tracegen::TraceContainer&& trace)
{
    // The proof is done over the whole circuit (2^21 rows).
    // However, for check-circuit purposes we run only over the trace rows
    // PLUS one extra row to catch any possible errors in the empty remainder
    // of the circuit.
    const size_t num_rows = trace.get_num_rows_without_clk() + 1;
    const bool skippable_enabled = (getenv("AVM_DISABLE_SKIPPABLE") == nullptr);
    info("Running check ",
         skippable_enabled ? "(with skippable)" : "(without skippable)",
         " circuit over ",
         num_rows,
         " rows.");

    // Warning: this destroys the trace.
    auto polynomials = AVM_TRACK_TIME_V("proving/prove:compute_polynomials", constraining::compute_polynomials(trace));
    try {
        AVM_TRACK_TIME("proving/check_circuit",
                       constraining::run_check_circuit(polynomials, num_rows, skippable_enabled));
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
