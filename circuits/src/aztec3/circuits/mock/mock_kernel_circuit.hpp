#pragma once
#include <common/map.hpp>
#include <numeric/random/engine.hpp>
#include <stdlib/primitives/field/field.hpp>
#include <stdlib/primitives/witness/witness.hpp>
#include <stdlib/commitment/pedersen/pedersen.hpp>
#include <stdlib/types/native_types.hpp>
#include <stdlib/types/circuit_types.hpp>
#include <aztec3/circuits/abis/private_kernel/public_inputs.hpp>
// #include <aztec3/circuits/abis/private_circuit_public_inputs.hpp>

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace aztec3::circuits::mock {

using aztec3::circuits::abis::private_kernel::PublicInputs;
using NT = plonk::stdlib::types::NativeTypes;
using plonk::stdlib::pedersen_commitment;
using plonk::stdlib::witness_t;
using plonk::stdlib::types::CircuitTypes;

template <typename Composer> void mock_kernel_circuit(Composer& composer, PublicInputs<NT> const& _public_inputs)
{
    typedef CircuitTypes<Composer> CT;
    typedef typename CT::fr fr;

    auto public_inputs = _public_inputs.to_circuit_type(composer);

    {
        std::vector<uint32_t> dummy_witness_indices;
        // 16 is the number of values added to `proof_witness_indices` at the end of `verify_proof`.
        for (size_t i = 0; i < 16; ++i) {
            fr witness = fr(witness_t(&composer, engine.get_random_uint32()));
            uint32_t witness_index = witness.get_witness_index();
            dummy_witness_indices.push_back(witness_index);
        }
        public_inputs.end.aggregation_object.proof_witness_indices = dummy_witness_indices;
    }

    public_inputs.set_public();

    plonk::stdlib::pedersen_commitment<Composer>::compress(fr(witness_t(&composer, 1)), fr(witness_t(&composer, 1)));
}

} // namespace aztec3::circuits::mock
