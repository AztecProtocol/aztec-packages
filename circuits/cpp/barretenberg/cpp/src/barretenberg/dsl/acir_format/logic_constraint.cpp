#include "logic_constraint.hpp"
#include "barretenberg/stdlib/primitives/logic/logic.hpp"

namespace acir_format {

using namespace proof_system::plonk;

void create_logic_gate(Composer& composer,
                       const uint32_t a,
                       const uint32_t b,
                       const uint32_t result,
                       const size_t num_bits,
                       const bool is_xor_gate)
{

    field_ct left = field_ct::from_witness_index(&composer, a);
    field_ct right = field_ct::from_witness_index(&composer, b);

    field_ct res = stdlib::logic<Composer>::create_logic_constraint(left, right, num_bits, is_xor_gate);
    field_ct our_res = field_ct::from_witness_index(&composer, result);
    res.assert_equal(our_res);
}

} // namespace acir_format
