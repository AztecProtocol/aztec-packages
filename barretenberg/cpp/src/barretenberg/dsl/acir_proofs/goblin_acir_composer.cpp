#include "goblin_acir_composer.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/types.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"

namespace acir_proofs {

void GoblinAcirComposer::create_circuit(acir_format::AcirFormat& constraint_system, acir_format::WitnessVector& witness)
{
    // Construct a builder using the witness and public input data from acir and with the goblin-owned op_queue
    builder_ = acir_format::GoblinBuilder{
        goblin.op_queue, witness, constraint_system.public_inputs, constraint_system.varnum
    };

    // Populate constraints in the builder via the data in constraint_system
    acir_format::build_constraints(builder_, constraint_system, true);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/817): Add some arbitrary op gates to ensure the
    //  to give ECCVM and Translator some ECC ops to process.
    MockCircuits::construct_goblin_ecc_op_circuit(builder_);
}

std::vector<bb::fr> GoblinAcirComposer::accumulate_and_prove()
{
    // Construct one final MegaHonk proof via the accumulate mechanism
    std::vector<bb::fr> ultra_proof = goblin.accumulate_for_acir(builder_);

    // Construct a Goblin proof (ECCVM, Translator, Merge); result stored internally
    goblin.prove_for_acir();

    return ultra_proof;
}

bool GoblinAcirComposer::verify(std::vector<bb::fr> const& proof)
{
    // Verify the final MegaHonk proof
    bool ultra_verified = goblin.verify_accumulator_for_acir(proof);

    // Verify the Goblin proof (ECCVM, Translator, Merge)
    bool goblin_verified = goblin.verify_for_acir();

    return ultra_verified && goblin_verified;
}

} // namespace acir_proofs
