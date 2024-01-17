#include "honk_acir_composer.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"

namespace acir_proofs {

HonkAcirComposer::HonkAcirComposer(size_t size_hint, bool verbose)
    : size_hint_(size_hint)
    , verbose_(verbose)
{}

void HonkAcirComposer::create_goblin_circuit(acir_format::acir_format& constraint_system,
                                             acir_format::WitnessVector& witness)
{
    // Construct a builder using the witness and public input data from acir
    goblin_builder_ = acir_format::GoblinBuilder{
        goblin.op_queue, witness, constraint_system.public_inputs, constraint_system.varnum
    };

    // Populate constraints in the builder via the data in constraint_system
    acir_format::build_constraints(goblin_builder_, constraint_system, true);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/817): Add some arbitrary op gates to ensure the
    // associated polynomials are non-zero and to give ECCVM and Translator some ECC ops to process.
    GoblinMockCircuits::construct_goblin_ecc_op_circuit(goblin_builder_);
}

std::vector<uint8_t> HonkAcirComposer::create_goblin_proof()
{
    return goblin.construct_proof(goblin_builder_);
}

bool HonkAcirComposer::verify_goblin_proof(std::vector<uint8_t> const& proof)
{
    return goblin.verify_proof({ proof });
}

} // namespace acir_proofs
