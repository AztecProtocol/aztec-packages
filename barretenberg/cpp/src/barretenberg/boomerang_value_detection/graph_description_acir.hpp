#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"

namespace cdg {
template <typename FF, typename CircuitBuilder> class StaticAnalyzerAcir_ {
  public:
    StaticAnalyzerAcir_() = delete;
    StaticAnalyzerAcir_(const StaticAnalyzerAcir_& other) = delete;
    StaticAnalyzerAcir_(StaticAnalyzerAcir_&& other) = delete;
    StaticAnalyzerAcir_& operator=(const StaticAnalyzerAcir_& other) = delete;
    StaticAnalyzerAcir_&& operator=(StaticAnalyzerAcir_&& other) = delete;
    StaticAnalyzerAcir_(std::vector<uint8_t>& acir_program_buf);
    // TODO: think about second constructor from lvalue acir_program_buf
    ~StaticAnalyzerAcir_() = default;

    std::unordered_set<uint32_t> get_unconstrained_variables();
    void filter_false_positives(std::unordered_set<uint32_t>& variables_in_one_gate);
    bool is_inverse_gate(size_t block_idx, size_t gate_idx);
    std::pair<std::unordered_set<uint32_t>, std::unordered_set<uint32_t>> analyze_acir();
    // logic to parse constraint system
    void process_constraint_system();
    void process_logic_constraints();
    void process_aes128_constraints(const std::vector<ConnectedComponent>& cc);
    void process_range_constraints();
    void process_sha256compression_constraints();
    void process_blake2s_constraints();
    void process_blake3s_constraints();
    void process_poseidon2s_constraints();
    void process_recursion_constraints();
    void process_multi_scalar_mul_constraints();
    void process_ecdsa_constraints();
    void process_embedded_curve_add_constraints();
    // getters
    auto get_aes128_subgraphs() const { return aes128_subgraphs; }
    auto get_logic_witnesses() const { return builder.get_all_logic_witnesses(); };

    // functions for test debugging
    void print_variable_info(uint32_t var_idx) { analyzer.print_variable_info(var_idx); };

  private:
    acir_format::AcirFormat constraint_system;
    acir_format::AcirProgram program;
    bb::UltraCircuitBuilder builder;
    UltraStaticAnalyzer analyzer;
    std::vector<std::vector<uint32_t>> aes128_subgraphs;
};

using StaticAnalyzerAcir = StaticAnalyzerAcir_<bb::fr, bb::UltraCircuitBuilder>;

} // namespace cdg
