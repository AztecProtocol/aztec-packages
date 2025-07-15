// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_proofs/templates/inja.hpp"
#include "barretenberg/dsl/acir_proofs/templates/json.hpp"
#include "barretenberg/honk/utils/honk_key_gen.hpp"
#include <filesystem>
#include <sstream>

using json = nlohmann::json;

template <typename Field> std::string field_to_hex(const Field& f)
{
    std::ostringstream os;
    os << f;
    return os.str();
}

inline std::string get_honk_solidity_verifier(auto const& verification_key)
{
    // std::ostringstream vk_stream;
    // output_vk_sol_ultra_honk_opt(vk_stream, verification_key, false);
    // std::string vk_code = vk_stream.str();

    json context;
    context["circuit_size"] = verification_key->circuit_size;
    context["log_circuit_size"] = verification_key->log_circuit_size;
    context["num_public_inputs"] = verification_key->num_public_inputs;

    context["vk_q_l_x"] = field_to_hex(verification_key->q_l.x);
    context["vk_q_l_y"] = field_to_hex(verification_key->q_l.y);
    context["vk_q_r_x"] = field_to_hex(verification_key->q_r.x);
    context["vk_q_r_y"] = field_to_hex(verification_key->q_r.y);
    context["vk_q_o_x"] = field_to_hex(verification_key->q_o.x);
    context["vk_q_o_y"] = field_to_hex(verification_key->q_o.y);
    context["vk_q_4_x"] = field_to_hex(verification_key->q_4.x);
    context["vk_q_4_y"] = field_to_hex(verification_key->q_4.y);
    context["vk_q_m_x"] = field_to_hex(verification_key->q_m.x);
    context["vk_q_m_y"] = field_to_hex(verification_key->q_m.y);
    context["vk_q_c_x"] = field_to_hex(verification_key->q_c.x);
    context["vk_q_c_y"] = field_to_hex(verification_key->q_c.y);
    context["vk_q_arith_x"] = field_to_hex(verification_key->q_arith.x);
    context["vk_q_arith_y"] = field_to_hex(verification_key->q_arith.y);
    context["vk_q_delta_range_x"] = field_to_hex(verification_key->q_delta_range.x);
    context["vk_q_delta_range_y"] = field_to_hex(verification_key->q_delta_range.y);
    context["vk_q_elliptic_x"] = field_to_hex(verification_key->q_elliptic.x);
    context["vk_q_elliptic_y"] = field_to_hex(verification_key->q_elliptic.y);
    context["vk_q_aux_x"] = field_to_hex(verification_key->q_aux.x);
    context["vk_q_aux_y"] = field_to_hex(verification_key->q_aux.y);
    context["vk_q_lookup_x"] = field_to_hex(verification_key->q_lookup.x);
    context["vk_q_lookup_y"] = field_to_hex(verification_key->q_lookup.y);
    context["vk_q_poseidon2_external_x"] = field_to_hex(verification_key->q_poseidon2_external.x);
    context["vk_q_poseidon2_external_y"] = field_to_hex(verification_key->q_poseidon2_external.y);
    context["vk_q_poseidon2_internal_x"] = field_to_hex(verification_key->q_poseidon2_internal.x);
    context["vk_q_poseidon2_internal_y"] = field_to_hex(verification_key->q_poseidon2_internal.y);
    context["vk_sigma_1_x"] = field_to_hex(verification_key->sigma_1.x);
    context["vk_sigma_1_y"] = field_to_hex(verification_key->sigma_1.y);
    context["vk_sigma_2_x"] = field_to_hex(verification_key->sigma_2.x);
    context["vk_sigma_2_y"] = field_to_hex(verification_key->sigma_2.y);
    context["vk_sigma_3_x"] = field_to_hex(verification_key->sigma_3.x);
    context["vk_sigma_3_y"] = field_to_hex(verification_key->sigma_3.y);
    context["vk_sigma_4_x"] = field_to_hex(verification_key->sigma_4.x);
    context["vk_sigma_4_y"] = field_to_hex(verification_key->sigma_4.y);
    context["vk_table_1_x"] = field_to_hex(verification_key->table_1.x);
    context["vk_table_1_y"] = field_to_hex(verification_key->table_1.y);
    context["vk_table_2_x"] = field_to_hex(verification_key->table_2.x);
    context["vk_table_2_y"] = field_to_hex(verification_key->table_2.y);
    context["vk_table_3_x"] = field_to_hex(verification_key->table_3.x);
    context["vk_table_3_y"] = field_to_hex(verification_key->table_3.y);
    context["vk_table_4_x"] = field_to_hex(verification_key->table_4.x);
    context["vk_table_4_y"] = field_to_hex(verification_key->table_4.y);
    context["vk_id_1_x"] = field_to_hex(verification_key->id_1.x);
    context["vk_id_1_y"] = field_to_hex(verification_key->id_1.y);
    context["vk_id_2_x"] = field_to_hex(verification_key->id_2.x);
    context["vk_id_2_y"] = field_to_hex(verification_key->id_2.y);
    context["vk_id_3_x"] = field_to_hex(verification_key->id_3.x);
    context["vk_id_3_y"] = field_to_hex(verification_key->id_3.y);
    context["vk_id_4_x"] = field_to_hex(verification_key->id_4.x);
    context["vk_id_4_y"] = field_to_hex(verification_key->id_4.y);
    context["vk_lagrange_first_x"] = field_to_hex(verification_key->lagrange_first.x);
    context["vk_lagrange_first_y"] = field_to_hex(verification_key->lagrange_first.y);
    context["vk_lagrange_last_x"] = field_to_hex(verification_key->lagrange_last.x);
    context["vk_lagrange_last_y"] = field_to_hex(verification_key->lagrange_last.y);

    inja::Environment env;
    std::filesystem::path source_dir = std::filesystem::path(__FILE__).parent_path();
    std::filesystem::path template_path = source_dir / "templates" / "honk_contract.sol";
    return env.render_file(template_path.string(), context);
}
