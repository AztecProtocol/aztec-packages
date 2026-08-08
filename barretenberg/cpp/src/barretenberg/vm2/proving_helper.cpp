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
    auto polynomials = AVM_TRACK_TIME_V("proving/prove:compute_polynomials", constraining::compute_polynomials(trace));
    auto proving_key =
        AVM_TRACK_TIME_V("proving/prove:proving_key", constraining::proving_key_from_polynomials(polynomials));

    auto verification_key = std::make_shared<AvmVerifier::VerificationKey>();

    auto prover = AVM_TRACK_TIME_V("proving/prove:construct_prover",
                                   AvmProver(proving_key, verification_key, proving_key->commitment_key));

    auto proof = AVM_TRACK_TIME_V("proving/construct_proof", prover.construct_proof());

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
    } catch (const std::exception& e) {
        // Exceptions from parallel threads are now properly propagated by run_check_circuit
        vinfo("Circuit check failed: ", e.what());
        return false;
    }

    return true;
}

bool AvmProvingHelper::verify(const AvmProvingHelper::Proof& proof, const PublicInputs& pi)
{
    auto vk =
        AVM_TRACK_TIME_V("proving/verify:create_verification_key", std::make_shared<AvmFlavor::VerificationKey>());
    auto verifier = AVM_TRACK_TIME_V("proving/verify:construct_verifier", AvmVerifier());
    return AVM_TRACK_TIME_V("proving/verify_proof", verifier.verify_proof(proof, pi.to_columns()));
}

} // namespace bb::avm2
