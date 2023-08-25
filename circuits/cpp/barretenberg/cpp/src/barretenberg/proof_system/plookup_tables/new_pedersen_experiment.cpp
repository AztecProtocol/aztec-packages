
#include "./new_pedersen_experiment.hpp"

namespace plookup::new_pedersen {

bool table::lookup_table_exists_for_point(const grumpkin::g1::affine_element& input)
{
    return (input == crypto::pedersen_hash::generator_info::get_lhs_generator() ||
            input == crypto::pedersen_hash::generator_info::get_rhs_generator());
}

std::optional<std::array<MultiTableId, 2>> table::get_lookup_table_ids_for_point(
    const grumpkin::g1::affine_element& input)
{
    if (input == crypto::pedersen_hash::generator_info::get_lhs_generator()) {
        return { { NEW_PEDERSEN_LEFT_LO, NEW_PEDERSEN_LEFT_HI } };
    }
    if (input == crypto::pedersen_hash::generator_info::get_lhs_generator()) {
        return { { NEW_PEDERSEN_RIGHT_LO, NEW_PEDERSEN_RIGHT_HI } };
    }
    return {};
}

std::optional<grumpkin::g1::affine_element> table::get_generator_offset_for_table_id(const MultiTableId table_id)
{
    if (table_id == NEW_PEDERSEN_LEFT_LO) {
        return pedersen_table_offset_generators[0];
    }
    if (table_id == NEW_PEDERSEN_LEFT_HI) {
        return pedersen_table_offset_generators[1];
    }
    if (table_id == NEW_PEDERSEN_RIGHT_LO) {
        return pedersen_table_offset_generators[2];
    }
    if (table_id == NEW_PEDERSEN_RIGHT_HI) {
        return pedersen_table_offset_generators[3];
    }
    return {};
}

} // namespace plookup::new_pedersen