#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/arithmetization/gate_data.hpp"
#include "barretenberg/proof_system/plookup_tables/plookup_tables.hpp"
#include "barretenberg/proof_system/plookup_tables/types.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include "barretenberg/proof_system/types/merkle_hash_type.hpp"
#include "barretenberg/proof_system/types/pedersen_commitment_type.hpp"
#include <cstdint>

namespace proof_system {

class CircuitSimulatorBN254 {
  public:
    using FF = barretenberg::fr;                                                 // IOU templating
    static constexpr merkle::HashType merkle_hash_type = merkle::HashType::NONE; // UGH
    static constexpr pedersen::CommitmentType commitment_type = pedersen::CommitmentType::NONE;
    static constexpr CircuitType CIRCUIT_TYPE = CircuitType::UNDEFINED;
    static constexpr std::string_view NAME_STRING = "SIMULATOR";
    bool contains_recursive_proof = false;
    static constexpr size_t UINT_LOG2_BASE = 2; // WORKTODO: 6 for Ultra
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_BITNUM = 1028;

    static constexpr size_t num_gates = 0;
    static constexpr uint32_t zero_idx = 0;

    // uint32_t add_variable([[maybe_unused]]const FF& in){
    //   return 0; // WORKTODO: return part of `in` for debugging purposes?
    // }

    std::vector<uint32_t> public_inputs;
    void add_recursive_proof(const std::vector<uint32_t>& proof_output_witness_indices)
    {

        if (contains_recursive_proof) {
            failure("added recursive proof when one already exists");
        }
        contains_recursive_proof = true;

        for (uint32_t idx = 0; idx < proof_output_witness_indices.size(); idx++) {
            recursive_proof_public_input_indices.push_back(idx);
        }
    }

    inline uint32_t add_variable([[maybe_unused]] const barretenberg::fr index) const { return 1028; }
    inline barretenberg::fr get_variable([[maybe_unused]] const uint32_t index) const { return 1028; }

    uint32_t put_constant_variable([[maybe_unused]] const barretenberg::fr& variable) { return 1028; }
    void set_public_input([[maybe_unused]] const uint32_t witness_index)
    {
        // WORKTODO Public input logic?
    }

    void fix_witness([[maybe_unused]] const uint32_t witness_index,
                     [[maybe_unused]] const barretenberg::fr& witness_value){
        // WORKTODO: logic?
    };

    [[nodiscard]] size_t get_num_gates() const { return 0; }

    void create_add_gate([[maybe_unused]] const add_triple& in){};
    void create_mul_gate([[maybe_unused]] const mul_triple& in){};
    void create_bool_gate([[maybe_unused]] const uint32_t a){};
    void create_poly_gate([[maybe_unused]] const poly_triple& in){};
    void create_big_add_gate([[maybe_unused]] const add_quad& in){};
    void create_big_add_gate_with_bit_extraction([[maybe_unused]] const add_quad& in){};
    void create_big_mul_gate([[maybe_unused]] const mul_quad& in){};
    void create_balanced_add_gate([[maybe_unused]] const add_quad& in){};
    void create_fixed_group_add_gate([[maybe_unused]] const fixed_group_add_quad& in){};
    void create_fixed_group_add_gate_with_init([[maybe_unused]] const fixed_group_add_quad& in,
                                               [[maybe_unused]] const fixed_group_init_quad& init){};
    void create_fixed_group_add_gate_final([[maybe_unused]] const add_quad& in){};
    void create_ecc_add_gate([[maybe_unused]] const ecc_add_gate& in){};

    plookup::ReadData<uint32_t> create_gates_from_plookup_accumulators(
        [[maybe_unused]] const plookup::MultiTableId& id,
        [[maybe_unused]] const plookup::ReadData<FF>& read_values,
        [[maybe_unused]] const uint32_t key_a_index,
        [[maybe_unused]] std::optional<uint32_t> key_b_index = std::nullopt)
    {
        return {};
    };

    std::vector<uint32_t> decompose_into_default_range(
        [[maybe_unused]] const uint32_t variable_index,
        [[maybe_unused]] const uint64_t num_bits,
        [[maybe_unused]] const uint64_t target_range_bitnum = 1028,
        [[maybe_unused]] std::string const& msg = "decompose_into_default_range")
    {
        return {};
    };

    std::vector<uint32_t> decompose_into_default_range_better_for_oddlimbnum(
        [[maybe_unused]] const uint32_t variable_index,
        [[maybe_unused]] const size_t num_bits,
        [[maybe_unused]] std::string const& msg = "decompose_into_default_range_better_for_oddlimbnum")
    {
        return {};
    };
    void create_dummy_constraints([[maybe_unused]] const std::vector<uint32_t>& variable_index){};
    void create_sort_constraint([[maybe_unused]] const std::vector<uint32_t>& variable_index){};
    void create_sort_constraint_with_edges([[maybe_unused]] const std::vector<uint32_t>& variable_index,
                                           [[maybe_unused]] const FF&,
                                           [[maybe_unused]] const FF&){};
    void assign_tag([[maybe_unused]] const uint32_t variable_index, [[maybe_unused]] const uint32_t tag){};

    accumulator_triple create_and_constraint([[maybe_unused]] const uint32_t a,
                                             [[maybe_unused]] const uint32_t b,
                                             [[maybe_unused]] const size_t num_bits)
    {
        return { { 1028 }, { 1028 }, { 1028 } };
    };
    accumulator_triple create_xor_constraint([[maybe_unused]] const uint32_t a,
                                             [[maybe_unused]] const uint32_t b,
                                             [[maybe_unused]] const size_t num_bits)
    {
        return { { 1028 }, { 1028 }, { 1028 } };
    };

    size_t get_num_constant_gates() { return 1028; };
    // maybe this shouldn't be implemented?

    bool create_range_constraint(FF const& elt,
                                 size_t const& num_bits,
                                 std::string const& msg = "create_range_constraint")
    {
        const bool constraint_holds = static_cast<uint256_t>(elt).get_msb() < num_bits;
        if (!constraint_holds) {
            failure(msg);
        }
        return constraint_holds;
    }

    std::vector<uint32_t> decompose_into_base4_accumulators(
        [[maybe_unused]] const uint32_t witness_index,
        [[maybe_unused]] const size_t num_bits,
        [[maybe_unused]] std::string const& msg = "create_range_constraint")
    {
        return { 1028 };
    };

    void create_new_range_constraint([[maybe_unused]] const uint32_t variable_index,
                                     [[maybe_unused]] const uint64_t target_range,
                                     [[maybe_unused]] std::string const msg = "create_new_range_constraint"){};

    void assert_equal(FF left, FF right, std::string const& msg)
    {
        if (left != right) {
            failure(msg);
        }
    }

    void assert_equal_constant(FF left, FF right, std::string const& msg) { assert_equal(left, right, msg); }

    bool _failed = false;
    std::string _err;

    [[maybe_unused]] bool failed() const { return _failed; };
    [[nodiscard]] const std::string& err() const { return _err; };

    void set_err(std::string msg) { _err = std::move(msg); }
    void failure(std::string msg)
    {
        _failed = true;
        set_err(std::move(msg));
    }

    [[nodiscard]] bool check_circuit() const { return !_failed; }

    // Public input indices which contain recursive proof information
    std::vector<uint32_t> recursive_proof_public_input_indices;
};

} // namespace proof_system
