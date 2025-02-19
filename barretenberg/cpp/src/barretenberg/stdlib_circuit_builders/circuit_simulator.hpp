#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/plonk_honk_shared/execution_trace/gate_data.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/plonk_honk_shared/types/circuit_type.hpp"
#include "barretenberg/plonk_honk_shared/types/merkle_hash_type.hpp"
#include "barretenberg/plonk_honk_shared/types/pedersen_commitment_type.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include <cstdint>

namespace bb {

/**
 * @brief Simulate circuit construction to quickly get function outputs.
 * @details Instantiating the stdlib with this type will give a version of the stdlib where none of the classes store
 * witness data. This significantly speeds us the cost of executing stdlib functions. What's more, for even faster
 * speeds, we have the option (partially implemented) to completely skip computing most witness constrution, and instead
 * proxy out to "native" functions (for instance, bb::stdlib::ecdsa_verify_signature we might reformat
 * its inputs and then directly call the function crypto::ecdsa_verify_signature).
 *
 * The general strategy is to use the "constant" code paths that already exist in the stdlib, but with a circuit
 * simulator as its context (rather than, for instance, a nullptr). In cases where this doesn't quite work, we use
 * template metaprogramming to provide an alternative implementation.
 *
 * This means changing the data model in some ways. Since a simulator does not contain a `variables` vector, we cannot
 * work with witness indices anymore. In particular, the witness index of every witness instantiated with a simulator
 * type will be `IS_CONSTANT`, and the witness is just a wrapper for a value. A stdlib `field_t` instance will now store
 * all of its data in the `additive_constant`, and something similar is true for the `uint` classes. Changes are also
 * necessary with some basic builder functions, like `assert_equal`, which would take in a pair of witness indices for a
 * real builder, but which just takes in a pair of native field elements during simulation. This strategy has a
 * relatively small footprint, but it feels possible to improve upon the idioms, reduce the size of the divergence, or
 * perhaps organize things more cleanly in a way that avoids the use of compile time `if` statements.
 *
 */
// TODO(https://github.com/AztecProtocol/barretenberg/issues/961): Ensure we can execute the simulator in the context of
// ECCVM which is instantiated on Grumpkin
class CircuitSimulatorBN254 {
  public:
    using FF = bb::fr;
    using EmbeddedCurve = std::conditional_t<std::same_as<FF, bb::g1::coordinate_field>, curve::BN254, curve::Grumpkin>;
    static constexpr CircuitType CIRCUIT_TYPE = CircuitType::ULTRA;
    static constexpr std::string_view NAME_STRING = "SIMULATOR";
    bool contains_pairing_point_accumulator = false;
    static constexpr size_t UINT_LOG2_BASE = 2; // Would be 6 for UltraPlonk
    static constexpr size_t DEFAULT_PLOOKUP_RANGE_BITNUM = 1028;

    size_t num_gates = 0;
    static constexpr uint32_t zero_idx = 0; // Should agree with what is in circuit builders
    std::vector<FF> public_inputs;

    void add_pairing_point_accumulator(const PairingPointAccumulatorIndices& proof_element_limbs)
    {

        if (contains_pairing_point_accumulator) {
            failure("added recursive proof when one already exists");
        }
        contains_pairing_point_accumulator = true;

        for (uint32_t idx = 0; idx < proof_element_limbs.size(); idx++) {
            set_public_input(proof_element_limbs[idx]);
            pairing_point_accumulator_public_input_indices[idx] = static_cast<uint32_t>(public_inputs.size() - 1);
        }
    }

    inline uint32_t add_variable([[maybe_unused]] const bb::fr index) const { return 1028; }
    inline bb::fr get_variable([[maybe_unused]] const uint32_t index) const { return 1028; }

    uint32_t put_constant_variable([[maybe_unused]] const bb::fr& variable) { return 1028; }
    void set_public_input([[maybe_unused]] const uint32_t witness_index) {}

    void set_public_input(const bb::fr value) { public_inputs.emplace_back(value); }

    void fix_witness([[maybe_unused]] const uint32_t witness_index, [[maybe_unused]] const bb::fr& witness_value){};

    [[nodiscard]] size_t get_estimated_num_finalized_gates() const { return 0; }

    void create_add_gate([[maybe_unused]] const add_triple_<FF>& in){};
    void create_mul_gate([[maybe_unused]] const mul_triple_<FF>& in){};
    void create_bool_gate([[maybe_unused]] const uint32_t a){};
    void create_poly_gate([[maybe_unused]] const poly_triple_<FF>& in){};
    void create_big_add_gate([[maybe_unused]] const add_quad_<FF>& in){};
    void create_big_add_gate_with_bit_extraction([[maybe_unused]] const add_quad_<FF>& in){};
    void create_big_mul_gate([[maybe_unused]] const mul_quad_<FF>& in){};
    void create_balanced_add_gate([[maybe_unused]] const add_quad_<FF>& in){};
    void create_fixed_group_add_gate([[maybe_unused]] const fixed_group_add_quad_<FF>& in){};
    void create_fixed_group_add_gate_with_init([[maybe_unused]] const fixed_group_add_quad_<FF>& in,
                                               [[maybe_unused]] const fixed_group_init_quad_<FF>& init){};
    void create_fixed_group_add_gate_final([[maybe_unused]] const add_quad_<FF>& in){};
    void create_ecc_add_gate([[maybe_unused]] const ecc_add_gate_<FF>& in){};

    void create_poseidon2_internal_gate(const poseidon2_internal_gate_<FF>& in);
    void create_poseidon2_external_gate(const poseidon2_external_gate_<FF>& in);

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

    accumulator_triple_<FF> create_and_constraint([[maybe_unused]] const uint32_t a,
                                                  [[maybe_unused]] const uint32_t b,
                                                  [[maybe_unused]] const size_t num_bits)
    {
        return { { 1028 }, { 1028 }, { 1028 } };
    };
    accumulator_triple_<FF> create_xor_constraint([[maybe_unused]] const uint32_t a,
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

    [[nodiscard]] bool failed() const { return _failed; };
    [[nodiscard]] const std::string& err() const { return _err; };

    void set_err(std::string msg) { _err = std::move(msg); }
    void failure(std::string msg)
    {
        _failed = true;
        set_err(std::move(msg));
    }

    [[nodiscard]] bool check_circuit() const { return !_failed; }

    size_t create_ROM_array([[maybe_unused]] const size_t array_size) { return {}; }

    void set_ROM_element_pair([[maybe_unused]] const size_t rom_id,
                              [[maybe_unused]] const size_t index_value,
                              [[maybe_unused]] const std::array<uint32_t, 2>& value_witnesses)
    {}
    uint32_t read_ROM_array([[maybe_unused]] const size_t rom_id, [[maybe_unused]] const uint32_t index_witness)
    {
        return {};
    }
    std::array<uint32_t, 2> read_ROM_array_pair([[maybe_unused]] const size_t rom_id,
                                                [[maybe_unused]] const uint32_t index_witness)
    {
        return {};
    }
    void create_ecc_dbl_gate([[maybe_unused]] const ecc_dbl_gate_<FF>& in){};

    // Public input indices which contain recursive proof information
    PairingPointAccumulatorPubInputIndices pairing_point_accumulator_public_input_indices;
};

class SimulatorCircuitChecker {
  public:
    static bool check(const CircuitSimulatorBN254& builder) { return builder.check_circuit(); }
};

} // namespace bb
