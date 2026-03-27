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

AvmProvingHelper::Proof AvmProvingHelper::prove(tracegen::TraceContainer&& trace)
{
    vinfo("[mem] before compute_polynomials");
    auto polynomials = AVM_TRACK_TIME_V("proving/prove:compute_polynomials", constraining::compute_polynomials(trace));
    vinfo("[mem] after compute_polynomials");
    auto proving_key =
        AVM_TRACK_TIME_V("proving/prove:proving_key", constraining::proving_key_from_polynomials(polynomials));
    vinfo("[mem] after proving_key");

    // VK constructor initializes precomputed_group_commitments from hardcoded values.
    vk_ = std::make_shared<AvmVerifier::VerificationKey>();

    auto prover =
        AVM_TRACK_TIME_V("proving/prove:construct_prover", AvmProver(proving_key, vk_, proving_key->commitment_key));
    vinfo("[mem] after construct_prover (SRS loaded)");

    auto proof = AVM_TRACK_TIME_V("proving/construct_proof", prover.construct_proof());
    vinfo("[mem] after construct_proof");

    vinfo("=== AVM Prover Stats (depth 4) ===\n", Stats::get().to_string(4));

    return proof;
}

bool AvmProvingHelper::check_circuit(tracegen::TraceContainer&& trace)
{
    // The proof is done over the whole circuit (2^21 rows).
    // However, for check-circuit purposes we run only over the witness rows
    // PLUS one extra row to catch any possible errors in the empty remainder
    // of the circuit.
    const bool skippable_enabled = (getenv("AVM_DISABLE_SKIPPABLE") == nullptr);
    const size_t num_rows = skippable_enabled ? trace.get_num_witness_rows() + 1 : trace.get_num_rows();
    vinfo("Running check ",
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
        vinfo("Circuit check failed: ", e.what());
    }

    return true;
}

bool AvmProvingHelper::verify(const AvmProvingHelper::Proof& proof, const PublicInputs& pi)
{
    // Use stored VK if available (has precomputed group commitments from prove()).
    // Otherwise create a default one (works for BS=1 only).
    if (!vk_) {
        vk_ = std::make_shared<AvmFlavor::VerificationKey>();
        // For BS=1, group commitments = individual commitments
        auto precomputed_comms = vk_->get_all();
        for (size_t i = 0; i < AvmFlavor::NUM_PRECOMPUTED_GROUPS; i++) {
            vk_->precomputed_group_commitments[i] = precomputed_comms[i];
        }
    }
    auto verifier = AVM_TRACK_TIME_V("proving/verify:construct_verifier", AvmVerifier());
    verifier.key = vk_;
    return AVM_TRACK_TIME_V("proving/verify_proof", verifier.verify_proof(proof, pi.to_columns()));
}

} // namespace bb::avm2
