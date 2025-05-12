#pragma once
#include "circuit_base.hpp"

namespace smt_circuit {

#define RED "\033[31m"
#define RESET "\033[0m"

enum class TableType : int32_t { XOR, AND, UNKNOWN };
struct BlockType {
    static const size_t PUB = 0;
    static const size_t LOOKUP = 1;
    static const size_t ARITHMETIC = 2;
    static const size_t DELTA_RANGE = 3;
    static const size_t ELLIPTIC = 4;
    static const size_t AUX = 5;
};

/**
 * @brief Symbolic Circuit class for Standard Circuit Builder.
 *
 * @details Contains all the information about the circuit: gates, variables,
 * symbolic variables, specified names and global solver.
 */
class UltraCircuit : public CircuitBase {
  public:
    // TODO(alex): check that there's no actual pub_inputs block
    std::vector<std::vector<std::vector<bb::fr>>> selectors;    // all selectors from the circuit
                                                                // 1st entry are lookup selectors
                                                                // 2nd entry are arithmetic selectors
                                                                // 3rd entry are delta_range selectors
                                                                // 4th entry are elliptic selectors
                                                                // 5th entry are aux selectors
    std::vector<std::vector<std::vector<uint32_t>>> wires_idxs; // values of the gates' wires idxs

    std::vector<std::vector<std::vector<bb::fr>>> lookup_tables;
    std::unordered_map<uint32_t, SymSet<STuple>> cached_symbolic_tables;
    std::unordered_map<uint32_t, TableType> tables_types;
    std::unordered_map<uint32_t, size_t> tables_sizes;
    std::unordered_map<uint64_t, SymSet<STerm>> cached_range_tables;

    std::unordered_map<uint32_t, uint64_t> range_tags; // ranges associated with a certain tag

    std::vector<std::vector<std::vector<uint32_t>>> rom_records;  // triplets of index, value1, value2 witness indices
    std::vector<std::vector<std::array<uint32_t, 2>>> rom_states; // witness indices in the rom_table
    std::vector<std::vector<std::vector<uint32_t>>>
        ram_records; // quadriplets of index, value, timestamp witness indices and access type
    std::vector<std::vector<uint32_t>> ram_states; // wintess indices in the ram_table
    std::unordered_map<uint32_t, SymArray<STerm, STuple>>
        cached_rom_tables; // Stores the symbolic representations of in-circuit ROM tables
    std::unordered_map<uint32_t, SymArray<STerm, STerm>>
        cached_ram_tables; // Stores the symbolic representations of in-circuit RAM tables
    bool rom_ram_relaxed;  // indicates circuit parser to tread RAM/ROM relations

    explicit UltraCircuit(CircuitSchema& circuit_info,
                          Solver* solver,
                          TermType type = TermType::FFTerm,
                          const std::string& tag = "",
                          bool enable_optimizations = true,
                          bool rom_ram_relaxed = false);
    UltraCircuit(const UltraCircuit& other) = default;
    UltraCircuit(UltraCircuit&& other) = default;
    UltraCircuit& operator=(const UltraCircuit& other) = default;
    UltraCircuit& operator=(UltraCircuit&& other) = default;
    ~UltraCircuit() override = default;

    /**
     * @brief Get the num gates object
     * @note DO NOT RELY ON THIS FUNCTION
     *
     * @return size_t
     */
    inline size_t get_num_gates() const
    {
        return selectors[0].size() + selectors[1].size() + selectors[2].size() + selectors[3].size() +
               selectors[4].size() + selectors[5].size();
    };

    bool simulate_circuit_eval(std::vector<bb::fr>& witness) const override;
    void process_new_table(uint32_t table_idx);

    size_t handle_arithmetic_relation(size_t cursor);
    size_t handle_lookup_relation(size_t cursor);
    size_t handle_elliptic_relation(size_t cursor);
    size_t handle_delta_range_relation(size_t cursor);
    size_t handle_aux_relation(size_t cursor);

    void handle_range_constraints();

    void rom_table_read(uint32_t rom_array_idx, uint32_t index_idx, uint32_t value1_idx, uint32_t value2_idx);
    void ram_table_read(uint32_t ram_array_idx, uint32_t index_idx, uint32_t value_idx);
    void ram_table_write(uint32_t rom_array_idx, uint32_t index_idx, uint32_t value_idx);
    void handle_rom_tables();
    void handle_ram_tables();

    static std::pair<UltraCircuit, UltraCircuit> unique_witness_ext(
        CircuitSchema& circuit_info,
        Solver* s,
        TermType type,
        const std::vector<std::string>& equal = {},
        const std::vector<std::string>& not_equal = {},
        const std::vector<std::string>& equal_at_the_same_time = {},
        const std::vector<std::string>& not_equal_at_the_same_time = {},
        bool enable_optimizations = false);
    static std::pair<UltraCircuit, UltraCircuit> unique_witness(CircuitSchema& circuit_info,
                                                                Solver* s,
                                                                TermType type,
                                                                const std::vector<std::string>& equal = {},
                                                                bool enable_optimizations = false);
};
}; // namespace smt_circuit