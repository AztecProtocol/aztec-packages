#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/opcode_constraint_map.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"

namespace cdg {

using sha256_helpers::Sha256RoundState;
using sha256_helpers::Sha256SparseFunctionParams;
using sha256_helpers::Sha256SparseFunctionResult;
using sha256_helpers::Sha256SparseFunctionType;
/**
 * @brief Result of find_and_validate_add_two_gate: gate index and output witness.
 */
struct AddTwoGateInfo {
    size_t gate_idx;
    uint32_t result_real; // real variable index of the output wire
};

/**
 * @brief Full wire info from an add_two gate, discovered by searching backward from output.
 */
struct AddTwoGateWires {
    size_t gate_idx;
    uint32_t w_l_real;
    uint32_t w_r_real;
    uint32_t w_o_real;
    uint32_t w_4_real;
    bool is_big_mul_add; // true = big_mul_add_gate (output in w_4), false = add_gate (output in w_o)
};

template <typename FF, typename CircuitBuilder> class StaticAnalyzerAcir_ {
  public:
    StaticAnalyzerAcir_() = delete;
    StaticAnalyzerAcir_(const StaticAnalyzerAcir_& other) = delete;
    StaticAnalyzerAcir_(StaticAnalyzerAcir_&& other) = delete;
    StaticAnalyzerAcir_& operator=(const StaticAnalyzerAcir_& other) = delete;
    StaticAnalyzerAcir_&& operator=(StaticAnalyzerAcir_&& other) = delete;
    StaticAnalyzerAcir_(std::vector<uint8_t>& acir_program_buf);
    StaticAnalyzerAcir_(acir_format::AcirFormat constraint_system);
    StaticAnalyzerAcir_(acir_format::AcirFormat constraint_system, CircuitBuilder&& external_builder);
    ~StaticAnalyzerAcir_() = default;

    bool is_inverse_gate(size_t block_idx, size_t gate_idx);
    bool is_boolean_gate(size_t block_idx, size_t gate_idx);
    bool is_uncostrained_arithmetic_gate(size_t gate_index);
    std::optional<size_t> find_sha256_add_normalize_gate(uint32_t result_real, uint32_t hash_real);
    std::optional<std::vector<size_t>> find_sha256_decompose_gate(uint32_t result_real);
    std::optional<AddTwoGateInfo> find_and_validate_add_two_gate(uint32_t a_real, uint32_t b_real, uint32_t c_real);
    std::optional<AddTwoGateWires> find_add_two_gate_by_output(uint32_t output_real);
    /**
     * @brief Find an arithmetic gate matching specified wire positions.
     *
     * Searches for gates where ALL given witness indices appear on any wire (position-independent).
     * Validates q_m=0, q_arith=1, and gate equation == 0.
     * Searches via the first witness in the vector using get_variable_gates.
     *
     * @param witnesses Real variable indices to search for (all must appear on gate wires)
     * @return Vector of matching gate indices (empty if none found).
     */
    std::vector<size_t> find_arithmetic_gate(const std::vector<uint32_t>& witnesses);
    /**
     * @brief Find and hash-validate a contiguous block of lookup gates starting from a known output witness.
     *
     * The output of read_from_1_to_2_table (lookup[C2][0]) appears in w_r of the first gate.
     * Finds that gate, hashes `gate_count` consecutive gates' selectors, compares against pinned hash.
     *
     * @param output_real Real index of the lookup output (appears in w_r of first gate)
     * @param gate_count Number of consecutive lookup gates to hash
     * @param expected_hash Pinned selector hash (0 = skip hash check)
     * @param log_prefix Label for error messages
     * @return true if found and hash matches (or hash check skipped)
     */
    bool validate_sha256_lookup_block(uint32_t output_real,
                                      size_t gate_count,
                                      size_t expected_hash,
                                      const char* log_prefix);
    bool process_sha256comression_round(
        Sha256RoundState& state, uint32_t w_i_real, bool w_i_const, size_t round_idx, uint32_t& discovered_w_i_real);
    Sha256SparseFunctionResult validate_sha256_sparse_function(const Sha256SparseFunctionParams& params,
                                                               size_t lookup_lower_bound = 0);
    /**
     * @brief Validate one extend_witness iteration for W[i] (i >= 16, non-constant).
     *
     * Called after compression round discovers W[i]. Traces backward through:
     *   Step 9: reduction (w_out → w_out_raw, divisor range check)
     *   Step 8: w_out_raw add_two gate (discover xor_result)
     *   Step 7: SHA256_WITNESS_OUTPUT lookup (hash selectors)
     *   Steps 5-6: add_two chains for xor_result_sparse and left_xor_sparse
     *   Steps 1-2: convert_witness lookups for W[i-15] and W[i-2] (hash selectors)
     *
     * @param w_i_real Real index of W[i] (must not be IS_CONSTANT)
     * @param w_real Array of all 64 W real indices (IS_CONSTANT for constant entries)
     * @param w_const Array of constant flags for all 64 W values
     * @param i The extend_witness iteration index (16..63)
     * @return true if all validations pass
     */
    bool validate_extend_witness_iteration(uint32_t w_i_real,
                                           const std::array<uint32_t, 64>& w_real,
                                           const std::array<bool, 64>& w_const,
                                           size_t i);

    std::vector<size_t> find_range_list_unconstrained_gates(const CircuitBuilder::RangeList& range_list);
    void process_constraint_system();
    std::unordered_set<size_t> get_incorrect_opcodes();
    bool process_quad_constraints(const ConstraintPtr& ptr, bool include_next_gate_w_4 = false);
    bool process_big_quad_constraints(const ConstraintPtr& ptr);
    bool process_logic_constraints(const ConstraintPtr& ptr);
    bool process_aes128_constraints(const ConstraintPtr& ptr,
                                    const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_range_constraints(const ConstraintPtr& ptr);
    bool validate_range_constraint(uint32_t witness, uint32_t num_bits);
    bool process_sha256compression_constraint(const ConstraintPtr& ptr);

    bool process_blake2s_constraints(const ConstraintPtr& ptr,
                                     const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_blake3s_constraints(const ConstraintPtr& ptr,
                                     const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_poseidon2s_constraints(const ConstraintPtr& ptr);
    bool process_recursion_constraints(const ConstraintPtr& ptr,
                                       const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_chonk_recursion_constraint(const acir_format::RecursionConstraint* constraint);
    bool validate_chonk_recursion_mega_zk(const acir_format::RecursionConstraint* constraint);
    bool process_honk_recursion_constraint(const acir_format::RecursionConstraint* constraint);
    bool process_rollup_honk_recursion_constraint(const acir_format::RecursionConstraint* constraint);
    bool process_multi_scalar_mul_constraints(const ConstraintPtr& ptr,
                                              const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_ecdsa_constraints(const ConstraintPtr& ptr,
                                   const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_embedded_curve_add_constraints(const ConstraintPtr& ptr,
                                                const std::unordered_set<uint32_t>& next_constraint_witnesses);

    void add_witness_if_not_constant(const WitnessOrConstant<FF>& woc, std::unordered_set<uint32_t>& witness_indices);

    /**
     * @brief Collect ACIR witness indices from a constraint at the given opcode index
     * @param opcode_idx The opcode index to look up in the constraint map
     * @return Set of witness indices found in the constraint
     */
    std::unordered_set<uint32_t> collect_witnesses_from_constraint(size_t opcode_idx);

    /**
     * @brief Build or retrieve the opcode constraint map
     * @return Reference to the opcode constraint map
     */
    const OpcodeConstraintMap& build_opcode_type_map() const
    {
        if (!opcode_constraint_map_built) {
            opcode_constraint_map = cdg::build_opcode_type_map(constraint_system);
            opcode_constraint_map_built = true;
        }
        return opcode_constraint_map;
    }

    /**
     * @brief Get end iterator for constraint map
     * @return End iterator for the opcode constraint map
     */
    OpcodeConstraintMap::const_iterator constraints_end() const
    {
        if (!opcode_constraint_map_built) {
            opcode_constraint_map = cdg::build_opcode_type_map(constraint_system);
            opcode_constraint_map_built = true;
        }
        return opcode_constraint_map.end();
    }

    /**
     * @brief Find a constraint by opcode index
     * @param opcode_idx The opcode index to look up
     * @return Iterator to the constraint info, or end() if not found
     */
    OpcodeConstraintMap::const_iterator find_constraint(size_t opcode_idx) const
    {
        if (!opcode_constraint_map_built) {
            opcode_constraint_map = cdg::build_opcode_type_map(constraint_system);
            opcode_constraint_map_built = true;
        }
        return opcode_constraint_map.find(opcode_idx);
    }

    // functions for test debugging
    void print_variable_info(uint32_t var_idx) { analyzer.print_variable_info(var_idx); };

    std::pair<uint256_t, uint256_t> recover_chunks_from_lookups(const bb::plookup::MultiTable& multi_table,
                                                                const size_t& init_gate_idx);

  private:
    std::optional<size_t> find_block_index(const auto& block) const;

    acir_format::AcirFormat constraint_system;
    acir_format::AcirProgram program;
    CircuitBuilder builder;
    StaticAnalyzer_<FF, CircuitBuilder> analyzer;
    mutable OpcodeConstraintMap opcode_constraint_map;
    mutable bool opcode_constraint_map_built = false;
    // Position among ROLLUP_HONK/ROOT_ROLLUP_HONK recursion constraints on this builder.
    size_t rollup_honk_opcode_count = 0;
    // Multi-block cursor handoff after the previous ROOT_ROLLUP_HONK opcode.
    RollupHonkIpaAccumulateValidation::BlockCursor rollup_cursor_handoff{};
};


using StaticAnalyzerAcir = StaticAnalyzerAcir_<bb::fr, bb::UltraCircuitBuilder>;
using MegaStaticAnalyzerAcir = StaticAnalyzerAcir_<bb::fr, bb::MegaCircuitBuilder>;

} // namespace cdg
