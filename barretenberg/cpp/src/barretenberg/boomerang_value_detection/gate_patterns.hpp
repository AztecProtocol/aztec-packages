// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string_view>
#include <vector>

namespace bb::gate_patterns {

enum class Wire : uint8_t {
    W_L,
    W_R,
    W_O,
    W_4,
    W_L_SHIFT,
    W_R_SHIFT,
    W_O_SHIFT,
    W_4_SHIFT,
};

/**
 * @brief Selector values read from a gate
 *
 * Each block type only activates one relation, so we don't need to check
 * which relation is active. We just need the selector values to determine
 * which wires are constrained within that relation.
 */
struct Selectors {
    // The gate selector value (q_arith, q_elliptic, etc. depending on block)
    int64_t gate_selector = 0;

    // Secondary selectors (can be arbitrary field elements, so track non-zero)
    bool q_m_nz = false;
    bool q_1_nz = false;
    bool q_2_nz = false;
    bool q_3_nz = false;
    bool q_4_nz = false;
    bool q_c_nz = false;
};

using Predicate = std::function<bool(const Selectors&)>;

struct WireSpec {
    Wire wire;
    Predicate condition = [](const Selectors&) { return true; };
};

/**
 * @brief Pattern defining which wires are constrained by a gate type
 *
 * Each block type maps to exactly one pattern. The pattern specifies
 * which wires are constrained based on selector values.
 */
struct GatePattern {
    std::string_view name;
    std::vector<WireSpec> wires;
};

// ============================================================================
// Arithmetic Pattern (from ultra_arithmetic_relation.hpp)
//
// Subrelation 1:
//   q_arith * [ (-1/2) * (q_arith - 3) * (q_m * w_1 * w_2)
//             + q_1*w_1 + q_2*w_2 + q_3*w_3 + q_4*w_4 + q_c
//             + (q_arith - 1) * w_4_shift ]
//
// Subrelation 2 (only when q_arith == 3):
//   q_arith * (q_arith-1) * (q_arith-2) * (w_1 + w_4 - w_1_shift + q_m)
//
// gate_selector = q_arith
// ============================================================================

inline const GatePattern
    ARITHMETIC = { .name = "arithmetic",
                   .wires = {
                       // w_l: linear term OR mul term (disabled when q_arith==3) OR subrel2
                       { Wire::W_L,
                         [](const Selectors& sel) {
                             return sel.q_1_nz || (sel.q_m_nz && sel.gate_selector != 3) || sel.gate_selector == 3;
                         } },
                       // w_r: linear term OR mul term (disabled when q_arith==3)
                       { Wire::W_R,
                         [](const Selectors& sel) { return sel.q_2_nz || (sel.q_m_nz && sel.gate_selector != 3); } },
                       // w_o: linear term
                       { Wire::W_O, [](const Selectors& sel) { return sel.q_3_nz; } },
                       // w_4: linear term OR subrel2 (subrel2 active when q_arith == 3)
                       { Wire::W_4, [](const Selectors& sel) { return sel.q_4_nz || sel.gate_selector == 3; } },
                       // w_4_shift: when q_arith == 2 or 3 (subrel1 has (q_arith - 1) * w_4_shift)
                       { Wire::W_4_SHIFT,
                         [](const Selectors& sel) { return sel.gate_selector == 2 || sel.gate_selector == 3; } },
                       // w_l_shift: subrel2 when q_arith == 3
                       { Wire::W_L_SHIFT, [](const Selectors& sel) { return sel.gate_selector == 3; } },
                   } };

// ============================================================================
// Elliptic Pattern (from elliptic_relation.hpp)
//
// Point addition (q_is_double == 0, i.e., q_m == 0):
//   x1 = w_r, y1 = w_o, x2 = w_l_shift, x3 = w_r_shift, y3 = w_o_shift, y2 = w_4_shift
//
// Point doubling (q_is_double == 1, i.e., q_m == 1):
//   x1 = w_r, y1 = w_o, x3 = w_r_shift, y3 = w_o_shift
//
// gate_selector = q_elliptic
// ============================================================================

inline const GatePattern ELLIPTIC = { .name = "elliptic",
                                      .wires = {
                                          // x1, y1: always used (both addition and doubling)
                                          { Wire::W_R, [](const Selectors&) { return true; } },
                                          { Wire::W_O, [](const Selectors&) { return true; } },
                                          // x3, y3: always used (both addition and doubling)
                                          { Wire::W_R_SHIFT, [](const Selectors&) { return true; } },
                                          { Wire::W_O_SHIFT, [](const Selectors&) { return true; } },
                                          // x2: only for addition (q_m == 0)
                                          { Wire::W_L_SHIFT, [](const Selectors& sel) { return !sel.q_m_nz; } },
                                          // y2: only for addition (q_m == 0)
                                          { Wire::W_4_SHIFT, [](const Selectors& sel) { return !sel.q_m_nz; } },
                                      } };

// ============================================================================
// Non-Native Field Pattern (from non_native_field_relation.hpp)
//
// | gate type     | q_2 | q_3 | q_4 | q_m | wires constrained                              |
// |---------------|-----|-----|-----|-----|------------------------------------------------|
// | Limb Accum 1  | 0   | 1   | 1   | 0   | w_l, w_r, w_o, w_4, w_l', w_r'                 |
// | Limb Accum 2  | 0   | 1   | 0   | 1   | w_o, w_4, w_l', w_r', w_o', w_4'               |
// | Product 1     | 1   | 1   | 0   | 0   | w_l, w_r, w_o, w_4, w_l', w_r'                 |
// | Product 2     | 1   | 0   | 1   | 0   | all 8 wires                                    |
// | Product 3     | 1   | 0   | 0   | 1   | w_l, w_r, w_4, w_l', w_r', w_o', w_4'          |
//
// gate_selector = q_nnf
// ============================================================================

namespace nnf_helpers {
// Limb Accum 2: !q_2 && q_3 && !q_4 && q_m
inline bool is_limb_accum_2(const Selectors& sel)
{
    return !sel.q_2_nz && sel.q_3_nz && !sel.q_4_nz && sel.q_m_nz;
}
// Product 3: q_2 && !q_3 && !q_4 && q_m
inline bool is_product_3(const Selectors& sel)
{
    return sel.q_2_nz && !sel.q_3_nz && !sel.q_4_nz && sel.q_m_nz;
}
} // namespace nnf_helpers

inline const GatePattern
    NON_NATIVE_FIELD = { .name = "non_native_field",
                         .wires = {
                             // w_l, w_r: all gates except Limb Accum 2
                             { Wire::W_L, [](const Selectors& sel) { return !nnf_helpers::is_limb_accum_2(sel); } },
                             { Wire::W_R, [](const Selectors& sel) { return !nnf_helpers::is_limb_accum_2(sel); } },
                             // w_o: all gates except Product 3
                             { Wire::W_O, [](const Selectors& sel) { return !nnf_helpers::is_product_3(sel); } },
                             // w_4: all gates
                             { Wire::W_4, [](const Selectors&) { return true; } },
                             // w_l_shift, w_r_shift: all gates
                             { Wire::W_L_SHIFT, [](const Selectors&) { return true; } },
                             { Wire::W_R_SHIFT, [](const Selectors&) { return true; } },
                             // w_o_shift, w_4_shift: Limb Accum 2, Product 2, Product 3
                             // = q_m || (q_2 && q_4)
                             { Wire::W_O_SHIFT,
                               [](const Selectors& sel) { return sel.q_m_nz || (sel.q_2_nz && sel.q_4_nz); } },
                             { Wire::W_4_SHIFT,
                               [](const Selectors& sel) { return sel.q_m_nz || (sel.q_2_nz && sel.q_4_nz); } },
                         } };

// ============================================================================
// Memory Pattern (from memory_relation.hpp)
//
// | gate type           | q_1 | q_2 | q_3 | q_4 | q_m | wires constrained            |
// |---------------------|-----|-----|-----|-----|-----|------------------------------|
// | RAM/ROM access      | 1   | 0   | 0   | 0   | 1   | w_l, w_r, w_o, w_4           |
// | RAM timestamp check | 1   | 0   | 0   | 1   | 0   | w_l, w_r, w_o, w_l', w_r'    |
// | ROM consistency     | 1   | 1   | 0   | 0   | 0   | w_l, w_l', w_4, w_4'         |
// | RAM consistency     | 0   | 0   | 1   | 0   | 0   | all 8 wires                  |
//
// gate_selector = q_memory
// ============================================================================

namespace memory_helpers {
// RAM timestamp check: q_1 && q_4
inline bool is_timestamp_check(const Selectors& sel)
{
    return sel.q_1_nz && sel.q_4_nz;
}
// ROM consistency: q_1 && q_2
inline bool is_rom_consistency(const Selectors& sel)
{
    return sel.q_1_nz && sel.q_2_nz;
}
// RAM consistency: q_3
inline bool is_ram_consistency(const Selectors& sel)
{
    return sel.q_3_nz;
}
} // namespace memory_helpers

// Note: Access gates (q_1 && q_m) are NOT handled here - they're processed separately
// via ROM/RAM transcript methods.
inline const GatePattern
    MEMORY = { .name = "memory",
               .wires = {
                   { Wire::W_L,
                     [](const Selectors& sel) {
                         return memory_helpers::is_timestamp_check(sel) || memory_helpers::is_rom_consistency(sel) ||
                                memory_helpers::is_ram_consistency(sel);
                     } },
                   { Wire::W_R,
                     [](const Selectors& sel) {
                         return memory_helpers::is_timestamp_check(sel) || memory_helpers::is_rom_consistency(sel) ||
                                memory_helpers::is_ram_consistency(sel);
                     } },
                   { Wire::W_O,
                     [](const Selectors& sel) {
                         return memory_helpers::is_timestamp_check(sel) || memory_helpers::is_rom_consistency(sel) ||
                                memory_helpers::is_ram_consistency(sel);
                     } },
                   { Wire::W_4,
                     [](const Selectors& sel) {
                         return memory_helpers::is_rom_consistency(sel) || memory_helpers::is_ram_consistency(sel);
                     } },
                   { Wire::W_L_SHIFT,
                     [](const Selectors& sel) {
                         return memory_helpers::is_timestamp_check(sel) || memory_helpers::is_rom_consistency(sel) ||
                                memory_helpers::is_ram_consistency(sel);
                     } },
                   { Wire::W_R_SHIFT,
                     [](const Selectors& sel) {
                         return memory_helpers::is_timestamp_check(sel) || memory_helpers::is_ram_consistency(sel);
                     } },
                   { Wire::W_O_SHIFT, [](const Selectors& sel) { return memory_helpers::is_ram_consistency(sel); } },
                   { Wire::W_4_SHIFT,
                     [](const Selectors& sel) {
                         return memory_helpers::is_rom_consistency(sel) || memory_helpers::is_ram_consistency(sel);
                     } },
               } };

// ============================================================================
// Lookup Pattern (from logderiv_lookup_relation.hpp)
//
// The read term uses: w_l, w_r, w_o (always)
// Shifted wires used when step_size != 0:
//   w_l_shift if q_2 (q_r) != 0
//   w_r_shift if q_m != 0
//   w_o_shift if q_c != 0
//
// gate_selector = q_lookup
// ============================================================================

inline const GatePattern LOOKUP = { .name = "lookup",
                                    .wires = {
                                        { Wire::W_L, [](const Selectors&) { return true; } },
                                        { Wire::W_R, [](const Selectors&) { return true; } },
                                        { Wire::W_O, [](const Selectors&) { return true; } },
                                        { Wire::W_L_SHIFT, [](const Selectors& sel) { return sel.q_2_nz; } },
                                        { Wire::W_R_SHIFT, [](const Selectors& sel) { return sel.q_m_nz; } },
                                        { Wire::W_O_SHIFT, [](const Selectors& sel) { return sel.q_c_nz; } },
                                    } };

// ============================================================================
// Delta Range Pattern (from delta_range_constraint_relation.hpp)
//
// D_0 = w_2 - w_1, D_1 = w_3 - w_2, D_2 = w_4 - w_3, D_3 = w_1_shift - w_4
//
// gate_selector = q_delta_range
// ============================================================================

inline const GatePattern DELTA_RANGE = { .name = "delta_range",
                                         .wires = {
                                             { Wire::W_L, [](const Selectors&) { return true; } },
                                             { Wire::W_R, [](const Selectors&) { return true; } },
                                             { Wire::W_O, [](const Selectors&) { return true; } },
                                             { Wire::W_4, [](const Selectors&) { return true; } },
                                             { Wire::W_L_SHIFT, [](const Selectors&) { return true; } },
                                         } };

// ============================================================================
// Poseidon2 Internal Pattern (from poseidon2_internal_relation.hpp)
//
// All 4 current wires and all 4 shifted wires are constrained
//
// gate_selector = q_poseidon2_internal
// ============================================================================

inline const GatePattern POSEIDON2_INTERNAL = { .name = "poseidon2_internal",
                                                .wires = {
                                                    { Wire::W_L, [](const Selectors&) { return true; } },
                                                    { Wire::W_R, [](const Selectors&) { return true; } },
                                                    { Wire::W_O, [](const Selectors&) { return true; } },
                                                    { Wire::W_4, [](const Selectors&) { return true; } },
                                                    { Wire::W_L_SHIFT, [](const Selectors&) { return true; } },
                                                    { Wire::W_R_SHIFT, [](const Selectors&) { return true; } },
                                                    { Wire::W_O_SHIFT, [](const Selectors&) { return true; } },
                                                    { Wire::W_4_SHIFT, [](const Selectors&) { return true; } },
                                                } };

// ============================================================================
// Poseidon2 External Pattern (from poseidon2_external_relation.hpp)
//
// All 4 current wires and all 4 shifted wires are constrained
//
// gate_selector = q_poseidon2_external
// ============================================================================

inline const GatePattern POSEIDON2_EXTERNAL = { .name = "poseidon2_external",
                                                .wires = {
                                                    { Wire::W_L, [](const Selectors&) { return true; } },
                                                    { Wire::W_R, [](const Selectors&) { return true; } },
                                                    { Wire::W_O, [](const Selectors&) { return true; } },
                                                    { Wire::W_4, [](const Selectors&) { return true; } },
                                                    { Wire::W_L_SHIFT, [](const Selectors&) { return true; } },
                                                    { Wire::W_R_SHIFT, [](const Selectors&) { return true; } },
                                                    { Wire::W_O_SHIFT, [](const Selectors&) { return true; } },
                                                    { Wire::W_4_SHIFT, [](const Selectors&) { return true; } },
                                                } };

// ============================================================================
// Databus Pattern (from databus_lookup_relation.hpp)
//
// Read term uses: w_l (value), w_r (index)
//
// gate_selector = q_busread
// ============================================================================

inline const GatePattern DATABUS = { .name = "databus",
                                     .wires = {
                                         { Wire::W_L, [](const Selectors&) { return true; } },
                                         { Wire::W_R, [](const Selectors&) { return true; } },
                                     } };

// ============================================================================
// ECC Op Pattern (from ecc_op_queue_relation.hpp)
//
// Constrains ecc_op_wires to equal shifted wires on ECC op domain.
// Uses: w_l_shift, w_r_shift, w_o_shift, w_4_shift
//
// gate_selector = lagrange_ecc_op (special precomputed selector)
// ============================================================================

inline const GatePattern ECC_OP = { .name = "ecc_op",
                                    .wires = {
                                        { Wire::W_L_SHIFT, [](const Selectors&) { return true; } },
                                        { Wire::W_R_SHIFT, [](const Selectors&) { return true; } },
                                        { Wire::W_O_SHIFT, [](const Selectors&) { return true; } },
                                        { Wire::W_4_SHIFT, [](const Selectors&) { return true; } },
                                    } };

// ============================================================================
// Helper functions
// ============================================================================

template <typename Block, typename GateSelectorColumn>
Selectors read_selectors(Block& block, size_t gate_index, const GateSelectorColumn& gate_selector_column)
{
    return Selectors{
        .gate_selector = static_cast<int64_t>(static_cast<uint64_t>(gate_selector_column[gate_index])),
        .q_m_nz = !block.q_m()[gate_index].is_zero(),
        .q_1_nz = !block.q_1()[gate_index].is_zero(),
        .q_2_nz = !block.q_2()[gate_index].is_zero(),
        .q_3_nz = !block.q_3()[gate_index].is_zero(),
        .q_4_nz = !block.q_4()[gate_index].is_zero(),
        .q_c_nz = !block.q_c()[gate_index].is_zero(),
    };
}

template <typename Block> uint32_t get_wire(Block& block, size_t gate_index, Wire wire)
{
    switch (wire) {
    case Wire::W_L:
        return block.w_l()[gate_index];
    case Wire::W_R:
        return block.w_r()[gate_index];
    case Wire::W_O:
        return block.w_o()[gate_index];
    case Wire::W_4:
        return block.w_4()[gate_index];
    case Wire::W_L_SHIFT:
        return block.w_l()[gate_index + 1];
    case Wire::W_R_SHIFT:
        return block.w_r()[gate_index + 1];
    case Wire::W_O_SHIFT:
        return block.w_o()[gate_index + 1];
    case Wire::W_4_SHIFT:
        return block.w_4()[gate_index + 1];
    }
    return 0;
}

inline bool is_shifted(Wire wire)
{
    return wire >= Wire::W_L_SHIFT;
}

template <typename Block>
std::vector<uint32_t> extract_wires(Block& block,
                                    size_t gate_index,
                                    const GatePattern& pattern,
                                    const Selectors& selectors)
{
    std::vector<uint32_t> result;
    for (const auto& wire_spec : pattern.wires) {
        // Bounds check for shifted wires
        if (is_shifted(wire_spec.wire) && gate_index + 1 >= block.size()) {
            continue;
        }
        if (wire_spec.condition(selectors)) {
            result.push_back(get_wire(block, gate_index, wire_spec.wire));
        }
    }
    return result;
}

} // namespace bb::gate_patterns
