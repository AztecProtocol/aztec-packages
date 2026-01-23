#include "barretenberg/vm2/constraining/testing/check_relation.hpp"

namespace bb::avm2::constraining::detail {

const RelationParameters<FF>& get_test_params()
{
    static RelationParameters<FF> params = {
        .eta = 0,
        .beta = FF::random_element(),
        .gamma = FF::random_element(),
        .public_input_delta = 0,
        .beta_sqr = 0,
        .beta_cube = 0,
        .eccvm_set_permutation_delta = 0,
    };
    return params;
}

} // namespace bb::avm2::constraining::detail
