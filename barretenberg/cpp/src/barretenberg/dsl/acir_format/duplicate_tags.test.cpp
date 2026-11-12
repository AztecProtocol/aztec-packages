#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <gtest/gtest.h>

namespace acir_format {
namespace {

std::vector<uint8_t> marked_bytes(const msgpack::sbuffer& buffer)
{
    std::vector<uint8_t> bytes{ 0x04 };
    bytes.insert(bytes.end(), buffer.data(), buffer.data() + buffer.size());
    return bytes;
}

TEST(AcirDuplicateTags, ProgramAndCircuitFields)
{
    for (bool duplicate_functions : { false, true }) {
        for (uint32_t count : { 1U, 2U }) {
            SCOPED_TRACE(duplicate_functions ? "functions" : "opcodes");
            SCOPED_TRACE(count);
            msgpack::sbuffer buffer;
            msgpack::packer<msgpack::sbuffer> packer(buffer);
            packer.pack_map(duplicate_functions ? count : 1);
            for (uint32_t function = 0; function < (duplicate_functions ? count : 1); ++function) {
                packer.pack(0);
                packer.pack_array(1);
                packer.pack_map(duplicate_functions ? 1 : count);
                for (uint32_t opcode = 0; opcode < (duplicate_functions ? 1 : count); ++opcode) {
                    packer.pack(1);
                    packer.pack_array(0);
                }
            }
            for (bool is_mega : { false, true }) {
                if (count == 1) {
                    EXPECT_EQ(circuit_buf_to_acir_format(marked_bytes(buffer), is_mega).num_acir_opcodes, 0U);
                } else {
                    const char* message = duplicate_functions ? "duplicate field 'functions' in ProgramWithoutBrillig"
                                                              : "duplicate field 'opcodes' in Circuit";
                    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(marked_bytes(buffer), is_mega), message);
                }
            }
        }
    }
}

TEST(AcirDuplicateTags, WitnessContainerFields)
{
    for (uint32_t field : { 0U, 1U, 2U }) {
        for (uint32_t count : { 1U, 2U }) {
            SCOPED_TRACE(field);
            SCOPED_TRACE(count);
            msgpack::sbuffer buffer;
            msgpack::packer<msgpack::sbuffer> packer(buffer);
            packer.pack_map(field == 0 ? count : 1);
            for (uint32_t stack = 0; stack < (field == 0 ? count : 1); ++stack) {
                packer.pack(0);
                packer.pack_array(1);
                packer.pack_map(field == 0 ? 2 : count + 1);
                for (uint32_t index = 0; index < (field == 1 ? count : 1); ++index) {
                    packer.pack(0);
                    packer.pack(0);
                }
                for (uint32_t witness = 0; witness < (field == 2 ? count : 1); ++witness) {
                    packer.pack(1);
                    packer.pack_map(0);
                }
            }
            if (count == 1) {
                EXPECT_TRUE(witness_buf_to_witness_vector(marked_bytes(buffer)).empty());
            } else {
                const char* messages[] = { "duplicate field 'stack' in WitnessStack",
                                           "duplicate field 'index' in StackItem",
                                           "duplicate field 'witness' in StackItem" };
                EXPECT_THROW_WITH_MESSAGE(witness_buf_to_witness_vector(marked_bytes(buffer)), messages[field]);
            }
        }
    }
}

} // namespace
} // namespace acir_format
