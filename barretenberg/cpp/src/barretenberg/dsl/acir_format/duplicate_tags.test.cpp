#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
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

TEST(AcirReaderPolicy, RejectsUnknownProgramTag)
{
    msgpack::sbuffer buffer;
    msgpack::packer<msgpack::sbuffer> packer(buffer);
    packer.pack_map(2);
    packer.pack(0);
    packer.pack_array(1);
    packer.pack_map(1);
    packer.pack(1);
    packer.pack_array(0);
    packer.pack(2);
    packer.pack_nil();
    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(marked_bytes(buffer), false), "unknown tag");
}

TEST(AcirReaderPolicy, ValidatesUnusedCircuitFields)
{
    for (uint32_t field : { 0U, 2U, 5U }) {
        SCOPED_TRACE(field);
        msgpack::sbuffer buffer;
        msgpack::packer<msgpack::sbuffer> packer(buffer);
        packer.pack_map(1);
        packer.pack(0);
        packer.pack_array(1);
        packer.pack_map(2);
        packer.pack(1);
        packer.pack_array(0);
        packer.pack(field);
        packer.pack_nil();
        EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(marked_bytes(buffer), false), "acir_format:");
    }
}

TEST(LookupRowPolicy, LastDuplicateWins)
{
    std::vector<bb::fr> a{ 1, 2, 1 }, b{ 3, 4, 3 }, c{ 5, 6, 5 };
    bb::plookup::LookupHashTable table;
    table.initialize(a, b, c);
    EXPECT_EQ(table.find({ 1, 3, 5 }, { &a, &b, &c }), 2U);
    EXPECT_EQ(table.find({ 2, 4, 6 }, { &a, &b, &c }), 1U);
}

TEST(AcirReaderPolicy, WitnessStructsRejectUnknownTags)
{
    for (bool outer : { false, true }) {
        msgpack::sbuffer buffer;
        msgpack::packer<msgpack::sbuffer> packer(buffer);
        packer.pack_map(outer ? 2 : 1);
        packer.pack(0);
        packer.pack_array(1);
        packer.pack_map(outer ? 2 : 3);
        packer.pack(0);
        packer.pack(0);
        packer.pack(1);
        packer.pack_map(0);
        packer.pack(outer ? 1 : 2);
        packer.pack_nil();
        EXPECT_THROW_WITH_MESSAGE(witness_buf_to_witness_vector(marked_bytes(buffer)), "unknown tag");
    }
}

TEST(AcirReaderPolicy, ProgramContainerSizeLimit)
{
    for (bool array : { false, true }) {
        msgpack::sbuffer buffer;
        msgpack::packer<msgpack::sbuffer> packer(buffer);
        if (array) {
            packer.pack_array(3);
        } else {
            packer.pack_map(3);
            packer.pack(std::string("functions"));
        }
        packer.pack_array(1);
        packer.pack_map(1);
        packer.pack(1);
        packer.pack_array(0);
        if (!array) {
            packer.pack(std::string("unconstrained_functions"));
        }
        packer.pack_nil();
        if (!array) {
            packer.pack(std::string("extra"));
        }
        packer.pack_nil();
        EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(marked_bytes(buffer), false), "too many fields");
    }
}

TEST(AcirReaderPolicy, CircuitAcceptsUnknownTags)
{
    msgpack::sbuffer buffer;
    msgpack::packer<msgpack::sbuffer> packer(buffer);
    packer.pack_map(1);
    packer.pack(0);
    packer.pack_array(1);
    packer.pack_map(2);
    packer.pack(1);
    packer.pack_array(0);
    packer.pack(6);
    packer.pack_nil();
    EXPECT_EQ(circuit_buf_to_acir_format(marked_bytes(buffer), false).num_acir_opcodes, 0U);
}

TEST(AcirReaderPolicy, FailureDoesNotReturnInWarnMode)
{
    BB_DISABLE_ASSERTS();
    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(std::vector<uint8_t>{ 0x04, 0xc0 }, false),
                              "expected an array or map");
}

TEST(LookupRowPolicy, MissingEntryFailsImmediately)
{
    std::vector<bb::fr> a{ 1 }, b{ 3 }, c{ 5 };
    bb::plookup::LookupHashTable table;
    table.initialize(a, b, c);
    EXPECT_THROW_WITH_MESSAGE((table.find({ 2, 3, 5 }, { &a, &b, &c })), "Key not found");
}

} // namespace
} // namespace acir_format
