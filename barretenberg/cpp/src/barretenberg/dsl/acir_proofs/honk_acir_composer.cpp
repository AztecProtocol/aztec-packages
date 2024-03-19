#include "honk_acir_composer.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"

namespace acir_proofs {

void HonkAcirComposer::create_circuit(acir_format::AcirFormat& constraint_system, acir_format::WitnessVector& witness)
{
    // Construct a builder using the witness and public input data from acir and a clean op_queue
    builder_ =
        acir_format::GoblinBuilder{ op_queue, witness, constraint_system.public_inputs, constraint_system.varnum };

    // Populate constraints in the builder via the data in constraint_system
    acir_format::build_constraints(builder_, constraint_system, true);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/817): Add some arbitrary op gates to ensure the
    // associated polynomials are non-zero and to give ECCVM and Translator some ECC ops to process.
    MockCircuits::construct_goblin_ecc_op_circuit(builder_);
}

std::vector<bb::fr> HonkAcirComposer::prove()
{
    instance = std::make_shared<ProverInstance>(builder_);
    GoblinUltraProver prover{ instance };

    return prover.construct_proof();
}

bool HonkAcirComposer::verify(std::vector<bb::fr> const& proof)
{
    auto verification_key = std::make_shared<VerificationKey>(instance->proving_key);
    GoblinUltraVerifier verifier{ verification_key };

    return verifier.verify_proof(proof);
}

} // namespace acir_proofs
