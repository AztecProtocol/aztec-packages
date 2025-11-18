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
    // TO-DO: think about second constructor from lvalue acir_program_buf
    ~StaticAnalyzerAcir_() = default;

    std::unordered_set<uint32_t> get_unconstrained_variables();
    void filter_false_positives(std::unordered_set<uint32_t>& variables_in_one_gate);
    bool is_inverse_gate(size_t block_idx, size_t gate_idx);
    std::pair<std::unordered_set<uint32_t>, std::unordered_set<uint32_t>> analyze_acir();
    void print_variable_info(uint32_t var_idx) {analyzer.print_variable_info(var_idx);};

    void process_logic_constraints();

  private:
    acir_format::AcirFormat constraint_system;
    acir_format::AcirProgram program;
    bb::UltraCircuitBuilder builder;
    UltraStaticAnalyzer analyzer;
};

using StaticAnalyzerAcir = StaticAnalyzerAcir_<bb::fr, bb::UltraCircuitBuilder>;

} // namespace cdg
