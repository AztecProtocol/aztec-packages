#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::constraining {
using simulation::OperandType;
namespace {

// We use a map from opcode to an array of pairs of size_t
// Each array index corresponds to an operand or indirect value.
// We reserve index 0 for indirect value and then the successive indices
// for all other operands (tags or immediate are included) appearing in order
// any value in map WireOpCode_WIRE_FORMAT.
// Each pair denotes the byte offset and respectively its length.
//
// Example CAST_8: { OperandType::INDIRECT8, OperandType::UINT8, OperandType::UINT8, OperandType::TAG }
// [{0,1}, {1,1}, {2,1}, {3, 1}]
//
// Example SET_128: { OperandType::INDIRECT8, OperandType::UINT16, OperandType::TAG, OperandType::UINT128 }
// [{0,1}, {1,2}, {3,1}, {4,16}]
//
// Example JUMP_32: { OperandType::UINT32 }
// [{0,0}, {0, 4}]

struct OperandLayout {
    uint8_t offset = 0;
    uint8_t len = 0;
};

struct Partition {
    uint128_t subset_1;
    uint128_t subset_2;
    uint128_t union_subset;
};

// Note that array of length needs to be 8 to cover ECADD opcode.
std::unordered_map<WireOpCode, std::array<OperandLayout, 8>> gen_opcode_to_operands_layout()
{
    std::unordered_map<WireOpCode, std::array<OperandLayout, 8>> mapping;

    for (const auto& [opcode, format] : simulation::WireOpCode_WIRE_FORMAT) {
        std::array<OperandLayout, 8> operands_layout_array;
        uint8_t op_idx = 1; // We start at index 1 because the index zero is reserved for indirect value.
        uint8_t byte_offset = 0;

        for (const auto& operand : format) {
            const auto operand_len = static_cast<uint8_t>(simulation::OPERAND_TYPE_SIZE_BYTES.at(operand));
            const auto op_layout = OperandLayout{ .offset = byte_offset, .len = operand_len };

            if (operand == OperandType::INDIRECT8 || operand == OperandType::INDIRECT16) {
                operands_layout_array[0] = op_layout;
            } else {
                operands_layout_array[op_idx++] = op_layout;
            }
            byte_offset += operand_len;
        }
        mapping.insert(std::make_pair(opcode, operands_layout_array));
    }
    return mapping;
}

uint32_t encode_operand_idx_with_layout(uint8_t operand_idx, uint8_t offset, uint8_t len)
{
    uint32_t layout = len;
    layout += (static_cast<uint32_t>(offset) << 8);
    layout += (static_cast<uint32_t>(operand_idx) << 16);
    return layout;
}

uint8_t get_op_idx(uint32_t op_idx_with_layout)
{
    return static_cast<uint8_t>(op_idx_with_layout >> 16);
}

OperandLayout get_op_layout(uint32_t op_idx_with_layout)
{
    uint8_t offset = static_cast<uint8_t>((op_idx_with_layout >> 8) & 0xFF);
    uint8_t len = static_cast<uint8_t>(op_idx_with_layout & 0xFF);
    return OperandLayout{ .offset = offset, .len = len };
}

uint128_t encode_subset_wire_opcodes(const std::unordered_set<WireOpCode>& set)
{
    std::string list_opcodes;
    for (const auto& el : set) {
        list_opcodes += format(", ", el);
    }
    info(list_opcodes);

    uint128_t value = 0;
    for (const auto& wire_opcode : set) {
        value += (static_cast<uint128_t>(1) << static_cast<uint8_t>(wire_opcode));
    }

    return value;
}

[[__maybe_unused__]] uint64_t encode_format(const std::array<std::pair<uint32_t, uint32_t>, 8>& format_array)
{
    uint64_t format = 0;
    for (uint8_t i = 0; i < 8; i++) {
        format += (static_cast<uint64_t>(format_array[i].second) << (8 * i));
    }

    info("ENCODE FORMAT: ", format);
    return format;
}

std::string render_selector_array(WireOpCode wire_opcode, const std::vector<uint128_t>& sel_bitmasks)
{
    size_t num_of_selectors = sel_bitmasks.size();
    std::vector<bool> selectors;
    selectors.reserve(num_of_selectors);

    for (const auto& bitmask : sel_bitmasks) {
        selectors.push_back(((static_cast<uint128_t>(1) << static_cast<uint128_t>(wire_opcode)) & bitmask) != 0);
    }

    std::string output = format("{", selectors[0]);
    for (size_t i = 1; i < num_of_selectors; i++) {
        output += format(", ", selectors[i]);
    }
    output += "}";
    return output;
}

auto add_fold = [](const std::string& a, const std::string& b) { return a + " + " + b; };

// Write pol sel_i = sel_j + sel_k
std::string render_partitions_pil(const std::vector<Partition>& partitions,
                                  const std::unordered_map<uint128_t, size_t>& bitmask_to_sel_idx)
{
    std::string output;
    for (const auto& partition : partitions) {
        output += format("pol sel_", bitmask_to_sel_idx.at(partition.union_subset));
        output += format(" = sel_", bitmask_to_sel_idx.at(partition.subset_1));
        output += format(" + sel_", bitmask_to_sel_idx.at(partition.subset_2), ";\n");
    }
    return output;
}

// Output the string:
std::string render_operand_layout_pil(OperandLayout layout)
{
    std::vector<std::string> monomials;
    uint8_t byte_offset = layout.offset;
    for (int i = 0; i < layout.len; i++) {
        monomials.push_back(format("byte_", byte_offset + i, " * 2**", 8 * i));
    }

    return std::accumulate(std::next(monomials.begin()), monomials.end(), monomials[0], add_fold);
}

std::string render_pil(const std::array<std::vector<std::pair<size_t, OperandLayout>>, 8>& sel_layout_breakdowns)
{
    std::string pil_equations;
    for (uint8_t i = 0; i < 8; i++) {
        pil_equations += (i == 0) ? "indirect = " : format("op_", static_cast<uint32_t>(i), " = ");

        std::vector<std::string> additive_terms;
        for (const auto& sel_layout : sel_layout_breakdowns[i]) {
            additive_terms.push_back(
                format("sel_", sel_layout.first, " * (", render_operand_layout_pil(sel_layout.second), ")"));
        }
        pil_equations +=
            std::accumulate(std::next(additive_terms.begin()), additive_terms.end(), additive_terms[0], add_fold);
        pil_equations += ";\n";
    }
    return pil_equations;
}

TEST(DecompositionSelectors, Basic)
{
    // Map any given operand idx with layout to a subset of wire opcodes where
    // we encode an operand idx with OperandLayout into a uint32_t.
    std::unordered_map<uint32_t, std::unordered_set<WireOpCode>> op_idx_with_layout_to_subset;

    std::unordered_map<WireOpCode, std::array<OperandLayout, 8>> opcode_to_layouts = gen_opcode_to_operands_layout();
    for (const auto& [wire_opcode, operand_layouts] : opcode_to_layouts) {
        for (uint8_t i = 0; i < 8; i++) {
            const auto& layout = operand_layouts[i];
            if (layout.len != 0) {
                const auto key = encode_operand_idx_with_layout(i, layout.offset, layout.len);
                if (op_idx_with_layout_to_subset.contains(key)) {
                    op_idx_with_layout_to_subset[key].insert(wire_opcode);
                } else {
                    op_idx_with_layout_to_subset[key] = { wire_opcode };
                }
            }
        }
    }

    std::unordered_set<uint128_t> set_of_bitmasks;
    std::unordered_map<uint32_t, uint128_t> op_idx_with_layout_to_bitmask;

    for (const auto& [op_layout, subset] : op_idx_with_layout_to_subset) {
        const auto encoded = encode_subset_wire_opcodes(subset);
        info("encoded subset of opcodes: ", encoded);
        set_of_bitmasks.insert(encoded);
        op_idx_with_layout_to_bitmask.insert(std::make_pair(op_layout, encoded));
    }

    info("NUMBER OF SUBSETS: ", set_of_bitmasks.size());

    // Is there any union of two disjoint subsets equal to another one?
    bool partition_found = true;
    std::vector<Partition> partitions;

    // We try to remove partitions in a naive way, basically we remove the first encountered
    // partition one after the other. This is by no way an exhaustive algorithm to find a hierarchy
    // of partitions. This does the job as we have only one partition with the current AVM design.
    while (partition_found) {
        for (auto it1 = set_of_bitmasks.begin(); it1 != set_of_bitmasks.end(); it1++) {
            auto it2 = it1;
            for (it2++; it2 != set_of_bitmasks.end(); it2++) {
                uint128_t sub_union = *it1 | *it2;
                if ((*it1 & *it2) == 0 && set_of_bitmasks.contains(sub_union)) {
                    info("UNION FOUND! ", *it1, "  ", *it2, "  ", sub_union);
                    partitions.push_back(Partition{ .subset_1 = *it1, .subset_2 = *it2, .union_subset = sub_union });
                    set_of_bitmasks.erase(sub_union);
                    partition_found = true;
                    break;
                }
                partition_found = false;
            }
            if (partition_found) { // Mechanism to exit the outer loop
                break;
            }
        }
    }

    info("NUMBER OF SUBSETS AFTER PARTITION REMOVAL: ", set_of_bitmasks.size());

    std::vector<uint128_t> bitmasks_vector;
    std::copy(set_of_bitmasks.begin(), set_of_bitmasks.end(), std::back_inserter(bitmasks_vector));

    // Ensure a deterministic order
    std::sort(bitmasks_vector.begin(), bitmasks_vector.end(), std::greater<>());

    info("#################################");
    info(" Precomputed Selectors Table:");
    info("#################################\n");

    for (int i = 0; i < static_cast<int>(WireOpCode::LAST_OPCODE_SENTINEL); i++) {
        const auto wire_opcode = static_cast<WireOpCode>(i);
        if (simulation::WireOpCode_WIRE_FORMAT.contains(wire_opcode)) {
            info("{WireOpCode::", wire_opcode, ", ", render_selector_array(wire_opcode, bitmasks_vector), ",");
        }
    }

    // Add subsets/bitmasks which were removed as unions at the end.
    for (const auto& partition : partitions) {
        bitmasks_vector.push_back(partition.union_subset);
    }

    std::unordered_map<uint128_t, size_t> bitmask_to_sel_idx;

    for (size_t i = 0; i < bitmasks_vector.size(); i++) {
        bitmask_to_sel_idx.insert(std::make_pair(bitmasks_vector[i], i));
    }

    // For each operand (index of the array), we store a vector of (selector, layout) corresponding to
    // the decomposition of the operand.
    // op_1 = sel_1 * (bc_1 + bc_2 * 2^8) + sel_4 * (bc_5 + bc_6 * 2^8)
    std::array<std::vector<std::pair<size_t, OperandLayout>>, 8> sel_layout_breakdowns;
    for (const auto& [op_idx_with_layout, bitmask] : op_idx_with_layout_to_bitmask) {
        uint8_t op_idx = get_op_idx(op_idx_with_layout);
        OperandLayout layout = get_op_layout(op_idx_with_layout);
        size_t sel_idx = bitmask_to_sel_idx.at(bitmask);
        sel_layout_breakdowns[op_idx].emplace_back(std::make_pair(sel_idx, layout));
    }

    // For each sel-layout breakdown vector, we sort by increasing selector indices.
    for (uint8_t i = 0; i < 8; i++) {
        std::sort(
            sel_layout_breakdowns[i].begin(),
            sel_layout_breakdowns[i].end(),
            [](std::pair<size_t, OperandLayout> a, std::pair<size_t, OperandLayout> b) { return a.first < b.first; });
    }

    info("\n##################");
    info("PIL Relations:");
    info("##################\n");

    info(render_partitions_pil(partitions, bitmask_to_sel_idx));
    info(render_pil(sel_layout_breakdowns));

    // Finding out how many different formats.
    // std::unordered_set<uint64_t> format_set;

    // for (const auto& [wire_opcode, operand_layouts] : opcode_to_layouts) {
    //     info("wire opcode: ", wire_opcode);
    //     format_set.insert(encode_format(operand_layouts));
    // }

    // info("NUMBER OF FORMATS: ", format_set.size());
}

} // namespace
} // namespace bb::avm2::constraining