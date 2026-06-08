// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./graph.hpp"
#include "./gate_patterns.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/duplicate_provenance.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <algorithm>
#include <array>
#include <iomanip>
#include <optional>
#include <stack>

using namespace bb::plookup;
using namespace bb;

namespace {

using DuplicateAdjacency = std::unordered_map<uint32_t, std::vector<uint32_t>>;

template <typename T> void hash_combine(size_t& seed, const T& value)
{
    constexpr size_t HASH_COMBINE_CONSTANT = 0x9e3779b9;
    seed ^= std::hash<T>{}(value) + HASH_COMBINE_CONSTANT + (seed << 6) + (seed >> 2);
}

template <typename FF> struct ArithmeticDerivationSignature {
    FF q_m;
    FF linear_scaling;
    FF q_c;
    uint32_t peer_variable = 0;

    bool operator==(const ArithmeticDerivationSignature& other) const = default;
};

template <typename FF> struct ArithmeticDerivationSignatureHasher {
    size_t operator()(const ArithmeticDerivationSignature<FF>& signature) const
    {
        size_t seed = 0;
        hash_combine(seed, signature.q_m);
        hash_combine(seed, signature.linear_scaling);
        hash_combine(seed, signature.q_c);
        hash_combine(seed, signature.peer_variable);
        return seed;
    }
};

template <typename FF> struct EllipticOperationSignature {
    bool is_double = false;
    FF q_sign_or_double;
    std::array<FF, 4> inputs;

    bool operator==(const EllipticOperationSignature& other) const = default;
};

template <typename FF> struct EllipticOperationSignatureHasher {
    size_t operator()(const EllipticOperationSignature<FF>& signature) const
    {
        size_t seed = 0;
        hash_combine(seed, signature.is_double);
        hash_combine(seed, signature.q_sign_or_double);
        for (const auto& input : signature.inputs) {
            hash_combine(seed, input);
        }
        return seed;
    }
};

template <typename FF> struct EccOpPointSignature {
    FF opcode;
    std::array<FF, 4> point;

    bool operator==(const EccOpPointSignature& other) const = default;
};

template <typename FF> struct EccOpPointSignatureHasher {
    size_t operator()(const EccOpPointSignature<FF>& signature) const
    {
        size_t seed = 0;
        hash_combine(seed, signature.opcode);
        for (const auto& limb : signature.point) {
            hash_combine(seed, limb);
        }
        return seed;
    }
};

using DuplicateIdentityKey = DuplicateProvenanceLocalId;

struct DuplicateIdentityKeyHasher {
    size_t operator()(const DuplicateIdentityKey& key) const
    {
        size_t seed = 0;
        for (const uint64_t identity : key) {
            hash_combine(seed, identity);
        }
        return seed;
    }
};

struct LookupAccessSignature {
    size_t table_index = 0;
    DuplicateIdentityKey key_identity;

    bool operator==(const LookupAccessSignature& other) const = default;
};

struct LookupAccessSignatureHasher {
    size_t operator()(const LookupAccessSignature& signature) const
    {
        size_t seed = 0;
        hash_combine(seed, signature.table_index);
        DuplicateIdentityKeyHasher hash_key;
        hash_combine(seed, hash_key(signature.key_identity));
        return seed;
    }
};

void connect_duplicate_variables(DuplicateAdjacency& duplicate_adjacency,
                                 const std::vector<uint32_t>& variables,
                                 uint32_t zero_idx)
{
    std::vector<uint32_t> filtered_variables;
    filtered_variables.reserve(variables.size());
    for (auto variable_index : variables) {
        if (variable_index != zero_idx) {
            filtered_variables.emplace_back(variable_index);
        }
    }
    std::sort(filtered_variables.begin(), filtered_variables.end());
    auto unique_pointer = std::unique(filtered_variables.begin(), filtered_variables.end());
    filtered_variables.erase(unique_pointer, filtered_variables.end());
    if (filtered_variables.size() < 2) {
        return;
    }
    for (size_t i = 0; i < filtered_variables.size() - 1; i++) {
        duplicate_adjacency[filtered_variables[i]].emplace_back(filtered_variables[i + 1]);
        duplicate_adjacency[filtered_variables[i + 1]].emplace_back(filtered_variables[i]);
    }
}

std::unordered_set<uint32_t> collect_duplicate_graph_variables(const DuplicateAdjacency& duplicate_adjacency)
{
    std::unordered_set<uint32_t> duplicate_variables;
    duplicate_variables.reserve(duplicate_adjacency.size() * 2);
    for (const auto& [node, neighbors] : duplicate_adjacency) {
        duplicate_variables.insert(node);
        duplicate_variables.insert(neighbors.begin(), neighbors.end());
    }
    return duplicate_variables;
}

bool all_connected_in_duplicate_graph(const std::vector<uint32_t>& ordered_indices,
                                      const DuplicateAdjacency& duplicate_adjacency)
{
    if (ordered_indices.empty()) {
        return false;
    }
    std::unordered_set<uint32_t> visited;
    std::stack<uint32_t> frontier;
    frontier.push(ordered_indices[0]);
    while (!frontier.empty()) {
        uint32_t node = frontier.top();
        frontier.pop();
        if (visited.contains(node)) {
            continue;
        }
        visited.insert(node);
        if (auto it = duplicate_adjacency.find(node); it != duplicate_adjacency.end()) {
            for (auto neighbor : it->second) {
                frontier.push(neighbor);
            }
        }
    }
    return std::all_of(
        ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) { return visited.contains(idx); });
}

bool duplicate_set_is_connected_in_overlay(const std::vector<uint32_t>& ordered_indices,
                                           const DuplicateAdjacency& duplicate_adjacency,
                                           const std::unordered_set<uint32_t>& duplicate_variables)
{
    return !duplicate_variables.empty() &&
           std::all_of(ordered_indices.begin(),
                       ordered_indices.end(),
                       [&](uint32_t idx) { return duplicate_variables.contains(idx); }) &&
           all_connected_in_duplicate_graph(ordered_indices, duplicate_adjacency);
}

bool duplicate_set_intersects_overlay(const std::vector<uint32_t>& ordered_indices,
                                      const std::unordered_set<uint32_t>& duplicate_variables)
{
    return std::any_of(ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) {
        return duplicate_variables.contains(idx);
    });
}

std::unordered_map<uint32_t, size_t> build_duplicate_component_ids(const DuplicateAdjacency& duplicate_adjacency)
{
    std::unordered_map<uint32_t, size_t> component_ids;
    component_ids.reserve(duplicate_adjacency.size());
    size_t next_component_id = 0;

    for (const auto& [start, _] : duplicate_adjacency) {
        if (component_ids.contains(start)) {
            continue;
        }
        std::stack<uint32_t> frontier;
        frontier.push(start);
        while (!frontier.empty()) {
            uint32_t node = frontier.top();
            frontier.pop();
            if (component_ids.contains(node)) {
                continue;
            }
            component_ids[node] = next_component_id;
            if (auto it = duplicate_adjacency.find(node); it != duplicate_adjacency.end()) {
                for (auto neighbor : it->second) {
                    frontier.push(neighbor);
                }
            }
        }
        next_component_id++;
    }

    return component_ids;
}

bool duplicate_set_is_connected_in_overlay_components(const std::vector<uint32_t>& ordered_indices,
                                                      const std::unordered_map<uint32_t, size_t>& component_ids)
{
    if (ordered_indices.empty()) {
        return false;
    }
    auto first_it = component_ids.find(ordered_indices[0]);
    if (first_it == component_ids.end()) {
        return false;
    }
    const size_t component_id = first_it->second;
    return std::all_of(ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) {
        auto it = component_ids.find(idx);
        return it != component_ids.end() && it->second == component_id;
    });
}

bool duplicate_set_intersects_overlay_components(const std::vector<uint32_t>& ordered_indices,
                                                 const std::unordered_map<uint32_t, size_t>& component_ids)
{
    return std::any_of(
        ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) { return component_ids.contains(idx); });
}

constexpr uint64_t DATABUS_VARIABLE_INDEX_READ_OVERLAY_TAG = 1;

DuplicateIdentityKey databus_read_key(size_t bus_idx, uint32_t read_index)
{
    return duplicate_provenance_local_id({ static_cast<uint64_t>(bus_idx), read_index });
}

DuplicateIdentityKey duplicate_identity_key(std::initializer_list<uint64_t> identities)
{
    return duplicate_provenance_local_id(identities);
}

DuplicateIdentityKey duplicate_identity_key(std::initializer_list<uint64_t> prefix, const DuplicateIdentityKey& suffix)
{
    auto key = duplicate_provenance_local_id(prefix);
    append_duplicate_provenance_identity(key, suffix);
    return key;
}

std::optional<DuplicateIdentityKey> cryptographic_binding_group_key(const DuplicateProvenance& provenance)
{
    const auto binding_role = get_duplicate_cryptographic_binding_role(provenance.local_id);
    if (duplicate_provenance_category(provenance) != DuplicateProvenanceCategory::POSEIDON2_CRYPTOGRAPHIC_BINDING ||
        provenance.local_id.empty() ||
        provenance.local_id[DUPLICATE_CRYPTOGRAPHIC_BINDING_KIND_INDEX] !=
            static_cast<uint64_t>(DuplicateCryptographicBindingKind::BATCH_MERGE_ECC_OP_HASH) ||
        !binding_role.has_value()) {
        return std::nullopt;
    }

    DuplicateIdentityKey key = provenance.local_id;
    key.erase(key.begin() + static_cast<std::ptrdiff_t>(DUPLICATE_CRYPTOGRAPHIC_BINDING_ROLE_INDEX));
    return key;
}

} // namespace

namespace cdg {

/**
 * @brief this method processes variables from a gate by removing duplicates and updating tracking structures
 * @tparam FF field type
 * @tparam CircuitBuilder
 * @param gate_variables vector of variables to process
 * @param gate_index index of the current gate
 * @param blk reference to the block containing the gate
 * @details The method performs several operations:
 *          1) Removes duplicate variables from the input vector
 *          2) Converts each variable to its real index using to_real
 *          3) Creates key-value pairs of (variable_index, block_pointer) for tracking
 *          4) Updates variable_gates map with gate indices for each variable
 *          5) Increments the gate count for each processed variable
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::process_gate_variables(std::vector<uint32_t>& gate_variables,
                                                                        size_t gate_index,
                                                                        auto& blk)
{
    auto unique_variables = std::unique(gate_variables.begin(), gate_variables.end());
    gate_variables.erase(unique_variables, gate_variables.end());
    if (gate_variables.empty()) {
        return;
    }
    for (auto& var_idx : gate_variables) {
        const void* block_ptr = &blk;
        KeyPair key = std::make_pair(var_idx, block_ptr);
        variable_gates[key].emplace_back(gate_index);
        variable_gate_refs[var_idx].emplace_back(block_ptr, gate_index);
    }
    for (const auto& variable_index : gate_variables) {
        variables_gate_counts[variable_index] += 1;
    }
}

/**
 * @brief Extract gate variables using a declarative pattern
 *
 * This method uses a GatePattern to determine which wires are constrained by a gate,
 * then extracts the variable indices from those wire positions.
 *
 * @param index Gate index within the block
 * @param blk The block containing the gate
 * @param pattern The GatePattern describing which wires are constrained
 * @param gate_selector_column The selector column for this gate type (e.g., q_arith, q_elliptic)
 * @return Vector of real variable indices constrained by this gate
 */
template <typename FF, typename CircuitBuilder>
template <typename Block>
std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::extract_gate_variables(
    size_t index, Block& blk, const bb::gate_patterns::GatePattern& pattern, bb::GateKind kind)
{
    using namespace bb::gate_patterns;

    if (read_gate_selector(blk, kind, index).is_zero()) {
        return {};
    }

    // Read selectors and extract wire indices using the pattern
    Selectors selectors = read_selectors(blk, index, kind);
    std::vector<uint32_t> gate_variables = extract_wires(blk, index, pattern, selectors);

    // Convert to real indices and process
    gate_variables = to_real(gate_variables);
    process_gate_variables(gate_variables, index, blk);
    return gate_variables;
}

/**
 * @brief this method gets the ROM table connected component by processing ROM transcript records
 * @tparam FF field type
 * @tparam CircuitBuilder
 * @param rom_array ROM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from ROM table gates
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_rom_table_connected_component(
    const bb::RomTranscript& rom_array)
{
    // Every RomTranscript data structure has 2 main components that are interested for static analyzer:
    // 1) records contains values that were put in the gate, we can use them to create connections between variables
    // 2) states contains values witness indexes that we can find in the ROM record in the RomTrascript, so we can
    // ignore state of the ROM transcript, because we still can connect all variables using variables from records.
    std::vector<uint32_t> rom_table_variables;
    auto& memory_block = circuit_builder.blocks.memory;
    for (const auto& record : rom_array.records) {
        std::vector<uint32_t> gate_variables;
        size_t gate_index = record.gate_index;

        auto q_1 = memory_block.q_1()[gate_index];
        auto q_2 = memory_block.q_2()[gate_index];
        auto q_3 = memory_block.q_3()[gate_index];
        auto q_4 = memory_block.q_4()[gate_index];
        auto q_m = memory_block.q_m()[gate_index];
        auto q_c = memory_block.q_c()[gate_index];

        auto index_witness = record.index_witness;
        auto vc1_witness = record.value_column1_witness; // state[0] from RomTranscript
        auto vc2_witness = record.value_column2_witness; // state[1] from RomTranscript
        auto record_witness = record.record_witness;

        if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() && q_c.is_zero()) {
            // By default ROM read gate uses variables (w_1, w_2, w_3, w_4) = (index_witness, vc1_witness,
            // vc2_witness, record_witness) So we can update all of them
            gate_variables.emplace_back(index_witness);
            if (vc1_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(vc1_witness);
            }
            if (vc2_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(vc2_witness);
            }
            gate_variables.emplace_back(record_witness);
        }
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, gate_index, memory_block);
        // after process_gate_variables function gate_variables constists of real variables indexes, so we can
        // add all this variables in the final vector to connect all of them
        if (!gate_variables.empty()) {
            rom_table_variables.insert(rom_table_variables.end(), gate_variables.begin(), gate_variables.end());
        }
    }
    return rom_table_variables;
}

/**
 * @brief this method gets the RAM table connected component by processing RAM transcript records
 * @tparam FF field type
 * @param CircuitBuilder
 * @param ram_array RAM transcript containing records with witness indices and gate information
 * @return std::vector<uint32_t> vector of connected variables from RAM table gates
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_ram_table_connected_component(
    const bb::RamTranscript& ram_array)
{
    std::vector<uint32_t> ram_table_variables;
    auto& memory_block = circuit_builder.blocks.memory;
    for (const auto& record : ram_array.records) {
        std::vector<uint32_t> gate_variables;
        size_t gate_index = record.gate_index;

        auto q_1 = memory_block.q_1()[gate_index];
        auto q_2 = memory_block.q_2()[gate_index];
        auto q_3 = memory_block.q_3()[gate_index];
        auto q_4 = memory_block.q_4()[gate_index];
        auto q_m = memory_block.q_m()[gate_index];
        auto q_c = memory_block.q_c()[gate_index];

        auto index_witness = record.index_witness;
        auto timestamp_witness = record.timestamp_witness;
        auto value_witness = record.value_witness;
        auto record_witness = record.record_witness;

        if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
            (q_c.is_zero() || q_c == FF::one())) {
            // By default RAM read/write gate uses variables (w_1, w_2, w_3, w_4) = (index_witness,
            // timestamp_witness, value_witness, record_witness) So we can update all of them
            gate_variables.emplace_back(index_witness);
            if (timestamp_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(timestamp_witness);
            }
            if (value_witness != circuit_builder.zero_idx()) {
                gate_variables.emplace_back(value_witness);
            }
            gate_variables.emplace_back(record_witness);
        }
        gate_variables = to_real(gate_variables);
        process_gate_variables(gate_variables, gate_index, memory_block);
        // after process_gate_variables function gate_variables constists of real variables indexes, so we can add
        // all these variables in the final vector to connect all of them
        ram_table_variables.insert(ram_table_variables.end(), gate_variables.begin(), gate_variables.end());
    }
    return ram_table_variables;
}

/**
 * @brief this method creates connected components from elliptic curve operation gates
 * @tparam FF field type
 * @param CircuitBuilder
 * @param index index of the current gate
 * @param blk block containing the gates
 * @return std::vector<uint32_t> vector of connected variables from the gate
 * @details Processes elliptic curve operations by collecting variables from current and next gates,
 *          handling opcodes and coordinate variables for curve operations.
 *          Only processes gates in the ecc_op block - returns empty for other blocks.
 */
template <typename FF, typename CircuitBuilder>
inline std::vector<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_eccop_part_connected_component(size_t index,
                                                                                                     auto& blk)
{
    std::vector<uint32_t> gate_variables;

    // Only process gates in the ecc_op block, otherwise return early
    if constexpr (IsMegaBuilder<CircuitBuilder>) {
        if (&blk != &circuit_builder.blocks.ecc_op) {
            return gate_variables;
        }
    }

    std::vector<uint32_t> first_row_variables;
    std::vector<uint32_t> second_row_variables;
    auto w1 = blk.w_l()[index]; // get opcode of operation, because function get_ecc_op_idx returns type
                                // uint32_t and it adds as w1
    if (w1 != circuit_builder.zero_idx()) {
        // this is opcode and start of the UltraOp element
        first_row_variables.insert(
            first_row_variables.end(),
            { w1, blk.w_r()[index], blk.w_o()[index], blk.w_4()[index] }); // add op, x_lo, x_hi, y_lo
        if (index < blk.size() - 1) {
            second_row_variables.insert(
                second_row_variables.end(),
                { blk.w_r()[index + 1], blk.w_o()[index + 1], blk.w_4()[index + 1] }); // add y_hi, z1, z2
        }
        first_row_variables = to_real(first_row_variables);
        second_row_variables = to_real(second_row_variables);
        process_gate_variables(first_row_variables, index, blk);
        process_gate_variables(second_row_variables, index, blk);
    }
    if (!first_row_variables.empty()) {
        gate_variables.insert(gate_variables.end(), first_row_variables.cbegin(), first_row_variables.cend());
    }
    if (!second_row_variables.empty()) {
        gate_variables.insert(gate_variables.end(), second_row_variables.cbegin(), second_row_variables.cend());
    }
    return gate_variables;
}

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::process_execution_trace()
{
    using namespace bb::gate_patterns;

    for (auto& blk : circuit_builder.blocks.get()) {
        if (blk.size() == 0 || &blk == &circuit_builder.blocks.pub_inputs) {
            continue;
        }

        std::vector<uint32_t> eccop_variables;
        for (size_t gate_idx = 0; gate_idx < blk.size(); gate_idx++) {
            // Try each pattern until one matches (returns non-empty)
            std::vector<uint32_t> cc;
            auto try_pattern = [&](const GatePattern& pattern, GateKind kind) {
                if (cc.empty()) {
                    cc = extract_gate_variables(gate_idx, blk, pattern, kind);
                }
            };

            // Standard gate patterns (mutually exclusive - at most one will match)
            try_pattern(ARITHMETIC, GateKind::Arith);
            try_pattern(ELLIPTIC, GateKind::Elliptic);
            try_pattern(LOOKUP, GateKind::Lookup);
            try_pattern(POSEIDON2_EXTERNAL, GateKind::Poseidon2Ext);
            if constexpr (IsMegaBuilder<CircuitBuilder>) {
                try_pattern(POSEIDON2_QUAD_INTERNAL, GateKind::Poseidon2QuadInt);
                try_pattern(POSEIDON2_QUAD_INTERNAL_TERMINAL, GateKind::Poseidon2QuadIntTerminal);
                try_pattern(POSEIDON2_TRANSITION_ENTRY, GateKind::Poseidon2TransitionEntry);
                try_pattern(POSEIDON2_INITIAL_EXTERNAL, GateKind::Poseidon2ExtInitial);
            } else {
                try_pattern(POSEIDON2_INTERNAL, GateKind::Poseidon2Int);
            }
            try_pattern(NON_NATIVE_FIELD, GateKind::Nnf);
            try_pattern(MEMORY, GateKind::Memory); // consistency gates only; access gates via ROM/RAM transcripts
            try_pattern(DELTA_RANGE, GateKind::DeltaRange);

            if (!cc.empty() && connect_variables) {
                connect_all_variables_in_vector(cc);
            }

            // MegaBuilder-specific patterns
            if constexpr (IsMegaBuilder<CircuitBuilder>) {
                auto databus_cc = extract_gate_variables(gate_idx, blk, DATABUS, GateKind::BusRead);
                if (!databus_cc.empty() && connect_variables) {
                    connect_all_variables_in_vector(databus_cc);
                }

                // Bilinear / batched-eq gate (shares the arithmetic block; q_arith and
                // q_bilinear_batched_eq are mutually exclusive). BILINEAR mode is one equation over the four
                // wires, so they form a single connected group; BATCHED_EQ mode holds two independent
                // equalities, so each half is connected separately.
                auto bilinear_cc = extract_gate_variables(gate_idx, blk, BILINEAR, GateKind::BilinearBatchedEq);
                if (!bilinear_cc.empty() && connect_variables) {
                    connect_all_variables_in_vector(bilinear_cc);
                }
                auto batched_eq_half_1_cc =
                    extract_gate_variables(gate_idx, blk, BATCHED_EQ_HALF_1, GateKind::BilinearBatchedEq);
                if (!batched_eq_half_1_cc.empty() && connect_variables) {
                    connect_all_variables_in_vector(batched_eq_half_1_cc);
                }
                auto batched_eq_half_2_cc =
                    extract_gate_variables(gate_idx, blk, BATCHED_EQ_HALF_2, GateKind::BilinearBatchedEq);
                if (!batched_eq_half_2_cc.empty() && connect_variables) {
                    connect_all_variables_in_vector(batched_eq_half_2_cc);
                }

                auto eccop_cc = get_eccop_part_connected_component(gate_idx, blk);
                if (!eccop_cc.empty() && connect_variables) {
                    eccop_variables.insert(eccop_variables.end(), eccop_cc.begin(), eccop_cc.end());
                    if (eccop_cc[0] == circuit_builder.equality_op_idx) {
                        connect_all_variables_in_vector(eccop_variables);
                        eccop_variables.clear();
                    }
                }
            }
        }
    }

    const auto& rom_arrays = circuit_builder.rom_ram_logic.rom_arrays;
    if (!rom_arrays.empty()) {
        for (const auto& rom_array : rom_arrays) {
            std::vector<uint32_t> variable_indices = get_rom_table_connected_component(rom_array);
            if (connect_variables) {
                connect_all_variables_in_vector(variable_indices);
            }
        }
    }

    const auto& ram_arrays = circuit_builder.rom_ram_logic.ram_arrays;
    if (!ram_arrays.empty()) {
        for (const auto& ram_array : ram_arrays) {
            std::vector<uint32_t> variable_indices = get_ram_table_connected_component(ram_array);
            if (connect_variables) {
                connect_all_variables_in_vector(variable_indices);
            }
        }
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_provenance_duplicate_adjacency() const
{
    // Construction-time provenance overlay: producers (bigfield, MSM, Poseidon2, databus, ecc-op) tag witnesses they
    // deterministically derive with a group key that, by the soundness contract, is shared only when the constraints
    // force the witnesses equal. Connect all real indices sharing a key. See WITNESS_DUPLICATE_DETECTION.md.
    std::unordered_map<DuplicateProvenance, std::vector<uint32_t>, DuplicateProvenanceHasher> variables_by_group;
    for (const auto& [real_index, group_key] : circuit_builder.get_duplicate_provenance()) {
        if (duplicate_provenance_category(group_key) == DuplicateProvenanceCategory::POSEIDON2_CRYPTOGRAPHIC_BINDING) {
            continue;
        }
        variables_by_group[group_key].emplace_back(real_index);
    }
    DuplicateAdjacency duplicate_adjacency;
    for (auto& [_, variables] : variables_by_group) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }
    return duplicate_adjacency;
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_memory_table_duplicate_adjacency() const
{
    // This is a duplicate-search-only overlay. These edges do not belong to the main circuit graph; they only explain
    // repeated witness values that are known to be the same because of a concrete ROM/RAM access relation.
    DuplicateAdjacency duplicate_adjacency;
    auto& memory_block = circuit_builder.blocks.memory;

    auto connect_variables = [&](const std::vector<uint32_t>& variables) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    };

    auto get_memory_sorted_tag = [&](uint32_t record_witness) -> std::optional<uint32_t> {
        // The builder tags each memory record witness, and tau maps that tag to the tag used by the sorted/finalized
        // memory rows. If this link is absent, do not infer duplicate equivalence from the memory block.
        const uint32_t real_record_witness = circuit_builder.real_variable_index[record_witness];
        if (real_record_witness >= circuit_builder.real_variable_tags.size()) {
            return std::nullopt;
        }
        const uint32_t record_tag = circuit_builder.real_variable_tags[real_record_witness];
        if (record_tag == DEFAULT_TAG) {
            return std::nullopt;
        }
        auto tau_it = circuit_builder.tau().find(record_tag);
        if (tau_it == circuit_builder.tau().end() || tau_it->second == DEFAULT_TAG || tau_it->second == record_tag) {
            return std::nullopt;
        }
        return tau_it->second;
    };

    // Finalized ROM/RAM tables are represented by sorted memory rows. Index them once by record tag so every table can
    // recover its own sorted rows without rescanning the whole memory block.
    std::unordered_map<uint32_t, std::vector<size_t>> memory_rows_by_record_tag;
    memory_rows_by_record_tag.reserve(circuit_builder.rom_ram_logic.rom_arrays.size() +
                                      circuit_builder.rom_ram_logic.ram_arrays.size());
    for (size_t row = 0; row < memory_block.size(); row++) {
        const uint32_t real_record_witness = circuit_builder.real_variable_index[memory_block.w_4()[row]];
        if (real_record_witness < circuit_builder.real_variable_tags.size()) {
            const uint32_t record_tag = circuit_builder.real_variable_tags[real_record_witness];
            if (record_tag != DEFAULT_TAG) {
                memory_rows_by_record_tag[record_tag].emplace_back(row);
            }
        }
    }

    const std::vector<size_t> empty_memory_rows;
    auto memory_rows_with_record_tag = [&](uint32_t record_tag) -> const std::vector<size_t>& {
        auto it = memory_rows_by_record_tag.find(record_tag);
        return it == memory_rows_by_record_tag.end() ? empty_memory_rows : it->second;
    };

    auto add_real_witness = [&](std::vector<uint32_t>& variables, uint32_t witness_index) {
        variables.emplace_back(circuit_builder.real_variable_index[witness_index]);
    };

    for (const auto& rom_array : circuit_builder.rom_ram_logic.rom_arrays) {
        // ROM reads are safe duplicates only within one ROM table and one slot. The table state gives the source
        // witness stored at that slot, the transcript records give the unsorted read witnesses, and the sorted rows
        // give the finalized read witnesses for the same table.
        const size_t table_size = rom_array.state.size();
        std::vector<std::vector<uint32_t>> by_position(table_size);
        for (size_t index = 0; index < table_size; index++) {
            if (rom_array.state[index][0] != UNINITIALIZED_MEMORY_RECORD) {
                add_real_witness(by_position[index], rom_array.state[index][0]);
            }
            if (rom_array.state[index][1] != UNINITIALIZED_MEMORY_RECORD &&
                rom_array.state[index][1] != circuit_builder.zero_idx()) {
                add_real_witness(by_position[index], rom_array.state[index][1]);
            }
        }
        for (const auto& record : rom_array.records) {
            if (record.index < table_size) {
                add_real_witness(by_position[record.index], record.value_column1_witness);
                if (record.value_column2_witness != circuit_builder.zero_idx()) {
                    add_real_witness(by_position[record.index], record.value_column2_witness);
                }
            }
        }

        if (!rom_array.records.empty()) {
            auto sorted_tag = get_memory_sorted_tag(rom_array.records[0].record_witness);
            if (sorted_tag.has_value()) {
                for (size_t row : memory_rows_with_record_tag(*sorted_tag)) {
                    const uint32_t index =
                        static_cast<uint32_t>(uint256_t(circuit_builder.get_variable(memory_block.w_l()[row])));
                    if (index < table_size) {
                        add_real_witness(by_position[index], memory_block.w_r()[row]);
                        if (memory_block.w_o()[row] != circuit_builder.zero_idx()) {
                            add_real_witness(by_position[index], memory_block.w_o()[row]);
                        }
                    }
                }
            }
        }

        for (auto& vars_at_pos : by_position) {
            connect_variables(vars_at_pos);
        }
    }

    struct RamAccessDuplicateVariables {
        uint32_t index = 0;
        bool is_read = false;
        std::vector<uint32_t> variables;
    };

    for (const auto& ram_array : circuit_builder.rom_ram_logic.ram_arrays) {
        // RAM duplicates are more restrictive than ROM: a read may reuse the value from the immediately previous access
        // to the same table/index, but repeated writes are still meaningful positives and must not be collapsed.
        const size_t table_size = ram_array.state.size();
        std::vector<RamAccessDuplicateVariables> accesses;
        accesses.reserve(ram_array.records.size());

        for (const auto& record : ram_array.records) {
            RamAccessDuplicateVariables access{
                .index = record.index,
                .is_read = record.access_type == bb::RamRecord::AccessType::READ,
            };
            add_real_witness(access.variables, record.value_witness);
            accesses.emplace_back(access);
        }

        if (!ram_array.records.empty()) {
            auto sorted_tag = get_memory_sorted_tag(ram_array.records[0].record_witness);
            if (sorted_tag.has_value()) {
                const auto& sorted_rows = memory_rows_with_record_tag(*sorted_tag);
                // If the counts differ, we cannot reliably pair transcript accesses with sorted rows for this RAM
                // table, so leave those duplicate values visible rather than guessing.
                if (sorted_rows.size() == accesses.size()) {
                    // Pair each transcript access with its sorted-memory row. The sorted row output is the same access,
                    // so it can be collapsed with the transcript value before we reason about read-after-access chains.
                    for (size_t i = 0; i < sorted_rows.size(); i++) {
                        std::vector<uint32_t> same_access_variables = accesses[i].variables;
                        add_real_witness(same_access_variables, memory_block.w_o()[sorted_rows[i]]);
                        connect_variables(same_access_variables);
                        accesses[i].variables = std::move(same_access_variables);
                    }
                }
            }
        }

        std::vector<std::optional<size_t>> previous_access_by_position(table_size);
        for (size_t i = 0; i < accesses.size(); i++) {
            if (accesses[i].index >= table_size) {
                continue;
            }
            auto& previous_access = previous_access_by_position[accesses[i].index];
            if (accesses[i].is_read && previous_access.has_value()) {
                // A RAM read is allowed to repeat exactly the value established by the previous access to this slot.
                // Writes do not get this treatment: two writes of the same value are still independent witnesses.
                std::vector<uint32_t> connected_read_variables = accesses[*previous_access].variables;
                connected_read_variables.insert(
                    connected_read_variables.end(), accesses[i].variables.begin(), accesses[i].variables.end());
                connect_variables(connected_read_variables);
            }
            previous_access = i;
        }
    }

    return duplicate_adjacency;
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_lookup_table_duplicate_adjacency() const
{
    // STRAUS_EC_POINT lookup tables are deterministic fixed-base MSM tables. Re-reading the same table/key pair
    // produces the same point coordinates, but the lookup outputs are fresh witnesses and otherwise look duplicated.
    DuplicateAdjacency duplicate_adjacency;
    const auto& lookup_tables = circuit_builder.get_lookup_tables();
    if (lookup_tables.empty()) {
        return duplicate_adjacency;
    }

    std::unordered_map<size_t, BasicTableId> table_id_by_index;
    table_id_by_index.reserve(lookup_tables.size());
    for (const auto& table : lookup_tables) {
        table_id_by_index.emplace(table.table_index, table.id);
    }

    auto real_index = [&](uint32_t witness_index) { return circuit_builder.real_variable_index[witness_index]; };
    auto key_identity = [&](uint32_t witness_index) {
        const uint32_t real_key_index = real_index(witness_index);
        const auto& provenance = circuit_builder.get_duplicate_provenance();
        auto provenance_it = provenance.find(real_key_index);
        if (provenance_it != provenance.end()) {
            return duplicate_provenance_nested_identity(provenance_it->second);
        }
        return duplicate_identity_key({ DUPLICATE_PROVENANCE_RAW_IDENTITY_TAG, static_cast<uint64_t>(real_key_index) });
    };

    std::unordered_map<LookupAccessSignature, std::vector<uint32_t>, LookupAccessSignatureHasher> x_outputs_by_lookup;
    std::unordered_map<LookupAccessSignature, std::vector<uint32_t>, LookupAccessSignatureHasher> y_outputs_by_lookup;

    auto& lookup_block = circuit_builder.blocks.lookup;
    for (size_t row = 0; row < lookup_block.size(); row++) {
        if (read_gate_selector(lookup_block, GateKind::Lookup, row) != FF::one()) {
            continue;
        }
        const size_t table_index = static_cast<size_t>(uint256_t(lookup_block.q_3()[row]));
        auto table_id_it = table_id_by_index.find(table_index);
        if (table_id_it == table_id_by_index.end() || table_id_it->second != BasicTableId::STRAUS_EC_POINT) {
            continue;
        }

        LookupAccessSignature signature{ .table_index = table_index,
                                         .key_identity = key_identity(lookup_block.w_l()[row]) };
        x_outputs_by_lookup[signature].emplace_back(real_index(lookup_block.w_r()[row]));
        y_outputs_by_lookup[signature].emplace_back(real_index(lookup_block.w_o()[row]));
    }

    for (auto& [_, variables] : x_outputs_by_lookup) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }
    for (auto& [_, variables] : y_outputs_by_lookup) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }

    return duplicate_adjacency;
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_straus_table_duplicate_adjacency() const
{
    // Straus MSM helpers repeat fixed-base lookup outputs and variable-base addends through ROM/memory rows while
    // deriving table entries. Those fresh witnesses carry the same point coordinates and are connected by the table
    // construction rather than being independent duplicate values.
    DuplicateAdjacency duplicate_adjacency;
    auto real_index = [&](uint32_t witness_index) { return circuit_builder.real_variable_index[witness_index]; };
    std::unordered_map<FF, std::vector<uint32_t>> straus_variables_by_value;
    auto add_straus_variable = [&](uint32_t real_variable_index) {
        if (real_variable_index != circuit_builder.zero_idx()) {
            straus_variables_by_value[circuit_builder.get_variable(real_variable_index)].emplace_back(
                real_variable_index);
        }
    };
    auto is_real_witness = [&](uint32_t witness_index) {
        return witness_index != UNINITIALIZED_MEMORY_RECORD && witness_index != circuit_builder.zero_idx();
    };

    struct PointWitnesses {
        uint32_t x = 0;
        uint32_t y = 0;

        bool operator==(const PointWitnesses& other) const = default;
    };

    struct PointWitnessesHasher {
        size_t operator()(const PointWitnesses& point) const
        {
            size_t seed = 0;
            hash_combine(seed, point.x);
            hash_combine(seed, point.y);
            return seed;
        }
    };

    struct PointValue {
        FF x;
        FF y;

        bool operator==(const PointValue& other) const = default;
    };

    struct PointValueHasher {
        size_t operator()(const PointValue& point) const
        {
            size_t seed = 0;
            hash_combine(seed, point.x);
            hash_combine(seed, point.y);
            return seed;
        }
    };

    auto same_point = [](const PointWitnesses& lhs, const PointWitnesses& rhs) {
        return lhs.x == rhs.x && lhs.y == rhs.y;
    };
    auto point_values = [&](const PointWitnesses& point) {
        return std::array<FF, 2>{ circuit_builder.get_variable(point.x), circuit_builder.get_variable(point.y) };
    };
    auto point_value_signature = [&](const PointWitnesses& point) {
        const auto values = point_values(point);
        return PointValue{ .x = values[0], .y = values[1] };
    };
    auto same_point_value = [&](const PointWitnesses& lhs, const PointWitnesses& rhs) {
        return point_values(lhs) == point_values(rhs);
    };

    std::unordered_map<PointWitnesses, std::vector<std::pair<PointWitnesses, PointWitnesses>>, PointWitnessesHasher>
        elliptic_inputs_by_output;
    std::unordered_map<PointValue, std::vector<PointWitnesses>, PointValueHasher> elliptic_addends_by_value;
    for (auto& block : circuit_builder.blocks.get()) {
        for (size_t row = 0; row + 1 < block.size(); row++) {
            if (read_gate_selector(block, GateKind::Elliptic, row) != FF::one() || !block.q_m()[row].is_zero()) {
                continue;
            }
            PointWitnesses first_input{ .x = real_index(block.w_r()[row]), .y = real_index(block.w_o()[row]) };
            PointWitnesses second_input{ .x = real_index(block.w_l()[row + 1]), .y = real_index(block.w_4()[row + 1]) };
            PointWitnesses gate_output{ .x = real_index(block.w_r()[row + 1]), .y = real_index(block.w_o()[row + 1]) };
            elliptic_inputs_by_output[gate_output].emplace_back(first_input, second_input);
            elliptic_addends_by_value[point_value_signature(second_input)].emplace_back(second_input);
        }
    }

    std::unordered_set<PointValue, PointValueHasher> repeated_elliptic_addend_values;
    for (const auto& [point_value, addends] : elliptic_addends_by_value) {
        if (addends.size() < 2) {
            continue;
        }
        repeated_elliptic_addend_values.insert(point_value);
        for (const auto& addend : addends) {
            add_straus_variable(addend.x);
            add_straus_variable(addend.y);
        }
    }

    std::unordered_map<size_t, BasicTableId> table_id_by_index;
    for (const auto& table : circuit_builder.get_lookup_tables()) {
        table_id_by_index.emplace(table.table_index, table.id);
    }

    // A STRAUS lookup output names a deterministic fixed-base table point. The same point can be materialized through
    // memory rows and then consumed as an elliptic-add input, so connect those coordinate witnesses by point value.
    std::unordered_set<PointValue, PointValueHasher> straus_lookup_point_values;
    auto& lookup_block = circuit_builder.blocks.lookup;
    for (size_t row = 0; row < lookup_block.size(); row++) {
        if (read_gate_selector(lookup_block, GateKind::Lookup, row) != FF::one()) {
            continue;
        }
        const size_t table_index = static_cast<size_t>(uint256_t(lookup_block.q_3()[row]));
        auto table_id_it = table_id_by_index.find(table_index);
        if (table_id_it == table_id_by_index.end() || table_id_it->second != BasicTableId::STRAUS_EC_POINT) {
            continue;
        }

        PointWitnesses lookup_point{ .x = real_index(lookup_block.w_r()[row]),
                                     .y = real_index(lookup_block.w_o()[row]) };
        straus_lookup_point_values.insert(point_value_signature(lookup_point));
        add_straus_variable(lookup_point.x);
        add_straus_variable(lookup_point.y);
    }

    for (const auto& [point_value, addends] : elliptic_addends_by_value) {
        if (!straus_lookup_point_values.contains(point_value)) {
            continue;
        }
        for (const auto& addend : addends) {
            add_straus_variable(addend.x);
            add_straus_variable(addend.y);
        }
    }

    auto& memory_block = circuit_builder.blocks.memory;
    for (size_t row = 0; row < memory_block.size(); row++) {
        if (read_gate_selector(memory_block, GateKind::Memory, row) != FF::one()) {
            continue;
        }
        PointWitnesses memory_point{ .x = real_index(memory_block.w_r()[row]),
                                     .y = real_index(memory_block.w_o()[row]) };
        const auto memory_point_value = point_value_signature(memory_point);
        if (!repeated_elliptic_addend_values.contains(memory_point_value) &&
            !straus_lookup_point_values.contains(memory_point_value)) {
            continue;
        }
        add_straus_variable(memory_point.x);
        add_straus_variable(memory_point.y);
    }

    auto find_base_for_step = [&](const PointWitnesses& previous,
                                  const PointWitnesses& output) -> std::optional<PointWitnesses> {
        auto it = elliptic_inputs_by_output.find(output);
        if (it == elliptic_inputs_by_output.end()) {
            return std::nullopt;
        }
        for (const auto& [first_input, second_input] : it->second) {
            if (same_point(first_input, previous)) {
                return second_input;
            }
            if (same_point(second_input, previous)) {
                return first_input;
            }
        }
        return std::nullopt;
    };

    for (const auto& rom_array : circuit_builder.rom_ram_logic.rom_arrays) {
        const size_t table_size = rom_array.state.size();
        if (table_size < 2) {
            continue;
        }

        std::vector<PointWitnesses> slots;
        slots.reserve(table_size);
        bool complete_point_table = true;
        for (size_t index = 0; index < table_size; index++) {
            if (!is_real_witness(rom_array.state[index][0]) || !is_real_witness(rom_array.state[index][1])) {
                complete_point_table = false;
                break;
            }
            slots.push_back({ .x = real_index(rom_array.state[index][0]), .y = real_index(rom_array.state[index][1]) });
        }
        if (!complete_point_table) {
            continue;
        }

        std::unordered_map<PointValue, std::vector<PointWitnesses>, PointValueHasher> rom_slots_by_point_value;
        for (const auto& slot : slots) {
            rom_slots_by_point_value[point_value_signature(slot)].emplace_back(slot);
        }
        for (const auto& [point_value, repeated_slots] : rom_slots_by_point_value) {
            auto addend_it = elliptic_addends_by_value.find(point_value);
            if (repeated_slots.size() < 2 || addend_it == elliptic_addends_by_value.end()) {
                continue;
            }
            for (const auto& slot : repeated_slots) {
                add_straus_variable(slot.x);
                add_straus_variable(slot.y);
            }
            for (const auto& addend : addend_it->second) {
                add_straus_variable(addend.x);
                add_straus_variable(addend.y);
            }
        }

        std::optional<PointWitnesses> table_base;
        std::vector<PointWitnesses> step_bases;
        step_bases.reserve(table_size - 1);
        bool is_straus_table = true;
        for (size_t index = 1; index < table_size; index++) {
            auto base = find_base_for_step(slots[index - 1], slots[index]);
            if (!base.has_value()) {
                is_straus_table = false;
                break;
            }
            if (!table_base.has_value()) {
                table_base = base;
            } else if (!same_point_value(*table_base, *base)) {
                is_straus_table = false;
                break;
            }
            step_bases.emplace_back(*base);
        }
        if (!is_straus_table || !table_base.has_value()) {
            continue;
        }

        std::vector<uint32_t> x_variables;
        std::vector<uint32_t> y_variables;
        x_variables.reserve(table_size + step_bases.size());
        y_variables.reserve(table_size + step_bases.size());
        for (const auto& base : step_bases) {
            x_variables.emplace_back(base.x);
            y_variables.emplace_back(base.y);
            add_straus_variable(base.x);
            add_straus_variable(base.y);
        }
        for (const auto& slot : slots) {
            x_variables.emplace_back(slot.x);
            y_variables.emplace_back(slot.y);
            add_straus_variable(slot.x);
            add_straus_variable(slot.y);
        }
        connect_duplicate_variables(duplicate_adjacency, x_variables, circuit_builder.zero_idx());
        connect_duplicate_variables(duplicate_adjacency, y_variables, circuit_builder.zero_idx());
    }

    for (auto& [_, variables] : straus_variables_by_value) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }

    return duplicate_adjacency;
}

template <typename FF, typename CircuitBuilder>
std::unordered_set<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_databus_read_value_variables() const
{
    std::unordered_set<uint32_t> databus_read_value_variables;
    if constexpr (!IsMegaBuilder<CircuitBuilder>) {
        return databus_read_value_variables;
    } else {
        auto& busread_block = circuit_builder.blocks.busread;
        for (size_t row = 0; row < busread_block.size(); row++) {
            if (read_gate_selector(busread_block, GateKind::BusRead, row) == FF::one()) {
                databus_read_value_variables.insert(circuit_builder.real_variable_index[busread_block.w_l()[row]]);
            }
        }
        return databus_read_value_variables;
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_databus_read_duplicate_adjacency() const
{
    DuplicateAdjacency duplicate_adjacency;
    if constexpr (!IsMegaBuilder<CircuitBuilder>) {
        return duplicate_adjacency;
    } else {
        auto connect_variables = [&](const std::vector<uint32_t>& variables) {
            connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
        };

        auto selected_bus_index = [&](size_t row) -> std::optional<size_t> {
            auto& busread_block = circuit_builder.blocks.busread;
            const std::array<FF, 5> selectors = { busread_block.q_1()[row],
                                                  busread_block.q_2()[row],
                                                  busread_block.q_3()[row],
                                                  busread_block.q_4()[row],
                                                  busread_block.q_m()[row] };
            std::optional<size_t> result;
            for (size_t idx = 0; idx < selectors.size(); idx++) {
                if (selectors[idx] == FF::one()) {
                    if (result.has_value()) {
                        return std::nullopt;
                    }
                    result = idx;
                } else if (!selectors[idx].is_zero()) {
                    return std::nullopt;
                }
            }
            return result;
        };

        auto index_identity = [&](uint32_t witness_index) {
            const uint32_t real_index = circuit_builder.real_variable_index[witness_index];
            const auto& provenance = circuit_builder.get_duplicate_provenance();
            auto provenance_it = provenance.find(real_index);
            if (provenance_it != provenance.end()) {
                return duplicate_provenance_nested_identity(provenance_it->second);
            }
            return duplicate_identity_key({ DUPLICATE_PROVENANCE_RAW_IDENTITY_TAG, static_cast<uint64_t>(real_index) });
        };

        std::unordered_map<DuplicateIdentityKey, std::vector<uint32_t>, DuplicateIdentityKeyHasher>
            access_variables_by_bus_and_index;
        auto& busread_block = circuit_builder.blocks.busread;
        for (size_t row = 0; row < busread_block.size(); row++) {
            if (read_gate_selector(busread_block, GateKind::BusRead, row) != FF::one()) {
                continue;
            }
            auto bus_idx = selected_bus_index(row);
            if (!bus_idx.has_value()) {
                continue;
            }
            const uint32_t index_witness = busread_block.w_r()[row];
            const uint32_t real_index_witness = circuit_builder.real_variable_index[index_witness];
            const uint32_t read_index = static_cast<uint32_t>(uint256_t(circuit_builder.get_variable(index_witness)));
            const auto& bus_vector = circuit_builder.get_bus_vector(*bus_idx);
            if (read_index >= bus_vector.size()) {
                continue;
            }

            const uint32_t output = circuit_builder.real_variable_index[busread_block.w_l()[row]];
            if (real_index_witness == circuit_builder.zero_idx() ||
                constant_variable_indices_set.contains(real_index_witness)) {
                // A fixed index selects one concrete bus slot, so the appended bus entry and every read output for that
                // slot are forced equal by the databus relation.
                auto& access_variables = access_variables_by_bus_and_index[databus_read_key(*bus_idx, read_index)];
                access_variables.emplace_back(circuit_builder.real_variable_index[bus_vector[read_index]]);
                access_variables.emplace_back(output);
            } else {
                // A variable index must not be collapsed by its current value. Reads of the same bus through the same
                // index witness are deterministic, but distinct same-valued index witnesses remain visible.
                auto& access_variables = access_variables_by_bus_and_index[duplicate_identity_key(
                    { DATABUS_VARIABLE_INDEX_READ_OVERLAY_TAG, static_cast<uint64_t>(*bus_idx) },
                    index_identity(index_witness))];
                access_variables.emplace_back(output);
            }
        }

        for (auto& [_, variables] : access_variables_by_bus_and_index) {
            connect_variables(variables);
        }
        return duplicate_adjacency;
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_non_native_field_duplicate_adjacency() const
{
    DuplicateAdjacency duplicate_adjacency;

    auto connect_variables = [&](const std::vector<uint32_t>& variables) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    };

    auto add_real_wire = [&](std::vector<uint32_t>& variables, uint32_t witness_index) {
        variables.emplace_back(circuit_builder.real_variable_index[witness_index]);
    };

    for (auto& block : circuit_builder.blocks.get()) {
        for (size_t row = 0; row < block.size(); row++) {
            if (is_non_native_field_prime_limb_gate(block, row)) {
                auto selectors = bb::gate_patterns::read_selectors(block, row, GateKind::Arith);
                auto wires = bb::gate_patterns::extract_wires(block, row, bb::gate_patterns::ARITHMETIC, selectors);
                std::vector<uint32_t> variables;
                variables.reserve(wires.size());
                for (auto wire : wires) {
                    add_real_wire(variables, wire);
                }
                connect_variables(variables);
            }
            if (is_non_native_field_custom_gate(block, row)) {
                auto selectors = bb::gate_patterns::read_selectors(block, row, GateKind::Nnf);
                auto wires =
                    bb::gate_patterns::extract_wires(block, row, bb::gate_patterns::NON_NATIVE_FIELD, selectors);
                std::vector<uint32_t> variables;
                variables.reserve(wires.size());
                for (auto wire : wires) {
                    add_real_wire(variables, wire);
                }
                connect_variables(variables);
            }
        }
    }

    return duplicate_adjacency;
}

/**
 * @brief Construct a new StaticAnalyzer for Ultra Circuit Builder or Mega Circuit Builder
 * @tparam FF field type used in the circuit
 * @tparam CircuitBuilder
 * @param CircuitBuilder
 * @param connect_variables
 * @details This constructor initializes the graph structure by:
 *          1) Creating data structures for tracking:
 *             - Number of gates each variable appears in (variables_gate_counts)
 *             - Adjacency lists for each variable (variable_adjacency_lists)
 *             - Degree of each variable (variables_degree)
 *          2) Processing different types of gates:
 *             - Arithmetic gates
 *             - Elliptic curve gates
 *             - Plookup gates
 *             - Poseidon2 gates
 *             - Memory gates
 *             - Non-native field gates
 *             - Delta range gates
 *          3) Creating connections between variables that appear in the same gate
 *          4) Special handling for sorted constraints in delta range blocks
 */
template <typename FF, typename CircuitBuilder>
StaticAnalyzer_<FF, CircuitBuilder>::StaticAnalyzer_(CircuitBuilder& circuit_builder, bool connect_variables)
    : circuit_builder(circuit_builder)
    , connect_variables(connect_variables)
{
    variables_gate_counts = std::unordered_map<uint32_t, size_t>(circuit_builder.real_variable_index.size());
    variable_adjacency_lists =
        std::unordered_map<uint32_t, std::vector<uint32_t>>(circuit_builder.real_variable_index.size());
    variables_degree = std::unordered_map<uint32_t, size_t>(circuit_builder.real_variable_index.size());
    for (const auto& variable_index : circuit_builder.real_variable_index) {
        variables_gate_counts[variable_index] = 0;
        variables_degree[variable_index] = 0;
        variable_adjacency_lists[variable_index] = {};
    }
    save_constant_variable_indices();
    process_execution_trace();
}

/**
 * @brief this method needs to save all constant variables indices in one data structure
 * in order to not go through whole map constant variable indices every time when tool checks
 * that variable isn't constant
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::save_constant_variable_indices()
{
    constant_variable_indices_set.clear();
    const auto& constant_variable_indices = circuit_builder.constant_variable_indices;
    for (const auto& pair : constant_variable_indices) {
        constant_variable_indices_set.insert(pair.second);
    }
}

/**
 * @brief this method checks whether the variable with given index is not constant
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variable_index
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::check_is_not_constant_variable(const uint32_t& variable_index)
{
    uint32_t real_variable_index = circuit_builder.real_variable_index[variable_index];
    return constant_variable_indices_set.find(real_variable_index) == constant_variable_indices_set.end();
}

/**
 * @brief this method connects 2 variables if they are in one gate and
 * 1) have different indices,
 * 2) not constant variables,
 * 3) their indices != 0
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variables_vector
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::connect_all_variables_in_vector(const std::vector<uint32_t>& variables_vector)
{
    if (variables_vector.empty()) {
        return;
    }
    std::vector<uint32_t> filtered_variables_vector;
    filtered_variables_vector.reserve(variables_vector.size());
    // Only copy non-zero and non-constant variables
    std::copy_if(variables_vector.begin(),
                 variables_vector.end(),
                 std::back_inserter(filtered_variables_vector),
                 [&](uint32_t variable_index) {
                     return variable_index != circuit_builder.zero_idx() &&
                            this->check_is_not_constant_variable(variable_index);
                 });
    // Remove duplicates
    auto unique_pointer = std::unique(filtered_variables_vector.begin(), filtered_variables_vector.end());
    filtered_variables_vector.erase(unique_pointer, filtered_variables_vector.end());
    if (filtered_variables_vector.size() < 2) {
        return;
    }
    for (size_t i = 0; i < filtered_variables_vector.size() - 1; i++) {
        add_new_edge(filtered_variables_vector[i], filtered_variables_vector[i + 1]);
    }
}

/**
 * @brief this method creates an edge between two variables in graph. All needed checks in a function above
 * @tparam FF
 * @tparam CircuitBuilder
 * @param first_variable_index
 * @param second_variable_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::add_new_edge(const uint32_t& first_variable_index,
                                                       const uint32_t& second_variable_index)
{
    variable_adjacency_lists[first_variable_index].emplace_back(second_variable_index);
    variable_adjacency_lists[second_variable_index].emplace_back(first_variable_index);
    variables_degree[first_variable_index] += 1;
    variables_degree[second_variable_index] += 1;
}

/**
 * @brief this method implements depth-first search algorithm for undirected graphs
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variable_index
 * @param is_used
 * @param connected_component
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::depth_first_search(const uint32_t& variable_index,
                                                             std::unordered_set<uint32_t>& is_used,
                                                             std::vector<uint32_t>& connected_component)
{
    std::stack<uint32_t> variable_stack;
    variable_stack.push(variable_index);
    while (!variable_stack.empty()) {
        uint32_t current_index = variable_stack.top();
        variable_stack.pop();
        if (!is_used.contains(current_index)) {
            is_used.insert(current_index);
            connected_component.emplace_back(current_index);
            for (const auto& it : variable_adjacency_lists[current_index]) {
                variable_stack.push(it);
            }
        }
    }
}

/**
 * @brief this methond finds all connected components in the graph described by adjacency lists and
 * marks some of them as connected components that were created with functions in method finalize_circuit
 * @tparam FF
 * @tparam CircuitBuilder
 * @return std::vector<std::vector<uint32_t>> list of connected components where each component is a vector of
 * variable indices
 */

template <typename FF, typename CircuitBuilder>
std::vector<ConnectedComponent> StaticAnalyzer_<FF, CircuitBuilder>::find_connected_components()
{
    if (!connect_variables) {
        throw_or_abort("find_connected_components() can only be called when connect_variables is true");
    }
    connected_components.clear();
    std::unordered_set<uint32_t> visited;
    for (const auto& pair : variable_adjacency_lists) {
        if (pair.first != 0 && variables_degree[pair.first] > 0) {
            if (!visited.contains(pair.first)) {
                std::vector<uint32_t> variable_indices;
                depth_first_search(pair.first, visited, variable_indices);
                std::sort(variable_indices.begin(), variable_indices.end());
                connected_components.emplace_back(ConnectedComponent(variable_indices));
            }
        }
    }
    mark_range_list_connected_components();
    mark_finalize_connected_components();
    mark_process_rom_connected_component();
    return connected_components;
}
static inline bool is_bn254_fq_modulus_derived_value(const bb::fr& value)
{
    uint256_t val_uint = value;
    static constexpr uint256_t fq_mod_top = uint256_t(0x30644e72e131a029ULL) << 192 | uint256_t(0xb85045b6ULL) << 160;
    static constexpr uint256_t top_mask = (uint256_t(1) << 256) - (uint256_t(1) << 160);
    return (val_uint & top_mask) == fq_mod_top;
}

static inline bool is_triage_noise_witness_value(const bb::fr& value)
{
    static std::unordered_set<bb::fr> common_values;
    static bool common_table_values_initialized = false;
    if (!common_table_values_initialized) {
        auto aes_sbox_table = bb::plookup::aes128_tables::generate_aes_sbox_table(BasicTableId::AES_SBOX_MAP, 0);
        for (auto& table_value : aes_sbox_table.column_1) {
            common_values.insert(table_value);
        }
        for (auto& table_value : aes_sbox_table.column_2) {
            common_values.insert(table_value);
        }
        for (auto& table_value : aes_sbox_table.column_3) {
            common_values.insert(table_value);
        }
        common_table_values_initialized = true;
        for (size_t i = 0; i < 252; i++) {
            common_values.insert(uint256_t(1) << i);
        }
        static constexpr uint256_t fq_modulus =
            uint256_t(0x3C208C16D87CFD47ULL, 0x97816a916871ca8dULL, 0xb85045b68181585dULL, 0x30644e72e131a029ULL);
        common_values.insert(bb::fr(fq_modulus));
        common_values.insert(bb::fr(fq_modulus - 1));
        common_values.insert(bb::fr(fq_modulus - 2));
        common_values.insert(bb::fr(fq_modulus + 1));
        common_values.insert(bb::fr(fq_modulus >> 1));
        common_values.insert(bb::fr((fq_modulus + 1) >> 1));
        static constexpr uint256_t two_to_136 = uint256_t(1) << 136;
        static constexpr uint256_t neg_modulus = bb::fr::modulus - fq_modulus;
        common_values.insert(bb::fr(neg_modulus));
        common_values.insert(bb::fr(neg_modulus & (two_to_136 - 1)));
        common_values.insert(bb::fr(neg_modulus >> 136));
    }
    if (value.is_zero() || value == bb::fr::one() || value == -bb::fr::one()) {
        return true;
    }
    if (common_values.contains(value)) {
        return true;
    }
    if (is_bn254_fq_modulus_derived_value(value)) {
        return true;
    }
    uint256_t converted = value;
    static constexpr auto positive_ceiling = uint256_t(1) << 32;
    static constexpr auto negative_ceiling = bb::fr::modulus;
    static constexpr auto negative_floor = negative_ceiling - positive_ceiling;
    for (size_t shift = 0; shift < 256; shift += 32) {
        const auto shifted_small_value_mask = (positive_ceiling - 1) << shift;
        if (converted != 0 && (converted & shifted_small_value_mask) == converted) {
            return true;
        }
    }
    return converted < positive_ceiling || (converted > negative_floor && converted < negative_ceiling);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::is_non_native_field_custom_gate(auto& block, size_t gate_idx) const
{
    if (read_gate_selector(block, GateKind::Nnf, gate_idx).is_zero()) {
        return false;
    }

    const auto& q_1 = block.q_1()[gate_idx];
    const auto& q_2 = block.q_2()[gate_idx];
    const auto& q_3 = block.q_3()[gate_idx];
    const auto& q_4 = block.q_4()[gate_idx];
    const auto& q_m = block.q_m()[gate_idx];
    const auto& q_c = block.q_c()[gate_idx];

    if (!q_1.is_zero() || !q_c.is_zero()) {
        return false;
    }
    // Recognize the exact selector modes emitted by range_constrain_two_limbs() and non-native multiplication:
    // limb accumulation 1/2 and product 1/2/3.
    return (q_2.is_zero() && q_3 == FF::one() && q_4 == FF::one() && q_m.is_zero()) ||
           (q_2.is_zero() && q_3 == FF::one() && q_4.is_zero() && q_m == FF::one()) ||
           (q_2 == FF::one() && q_3 == FF::one() && q_4.is_zero() && q_m.is_zero()) ||
           (q_2 == FF::one() && q_3.is_zero() && q_4 == FF::one() && q_m.is_zero()) ||
           (q_2 == FF::one() && q_3.is_zero() && q_4.is_zero() && q_m == FF::one());
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::is_non_native_field_prime_limb_gate(auto& block, size_t gate_idx) const
{
    const auto q_arith = read_gate_selector(block, GateKind::Arith, gate_idx);
    if (q_arith != FF::one() && q_arith != FF(2) && q_arith != FF(3)) {
        return false;
    }

    const auto& q_m = block.q_m()[gate_idx];
    const auto& q_1 = block.q_1()[gate_idx];
    const auto& q_2 = block.q_2()[gate_idx];
    const auto& q_3 = block.q_3()[gate_idx];
    const auto& q_4 = block.q_4()[gate_idx];
    const auto& q_c = block.q_c()[gate_idx];

    auto is_native_field_modulus_limb_selector = [](const FF& selector) {
        uint256_t selector_uint = selector;
        static constexpr uint256_t native_modulus_minus_one = bb::fr::modulus - 1;
        static constexpr uint256_t lower_127_mask = (uint256_t(1) << 127) - 1;
        return selector_uint == (native_modulus_minus_one & lower_127_mask) ||
               selector_uint == (native_modulus_minus_one >> 127);
    };
    auto is_modulus_selector = [&](const FF& selector) {
        return is_bn254_fq_modulus_derived_value(selector) || is_native_field_modulus_limb_selector(selector);
    };
    auto is_power_of_two_selector = [](const FF& selector) {
        uint256_t selector_uint = selector;
        return selector_uint > 0 && (selector_uint & (selector_uint - 1)) == 0;
    };
    auto is_zero_or_power_of_two_selector = [&](const FF& selector) {
        return selector.is_zero() || is_power_of_two_selector(selector);
    };
    auto is_zero_power_two_or_modulus_selector = [&](const FF& selector) {
        return is_zero_or_power_of_two_selector(selector) || is_modulus_selector(selector);
    };
    const bool has_modulus_selector = is_modulus_selector(q_m) || is_modulus_selector(q_1) ||
                                      is_modulus_selector(q_2) || is_modulus_selector(q_3) ||
                                      is_modulus_selector(q_4) || is_modulus_selector(q_c);
    const bool has_limb_modulus_selector =
        is_modulus_selector(q_1) || is_modulus_selector(q_2) || is_modulus_selector(q_3) || is_modulus_selector(q_c);

    auto is_zero_or_one_selector = [](const FF& selector) { return selector.is_zero() || selector == FF::one(); };
    if (q_arith == FF::one() && q_m.is_zero() && q_4 == -FF::one() && q_c.is_zero() && is_zero_or_one_selector(q_1) &&
        is_zero_or_one_selector(q_2) && is_zero_or_one_selector(q_3)) {
        return false;
    }

    // q_arith == 3 is a special mini-add mode used by non-native field addition/subtraction. It can carry arbitrary
    // limb scaling constants, so require a modulus-derived selector to avoid treating ordinary hand-written q=3
    // arithmetic rows as structural non-native rows.
    if (q_arith == FF(3)) {
        return q_1.is_zero() && q_4.is_zero() && has_modulus_selector;
    }

    // Shifted limb accumulation gates emitted by bigfield reductions:
    //   k1 * a + k2 * b + k3 * c + p' * d + d_shift = 0
    if (q_arith == FF(2)) {
        return q_m.is_zero() && has_modulus_selector;
    }

    // Linear limb/recomposition gates around bigfield reductions:
    //   k1 * a + k2 * b + p' * c + d = 0
    //   p' * a + k * b + p' * c + p'' = 0
    // These are paired with the q_arith == 2 shifted accumulators above. They contain one or more modulus-derived
    // selectors plus powers of two used for limb shifts.
    if (q_m.is_zero() && (q_4.is_zero() || q_4 == FF::one()) && is_zero_power_two_or_modulus_selector(q_1) &&
        is_zero_power_two_or_modulus_selector(q_2) && is_zero_power_two_or_modulus_selector(q_3)) {
        return is_modulus_selector(q_1) || is_modulus_selector(q_2) || is_modulus_selector(q_3) ||
               is_modulus_selector(q_c);
    }

    // Non-native product/reduction rows can place modulus-derived coefficients in both q_m and q_4 while keeping the
    // other limb terms linear. The q_2 coefficient is operation-dependent and may be an arbitrary challenge-derived
    // scaling in cycle-group table construction.
    if (is_modulus_selector(q_m) && is_modulus_selector(q_4) && q_3 == FF::one()) {
        return true;
    }
    if (is_modulus_selector(q_m) && q_4.is_zero() && is_modulus_selector(q_3) &&
        is_zero_or_power_of_two_selector(q_1) && is_zero_or_power_of_two_selector(q_2)) {
        return true;
    }
    if (q_m.is_zero() && is_modulus_selector(q_4) && is_zero_power_two_or_modulus_selector(q_1) &&
        is_zero_power_two_or_modulus_selector(q_2) && is_zero_power_two_or_modulus_selector(q_3)) {
        return true;
    }
    if (q_m == FF::one() && is_modulus_selector(q_4) && (q_3 == FF::one() || is_modulus_selector(q_3)) &&
        is_zero_power_two_or_modulus_selector(q_1) && is_zero_power_two_or_modulus_selector(q_2)) {
        return true;
    }
    if (!q_m.is_zero() && is_modulus_selector(q_4) && (q_3 == FF::one() || is_modulus_selector(q_3)) && q_1.is_zero() &&
        q_2.is_zero()) {
        return true;
    }

    // These are the arithmetic identities emitted by bigfield prime-limb checks:
    //   a * b + p' * c = 0
    //   a * b + p' = 0
    //   a * b + k1 * a + k2 * b + p' * c = 0
    //   k1 * a + k2 * b + p' * c = 0
    //   p' * a + p' * c = 0
    // where p' is -BN254::Fq::modulus in the native field. Values constrained only by these gates are
    // non-native reduction intermediates, and duplicate numeric values do not indicate witness reuse.
    if (!(q_m.is_zero() || q_m == FF::one())) {
        return false;
    }
    return has_limb_modulus_selector;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_non_native_field_prime_limb_gates(uint32_t var_idx) const
{
    using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;

    auto it = variable_gate_refs.find(var_idx);
    if (it == variable_gate_refs.end()) {
        return false;
    }
    for (const auto& [block_ptr, gate_idx] : it->second) {
        auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(block_ptr));
        const bool is_prime_limb_gate = is_non_native_field_prime_limb_gate(block, gate_idx);
        if (!is_prime_limb_gate && !is_non_native_field_custom_gate(block, gate_idx)) {
            return false;
        }
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::is_fixed_witness_gate(auto& block, size_t gate_idx, uint32_t var_idx) const
{
    return read_gate_selector(block, GateKind::Arith, gate_idx) == FF::one() && block.q_1()[gate_idx] == FF::one() &&
           block.q_m()[gate_idx].is_zero() && block.q_2()[gate_idx].is_zero() && block.q_3()[gate_idx].is_zero() &&
           block.q_4()[gate_idx].is_zero() && circuit_builder.real_variable_index[block.w_l()[gate_idx]] == var_idx;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::is_modulus_arithmetic_gate(auto& block, size_t gate_idx) const
{
    if (read_gate_selector(block, GateKind::Arith, gate_idx).is_zero()) {
        return false;
    }
    auto is_nontrivial_modulus_selector = [](const FF& selector) {
        return selector != -FF::one() && is_bn254_fq_modulus_derived_value(selector);
    };
    return is_nontrivial_modulus_selector(block.q_m()[gate_idx]) ||
           is_nontrivial_modulus_selector(block.q_1()[gate_idx]) ||
           is_nontrivial_modulus_selector(block.q_2()[gate_idx]) ||
           is_nontrivial_modulus_selector(block.q_3()[gate_idx]) ||
           is_nontrivial_modulus_selector(block.q_4()[gate_idx]) ||
           is_nontrivial_modulus_selector(block.q_c()[gate_idx]);
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_modulus_arithmetic_gates(uint32_t var_idx) const
{
    using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;

    auto it = variable_gate_refs.find(var_idx);
    if (it == variable_gate_refs.end()) {
        return false;
    }
    for (const auto& [block_ptr, gate_idx] : it->second) {
        auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(block_ptr));
        if (is_fixed_witness_gate(block, gate_idx, var_idx)) {
            continue;
        }
        if (!is_modulus_arithmetic_gate(block, gate_idx)) {
            return false;
        }
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_memory_gates(uint32_t var_idx) const
{
    auto it = variable_gate_refs.find(var_idx);
    if (it == variable_gate_refs.end()) {
        return false;
    }
    const void* memory_block_ptr = static_cast<const void*>(&circuit_builder.blocks.memory);
    return std::all_of(
        it->second.begin(), it->second.end(), [&](const auto& gate_ref) { return gate_ref.first == memory_block_ptr; });
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_msm_table_materialization_gates(uint32_t var_idx) const
{
    using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;

    auto it = variable_gate_refs.find(var_idx);
    if (it == variable_gate_refs.end()) {
        return false;
    }
    const void* arithmetic_block_ptr = static_cast<const void*>(&circuit_builder.blocks.arithmetic);
    const void* elliptic_block_ptr = static_cast<const void*>(&circuit_builder.blocks.elliptic);
    const void* lookup_block_ptr = static_cast<const void*>(&circuit_builder.blocks.lookup);
    const void* memory_block_ptr = static_cast<const void*>(&circuit_builder.blocks.memory);
    for (const auto& [block_ptr, gate_idx] : it->second) {
        if (block_ptr == elliptic_block_ptr || block_ptr == lookup_block_ptr || block_ptr == memory_block_ptr) {
            continue;
        }
        if (block_ptr == arithmetic_block_ptr) {
            auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(block_ptr));
            if (is_fixed_witness_gate(block, gate_idx, var_idx) || is_modulus_arithmetic_gate(block, gate_idx)) {
                continue;
            }
        }
        return false;
    }
    return true;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_elliptic_materialization_gates(uint32_t var_idx) const
{
    using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;

    auto it = variable_gate_refs.find(var_idx);
    if (it == variable_gate_refs.end()) {
        return false;
    }
    const void* arithmetic_block_ptr = static_cast<const void*>(&circuit_builder.blocks.arithmetic);
    const void* elliptic_block_ptr = static_cast<const void*>(&circuit_builder.blocks.elliptic);
    bool has_elliptic_row = false;
    bool has_materialization_row = false;
    for (const auto& [block_ptr, gate_idx] : it->second) {
        auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(block_ptr));
        if (block_ptr == elliptic_block_ptr) {
            has_elliptic_row = true;
            continue;
        }
        if (block_ptr == arithmetic_block_ptr &&
            (is_fixed_witness_gate(block, gate_idx, var_idx) || is_modulus_arithmetic_gate(block, gate_idx))) {
            has_materialization_row = true;
            continue;
        }
        return false;
    }
    return has_elliptic_row && has_materialization_row;
}

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_ecc_op_materialization_gates(uint32_t var_idx) const
{
    if constexpr (!IsMegaBuilder<CircuitBuilder>) {
        return false;
    } else {
        auto it = variable_gate_refs.find(var_idx);
        if (it == variable_gate_refs.end()) {
            return false;
        }
        const void* arithmetic_block_ptr = static_cast<const void*>(&circuit_builder.blocks.arithmetic);
        const void* ecc_op_block_ptr = static_cast<const void*>(&circuit_builder.blocks.ecc_op);
        const void* poseidon2_external_block_ptr = static_cast<const void*>(&circuit_builder.blocks.poseidon2_external);
        bool has_ecc_op_row = false;
        bool has_materialization_row = false;
        for (const auto& [block_ptr, gate_idx] : it->second) {
            if (block_ptr == ecc_op_block_ptr) {
                has_ecc_op_row = true;
                continue;
            }
            if (block_ptr == poseidon2_external_block_ptr) {
                has_materialization_row = true;
                continue;
            }
            if (block_ptr == arithmetic_block_ptr) {
                auto& block = *const_cast<bb::MegaTraceBlock*>(static_cast<const bb::MegaTraceBlock*>(block_ptr));
                if (is_fixed_witness_gate(block, gate_idx, var_idx) || is_modulus_arithmetic_gate(block, gate_idx)) {
                    has_materialization_row = true;
                    continue;
                }
            }
            return false;
        }
        return has_ecc_op_row && has_materialization_row;
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_arithmetic_derivation_duplicate_adjacency() const
{
    // Some stdlib helpers emit the same derived witness more than once from the same peer witness and identical
    // non-native modulus selectors. Connect only those derived witnesses; do not connect them to the peer itself.
    DuplicateAdjacency duplicate_adjacency;
    std::
        unordered_map<ArithmeticDerivationSignature<FF>, std::vector<uint32_t>, ArithmeticDerivationSignatureHasher<FF>>
            derived_variables_by_signature;

    auto add_derived_variable = [&](const ArithmeticDerivationSignature<FF>& signature, uint32_t witness_index) {
        const uint32_t real_index = circuit_builder.real_variable_index[witness_index];
        if (real_index != circuit_builder.zero_idx()) {
            derived_variables_by_signature[signature].emplace_back(real_index);
        }
    };

    for (auto& block : circuit_builder.blocks.get()) {
        for (size_t row = 0; row < block.size(); row++) {
            if (read_gate_selector(block, GateKind::Arith, row) != FF::one()) {
                continue;
            }

            const auto& q_m = block.q_m()[row];
            const auto& q_1 = block.q_1()[row];
            const auto& q_2 = block.q_2()[row];
            const auto& q_3 = block.q_3()[row];
            const auto& q_4 = block.q_4()[row];
            const auto& q_c = block.q_c()[row];
            if (q_m.is_zero() || !q_3.is_zero() || !q_4.is_zero() || !is_bn254_fq_modulus_derived_value(q_c)) {
                continue;
            }

            auto add_oriented_derivation = [&](uint32_t derived_witness, uint32_t peer_witness, const FF& linear) {
                const uint32_t peer_real_index = circuit_builder.real_variable_index[peer_witness];
                if (peer_real_index == circuit_builder.zero_idx()) {
                    return;
                }

                ArithmeticDerivationSignature<FF> signature{
                    .q_m = q_m,
                    .linear_scaling = linear,
                    .q_c = q_c,
                    .peer_variable = peer_real_index,
                };
                add_derived_variable(signature, derived_witness);
            };

            if (q_1.is_zero() && q_2.is_zero()) {
                // Pure product identity: q_m * peer * derived + q_c = 0. Since multiplication is commutative, add both
                // orientations. Only duplicated derived witnesses sharing the same peer get connected.
                add_oriented_derivation(block.w_l()[row], block.w_r()[row], FF::zero());
                add_oriented_derivation(block.w_r()[row], block.w_l()[row], FF::zero());
                continue;
            }

            const bool derived_on_left = !q_1.is_zero() && q_2.is_zero();
            const bool derived_on_right = q_1.is_zero() && !q_2.is_zero();
            if (derived_on_left == derived_on_right) {
                continue;
            }
            add_oriented_derivation(derived_on_left ? block.w_l()[row] : block.w_r()[row],
                                    derived_on_left ? block.w_r()[row] : block.w_l()[row],
                                    derived_on_left ? q_1 : q_2);
        }
    }

    for (auto& [_, variables] : derived_variables_by_signature) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }
    return duplicate_adjacency;
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_elliptic_operation_duplicate_adjacency() const
{
    // Repeating the same elliptic add/double operation with copied input witnesses deterministically repeats x3/y3.
    // Keep x-output and y-output components separate so accidental x == y equality remains visible.
    DuplicateAdjacency duplicate_adjacency;
    std::unordered_map<EllipticOperationSignature<FF>, std::vector<uint32_t>, EllipticOperationSignatureHasher<FF>>
        x_outputs_by_signature;
    std::unordered_map<EllipticOperationSignature<FF>, std::vector<uint32_t>, EllipticOperationSignatureHasher<FF>>
        y_outputs_by_signature;

    auto real_value = [&](uint32_t witness_index) {
        return circuit_builder.get_variable(circuit_builder.real_variable_index[witness_index]);
    };
    auto real_index = [&](uint32_t witness_index) { return circuit_builder.real_variable_index[witness_index]; };

    for (auto& block : circuit_builder.blocks.get()) {
        for (size_t row = 0; row + 1 < block.size(); row++) {
            if (read_gate_selector(block, GateKind::Elliptic, row) != FF::one()) {
                continue;
            }

            const bool is_double = block.q_m()[row] == FF::one();
            const bool is_add = block.q_m()[row].is_zero();
            if (!is_double && !is_add) {
                continue;
            }

            EllipticOperationSignature<FF> signature{
                .is_double = is_double,
                .q_sign_or_double = is_double ? FF::one() : block.q_1()[row],
                .inputs = { real_value(block.w_r()[row]),
                            real_value(block.w_o()[row]),
                            is_double ? FF::zero() : real_value(block.w_l()[row + 1]),
                            is_double ? FF::zero() : real_value(block.w_4()[row + 1]) },
            };
            x_outputs_by_signature[signature].emplace_back(real_index(block.w_r()[row + 1]));
            y_outputs_by_signature[signature].emplace_back(real_index(block.w_o()[row + 1]));
        }
    }

    for (auto& [_, variables] : x_outputs_by_signature) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }
    for (auto& [_, variables] : y_outputs_by_signature) {
        connect_duplicate_variables(duplicate_adjacency, variables, circuit_builder.zero_idx());
    }
    return duplicate_adjacency;
}

template <typename FF, typename CircuitBuilder>
std::unordered_map<uint32_t, std::vector<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    build_ecc_op_table_duplicate_adjacency() const
{
    DuplicateAdjacency duplicate_adjacency;
    if constexpr (!IsMegaBuilder<CircuitBuilder>) {
        return duplicate_adjacency;
    } else {
        // Repeated transcript commitments are materialized as repeated ECC-op table point tuples. This happens
        // structurally in batch-merge proofs, where inactive subtable commitments are commitments to the zero
        // polynomial. Connect corresponding limbs only when the full opcode+point tuple repeats.
        using PointVariables = std::array<uint32_t, 4>;
        std::unordered_map<EccOpPointSignature<FF>, std::vector<PointVariables>, EccOpPointSignatureHasher<FF>>
            point_variables_by_signature;

        auto real_index = [&](uint32_t witness_index) { return circuit_builder.real_variable_index[witness_index]; };
        auto real_value = [&](uint32_t witness_index) {
            return circuit_builder.get_variable(real_index(witness_index));
        };

        auto& block = circuit_builder.blocks.ecc_op;
        const void* ecc_op_block_ptr = static_cast<const void*>(&block);
        auto has_materialization_gate = [&](uint32_t real_variable_index) {
            auto it = variable_gate_refs.find(real_variable_index);
            if (it == variable_gate_refs.end()) {
                return false;
            }
            return std::any_of(it->second.begin(), it->second.end(), [&](const auto& gate_ref) {
                return gate_ref.first != ecc_op_block_ptr;
            });
        };

        for (size_t row = 0; row + 1 < block.size(); row++) {
            if (block.w_l()[row] == circuit_builder.zero_idx()) {
                continue;
            }
            PointVariables point_variables{ real_index(block.w_r()[row]),
                                            real_index(block.w_o()[row]),
                                            real_index(block.w_4()[row]),
                                            real_index(block.w_r()[row + 1]) };
            if (!std::all_of(point_variables.begin(), point_variables.end(), has_materialization_gate)) {
                continue;
            }

            EccOpPointSignature<FF> signature{
                .opcode = real_value(block.w_l()[row]),
                .point = { real_value(block.w_r()[row]),
                           real_value(block.w_o()[row]),
                           real_value(block.w_4()[row]),
                           real_value(block.w_r()[row + 1]) },
            };
            point_variables_by_signature[signature].push_back(point_variables);
        }

        for (auto& [_, point_variables] : point_variables_by_signature) {
            if (point_variables.size() < 2) {
                continue;
            }
            for (size_t limb_idx = 0; limb_idx < 4; limb_idx++) {
                std::vector<uint32_t> limb_variables;
                limb_variables.reserve(point_variables.size());
                for (const auto& variables : point_variables) {
                    limb_variables.emplace_back(variables[limb_idx]);
                }
                connect_duplicate_variables(duplicate_adjacency, limb_variables, circuit_builder.zero_idx());
            }
        }

        return duplicate_adjacency;
    }
}

/**
 * @brief Generate a map [WitnessValue] -> [VariableSet] for repeated witness values.
 *
 * @details Explanation-only mode does not drop candidates by value alone. Triage mode additionally removes common
 * values and caller-provided filter values after structural/provenance checks. Rerun-varying filter values are
 * computed by rebuilding the same circuit with randomized inputs and are removed independently of triage mode.
 *
 * @tparam FF
 * @tparam CircuitBuilder
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::fill_witness_duplicate_map(
    const std::unordered_set<FF>& additional_filter_values,
    WitnessDuplicateFilterMode filter_mode,
    const std::unordered_set<FF>& rerun_varying_filter_values)
{
    // We only need to fill the map once
    if (!filtered_witness_value_map.empty()) {
        return;
    }
    const auto databus_read_value_variables = get_databus_read_value_variables();
    std::unordered_map<uint32_t,
                       std::pair<DuplicateIdentityKey, DuplicateCryptographicBindingRole>>
        cryptographic_binding_by_variable;
    for (const auto& [real_index, group_key] : circuit_builder.get_duplicate_provenance()) {
        auto binding_group_key = cryptographic_binding_group_key(group_key);
        const auto binding_role = get_duplicate_cryptographic_binding_role(group_key.local_id);
        if (!binding_group_key.has_value() || !binding_role.has_value()) {
            continue;
        }
        cryptographic_binding_by_variable.emplace(
            real_index, std::make_pair(std::move(binding_group_key.value()), binding_role.value()));
    }
    auto duplicate_set_is_cryptographic_binding = [&](const std::vector<uint32_t>& ordered_indices) {
        if (ordered_indices.empty()) {
            return false;
        }
        auto first_it = cryptographic_binding_by_variable.find(ordered_indices[0]);
        if (first_it == cryptographic_binding_by_variable.end()) {
            return false;
        }
        const DuplicateIdentityKey& group_key = first_it->second.first;
        bool has_running_hash = false;
        bool has_transcript_hash = false;
        for (uint32_t idx : ordered_indices) {
            auto it = cryptographic_binding_by_variable.find(idx);
            if (it == cryptographic_binding_by_variable.end() || it->second.first != group_key) {
                return false;
            }
            has_running_hash |= it->second.second == DuplicateCryptographicBindingRole::RUNNING_HASH;
            has_transcript_hash |= it->second.second == DuplicateCryptographicBindingRole::TRANSCRIPT_HASH;
        }
        return has_running_hash && has_transcript_hash;
    };
    auto duplicate_set_intersects_cryptographic_binding = [&](const std::vector<uint32_t>& ordered_indices) {
        return std::any_of(ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) {
            return cryptographic_binding_by_variable.contains(idx);
        });
    };
    // Scan through already detected variables and add their values. Do not drop candidates by value alone: a common
    // field value can still be a real witness duplicate unless a structural/provenance explanation removes it below.
    for (auto [variable_index, count] : variables_gate_counts) {
        if (count == 0) {
            continue;
        }
        BB_ASSERT(variable_index == circuit_builder.real_variable_index[variable_index]);
        auto witness_value = circuit_builder.get_variable(variable_index);
        filtered_witness_value_map[witness_value].insert(variable_index);
    }
    // Remove single-occurrence values
    std::vector<bb::fr> values_for_removal;
    values_for_removal.reserve(filtered_witness_value_map.size());
    for (const auto& [value, index_set] : filtered_witness_value_map) {
        if (index_set.size() <= 1) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    // Build duplicate-search overlays even when main graph connectivity is disabled. These edges are used only by this
    // duplicate filter and never mutate variable_adjacency_lists.
    values_for_removal.clear();
    auto memory_duplicate_adjacency_lists = build_memory_table_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> databus_duplicate_adjacency_lists =
        build_databus_read_duplicate_adjacency();
    const auto databus_duplicate_variables = collect_duplicate_graph_variables(databus_duplicate_adjacency_lists);
    std::unordered_map<uint32_t, std::vector<uint32_t>> non_native_duplicate_adjacency_lists =
        build_non_native_field_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> arithmetic_derivation_duplicate_adjacency_lists =
        build_arithmetic_derivation_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> elliptic_operation_duplicate_adjacency_lists =
        build_elliptic_operation_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> ecc_op_table_duplicate_adjacency_lists =
        build_ecc_op_table_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> lookup_table_duplicate_adjacency_lists =
        build_lookup_table_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> straus_table_duplicate_adjacency_lists =
        build_straus_table_duplicate_adjacency();
    std::unordered_map<uint32_t, std::vector<uint32_t>> structural_duplicate_adjacency_lists =
        memory_duplicate_adjacency_lists;
    auto merge_structural_overlay = [&](const auto& overlay) {
        for (const auto& [node, neighbors] : overlay) {
            auto& structural_neighbors = structural_duplicate_adjacency_lists[node];
            structural_neighbors.insert(structural_neighbors.end(), neighbors.begin(), neighbors.end());
        }
    };
    merge_structural_overlay(non_native_duplicate_adjacency_lists);
    merge_structural_overlay(arithmetic_derivation_duplicate_adjacency_lists);
    merge_structural_overlay(elliptic_operation_duplicate_adjacency_lists);
    merge_structural_overlay(ecc_op_table_duplicate_adjacency_lists);
    merge_structural_overlay(lookup_table_duplicate_adjacency_lists);
    merge_structural_overlay(straus_table_duplicate_adjacency_lists);
    merge_structural_overlay(build_provenance_duplicate_adjacency());
    const auto structural_duplicate_component_ids = build_duplicate_component_ids(structural_duplicate_adjacency_lists);
    for (auto& [value, index_set] : filtered_witness_value_map) {
        std::vector<uint32_t> ordered_indices(index_set.begin(), index_set.end());
        std::sort(ordered_indices.begin(), ordered_indices.end());
        const bool has_databus_read = std::any_of(ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) {
            return databus_read_value_variables.contains(idx);
        });
        const bool has_non_databus_read =
            std::any_of(ordered_indices.begin(), ordered_indices.end(), [&](uint32_t idx) {
                return !databus_read_value_variables.contains(idx);
            });
        // Source-aware overlays are allowed to remove a duplicate only when every occurrence is connected by the
        // expected access relation. If a value touches an overlay but is not fully explained by it, keep it visible
        // so the next filter pass — or the human triaging output — can decide.
        if (duplicate_set_is_connected_in_overlay(
                ordered_indices, databus_duplicate_adjacency_lists, databus_duplicate_variables)) {
            values_for_removal.push_back(value);
            continue;
        }
        if (duplicate_set_intersects_overlay(ordered_indices, databus_duplicate_variables) ||
            (has_databus_read && has_non_databus_read)) {
            continue;
        }
        if (duplicate_set_is_cryptographic_binding(ordered_indices)) {
            values_for_removal.push_back(value);
            continue;
        }
        if (duplicate_set_intersects_cryptographic_binding(ordered_indices)) {
            continue;
        }
        if (duplicate_set_is_connected_in_overlay_components(ordered_indices, structural_duplicate_component_ids)) {
            values_for_removal.push_back(value);
            continue;
        }
        if (duplicate_set_intersects_overlay_components(ordered_indices, structural_duplicate_component_ids)) {
            continue;
        }
        // No structural overlay explains this duplicate. Keep it visible.
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    values_for_removal.clear();
    for (auto& [value, _] : filtered_witness_value_map) {
        if (rerun_varying_filter_values.contains(value)) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    values_for_removal.clear();
    if (filter_mode == WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS) {
        for (auto& [value, index_set] : filtered_witness_value_map) {
            if (is_triage_noise_witness_value(value)) {
                values_for_removal.push_back(value);
                continue;
            }
            if (!additional_filter_values.contains(value)) {
                continue;
            }
            const bool has_databus_read = std::any_of(index_set.begin(), index_set.end(), [&](uint32_t idx) {
                return databus_read_value_variables.contains(idx);
            });
            const bool has_non_databus_read = std::any_of(index_set.begin(), index_set.end(), [&](uint32_t idx) {
                return !databus_read_value_variables.contains(idx);
            });
            if (!(has_databus_read && has_non_databus_read)) {
                values_for_removal.push_back(value);
            }
        }
        for (auto& val : values_for_removal) {
            filtered_witness_value_map.erase(val);
        }
        values_for_removal.clear();
    }
    const auto& duplicate_provenance = circuit_builder.get_duplicate_provenance();
    for (auto& [value, index_set] : filtered_witness_value_map) {
        bool has_msm_table_materialization = false;
        bool all_msm_table_neighborhood = true;
        for (auto& idx : index_set) {
            auto provenance_it = duplicate_provenance.find(idx);
            const bool is_msm_table =
                provenance_it != duplicate_provenance.end() &&
                duplicate_provenance_category(provenance_it->second) == DuplicateProvenanceCategory::MSM_TABLE;
            if (is_msm_table) {
                has_msm_table_materialization = true;
                if (!variable_only_in_msm_table_materialization_gates(idx)) {
                    all_msm_table_neighborhood = false;
                    break;
                }
                continue;
            }
            if (!variable_only_in_memory_gates(idx)) {
                all_msm_table_neighborhood = false;
                break;
            }
        }
        if (has_msm_table_materialization && all_msm_table_neighborhood) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    values_for_removal.clear();
    for (auto& [value, index_set] : filtered_witness_value_map) {
        bool all_ecc_op_materializations = true;
        for (auto& idx : index_set) {
            auto provenance_it = duplicate_provenance.find(idx);
            if (provenance_it == duplicate_provenance.end() ||
                duplicate_provenance_category(provenance_it->second) != DuplicateProvenanceCategory::ECC_OP_TABLE ||
                !variable_only_in_ecc_op_materialization_gates(idx)) {
                all_ecc_op_materializations = false;
                break;
            }
        }
        if (all_ecc_op_materializations) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    values_for_removal.clear();
    for (auto& [value, index_set] : filtered_witness_value_map) {
        bool all_elliptic_w4_materializations = true;
        for (auto& idx : index_set) {
            if (!variable_only_in_elliptic_materialization_gates(idx)) {
                all_elliptic_w4_materializations = false;
                break;
            }
        }
        if (all_elliptic_w4_materializations) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    values_for_removal.clear();
    for (auto& [value, index_set] : filtered_witness_value_map) {
        bool all_modulus_arithmetic = true;
        for (auto& idx : index_set) {
            if (!variable_only_in_modulus_arithmetic_gates(idx)) {
                all_modulus_arithmetic = false;
                break;
            }
        }
        if (all_modulus_arithmetic) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    // Filter out variables that are constant or constrained via fix_witness.
    // fix_witness creates an arithmetic gate: q_1=1, q_c=-value, all other selectors/wires zero.
    // The value is baked into q_c, so duplicates are safe.
    auto is_fixed_witness = [&](uint32_t var_idx) -> bool {
        using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;

        auto it = variable_gate_refs.find(var_idx);
        if (it == variable_gate_refs.end()) {
            return false;
        }
        for (const auto& [block_ptr, gate_idx] : it->second) {
            auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(block_ptr));
            if (is_fixed_witness_gate(block, gate_idx, var_idx)) {
                return true;
            }
        }
        return false;
    };
    values_for_removal.resize(0);
    for (const auto& [value, index_set] : filtered_witness_value_map) {
        bool all_fixed_or_constant = true;
        for (auto& idx : index_set) {
            if (!constant_variable_indices_set.contains(idx) && !is_fixed_witness(idx)) {
                all_fixed_or_constant = false;
                break;
            }
        }
        if (all_fixed_or_constant) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    // Filter non-native field reduction intermediates. Bigfield prime-limb checks constrain quotient/remainder
    // witnesses with arithmetic gates containing BN254 Fq modulus-derived selectors. Repeated values here are
    // artifacts of the native quotient/remainder arithmetic, not independent witness reuse.
    values_for_removal.clear();
    for (auto& [value, index_set] : filtered_witness_value_map) {
        bool all_prime_limb_reduction_intermediates = true;
        for (auto& idx : index_set) {
            if (!variable_only_in_non_native_field_prime_limb_gates(idx)) {
                all_prime_limb_reduction_intermediates = false;
                break;
            }
        }
        if (all_prime_limb_reduction_intermediates) {
            values_for_removal.push_back(value);
        }
    }
    for (auto& val : values_for_removal) {
        filtered_witness_value_map.erase(val);
    }
    // Filter out false positives from ECC op negation patterns (ADD(x,y), ADD(x,-y), EQ)
    // When negating a point, the x-coordinate is reused, creating duplicate witness values that are not a concern.
    if constexpr (IsMegaBuilder<CircuitBuilder>) {
        auto& ecc_op_block = circuit_builder.blocks.ecc_op;
        auto& wires = ecc_op_block.wires;
        size_t num_rows = ecc_op_block.size();
        // Collect the x_lo/x_hi limb *variables* from ADD-ADD-EQ triples where the two ADD points are concrete
        // negations. We suppress only these specific ecc_op-block occurrences, not every witness that happens to hold
        // the same field value — an unrelated under-constrained duplicate sharing the value must stay visible.
        std::unordered_set<uint32_t> ecc_negation_x_variables;
        // Each ecc op occupies 2 rows. Iterate ops (stride 2) and check consecutive triples.
        size_t num_ops = num_rows / 2;
        for (size_t op_idx = 0; op_idx + 2 < num_ops; op_idx++) {
            size_t row_a = op_idx * 2;
            size_t row_b = (op_idx + 1) * 2;
            size_t row_c = (op_idx + 2) * 2;
            // Row layout: wires[0] = opcode, wires[1] = x_lo, wires[2] = x_hi, wires[3] = y_lo
            uint32_t op_a = circuit_builder.real_variable_index[wires[0][row_a]];
            uint32_t op_b = circuit_builder.real_variable_index[wires[0][row_b]];
            uint32_t op_c = circuit_builder.real_variable_index[wires[0][row_c]];
            if (op_a != circuit_builder.add_accum_op_idx || op_b != circuit_builder.add_accum_op_idx ||
                op_c != circuit_builder.equality_op_idx) {
                continue;
            }
            // Check if the two ADDs share the same x_lo and x_hi witness values
            uint32_t x_lo_a = circuit_builder.real_variable_index[wires[1][row_a]];
            uint32_t x_lo_b = circuit_builder.real_variable_index[wires[1][row_b]];
            uint32_t x_hi_a = circuit_builder.real_variable_index[wires[2][row_a]];
            uint32_t x_hi_b = circuit_builder.real_variable_index[wires[2][row_b]];
            auto x_lo_val_a = circuit_builder.get_variable(x_lo_a);
            auto x_lo_val_b = circuit_builder.get_variable(x_lo_b);
            auto x_hi_val_a = circuit_builder.get_variable(x_hi_a);
            auto x_hi_val_b = circuit_builder.get_variable(x_hi_b);
            uint32_t y_lo_a = circuit_builder.real_variable_index[wires[3][row_a]];
            uint32_t y_lo_b = circuit_builder.real_variable_index[wires[3][row_b]];
            uint32_t y_hi_a = circuit_builder.real_variable_index[wires[1][row_a + 1]];
            uint32_t y_hi_b = circuit_builder.real_variable_index[wires[1][row_b + 1]];
            auto y_lo_val_a = circuit_builder.get_variable(y_lo_a);
            auto y_lo_val_b = circuit_builder.get_variable(y_lo_b);
            auto y_hi_val_a = circuit_builder.get_variable(y_hi_a);
            auto y_hi_val_b = circuit_builder.get_variable(y_hi_b);
            using Fq = curve::BN254::BaseField;
            constexpr size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
            auto y_a = Fq((uint256_t(y_hi_val_a) << CHUNK_SIZE) + uint256_t(y_lo_val_a));
            auto y_b = Fq((uint256_t(y_hi_val_b) << CHUNK_SIZE) + uint256_t(y_lo_val_b));
            if (x_lo_val_a == x_lo_val_b && x_hi_val_a == x_hi_val_b && y_a == -y_b) {
                ecc_negation_x_variables.insert(x_lo_a);
                ecc_negation_x_variables.insert(x_lo_b);
                ecc_negation_x_variables.insert(x_hi_a);
                ecc_negation_x_variables.insert(x_hi_b);
            }
        }
        values_for_removal.clear();
        for (auto& [value, index_set] : filtered_witness_value_map) {
            for (auto it = index_set.begin(); it != index_set.end();) {
                it = ecc_negation_x_variables.contains(*it) ? index_set.erase(it) : std::next(it);
            }
            if (index_set.size() < 2) {
                values_for_removal.push_back(value);
            }
        }
        for (auto& val : values_for_removal) {
            filtered_witness_value_map.erase(val);
        }
    }
    // Build count from the final filtered map
    std::vector<std::pair<bb::fr, size_t>> count;
    count.reserve(filtered_witness_value_map.size());
    for (const auto& [value, index_set] : filtered_witness_value_map) {
        count.emplace_back(value, index_set.size());
    }
    std::sort(count.begin(), count.end(), [](auto& a, auto& b) { return a.second > b.second; });
    info("Total repeated values: ", count.size());
    for (size_t i = 0; i < (10 < count.size() ? 10 : count.size()); i++) {
        info("Value: ", count[i].first, " : ", count[i].second, " times");
    }
    if (count.empty()) {
        info("No repeats found");
        return;
    }
    // Build block labels for gate-type distribution
    std::vector<std::string> block_labels;
    {
        auto blocks_ref = circuit_builder.blocks.get();
        if constexpr (IsMegaBuilder<CircuitBuilder> || IsUltraBuilder<CircuitBuilder>) {
            auto labels = circuit_builder.blocks.get_labels();
            for (size_t i = 0; i < labels.size(); i++) {
                block_labels.emplace_back(labels[i]);
            }
        } else {
            for (size_t i = 0; i < blocks_ref.size(); i++) {
                block_labels.push_back("block_" + std::to_string(i));
            }
        }
    }

    for (size_t c = 0; c < std::min(size_t(10), count.size()); c++) {
        auto& val = count[c].first;
        uint256_t val_uint = val;
        static constexpr uint256_t LO_MASK = (uint256_t(1) << 136) - 1;
        uint256_t lo_chunk = val_uint & LO_MASK;
        uint256_t hi_chunk = val_uint >> 136;
        info("Indices of value #", c, " (", val, ", ", count[c].second, " times):");
        info("  lo_136=0x", lo_chunk, " hi=0x", hi_chunk);
        // Print only the first 3 indices
        size_t printed = 0;
        for (auto& index : filtered_witness_value_map[val]) {
            info("  ind ", index);
            if (++printed >= 3) {
                if (count[c].second > 3) {
                    info("  ... (", count[c].second - 3, " more)");
                }
                break;
            }
        }
        // Print gate-type distribution across all indices of this value.
        // Scan blocks directly since variable_gates may not cover all variables.
        {
            std::unordered_set<uint32_t> index_set(filtered_witness_value_map[val].begin(),
                                                   filtered_witness_value_map[val].end());
            std::unordered_map<std::string, size_t> gate_distribution;
            auto blocks_ref = circuit_builder.blocks.get();
            for (size_t b = 0; b < blocks_ref.size(); b++) {
                auto& blk = blocks_ref[b];
                size_t hits = 0;
                for (size_t row = 0; row < blk.size(); row++) {
                    if (index_set.contains(circuit_builder.real_variable_index[blk.w_l()[row]]) ||
                        index_set.contains(circuit_builder.real_variable_index[blk.w_r()[row]]) ||
                        index_set.contains(circuit_builder.real_variable_index[blk.w_o()[row]]) ||
                        index_set.contains(circuit_builder.real_variable_index[blk.w_4()[row]])) {
                        hits++;
                    }
                }
                if (hits > 0) {
                    gate_distribution[block_labels[b]] = hits;
                }
            }
            if (!gate_distribution.empty()) {
                info("  Gate-type distribution:");
                for (auto& [label, gate_count] : gate_distribution) {
                    info("    ", label, ": ", gate_count, " gate(s)");
                }
            }
        }
    }
}

/**
 * @brief this method checks if current gate is sorted ROM gate
 * @tparam FF
 * @tparam CircuitBuilder
 * @param memory_block reference to the memory block
 * @param gate_idx
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::is_gate_sorted_rom(auto& memory_block, size_t gate_idx) const
{
    return memory_block.gate_selector_for(GateKind::Memory)[gate_idx] == FF::one() &&
           memory_block.q_1()[gate_idx] == FF::one() && memory_block.q_2()[gate_idx] == FF::one();
}

/**
 * @brief this method checks that every gate for given variable in a given block is sorted ROM gate
 * @tparam FF
 * @tparam CircuitBuilder
 * @param var_idx
 * @param blk reference to the block
 */

template <typename FF, typename CircuitBuilder>
bool StaticAnalyzer_<FF, CircuitBuilder>::variable_only_in_sorted_rom_gates(uint32_t var_idx, auto& blk) const
{
    bool result = false;
    KeyPair key = { var_idx, &blk };
    auto it = variable_gates.find(key);
    if (it != variable_gates.end()) {
        const auto& gates = it->second;
        result = std::all_of(
            gates.begin(), gates.end(), [this, &blk](size_t gate_idx) { return is_gate_sorted_rom(blk, gate_idx); });
    }
    return result;
}

/**
 * @brief this method marks some connected components if they were created by function process_rom_array.
 * the point is process_ROM_array function uses only create_sorted_ROM_gate function internally
 * for sorted_ROM_gate we know that (q_memory, q_1, q_2) == (1, 1, 1), so if all variables in connected_component
 * are contained only in this type of gate, we can remove this connected component from the scope, cause it's
 * a result of process_ROM_array function
 * @tparam FF
 * @tparam CircuitBuilder
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_process_rom_connected_component()
{
    auto& memory_block = circuit_builder.blocks.memory;
    for (auto& cc : connected_components) {
        const std::vector<uint32_t>& variables = cc.vars();
        cc.is_process_rom_cc =
            std::all_of(variables.begin(), variables.end(), [this, &memory_block](uint32_t real_var_idx) {
                return variable_only_in_sorted_rom_gates(real_var_idx, memory_block);
            });
    }
}

/**
 * @brief this method marks some connected componets like they represent range lists
 * tool needs this method to remove range lists because after method finalize was called
 * because they aren't connected to other variables in a circuit. It's intended behaviout but the tool shows them as
 * another connected component
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_range_list_connected_components()
{
    const auto& tags = circuit_builder.real_variable_tags;
    std::unordered_set<uint32_t> tau_tags;
    for (const auto& pair : circuit_builder.range_lists) {
        tau_tags.insert(pair.second.tau_tag);
    }
    for (auto& cc : connected_components) {
        const auto& variables = cc.variable_indices;
        const uint32_t first_tag = tags[variables[0]];
        if (tau_tags.contains(first_tag)) {
            cc.is_range_list_cc =
                std::all_of(variables.begin() + 1, variables.end(), [&tags, first_tag](uint32_t var_idx) {
                    return tags[var_idx] == first_tag;
                });
        }
    }
}

/**
 * @brief this method marks some connected components like they represent separated finalize blocks
 * the point is finalize method create additional gates for ecc_op in databus in Mega case and they aren't connected
 * to other variables in the circuit. It's intended behaviour but the tool shows them as another connected component
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::mark_finalize_connected_components()
{
    const auto& finalize_witnesses = circuit_builder.get_finalize_witnesses();
    for (auto& cc : connected_components) {
        const auto& vars = cc.vars();
        cc.is_finalize_cc = std::all_of(vars.begin(), vars.end(), [&finalize_witnesses](uint32_t var_idx) {
            return finalize_witnesses.contains(var_idx);
        });
    }
}

/**
 * @brief this method removes variables that were created in a function decompose_into_default_range
 * because they are false cases and don't give any useful information about security of the circuit.
 * decompose_into_default_range function creates addition gates with shifts for intermediate variables,
 * i.e. variables from left, right and output wires. They have variable gates count = 1 or 2, but they are not
 * dangerous. so, we have to remove these variables from the analyzer. The situation is dangerous, if first variable
 * from accumulators have variables gate count = 1. It means that it was used only in decompose gate, and it's not
 * properly constrained.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param ultra_circuit_constructor
 * @param variables_in_one_gate
 * @param index
 * @return size_t
 */

template <typename FF, typename CircuitBuilder>
inline size_t StaticAnalyzer_<FF, CircuitBuilder>::process_current_decompose_chain(size_t index)
{
    auto& arithmetic_block = circuit_builder.blocks.arithmetic;
    auto zero_idx = circuit_builder.zero_idx();
    size_t current_index = index;
    std::vector<uint32_t> accumulators_indices;
    while (true) {
        // we have to remove left, right and output wires of the current gate, cause they'are new_limbs, and they
        // are useless for the analyzer
        auto fourth_idx = arithmetic_block.w_4()[current_index];
        accumulators_indices.emplace_back(this->to_real(fourth_idx));
        auto left_idx = arithmetic_block.w_l()[current_index];
        if (left_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(left_idx));
        }
        auto right_idx = arithmetic_block.w_r()[current_index];
        if (right_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(right_idx));
        }
        auto out_idx = arithmetic_block.w_o()[current_index];
        if (out_idx != zero_idx) {
            variables_in_one_gate.erase(this->to_real(out_idx));
        }
        auto q_arith = arithmetic_block.gate_selector_for(GateKind::Arith)[current_index];
        if (q_arith == 1 || current_index == arithmetic_block.size() - 1) {
            // this is the last gate in this chain, or we can't go next, so we have to stop a loop
            break;
        }
        current_index++;
    }
    for (size_t i = 0; i < accumulators_indices.size(); i++) {
        if (i == 0) {
            // the first variable in accumulators is the variable which decompose was created. So, we have to
            // decrement variable_gate_counts for this variable
            variables_gate_counts[accumulators_indices[i]] -= 1;
        } else {
            // next accumulators are useless variables that are not interested for the analyzer. So, for these
            // variables we can nullify variables_gate_counts
            variables_gate_counts[accumulators_indices[i]] = 0;
        }
    }
    // we don't want to make variables_gate_counts for intermediate variables negative, so, can go to the next gates
    return current_index;
}

/**
 * @brief this method removes unnecessary variables from decompose chains
 * @tparam FF
 * @tparam CircuitBuilder
 * @param variables_in_one_gate
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_decompose_variables(
    const std::unordered_set<uint32_t>& decompose_variables)
{
    auto is_power_two = [&](const uint256_t& number) { return number > 0 && ((number & (number - 1)) == 0); };
    auto find_position = [&](uint32_t variable_index) {
        return decompose_variables.contains(this->to_real(variable_index));
    };
    auto& arithmetic_block = circuit_builder.blocks.arithmetic;
    if (arithmetic_block.size() > 0) {
        for (size_t i = 0; i < arithmetic_block.size(); i++) {
            auto q_1 = arithmetic_block.q_1()[i];
            auto q_2 = arithmetic_block.q_2()[i];
            auto q_3 = arithmetic_block.q_3()[i];
            // big addition gate from decompose has selectors, which have the next property:
            // q_1 = (1) << shifts[0], target_range_bitnum * (3 * i),
            // q_2 = (1) << shifts[1], target_range_bitnum * (3 * i + 1),
            // q_3 = (1) << shifts[2], target_range_bitnum * (3 * i + 2)
            // so, they are power of two and satisfying the following equality: q_2 * q_2 = q_1 * q_3
            // this way we can differ them from other arithmetic gates
            bool q_1_is_power_two = is_power_two(q_1);
            bool q_2_is_power_two = is_power_two(q_2);
            bool q_3_is_power_two = is_power_two(q_3);
            if (q_2 * q_2 == q_1 * q_3 && q_1_is_power_two && q_2_is_power_two && q_3_is_power_two) {
                uint32_t left_idx = arithmetic_block.w_l()[i];
                uint32_t right_idx = arithmetic_block.w_r()[i];
                uint32_t out_idx = arithmetic_block.w_o()[i];
                uint32_t fourth_idx = arithmetic_block.w_4()[i];
                bool find_left = find_position(left_idx);
                bool find_right = find_position(right_idx);
                bool find_out = find_position(out_idx);
                bool find_fourth = find_position(fourth_idx);
                if (((find_left && find_right && find_out) || (find_left && find_right && !find_out) ||
                     (find_left && find_right && !find_out) || (find_left && !find_right && !find_out)) &&
                    !find_fourth) {
                    i = this->process_current_decompose_chain(i);
                }
            }
        }
    }
}

/**
 * @brief this method removes variables from range constraints that are not security critical
 * @tparam FF field type
 * @tparam CircuitBuilder
 * @details Right now static analyzer removes two types of variables:
 *          1) Variables from delta_range_constraints created by finalize_circuit()
 *          2) Variables from range_constraints created by range_constraint_into_two_limbs
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_range_constrains_variables()
{
    const auto& range_lists = circuit_builder.range_lists;
    std::unordered_set<uint32_t> range_lists_tau_tags;
    std::unordered_set<uint32_t> range_lists_range_tags;
    const auto& real_variable_tags = circuit_builder.real_variable_tags;
    for (const auto& pair : range_lists) {
        typename CircuitBuilder::RangeList list = pair.second;
        range_lists_tau_tags.insert(list.tau_tag);
        range_lists_range_tags.insert(list.range_tag);
    }
    for (uint32_t real_index = 0; real_index < real_variable_tags.size(); real_index++) {
        if (variables_in_one_gate.contains(real_index)) {
            // this if helps us to remove variables from delta_range_constraints when finalize_circuit() function
            // was called
            if (range_lists_tau_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
            // this if helps us to remove variables from range_constraints when range_constraint_into_two_limbs
            // function was called
            if (range_lists_range_tags.contains(real_variable_tags[real_index])) {
                variables_in_one_gate.erase(real_index);
            }
        }
    }
}

/**
 * @brief this method removes false positive cases variables from aes plookup tables.
 * AES_SBOX_MAP, AES_SPARSE_MAP, AES_SPARSE_NORMALIZE tables are used in read_from_1_to_2_table function which
 * return values C2[0], so C3[0] isn't used anymore in these cases, but this situation isn't dangerous.
 * So, we have to remove these variables.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param table_id
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_aes_plookup_variables(BasicTableId& table_id,
                                                                                          size_t gate_index)
{

    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    std::unordered_set<BasicTableId> aes_plookup_tables{ BasicTableId::AES_SBOX_MAP,
                                                         BasicTableId::AES_SPARSE_MAP,
                                                         BasicTableId::AES_SPARSE_NORMALIZE };
    auto& lookup_block = circuit_builder.blocks.lookup;
    if (aes_plookup_tables.contains(table_id)) {
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            bool find_out = find_position(real_out_idx);
            auto q_c = lookup_block.q_c()[gate_index];
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases in sha256 lookup tables.
 * tables which are enumerated in the unordered set sha256_plookup_tables
 * are used in read_from_1_to_2_table function which return C2[0], so C3[0]
 * isn't used anymore, but this situation isn't dangerous. So, we have to remove these variables.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param table_id
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_sha256_plookup_variables(BasicTableId& table_id,
                                                                                             size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = circuit_builder.blocks.lookup;
    std::unordered_set<BasicTableId> sha256_plookup_tables{ BasicTableId::SHA256_WITNESS_SLICE_3,
                                                            BasicTableId::SHA256_WITNESS_SLICE_7_ROTATE_4,
                                                            BasicTableId::SHA256_WITNESS_SLICE_8_ROTATE_7,
                                                            BasicTableId::SHA256_WITNESS_SLICE_14_ROTATE_1,
                                                            BasicTableId::SHA256_BASE16,
                                                            BasicTableId::SHA256_BASE16_ROTATE2,
                                                            BasicTableId::SHA256_BASE28,
                                                            BasicTableId::SHA256_BASE28_ROTATE3,
                                                            BasicTableId::SHA256_BASE28_ROTATE6 };
    if (sha256_plookup_tables.contains(table_id)) {
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            // auto q_m = lookup_block.q_m()[gate_index];
            auto q_c = lookup_block.q_c()[gate_index];
            bool find_out = find_position(real_out_idx);
            // bool find_right = find_position(real_right_idx);
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
            if (table_id == SHA256_BASE16_ROTATE2 || table_id == SHA256_BASE28_ROTATE6) {
                // we want to remove false cases for special tables even though their selectors != 0
                // because they are used in read_from_1_to_2_table function, and they aren't dangerous
                variables_in_one_gate.erase(real_out_idx);
            }
        }
    }
}

/**
 * @brief This method removes false positive cases from keccak lookup tables.
 * Tables which are enumerated in keccak_plookup_tables are used by keccak lookup constraints. Some lookup-gate outputs
 * are auxiliary (e.g. MSB) and may appear in only one gate but this is not dangerous. So we remove these variables.
 * @tparam FF
 * @tparam CircuitBuilder
 * @param table_id
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_keccak_plookup_variables(BasicTableId& table_id,
                                                                                             size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };

    std::unordered_set<BasicTableId> keccak_plookup_tables{
        BasicTableId::KECCAK_INPUT, BasicTableId::KECCAK_OUTPUT, BasicTableId::KECCAK_CHI,   BasicTableId::KECCAK_THETA,
        BasicTableId::KECCAK_RHO,   BasicTableId::KECCAK_RHO_1,  BasicTableId::KECCAK_RHO_2, BasicTableId::KECCAK_RHO_3,
        BasicTableId::KECCAK_RHO_4, BasicTableId::KECCAK_RHO_5,  BasicTableId::KECCAK_RHO_6, BasicTableId::KECCAK_RHO_7,
        BasicTableId::KECCAK_RHO_8, BasicTableId::KECCAK_RHO_9
    };

    auto& lookup_block = circuit_builder.blocks.lookup;

    if (keccak_plookup_tables.contains(table_id)) {
        uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
        uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
        if (variables_gate_counts[real_out_idx] != 1 || variables_gate_counts[real_right_idx] != 1) {
            bool find_out = find_position(real_out_idx);
            auto q_c = lookup_block.q_c()[gate_index];
            if (q_c.is_zero()) {
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases in lookup table for a given gate.
 * it uses all functions above for lookup tables to remove all variables that appear in one gate,
 * if they are not dangerous
 * @tparam FF
 * @tparam CircuitBuilder
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::process_current_plookup_gate(size_t gate_index)
{
    auto find_position = [&](uint32_t real_variable_index) {
        return variables_in_one_gate.contains(real_variable_index);
    };
    auto& lookup_block = circuit_builder.blocks.lookup;
    auto& lookup_tables = circuit_builder.get_lookup_tables();
    auto table_index = static_cast<size_t>(static_cast<uint256_t>(lookup_block.q_3()[gate_index]));
    for (const auto& table : lookup_tables) {
        if (table.table_index == table_index) {
            std::unordered_set<bb::fr> column_1(table.column_1.begin(), table.column_1.end());
            std::unordered_set<bb::fr> column_2(table.column_2.begin(), table.column_2.end());
            std::unordered_set<bb::fr> column_3(table.column_3.begin(), table.column_3.end());
            bb::plookup::BasicTableId table_id = table.id;
            // false cases for AES
            this->remove_unnecessary_aes_plookup_variables(table_id, gate_index);
            // false cases for sha256
            this->remove_unnecessary_sha256_plookup_variables(table_id, gate_index);
            // false cases for keccak
            this->remove_unnecessary_keccak_plookup_variables(table_id, gate_index);
            // if the amount of unique elements from columns of plookup tables = 1, it means that
            // variable from this column aren't used and we can remove it.
            if (column_1.size() == 1) {
                uint32_t left_idx = lookup_block.w_l()[gate_index];
                uint32_t real_left_idx = this->to_real(left_idx);
                bool find_left = find_position(real_left_idx);
                if (find_left) {
                    variables_in_one_gate.erase(real_left_idx);
                }
            }
            if (column_2.size() == 1) {
                uint32_t real_right_idx = this->to_real(lookup_block.w_r()[gate_index]);
                bool find_right = find_position(real_right_idx);
                if (find_right) {
                    variables_in_one_gate.erase(real_right_idx);
                }
            }
            if (column_3.size() == 1) {
                uint32_t real_out_idx = this->to_real(lookup_block.w_o()[gate_index]);
                bool find_out = find_position(real_out_idx);
                if (find_out) {
                    variables_in_one_gate.erase(real_out_idx);
                }
            }
        }
    }
}

/**
 * @brief this method removes false cases plookup variables from variables in one gate
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_unnecessary_plookup_variables()
{
    auto& lookup_block = circuit_builder.blocks.lookup;
    if (lookup_block.size() > 0) {
        for (size_t i = 0; i < lookup_block.size(); i++) {
            this->process_current_plookup_gate(i);
        }
    }
}

/**
 * @brief this method removes record witness variables from variables in one gate.
 * initially record witness is added in the circuit as ctx->add_variable(0), where ctx -- circuit builder.
 * then aren't used anymore, so we can remove from the static analyzer.
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder>
inline void StaticAnalyzer_<FF, CircuitBuilder>::remove_record_witness_variables()
{
    auto& memory_block = circuit_builder.blocks.memory;
    std::vector<uint32_t> to_remove;
    for (const auto& var_idx : variables_in_one_gate) {
        KeyPair key = { var_idx, &memory_block };
        if (auto search = variable_gates.find(key); search != variable_gates.end()) {
            std::vector<size_t> gate_indexes = variable_gates[key];
            BB_ASSERT_EQ(gate_indexes.size(), 1U);
            size_t gate_idx = gate_indexes[0];
            auto q_1 = memory_block.q_1()[gate_idx];
            auto q_2 = memory_block.q_2()[gate_idx];
            auto q_3 = memory_block.q_3()[gate_idx];
            auto q_4 = memory_block.q_4()[gate_idx];
            auto q_m = memory_block.q_m()[gate_idx];
            auto q_arith = read_gate_selector(memory_block, GateKind::Arith, gate_idx);
            if (q_1 == FF::one() && q_m == FF::one() && q_2.is_zero() && q_3.is_zero() && q_4.is_zero() &&
                q_arith.is_zero()) {
                // record witness can be in both ROM and RAM gates, so we can ignore q_c
                // record witness is written as 4th variable in RAM/ROM read/write gate, so we can get 4th
                // wire value and check it with our variable
                if (this->to_real(memory_block.w_4()[gate_idx]) == var_idx) {
                    to_remove.emplace_back(var_idx);
                }
            }
        }
    }
    for (const auto& elem : to_remove) {
        variables_in_one_gate.erase(elem);
    }
}

/**
 * @brief this method returns a final set of variables that were in one gate
 * @tparam FF
 * @tparam CircuitBuilder
 * @return std::unordered_set<uint32_t> set of variable indices
 */

template <typename FF, typename CircuitBuilder>
std::unordered_set<uint32_t> StaticAnalyzer_<FF, CircuitBuilder>::get_variables_in_one_gate()
{
    variables_in_one_gate.clear();
    for (const auto& pair : variables_gate_counts) {
        bool is_not_constant_variable = check_is_not_constant_variable(pair.first);
        if (pair.second == 1 && pair.first != 0 && is_not_constant_variable) {
            variables_in_one_gate.insert(pair.first);
        }
    }
    auto range_lists = circuit_builder.range_lists;
    std::unordered_set<uint32_t> decompose_variables;
    for (auto& pair : range_lists) {
        for (auto& elem : pair.second.variable_indices) {
            bool is_not_constant_variable = check_is_not_constant_variable(elem);
            if (variables_gate_counts[circuit_builder.real_variable_index[elem]] == 1 && is_not_constant_variable) {
                decompose_variables.insert(circuit_builder.real_variable_index[elem]);
            }
        }
    }
    remove_unnecessary_decompose_variables(decompose_variables);
    remove_unnecessary_plookup_variables();
    remove_unnecessary_range_constrains_variables();

    // Remove variables that are intentionally in one gate (e.g., fix_witness, inverse checks).
    // These are marked at the source via update_used_witnesses().
    // AUDITTODO: used_witnesses stores raw witness indices, but variables_in_one_gate contains
    // real_variable_index values. If a witness is copy-constrained (aliased), its raw index may
    // differ from its real_variable_index, causing the erase to fail silently. Should convert:
    //   variables_in_one_gate.erase(circuit_builder.real_variable_index[elem]);
    for (const auto& elem : circuit_builder.get_used_witnesses()) {
        variables_in_one_gate.erase(elem);
    }
    remove_record_witness_variables();

    // Remove variables that only appear in sorted ROM gates - these are constrained via tau tags
    // (permutation argument) rather than copy constraints, matching how connected components
    // are filtered with is_process_rom_cc
    auto& memory_block = circuit_builder.blocks.memory;
    std::vector<uint32_t> to_remove;
    for (const auto& var_idx : variables_in_one_gate) {
        if (variable_only_in_sorted_rom_gates(var_idx, memory_block)) {
            to_remove.emplace_back(var_idx);
        }
    }
    for (const auto& elem : to_remove) {
        variables_in_one_gate.erase(elem);
    }

    return variables_in_one_gate;
}

/**
 * @brief this method prints additional information about connected components that were found in the graph
 * @tparam FF
 * @tparam CircuitBuilder
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_connected_components_info()
{
    info("╔═══════╦═══════╦═════════════╦═══════════╦══════════════╗");
    info("║  CC#  ║  Size ║ Range List  ║ Finalize  ║ Process ROM  ║");
    info("╠═══════╬═══════╬═════════════╬═══════════╬══════════════╣");

    for (size_t i = 0; i < connected_components.size(); i++) {
        const auto& cc = connected_components[i];
        std::ostringstream line;

        line << "║ " << std::setw(5) << std::right << (i + 1) << " ║ " << std::setw(5) << std::right << cc.size()
             << " ║ " << std::setw(11) << std::left << (cc.is_range_list_cc ? "Yes" : "No") << " ║ " << std::setw(9)
             << std::left << (cc.is_finalize_cc ? "Yes" : "No") << " ║ " << std::setw(12) << std::left
             << (cc.is_process_rom_cc ? "Yes" : "No") << " ║";
        info(line.str());
    }
    info("╚═══════╩═══════╩═════════════╩═══════════╩══════════════╝");
    info("Total connected components: ", connected_components.size());
}

/**
 * @brief this method prints a number of gates for each variable
 * @tparam FF
 * @tparam CircuitBuilder
 */

template <typename FF, typename CircuitBuilder> void StaticAnalyzer_<FF, CircuitBuilder>::print_variables_gate_counts()
{
    for (const auto& it : variables_gate_counts) {
        info("number of gates with variables ", it.first, " == ", it.second);
    }
}

/**
 * @brief this method prints all information about arithmetic gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_arithmetic_gate_info(size_t gate_index, auto& block)
{
    auto q_arith = read_gate_selector(block, GateKind::Arith, gate_index);
    if (!q_arith.is_zero()) {
        info("q_arith == ", q_arith);
        // fisrtly, print selectors for standard plonk gate
        info("q_m == ", block.q_m()[gate_index]);
        info("q1 == ", block.q_1()[gate_index]);
        info("q2 == ", block.q_2()[gate_index]);
        info("q3 == ", block.q_3()[gate_index]);
        info("q4 == ", block.q_4()[gate_index]);
        info("q_c == ", block.q_c()[gate_index]);

        if (q_arith == FF(2)) {
            // we have to print w_4_shift from next gate
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        }
        if (q_arith == FF(3)) {
            // we have to print w_4_shift and w_1_shift from the next gate
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about elliptic gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */
template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_elliptic_gate_info(size_t gate_index, auto& block)
{
    auto q_elliptic = read_gate_selector(block, GateKind::Elliptic, gate_index);
    if (!q_elliptic.is_zero()) {
        info("q_elliptic == ", q_elliptic);
        info("q_1 == ", block.q_1()[gate_index]);
        info("q_m == ", block.q_m()[gate_index]);
        bool is_elliptic_add_gate = !block.q_1()[gate_index].is_zero() && block.q_m()[gate_index].is_zero();
        bool is_elliptic_dbl_gate = block.q_1()[gate_index].is_zero() && block.q_m()[gate_index] == FF::one();
        if (is_elliptic_add_gate) {
            info("x2 == ", block.w_l()[gate_index + 1]);
            info("x3 == ", block.w_r()[gate_index + 1]);
            info("y3 == ", block.w_o()[gate_index + 1]);
            info("y2 == ", block.w_4()[gate_index + 1]);
        }
        if (is_elliptic_dbl_gate) {
            info("x3 == ", block.w_r()[gate_index + 1]);
            info("y3 == ", block.w_o()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about plookup gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_plookup_gate_info(size_t gate_index, auto& block)
{
    auto q_lookup = read_gate_selector(block, GateKind::Lookup, gate_index);
    if (!q_lookup.is_zero()) {
        info("q_lookup == ", q_lookup);
        auto q_2 = block.q_2()[gate_index];
        auto q_m = block.q_m()[gate_index];
        auto q_c = block.q_c()[gate_index];
        info("q_2 == ", q_2);
        info("q_m == ", q_m);
        info("q_c == ", q_c);
        if (!q_2.is_zero()) {
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
        }
        if (!q_m.is_zero()) {
            info("w_2_shift == ", block.w_r()[gate_index + 1]);
        }
        if (!q_c.is_zero()) {
            info("w_3_shift == ", block.w_o()[gate_index + 1]);
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about range constrain gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_delta_range_gate_info(size_t gate_index, auto& block)
{
    auto q_delta_range = read_gate_selector(block, GateKind::DeltaRange, gate_index);
    if (!q_delta_range.is_zero()) {
        info("q_delta_range == ", q_delta_range);
        info("w_1 == ", block.w_l()[gate_index]);
        info("w_2 == ", block.w_r()[gate_index]);
        info("w_3 == ", block.w_o()[gate_index]);
        info("w_4 == ", block.w_4()[gate_index]);
        info("w_1_shift == ", block.w_l()[gate_index]);
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about poseidon2s gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_poseidon2s_gate_info(size_t gate_index, auto& block)
{
    auto external_selector = read_gate_selector(block, GateKind::Poseidon2Ext, gate_index);
    bool nonzero = !external_selector.is_zero();
    if constexpr (IsMegaBuilder<CircuitBuilder>) {
        nonzero = nonzero || !read_gate_selector(block, GateKind::Poseidon2ExtInitial, gate_index).is_zero() ||
                  !read_gate_selector(block, GateKind::Poseidon2QuadInt, gate_index).is_zero();
    } else {
        nonzero = nonzero || !read_gate_selector(block, GateKind::Poseidon2Int, gate_index).is_zero();
    }
    if (nonzero) {
        info("q_poseidon2_external == ", external_selector);
        if constexpr (IsMegaBuilder<CircuitBuilder>) {
            info("q_poseidon2_external_initial == ",
                 read_gate_selector(block, GateKind::Poseidon2ExtInitial, gate_index));
            info("q_poseidon2_quad_internal == ", read_gate_selector(block, GateKind::Poseidon2QuadInt, gate_index));
        } else {
            info("q_poseidon2_internal == ", read_gate_selector(block, GateKind::Poseidon2Int, gate_index));
        }
        info("w_1 == ", block.w_l()[gate_index]);
        info("w_2 == ", block.w_r()[gate_index]);
        info("w_3 == ", block.w_o()[gate_index]);
        info("w_4 == ", block.w_4()[gate_index]);
        info("w_1_shift == ", block.w_l()[gate_index + 1]);
        info("w_2_shift == ", block.w_r()[gate_index + 1]);
        info("w_3_shift == ", block.w_o()[gate_index + 1]);
        info("w_4_shift == ", block.w_4()[gate_index + 1]);
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about non natife field gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_nnf_gate_info(size_t gate_idx, auto& block)
{
    auto q_nnf = read_gate_selector(block, GateKind::Nnf, gate_idx);
    if (!q_nnf.is_zero()) {
        info("q_nnf == ", q_nnf);
        auto q_2 = block.q_2()[gate_idx];
        auto q_3 = block.q_3()[gate_idx];
        auto q_4 = block.q_4()[gate_idx];
        auto q_m = block.q_m()[gate_idx];
        if (q_3 == FF::one() && q_4 == FF::one()) {
            info("w_1_shift == ", block.w_l()[gate_idx + 1]);
            info("w_2_shift == ", block.w_r()[gate_idx + 1]);

        } else if (q_3 == FF::one() && q_m == FF::one()) {
            info("w_1_shift == ", block.w_l()[gate_idx + 1]);
            info("w_2_shift == ", block.w_r()[gate_idx + 1]);
            info("w_3_shift == ", block.w_o()[gate_idx + 1]);
            info("w_4_shift == ", block.w_4()[gate_idx + 1]);
        } else if (q_2 == FF::one() && (q_3 == FF::one() || q_4 == FF::one() || q_m == FF::one())) {
            info("w_1_shift == ", block.w_l()[gate_idx + 1]);
            info("w_2_shift == ", block.w_r()[gate_idx + 1]);
            if (q_4 == FF::one() || q_m == FF::one()) {
                info("w_3_shift == ", block.w_o()[gate_idx + 1]);
                info("w_4_shift == ", block.w_4()[gate_idx + 1]);
            }
        }
    } else {
        return;
    }
}

/**
 * @brief this method prints all information about memory gate where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param block
 * @param gate_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_memory_gate_info(size_t gate_index, auto& block)
{
    auto q_memory = read_gate_selector(block, GateKind::Memory, gate_index);
    if (!q_memory.is_zero()) {
        info("q_memory == ", q_memory);
        auto q_1 = block.q_1()[gate_index];
        auto q_2 = block.q_2()[gate_index];
        auto q_3 = block.q_3()[gate_index];
        auto q_4 = block.q_4()[gate_index];
        if (q_1 == FF::one() && q_4 == FF::one()) {
            info("q_1 == ", q_1);
            info("q_4 == ", q_4);
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_2_shift == ", block.w_r()[gate_index + 1]);
        } else if (q_1 == FF::one() && q_2 == FF::one()) {
            info("q_1 == ", q_1);
            info("q_2 == ", q_2);
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        } else if (!q_3.is_zero()) {
            info("q_3 == ", q_3);
            info("w_1_shift == ", block.w_l()[gate_index + 1]);
            info("w_2_shift == ", block.w_r()[gate_index + 1]);
            info("w_3_shift == ", block.w_o()[gate_index + 1]);
            info("w_4_shift == ", block.w_4()[gate_index + 1]);
        }
    } else {
        return;
    }
}

template <typename FF, typename CircuitBuilder>
std::unordered_set<FF> StaticAnalyzer_<FF, CircuitBuilder>::get_rerun_varying_duplicate_values(
    const std::vector<const CircuitBuilder*>& rerun_builders) const
{
    std::unordered_set<FF> varying_values;
    for (const auto* rerun_builder : rerun_builders) {
        BB_ASSERT(rerun_builder != nullptr, "rerun builder pointer must not be null");
    }

    for (const auto& [value, index_set] : filtered_witness_value_map) {
        bool value_varies = false;
        for (const auto* rerun_builder : rerun_builders) {
            for (uint32_t index : index_set) {
                if (index >= rerun_builder->real_variable_index.size() ||
                    rerun_builder->real_variable_index[index] >= rerun_builder->get_variables().size() ||
                    rerun_builder->get_variable(index) != value) {
                    value_varies = true;
                    break;
                }
            }
            if (value_varies) {
                break;
            }
        }
        if (value_varies) {
            varying_values.insert(value);
        }
    }

    return varying_values;
}

/**
 * @brief this method prints all information about gates where variable was found
 * @tparam FF
 * @tparam CircuitBuilder
 * @param real_index
 */

template <typename FF, typename CircuitBuilder>
void StaticAnalyzer_<FF, CircuitBuilder>::print_variable_info(const uint32_t real_idx)
{
    using BlockType = std::conditional_t<IsMegaBuilder<CircuitBuilder>, bb::MegaTraceBlock, bb::UltraTraceBlock>;
    for (const auto& [key, gates] : variable_gates) {
        if (key.first == real_idx) {
            for (size_t i = 0; i < gates.size(); i++) {
                size_t gate_index = gates[i];
                // key.second is a pointer to the block
                auto& block = *const_cast<BlockType*>(static_cast<const BlockType*>(key.second));
                info("---- printing variables in this gate");
                info("w_l == ",
                     block.w_l()[gate_index],
                     " w_r == ",
                     block.w_r()[gate_index],
                     " w_o == ",
                     block.w_o()[gate_index],
                     " w_4 == ",
                     block.w_4()[gate_index]);
                info("---- printing gate info where variable with index ", key.first, " was found ----");
                print_arithmetic_gate_info(gate_index, block);
                print_elliptic_gate_info(gate_index, block);
                print_plookup_gate_info(gate_index, block);
                print_poseidon2s_gate_info(gate_index, block);
                print_delta_range_gate_info(gate_index, block);
                print_nnf_gate_info(gate_index, block);
                print_memory_gate_info(gate_index, block);
                if constexpr (IsMegaBuilder<CircuitBuilder>) {
                    auto q_databus = read_gate_selector(block, GateKind::BusRead, gate_index);
                    if (!q_databus.is_zero()) {
                        info("q_databus == ", q_databus);
                    }
                }
                info("---- finished printing ----");
            }
        }
    }
}

/**
 * @brief this functions was made for more convenient testing process
 * @tparam FF
 * @tparam CircuitBuilder
 * @return std::pair<std::vector<ConnectedComponent>, std::unordered_set<uint32_t>>
 * @details it's important to mention that if you want to use this function and get all
 * cc, you have to change flag filter_cc IN tests, because by default it's true
 */

template <typename FF, typename CircuitBuilder>
std::pair<std::vector<ConnectedComponent>, std::unordered_set<uint32_t>> StaticAnalyzer_<FF, CircuitBuilder>::
    analyze_circuit(bool filter_cc)
{
    auto variables_in_one_gate = get_variables_in_one_gate();
    find_connected_components();
    if (filter_cc) {
        std::vector<ConnectedComponent> main_connected_components;
        main_connected_components.reserve(connected_components.size());
        for (auto& cc : connected_components) {
            if (!cc.is_range_list_cc && !cc.is_finalize_cc && !cc.is_process_rom_cc) {
                main_connected_components.emplace_back(cc);
            }
        }
        return std::make_pair(std::move(main_connected_components), std::move(variables_in_one_gate));
    }
    return std::make_pair(connected_components, std::move(variables_in_one_gate));
}

template class StaticAnalyzer_<bb::fr, bb::UltraCircuitBuilder>;
template class StaticAnalyzer_<bb::fr, bb::MegaCircuitBuilder>;

} // namespace cdg
