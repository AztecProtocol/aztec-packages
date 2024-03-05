#include "join_split.hpp"
#include "barretenberg/join_split_example/types.hpp"
#include "barretenberg/plonk/proof_system/commitment_scheme/kate_commitment_scheme.hpp"
#include "join_split_circuit.hpp"

namespace bb::join_split_example::proofs::join_split {

using namespace bb::plonk;
using namespace bb::crypto::merkle_tree;

CircuitBuilder new_join_split_prover(join_split_tx const& tx)
{
    CircuitBuilder builder;
    join_split_circuit(builder, tx);

    if (builder.failed()) {
        std::string error = format("builder logic failed: ", builder.err());
        throw_or_abort(error);
    }

    info("public inputs: ", builder.public_inputs.size());

    info("num gates before finalization: ", builder.get_num_gates());

    return builder;
}

bool verify_proof(CircuitBuilder& builder)
{
    return builder.check_circuit();
}

} // namespace bb::join_split_example::proofs::join_split
