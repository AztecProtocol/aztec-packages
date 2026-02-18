#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/opcode_constraint_map.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"

namespace cdg {

struct BlockRange {
    size_t first; // inclusive
    size_t last;  // inclusive
    size_t size() const { return last - first + 1; }
};

struct Sha256SubcircuitBoundaries {
    BlockRange lookup;
    BlockRange arithmetic;
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

    /**
     * @brief Find the exact gate boundaries of a SHA256 subcircuit in both lookup and arithmetic blocks.
     * Uses constraint witnesses to find start positions and known gate counts for sizes.
     */
    std::optional<Sha256SubcircuitBoundaries> find_sha256_subcircuit_boundaries(
        const acir_format::Sha256Compression& constraint);

    /**
     * @brief Validate that selectors within a SHA256 subcircuit match known-good hashes.
     * Computes a deterministic hash over all selector values in the lookup and arithmetic
     * gate ranges and compares against pinned constants.
     */
    bool validate_sha256_subcircuit_selectors(const Sha256SubcircuitBoundaries& boundaries);

    /**
     * @brief Find min and max gate indices for a set of witnesses in a specific block.
     * @param witness_real_indices Real variable indices to search for
     * @param target_block_idx Block index (0=pub_inputs, 1=lookup, 2=arithmetic, 3=delta_range, ...)
     * @return {min_gate_idx, max_gate_idx} or nullopt if no gates found
     */
    std::optional<std::pair<size_t, size_t>> find_subtrace_boundaries(
        const std::vector<uint32_t>& witness_real_indices, size_t target_block_idx);
    bool process_blake2s_constraints(const ConstraintPtr& ptr,
                                     const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_blake3s_constraints(const ConstraintPtr& ptr,
                                     const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_poseidon2s_constraints(const ConstraintPtr& ptr);
    bool process_recursion_constraints(const ConstraintPtr& ptr,
                                       const std::unordered_set<uint32_t>& next_constraint_witnesses);
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
    acir_format::AcirFormat constraint_system;
    acir_format::AcirProgram program;
    bb::UltraCircuitBuilder builder;
    UltraStaticAnalyzer analyzer;
    mutable OpcodeConstraintMap opcode_constraint_map;
    mutable bool opcode_constraint_map_built = false;
    size_t last_lookup_gate_processed = 0;
    size_t last_arithmetic_gate_processed = 0;
};

using StaticAnalyzerAcir = StaticAnalyzerAcir_<bb::fr, bb::UltraCircuitBuilder>;

} // namespace cdg
