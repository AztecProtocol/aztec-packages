#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/boomerang_value_detection/opcode_constraint_map.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace cdg {

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
    bool is_ram_rom_access_gate(size_t block_idx, size_t gate_idx);
    bool is_busread_gate(size_t block_idx, size_t gate_idx, const BusId bus_idx);

    void process_constraint_system();
    std::unordered_set<size_t> get_incorrect_opcodes();
    bool process_quad_constraints(const ConstraintPtr& ptr, bool include_next_gate_w_4 = false);
    bool process_big_quad_constraints(const ConstraintPtr& ptr);
    bool process_logic_constraints(const ConstraintPtr& ptr);
    bool process_aes128_constraints(const ConstraintPtr& ptr,
                                    const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_range_constraints(const ConstraintPtr& ptr);
    bool validate_range_constraint(uint32_t witness, uint32_t num_bits);
    bool process_sha256compression_constraints(const ConstraintPtr& ptr,
                                               const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_blake2s_constraints(const ConstraintPtr& ptr,
                                     const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_blake3s_constraints(const ConstraintPtr& ptr,
                                     const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_poseidon2s_constraints(const ConstraintPtr& ptr,
                                        const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_recursion_constraints(const ConstraintPtr& ptr,
                                       const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_multi_scalar_mul_constraints(const ConstraintPtr& ptr,
                                              const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_ecdsa_constraints(const ConstraintPtr& ptr,
                                   const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_embedded_curve_add_constraints(const ConstraintPtr& ptr,
                                                const std::unordered_set<uint32_t>& next_constraint_witnesses);
    bool process_block_constraint(const ConstraintPtr& ptr);
    bool validate_rom_constraint(const BlockConstraint& constraint,
                                 const std::vector<std::pair<uint32_t, uint32_t>>& rom_gates);
    bool validate_ram_constraint(const BlockConstraint& constraint,
                                 const std::vector<std::pair<uint32_t, uint32_t>>& ram_gates);

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
    CircuitBuilder builder;
    StaticAnalyzer_<FF, CircuitBuilder> analyzer;
    mutable OpcodeConstraintMap opcode_constraint_map;
    mutable bool opcode_constraint_map_built = false;
};

using StaticAnalyzerAcir = StaticAnalyzerAcir_<bb::fr, bb::MegaCircuitBuilder>;
} // namespace cdg
