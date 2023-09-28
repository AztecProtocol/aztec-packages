#include "pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
namespace proof_system::plonk::stdlib {

using namespace barretenberg;
using namespace proof_system;

template <typename C>
field_t<C> pedersen_hash<C>::hash(const std::vector<field_t>& inputs, const GeneratorContext context)
{

    using cycle_group = cycle_group<C>;
    using cycle_scalar = typename cycle_group::cycle_scalar;
    using Curve = EmbeddedCurve;

    auto base_points = context.generators->get(inputs.size(), context.offset, context.domain_separator);

    std::vector<cycle_scalar> scalars;
    std::vector<cycle_group> points;
    scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(field_t(inputs.size())));
    points.emplace_back(crypto::pedersen_hash_base<Curve>::length_generator);
    for (size_t i = 0; i < inputs.size(); ++i) {
        scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(inputs[i]));
        // constructs constant cycle_group objects (non-witness)
        points.emplace_back(base_points[i]);
    }

    auto result = cycle_group::batch_mul(scalars, points);
    return result.x;
}

// TODO skip range checks
template <typename C>
field_t<C> pedersen_hash<C>::hash_skip_field_validation(const std::vector<field_t>& inputs,
                                                        const GeneratorContext context)
{

    using cycle_group = cycle_group<C>;
    using cycle_scalar = typename cycle_group::cycle_scalar;
    using Curve = EmbeddedCurve;

    auto base_points = context.generators->get(inputs.size(), context.offset, context.domain_separator);

    std::vector<cycle_scalar> scalars;
    std::vector<cycle_group> points;
    scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(field_t(inputs.size())));
    points.emplace_back(crypto::pedersen_hash_base<Curve>::length_generator);
    for (size_t i = 0; i < inputs.size(); ++i) {
        scalars.emplace_back(cycle_scalar::create_from_bn254_scalar(inputs[i]));
        // constructs constant cycle_group objects (non-witness)
        points.emplace_back(base_points[i]);
    }

    auto result = cycle_group::batch_mul(scalars, points);
    return result.x;
}

INSTANTIATE_STDLIB_TYPE(pedersen_hash);

} // namespace proof_system::plonk::stdlib
