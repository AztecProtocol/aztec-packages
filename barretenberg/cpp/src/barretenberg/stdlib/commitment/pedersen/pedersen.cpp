#include "pedersen.hpp"
#include "../../hash/pedersen/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include "../../primitives/packed_byte_array/packed_byte_array.hpp"

namespace proof_system::plonk::stdlib {

template <typename C>
cycle_group<C> pedersen_commitment<C>::commit(const std::vector<field_t>& inputs,
                                              const size_t hash_index,
                                              const generator_data* generator_context)
{

    using cycle_group = cycle_group<C>;
    using cycle_scalar = typename cycle_group::cycle_scalar;

    auto base_points = generator_context->conditional_extend(inputs.size() + hash_index).generators;

    std::vector<cycle_scalar> scalars;
    std::vector<cycle_group> points;
    for (size_t i = 0; i < inputs.size(); ++i) {
        scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(inputs[i]));
        // constructs constant cycle_group objects (non-witness)
        points.emplace_back(base_points[i + hash_index]);
    }

    return cycle_group::batch_mul(scalars, points);
}

template <typename C>
field_t<C> pedersen_commitment<C>::compress(const std::vector<field_t>& inputs,
                                            const size_t hash_index,
                                            const generator_data* generator_context)
{
    auto result = commit(inputs, hash_index, generator_context).x;
    return result;
}
INSTANTIATE_STDLIB_TYPE(pedersen_commitment);

} // namespace proof_system::plonk::stdlib
