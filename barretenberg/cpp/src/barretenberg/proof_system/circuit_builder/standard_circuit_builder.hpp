#pragma once
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include "barretenberg/proof_system/types/merkle_hash_type.hpp"
#include "barretenberg/proof_system/types/pedersen_commitment_type.hpp"
#include "circuit_builder_base.hpp"
#include <array>

namespace bb {

template <typename FF> class StandardCircuitBuilder_ : public CircuitBuilderBase<FF> {
  public:
    using Arithmetization = StandardArith<FF>;
    using Selectors = Arithmetization;
    static constexpr size_t NUM_WIRES = Arithmetization::NUM_WIRES;
    // Keeping NUM_WIRES, at least temporarily, for backward compatibility
    static constexpr size_t program_width = Arithmetization::NUM_WIRES;
    static constexpr size_t num_selectors = Arithmetization::NUM_SELECTORS;
    std::vector<std::string> selector_names = Arithmetization::selector_names;

    static constexpr std::string_view NAME_STRING = "StandardArithmetization";
    static constexpr CircuitType CIRCUIT_TYPE = CircuitType::STANDARD;
    static constexpr merkle::HashType merkle_hash_type = merkle::HashType::FIXED_BASE_PEDERSEN;
    static constexpr pedersen::CommitmentType commitment_type = pedersen::CommitmentType::FIXED_BASE_PEDERSEN;

    std::array<std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>, NUM_WIRES> wires;
    Arithmetization selectors;

    using WireVector = std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>;
    using SelectorVector = std::vector<FF, bb::ContainerSlabAllocator<FF>>;

    WireVector& w_l() { return std::get<0>(wires); };
    WireVector& w_r() { return std::get<1>(wires); };
    WireVector& w_o() { return std::get<2>(wires); };

    const WireVector& w_l() const { return std::get<0>(wires); };
    const WireVector& w_r() const { return std::get<1>(wires); };
    const WireVector& w_o() const { return std::get<2>(wires); };

    SelectorVector& q_m() { return this->selectors.q_m(); };
    SelectorVector& q_1() { return this->selectors.q_1(); };
    SelectorVector& q_2() { return this->selectors.q_2(); };
    SelectorVector& q_3() { return this->selectors.q_3(); };
    SelectorVector& q_c() { return this->selectors.q_c(); };

    const SelectorVector& q_m() const { return this->selectors.q_m(); };
    const SelectorVector& q_1() const { return this->selectors.q_1(); };
    const SelectorVector& q_2() const { return this->selectors.q_2(); };
    const SelectorVector& q_3() const { return this->selectors.q_3(); };
    const SelectorVector& q_c() const { return this->selectors.q_c(); };

    static constexpr size_t UINT_LOG2_BASE = 2;

    // These are variables that we have used a gate on, to enforce that they are
    // equal to a defined value.
    // TODO(#216)(Adrian): Why is this not in CircuitBuilderBase
    std::map<FF, uint32_t> constant_variable_indices;

    StandardCircuitBuilder_(const size_t size_hint = 0)
        : CircuitBuilderBase<FF>(size_hint)
    {
        selectors.reserve(size_hint);
        w_l().reserve(size_hint);
        w_r().reserve(size_hint);
        w_o().reserve(size_hint);
        // To effieciently constrain wires to zero, we set the first value of w_1 to be 0, and use copy constraints for
        // all future zero values.
        // (#216)(Adrian): This should be done in a constant way, maybe by initializing the constant_variable_indices
        // map
        this->zero_idx = put_constant_variable(FF::zero());
        // TODO(#217)(Cody): Ensure that no polynomial is ever zero. Maybe there's a better way.
        this->one_idx = put_constant_variable(FF::one());
        // 1 * 1 * 1 + 1 * 1 + 1 * 1 + 1 * 1 + -4
        // m           l       r       o        c
        create_poly_gate({ this->one_idx, this->one_idx, this->one_idx, 1, 1, 1, 1, -4 });
    };
    StandardCircuitBuilder_(const StandardCircuitBuilder_& other) = delete;
    StandardCircuitBuilder_(StandardCircuitBuilder_&& other) = default;
    StandardCircuitBuilder_& operator=(const StandardCircuitBuilder_& other) = delete;
    StandardCircuitBuilder_& operator=(StandardCircuitBuilder_&& other)
    {
        CircuitBuilderBase<FF>::operator=(std::move(other));
        constant_variable_indices = other.constant_variable_indices;
        wires = other.wires;
        selectors = other.selectors;
        return *this;
    };
    ~StandardCircuitBuilder_() override = default;

    void assert_equal_constant(uint32_t const a_idx, FF const& b, std::string const& msg = "assert equal constant");

    void create_add_gate(const add_triple_<FF>& in) override;
    void create_mul_gate(const mul_triple_<FF>& in) override;
    void create_bool_gate(const uint32_t a) override;
    void create_poly_gate(const poly_triple_<FF>& in) override;
    void create_big_add_gate(const add_quad_<FF>& in);
    void create_big_add_gate_with_bit_extraction(const add_quad_<FF>& in);
    void create_big_mul_gate(const mul_quad_<FF>& in);
    void create_balanced_add_gate(const add_quad_<FF>& in);
    void create_fixed_group_add_gate(const fixed_group_add_quad_<FF>& in);
    void create_fixed_group_add_gate_with_init(const fixed_group_add_quad_<FF>& in,
                                               const fixed_group_init_quad_<FF>& init);
    void create_fixed_group_add_gate_final(const add_quad_<FF>& in);

    fixed_group_add_quad_<FF> previous_add_quad;

    // TODO(#216)(Adrian): This should be a virtual overridable method in the base class.
    void fix_witness(const uint32_t witness_index, const FF& witness_value);

    std::vector<uint32_t> decompose_into_base4_accumulators(const uint32_t witness_index,
                                                            const size_t num_bits,
                                                            std::string const& msg = "create_range_constraint");

    void create_range_constraint(const uint32_t variable_index,
                                 const size_t num_bits,
                                 std::string const& msg = "create_range_constraint")
    {
        decompose_into_base4_accumulators(variable_index, num_bits, msg);
    }

    accumulator_triple_<FF> create_logic_constraint(const uint32_t a,
                                                    const uint32_t b,
                                                    const size_t num_bits,
                                                    bool is_xor_gate);
    accumulator_triple_<FF> create_and_constraint(const uint32_t a, const uint32_t b, const size_t num_bits);
    accumulator_triple_<FF> create_xor_constraint(const uint32_t a, const uint32_t b, const size_t num_bits);

    // TODO(#216)(Adrian): The 2 following methods should be virtual in the base class
    uint32_t put_constant_variable(const FF& variable);

    size_t get_num_constant_gates() const override { return 0; }

    bool check_circuit();

    msgpack::sbuffer export_circuit() override;

  private:
    struct CircuitSchema {
        std::string modulus;
        std::vector<uint32_t> public_inps;
        std::unordered_map<uint32_t, std::string> vars_of_interest;
        std::vector<FF> variables;
        std::vector<std::vector<FF>> selectors;
        std::vector<std::vector<uint32_t>> wires;
        MSGPACK_FIELDS(modulus, public_inps, vars_of_interest, variables, selectors, wires);
    } circuit_schema;
};

using StandardCircuitBuilder = StandardCircuitBuilder_<bb::fr>;
using StandardGrumpkinCircuitBuilder = StandardCircuitBuilder_<grumpkin::fr>;
} // namespace bb
