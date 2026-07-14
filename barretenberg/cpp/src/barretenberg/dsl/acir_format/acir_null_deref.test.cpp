/**
 * @file acir_null_deref.test.cpp
 * @brief Exploit and fix tests for null shared_ptr dereference in ACIR deserialization.
 *
 * Demonstrates that crafted ACIR bytecode containing msgpack NIL values for
 * shared_ptr<array<T,N>> fields would produce a null pointer dereference in
 * acir_to_constraint_buf.cpp, and that the fix (rejecting NIL in conv_fld_from_kvmap
 * and conv_fld_from_array) prevents the crash.
 *
 * Attack vector: An attacker crafts raw ACIR bytecode (bypassing the Noir compiler)
 * containing a BlackBoxFuncCall opcode where a fixed-size array field is encoded as
 * msgpack NIL (0xc0). Without the fix, the AztecProtocol/msgpack-c fork silently
 * converts NIL to a null shared_ptr, which is then dereferenced unconditionally.
 * With the fix, deserialization rejects NIL for required fields and throws.
 */

#include <gtest/gtest.h>
#include <memory>
#include <regex>
#include <vector>

#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "serde/acir.hpp"

using namespace acir_format;

class AcirNullDerefTest : public ::testing::Test {};

/**
 * Helper: build a ProgramWithoutBrillig wire format by manually packing with msgpack.
 * We can't use ProgramWithoutBrillig::msgpack_pack because std::monostate lacks a pack adaptor.
 * Instead, we pack the structure by hand: ARRAY[ARRAY[circuit], NIL].
 */
static std::vector<uint8_t> serialize_program_with_circuit(const Acir::Circuit& circuit)
{
    msgpack::sbuffer sbuf;
    msgpack::packer<msgpack::sbuffer> packer(sbuf);

    // ProgramWithoutBrillig = ARRAY[functions, unconstrained_functions]
    packer.pack_array(2);

    // functions = ARRAY[circuit]
    packer.pack_array(1);
    packer.pack(circuit);

    // unconstrained_functions = NIL (std::monostate — ignored by ProgramWithoutBrillig::msgpack_unpack)
    packer.pack_nil();

    // Prepend format marker 0x03 (FORMAT_MSGPACK_COMPACT)
    std::vector<uint8_t> buf;
    buf.reserve(1 + sbuf.size());
    buf.push_back(0x03);
    buf.insert(buf.end(), sbuf.data(), sbuf.data() + sbuf.size());
    return buf;
}

// ============================================================================
// Exploit tests: These construct null shared_ptr directly in the struct,
// bypassing deserialization. They prove the dereference sites are unguarded.
// ============================================================================

TEST_F(AcirNullDerefTest, AES128Encrypt_NullIV_DirectCircuit_Crashes)
{
    Acir::BlackBoxFuncCall::AES128Encrypt aes_op{
        .inputs = {},
        .iv = nullptr,
        .key = nullptr,
        .outputs = {},
    };

    Acir::BlackBoxFuncCall bbfc;
    bbfc.value = aes_op;

    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ .value = bbfc } } },
        .public_parameters = {},
        .return_values = {},
    };

    // Dereferences nullptr at acir_to_constraint_buf.cpp:636: *arg.iv
    EXPECT_DEATH(circuit_serde_to_acir_format(circuit, /*is_mega=*/false), "");
}

TEST_F(AcirNullDerefTest, Keccakf1600_NullInputs_DirectCircuit_Crashes)
{
    Acir::BlackBoxFuncCall::Keccakf1600 keccak_op{
        .inputs = nullptr,
        .outputs = nullptr,
    };

    Acir::BlackBoxFuncCall bbfc;
    bbfc.value = keccak_op;

    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ .value = bbfc } } },
        .public_parameters = {},
        .return_values = {},
    };

    // Dereferences nullptr at acir_to_constraint_buf.cpp:716: *arg.inputs
    EXPECT_DEATH(circuit_serde_to_acir_format(circuit, /*is_mega=*/false), "");
}

TEST_F(AcirNullDerefTest, Sha256Compression_NullInputs_DirectCircuit_Crashes)
{
    Acir::BlackBoxFuncCall::Sha256Compression sha_op{
        .inputs = nullptr,
        .hash_values = nullptr,
        .outputs = nullptr,
    };

    Acir::BlackBoxFuncCall bbfc;
    bbfc.value = sha_op;

    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ .value = bbfc } } },
        .public_parameters = {},
        .return_values = {},
    };

    // Dereferences nullptr at acir_to_constraint_buf.cpp:644: *arg.inputs
    EXPECT_DEATH(circuit_serde_to_acir_format(circuit, /*is_mega=*/false), "");
}

// ============================================================================
// Fix tests: These go through the deserialization path (raw bytes or msgpack
// roundtrip). The fix in conv_fld_from_array rejects NIL before it can become
// a null shared_ptr, throwing instead of crashing.
// ============================================================================

TEST_F(AcirNullDerefTest, AES128Encrypt_NullIV_FromBytes_ThrowsAfterFix)
{
    Acir::BlackBoxFuncCall::AES128Encrypt aes_op{
        .inputs = {},
        .iv = nullptr, // Serialized as NIL (0xc0)
        .key = nullptr,
        .outputs = {},
    };

    Acir::BlackBoxFuncCall bbfc;
    bbfc.value = aes_op;

    Acir::Circuit circuit{
        .opcodes = { Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ .value = bbfc } } },
        .public_parameters = {},
        .return_values = {},
    };

    auto buf = serialize_program_with_circuit(circuit);

    // Verify the buffer contains NIL byte (0xc0) from the null shared_ptr
    size_t nil_count = 0;
    for (uint8_t b : buf) {
        if (b == 0xc0) {
            nil_count++;
        }
    }
    ASSERT_GE(nil_count, 2U) << "Buffer must contain at least 2 NIL (0xc0) bytes for null iv and key";

    // After fix: deserialization rejects NIL for required fields → throws instead of SIGSEGV
    EXPECT_THROW_WITH_MESSAGE(circuit_buf_to_acir_format(std::move(buf), /*is_mega=*/false),
                              "nil value for required field");
}

TEST_F(AcirNullDerefTest, NullSharedPtr_RejectedByMsgpackRoundtrip)
{
    // After the fix, a null shared_ptr encoded as NIL is rejected during deserialization.
    // conv_fld_from_array detects NIL at the array slot and throws before converting.
    Acir::BlackBoxFuncCall::AES128Encrypt original{
        .inputs = {},
        .iv = nullptr,
        .key = nullptr,
        .outputs = {},
    };

    // Serialize (null shared_ptr → NIL byte 0xc0)
    msgpack::sbuffer sbuf;
    msgpack::pack(sbuf, original);

    // Deserialize — should throw because iv slot is NIL
    auto oh = msgpack::unpack(sbuf.data(), sbuf.size());
    Acir::BlackBoxFuncCall::AES128Encrypt deserialized;
    EXPECT_THROW_WITH_MESSAGE(oh.get().convert(deserialized), "nil value for required field");
}
