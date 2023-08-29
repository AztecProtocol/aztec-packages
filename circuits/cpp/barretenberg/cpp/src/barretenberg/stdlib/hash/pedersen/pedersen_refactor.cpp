#include "pedersen_refactor.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
namespace proof_system::plonk::stdlib {

using namespace barretenberg;
using namespace crypto::generators;
using namespace proof_system;

template <typename C>
field_t<C> pedersen_hash_refactor<C>::hash_multiple(const std::vector<field_t>& inputs,
                                                    const size_t hash_index,
                                                    const std::string& domain_separator,
                                                    const bool /*unused*/)
{

    using cycle_group = cycle_group<C>;
    using cycle_scalar = typename cycle_group::cycle_scalar;
    using affine_element = typename cycle_group::G1::affine_element;
    std::vector<affine_element> base_points = {
        crypto::pedersen_commitment_refactor::generator_info_temp::get_length_generator()
    };
    auto _base_points =
        crypto::pedersen_commitment_refactor::generator_info_temp::get_generators(hash_index, 0, domain_separator);
    std::copy(_base_points.begin(), _base_points.end(), std::back_inserter(base_points));
    std::vector<cycle_scalar> scalars;
    scalars.emplace_back(field_t(inputs.size()));
    for (const auto& in : inputs) {
        scalars.emplace_back(in);
    }

    auto result = cycle_group::fixed_base_batch_mul(scalars, base_points);
    return result.x;
}

INSTANTIATE_STDLIB_TYPE(pedersen_hash_refactor);

} // namespace proof_system::plonk::stdlib
