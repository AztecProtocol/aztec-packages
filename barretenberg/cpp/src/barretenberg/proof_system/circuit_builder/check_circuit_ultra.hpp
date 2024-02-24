#pragma once
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/execution_trace/execution_trace.hpp"
#include "barretenberg/proof_system/op_queue/ecc_op_queue.hpp"
#include "barretenberg/proof_system/plookup_tables/plookup_tables.hpp"
#include "barretenberg/proof_system/plookup_tables/types.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include "barretenberg/proof_system/types/merkle_hash_type.hpp"
#include "barretenberg/proof_system/types/pedersen_commitment_type.hpp"
#include "ultra_circuit_builder.hpp"
#include "circuit_builder_base.hpp"
#include <optional>

namespace bb {

using namespace bb;

class UltraCircuitChecker {
  public:
    using FF = bb::fr;

    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS = 68;

    // Circuit evaluation methods

    static FF compute_arithmetic_identity(FF q_arith_value,
                                   FF q_1_value,
                                   FF q_2_value,
                                   FF q_3_value,
                                   FF q_4_value,
                                   FF q_m_value,
                                   FF q_c_value,
                                   FF w_1_value,
                                   FF w_2_value,
                                   FF w_3_value,
                                   FF w_4_value,
                                   FF w_1_shifted_value,
                                   FF w_4_shifted_value,
                                   const FF alpha_base,
                                   const FF alpha);
    static FF compute_auxilary_identity(FF q_aux_value,
                                 FF q_arith_value,
                                 FF q_1_value,
                                 FF q_2_value,
                                 FF q_3_value,
                                 FF q_4_value,
                                 FF q_m_value,
                                 FF q_c_value,
                                 FF w_1_value,
                                 FF w_2_value,
                                 FF w_3_value,
                                 FF w_4_value,
                                 FF w_1_shifted_value,
                                 FF w_2_shifted_value,
                                 FF w_3_shifted_value,
                                 FF w_4_shifted_value,
                                 FF alpha_base,
                                 FF alpha,
                                 FF eta);
    static FF compute_elliptic_identity(FF q_elliptic_value,
                                 FF q_1_value,
                                 FF q_m_value,
                                 FF w_2_value,
                                 FF w_3_value,
                                 FF w_1_shifted_value,
                                 FF w_2_shifted_value,
                                 FF w_3_shifted_value,
                                 FF w_4_shifted_value,
                                 FF alpha_base,
                                 FF alpha);
    static FF compute_genperm_sort_identity(FF q_sort_value,
                                     FF w_1_value,
                                     FF w_2_value,
                                     FF w_3_value,
                                     FF w_4_value,
                                     FF w_1_shifted_value,
                                     FF alpha_base,
                                     FF alpha);

    static bool execute(UltraCircuitBuilder circuit);
};
} // namespace bb
