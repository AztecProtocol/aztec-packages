#include "acir_to_constraint_buf.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <map>
#include <optional>
#include <ranges>
#include <span>
#include <string>
#include <string_view>
#include <tuple>
#include <utility>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/ecdsa_constraints.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"

namespace acir_format {

using namespace bb;

/// ========= HELPERS ========= ///

template <class... Ts> struct overloaded : Ts... {
    using Ts::operator()...;
};

bb::fr from_buffer_with_bound_checks(const std::vector<uint8_t>& buffer)
{
    BB_ASSERT_EQ(buffer.size(), 32U, "acir_format::from_buffer_with_bound_checks: buffer size must be 32 bytes.");
    return fr::serialize_from_buffer(buffer.data());
}

WitnessOrConstant<bb::fr> parse_input(const Acir::FunctionInput& input)
{
    WitnessOrConstant<bb::fr> result = std::visit(overloaded{ [](const Acir::FunctionInput::Witness& e) {
                                                                 return WitnessOrConstant<bb::fr>{
                                                                     .index = e.value.value,
                                                                     .value = bb::fr::zero(),
                                                                     .is_constant = false,
                                                                 };
                                                             },
                                                              [](const Acir::FunctionInput::Constant& e) {
                                                                  return WitnessOrConstant<bb::fr>{
                                                                      .index = bb::stdlib::IS_CONSTANT,
                                                                      .value = from_buffer_with_bound_checks(e.value),
                                                                      .is_constant = true,
                                                                  };
                                                              } },
                                                  input.value);
    return result;
}

uint32_t get_witness_from_function_input(const Acir::FunctionInput& input)
{
    BB_ASSERT(std::holds_alternative<Acir::FunctionInput::Witness>(input.value),
              "acir_format::get_witness_from_function_input: input must be a Witness variant. An error here means "
              "there was a serialization error.");

    return std::get<Acir::FunctionInput::Witness>(input.value).value.value;
}

void update_max_witness_index(const uint32_t witness_idx, AcirFormat& af)
{
    if (witness_idx != stdlib::IS_CONSTANT) {
        af.max_witness_index = std::max(af.max_witness_index, witness_idx);
    }
}

void update_max_witness_index_from_expression(Acir::Expression const& expr, AcirFormat& af)
{
    // Process multiplication terms: each term has two witness indices
    for (const auto& mul_term : expr.mul_terms) {
        update_max_witness_index(std::get<1>(mul_term).value, af);
        update_max_witness_index(std::get<2>(mul_term).value, af);
    }

    // Process linear combinations: each term has one witness index
    for (const auto& linear_term : expr.linear_combinations) {
        update_max_witness_index(std::get<1>(linear_term).value, af);
    }
}

void update_max_witness_index_from_opcode(Acir::Opcode const& opcode, AcirFormat& af)
{
    auto update_max_witness_index_from_function_input = [&](const Acir::FunctionInput& input) {
        if (std::holds_alternative<Acir::FunctionInput::Witness>(input.value)) {
            update_max_witness_index(std::get<Acir::FunctionInput::Witness>(input.value).value.value, af);
        }
    };

    auto update_max_witness_index_from_witness = [&](const Acir::Witness& witness) {
        update_max_witness_index(witness.value, af);
    };

    std::visit(
        overloaded{
            [&](const Acir::Opcode::AssertZero& arg) { update_max_witness_index_from_expression(arg.value, af); },
            [&](const Acir::Opcode::BlackBoxFuncCall& arg) {
                std::visit(overloaded{ [&](const Acir::BlackBoxFuncCall::AND& bb_arg) {
                                          update_max_witness_index_from_function_input(bb_arg.lhs);
                                          update_max_witness_index_from_function_input(bb_arg.rhs);
                                          update_max_witness_index_from_witness(bb_arg.output);
                                      },
                                       [&](const Acir::BlackBoxFuncCall::XOR& bb_arg) {
                                           update_max_witness_index_from_function_input(bb_arg.lhs);
                                           update_max_witness_index_from_function_input(bb_arg.rhs);
                                           update_max_witness_index_from_witness(bb_arg.output);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::RANGE& bb_arg) {
                                           update_max_witness_index_from_function_input(bb_arg.input);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::AES128Encrypt& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.iv) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.key) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Sha256Compression& bb_arg) {
                                           for (const auto& input : *bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.hash_values) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Blake2s& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Blake3& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::EcdsaSecp256k1& bb_arg) {
                                           for (const auto& input : *bb_arg.public_key_x) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.public_key_y) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.signature) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.hashed_message) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           update_max_witness_index_from_witness(bb_arg.output);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::EcdsaSecp256r1& bb_arg) {
                                           for (const auto& input : *bb_arg.public_key_x) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.public_key_y) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.signature) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.hashed_message) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           update_max_witness_index_from_witness(bb_arg.output);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::MultiScalarMul& bb_arg) {
                                           for (const auto& input : bb_arg.points) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : bb_arg.scalars) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::EmbeddedCurveAdd& bb_arg) {
                                           for (const auto& input : *bb_arg.input1) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : *bb_arg.input2) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Keccakf1600& bb_arg) {
                                           for (const auto& input : *bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : *bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       },
                                       [&](const Acir::BlackBoxFuncCall::RecursiveAggregation& bb_arg) {
                                           for (const auto& input : bb_arg.verification_key) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : bb_arg.proof) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& input : bb_arg.public_inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           update_max_witness_index_from_function_input(bb_arg.key_hash);
                                           update_max_witness_index_from_function_input(bb_arg.predicate);
                                       },
                                       [&](const Acir::BlackBoxFuncCall::Poseidon2Permutation& bb_arg) {
                                           for (const auto& input : bb_arg.inputs) {
                                               update_max_witness_index_from_function_input(input);
                                           }
                                           for (const auto& output : bb_arg.outputs) {
                                               update_max_witness_index_from_witness(output);
                                           }
                                       } },
                           arg.value.value);
            },
            [&](const Acir::Opcode::MemoryInit& arg) {
                for (const auto& init : arg.init) {
                    update_max_witness_index_from_witness(init);
                }
            },
            [&](const Acir::Opcode::MemoryOp& arg) {
                update_max_witness_index_from_witness(arg.op.index);
                update_max_witness_index_from_witness(arg.op.value);
            },
            [&](const Acir::Opcode::BrilligCall& arg) {
                for (const auto& input : arg.inputs) {
                    std::visit(overloaded{
                                   [&](const Acir::BrilligInputs::Single& e) {
                                       update_max_witness_index_from_expression(e.value, af);
                                   },
                                   [&](const Acir::BrilligInputs::Array& e) {
                                       for (const auto& expr : e.value) {
                                           update_max_witness_index_from_expression(expr, af);
                                       }
                                   },
                                   [&](const Acir::BrilligInputs::MemoryArray&) {
                                       // MemoryArray does not contain witnesses directly, so nothing to do here.
                                   },
                               },
                               input.value);
                }
                for (const auto& output : arg.outputs) {
                    std::visit(overloaded{
                                   [&](const Acir::BrilligOutputs::Simple& e) {
                                       update_max_witness_index_from_witness(e.value);
                                   },
                                   [&](const Acir::BrilligOutputs::Array& e) {
                                       for (const auto& witness : e.value) {
                                           update_max_witness_index_from_witness(witness);
                                       }
                                   },
                               },
                               output.value);
                }
                update_max_witness_index_from_expression(arg.predicate, af);
            },
            [&](const Acir::Opcode::Call&) {
                bb::assert_failure("acir_format::update_max_witness_index_from_opcode: Call opcode is not supported.");
            },
        },
        opcode.value);
}

/// ========= BYTES TO BARRETENBERG'S REPRESENTATION  ========= ///

namespace {

/**
 * @brief Reads one msgpack value at a time from a serialized buffer.
 *
 * @details Container headers are read directly from the bytes, so the caller can walk into the program without building
 * a msgpack::object for anything but the value it is about to convert. Values are unpacked into a zone the caller
 * provides and reuses, so the memory for one value is recycled for the next.
 */
class MsgpackCursor {
  public:
    enum class Container : uint8_t { ARRAY, MAP };
    struct Header {
        Container kind;
        uint32_t count;
    };

    MsgpackCursor(const char* data, size_t size)
        : data_(data)
        , size_(size)
    {}

    size_t offset() const { return offset_; }
    void seek(size_t offset) { offset_ = offset; }

    /**
     * @brief Consume the header of an array or map.
     * @param what Names the value for the error message.
     */
    Header read_container(std::string_view what)
    {
        const uint8_t marker = next_byte(what);
        if (marker >= 0x90 && marker <= 0x9f) {
            return { Container::ARRAY, static_cast<uint32_t>(marker & 0x0f) };
        }
        if (marker >= 0x80 && marker <= 0x8f) {
            return { Container::MAP, static_cast<uint32_t>(marker & 0x0f) };
        }
        switch (marker) {
        case 0xdc:
            return { Container::ARRAY, read_big_endian(2, what) };
        case 0xdd:
            return { Container::ARRAY, read_big_endian(4, what) };
        case 0xde:
            return { Container::MAP, read_big_endian(2, what) };
        case 0xdf:
            return { Container::MAP, read_big_endian(4, what) };
        default:
            fail("expected an array or map for " + std::string(what) + ", got msgpack marker 0x" + hex(marker));
        }
    }

    Header read_array(std::string_view what)
    {
        const Header header = read_container(what);
        if (header.kind != Container::ARRAY) {
            fail("expected an array for " + std::string(what));
        }
        return header;
    }

    /**
     * @brief Unpack the next value into `zone`. STR and BIN payloads are copied into the zone, so the object stays
     * valid until the zone is cleared, whatever happens to the buffer.
     */
    msgpack::object next(msgpack::zone& zone, std::string_view what)
    {
        try {
            return msgpack::unpack(zone, data_, size_, offset_);
        } catch (const msgpack::unpack_error& e) {
            fail("malformed msgpack while reading " + std::string(what) + ": " + e.what());
        }
    }

    /// Skip the next value without building an object for it.
    void skip(std::string_view what)
    {
        msgpack::null_visitor visitor;
        if (!msgpack::parse(data_, size_, offset_, visitor)) {
            fail("malformed msgpack while skipping " + std::string(what));
        }
    }

    /// Unpack the next value into `out` through its msgpack adaptor.
    template <typename T> void read_into(msgpack::zone& zone, T& out, std::string_view what)
    {
        const msgpack::object value = next(zone, what);
        try {
            value.convert(out);
        } catch (const msgpack::type_error&) {
            std::cerr << value << std::endl;
            fail("failed to convert msgpack data to " + std::string(what));
        }
        zone.clear();
    }

    [[noreturn]] static void fail(const std::string& message)
    {
        bb::assert_failure("acir_format: " + message);
        __builtin_unreachable();
    }

  private:
    uint8_t next_byte(std::string_view what)
    {
        if (offset_ >= size_) {
            fail("unexpected end of msgpack data while reading " + std::string(what));
        }
        return static_cast<uint8_t>(data_[offset_++]);
    }

    uint32_t read_big_endian(size_t num_bytes, std::string_view what)
    {
        uint32_t value = 0;
        for (size_t i = 0; i < num_bytes; ++i) {
            value = (value << 8) | next_byte(what);
        }
        return value;
    }

    static std::string hex(uint8_t byte)
    {
        static constexpr char DIGITS[] = "0123456789abcdef";
        return { DIGITS[byte >> 4], DIGITS[byte & 0x0f] };
    }

    const char* data_;
    size_t size_;
    size_t offset_ = 0;
};

/**
 * @brief Visit the fields of a serde struct in any wire layout the generated msgpack_unpack accepts: an array in field
 * order, a map keyed by field index, or a map keyed by field name.
 *
 * @param field_names The struct's fields in declaration order.
 * @param on_field Called with the field index for each present field. It must consume the field's value from the
 * cursor. Fields the struct does not declare are skipped.
 */
template <typename OnField>
void for_each_struct_field(MsgpackCursor& cursor,
                           msgpack::zone& zone,
                           std::span<const std::string_view> field_names,
                           std::string_view struct_name,
                           OnField&& on_field)
{
    const auto header = cursor.read_container(struct_name);
    for (uint32_t position = 0; position < header.count; ++position) {
        size_t field = field_names.size();
        if (header.kind == MsgpackCursor::Container::ARRAY) {
            field = position;
        } else {
            const msgpack::object key = cursor.next(zone, std::string(struct_name) + " field key");
            if (key.type == msgpack::type::POSITIVE_INTEGER) {
                field = key.via.u64 < field_names.size() ? static_cast<size_t>(key.via.u64) : field_names.size();
            } else if (key.type == msgpack::type::STR) {
                const std::string_view name(key.via.str.ptr, key.via.str.size);
                field = static_cast<size_t>(std::ranges::find(field_names, name) - field_names.begin());
            } else {
                MsgpackCursor::fail("expected an integer or string field key in " + std::string(struct_name));
            }
            zone.clear();
        }
        if (field < field_names.size()) {
            on_field(field);
        } else {
            cursor.skip(std::string(struct_name) + " field");
        }
    }
}

constexpr std::array<std::string_view, 2> PROGRAM_FIELDS = { "functions", "unconstrained_functions" };
constexpr std::array<std::string_view, 6> CIRCUIT_FIELDS = { "function_name",     "opcodes",       "private_parameters",
                                                             "public_parameters", "return_values", "assert_messages" };
constexpr size_t CIRCUIT_OPCODES = 1;
constexpr size_t CIRCUIT_PUBLIC_PARAMETERS = 3;
constexpr size_t CIRCUIT_RETURN_VALUES = 4;

/**
 * @brief The parts of an Acir::Circuit that circuit_serde_to_acir_format reads besides the opcodes.
 */
struct CircuitHeader {
    Acir::PublicInputs public_parameters;
    Acir::PublicInputs return_values;
    size_t num_opcodes = 0;
};

/**
 * @brief Check the format marker in front of a serialized program or witness and return the msgpack data after it.
 */
std::span<const char> msgpack_payload(const std::vector<uint8_t>& buf, std::string_view what)
{
    BB_ASSERT(!buf.empty(), std::string(what) + ": buffer is empty");
    const uint8_t FORMAT_MSGPACK = 2;
    const uint8_t FORMAT_MSGPACK_COMPACT = 3;
    const uint8_t FORMAT_MSGPACK_TAGGED = 4;
    const uint8_t format_marker = buf[0];
    BB_ASSERT(format_marker == FORMAT_MSGPACK || format_marker == FORMAT_MSGPACK_COMPACT ||
                  format_marker == FORMAT_MSGPACK_TAGGED,
              std::string(what) + ": expected msgpack format marker (2, 3 or 4), got " + std::to_string(format_marker));
    std::span<const char> payload(reinterpret_cast<const char*>(buf.data()) + 1, buf.size() - 1);
    if (format_marker == FORMAT_MSGPACK_COMPACT) {
        BB_ASSERT(!payload.empty() &&
                      ((static_cast<uint8_t>(payload[0]) & 0xf0) == 0x90 || static_cast<uint8_t>(payload[0]) == 0xdc ||
                       static_cast<uint8_t>(payload[0]) == 0xdd),
                  std::string(what) + ": expected ARRAY type at the root of msgpack-compact data");
    }
    return payload;
}

/**
 * @brief Give back the growth slack of the AcirFormat's constraint vectors.
 * @details The vectors are filled by push_back, so each holds up to twice its final size. The slack is a few MiB for a
 * kernel and would otherwise stay resident through circuit construction.
 */
void release_growth_slack(AcirFormat& af)
{
    auto shrink = [](auto&... vectors) { (vectors.shrink_to_fit(), ...); };
    shrink(af.public_inputs,
           af.logic_constraints,
           af.range_constraints,
           af.aes128_constraints,
           af.sha256_compression,
           af.ecdsa_k1_constraints,
           af.ecdsa_r1_constraints,
           af.blake2s_constraints,
           af.blake3_constraints,
           af.keccak_permutations,
           af.poseidon2_constraints,
           af.multi_scalar_mul_constraints,
           af.ec_add_constraints,
           af.honk_recursion_constraints,
           af.avm_recursion_constraints,
           af.hn_recursion_constraints,
           af.chonk_recursion_constraints,
           af.quad_constraints,
           af.big_quad_constraints,
           af.bilinear_constraints,
           af.batched_eq_check_constraints,
           af.block_constraints);
    auto& indices = af.original_opcode_indices;
    shrink(indices.logic_constraints,
           indices.range_constraints,
           indices.aes128_constraints,
           indices.sha256_compression,
           indices.ecdsa_k1_constraints,
           indices.ecdsa_r1_constraints,
           indices.blake2s_constraints,
           indices.blake3_constraints,
           indices.keccak_permutations,
           indices.poseidon2_constraints,
           indices.multi_scalar_mul_constraints,
           indices.ec_add_constraints,
           indices.honk_recursion_constraints,
           indices.avm_recursion_constraints,
           indices.hn_recursion_constraints,
           indices.chonk_recursion_constraints,
           indices.quad_constraints,
           indices.big_quad_constraints,
           indices.bilinear_constraints,
           indices.batched_eq_check_constraints,
           indices.block_constraints);
}

/**
 * @brief circuit_serde_to_acir_format with the opcodes supplied one at a time instead of from `circuit.opcodes`.
 *
 * @param stream_circuit Called once with a visitor, which it must call with (index, opcode) for each opcode in order,
 * and must then return the circuit header. The opcode only needs to live for the duration of the call. The header is
 * taken last so a serialized circuit can be read in wire order, whichever side of the opcodes its other fields are on.
 */
template <typename StreamCircuit>
AcirFormat circuit_serde_to_acir_format_impl(StreamCircuit&& stream_circuit, bool is_mega)
{
    AcirFormat af;
    // Map to a pair of: BlockConstraint, and list of opcodes associated with that BlockConstraint
    // Block constraints are built as we process the opcodes, so we store them in this map and we add them to the
    // AcirFormat struct at the end
    // NOTE: We want to deterministically visit this map, so unordered_map should not be used.
    std::map<uint32_t, std::pair<BlockConstraint, std::vector<size_t>>> block_id_to_block_constraint;

    // Linear AssertZeros that can be batched into one rows
    // They are batched later via the function batched_eq_assert_zeros_into_constraints
    std::vector<BatchedEqEntry> batched_eq_assert_zeros;

    const CircuitHeader header = stream_circuit([&](size_t i, Acir::Opcode const& gate) {
        update_max_witness_index_from_opcode(gate, af);
        std::visit(
            overloaded{
                [&](const Acir::Opcode::AssertZero& arg) {
                    assert_zero_to_constraints(arg, af, i, batched_eq_assert_zeros, is_mega);
                },
                [&](const Acir::Opcode::BlackBoxFuncCall& arg) { add_blackbox_func_call_to_acir_format(arg, af, i); },
                [&](const Acir::Opcode::MemoryInit& arg) {
                    auto block = memory_init_to_block_constraint(arg);
                    uint32_t block_id = arg.block_id.value;
                    block_id_to_block_constraint[block_id] = { block, /*opcode_indices=*/{ i } };
                },
                [&](const Acir::Opcode::MemoryOp& arg) {
                    auto block = block_id_to_block_constraint.find(arg.block_id.value);
                    if (block == block_id_to_block_constraint.end()) {
                        bb::assert_failure("acir_format::circuit_serde_to_acir_format: unitialized MemoryOp.");
                    }
                    add_memory_op_to_block_constraint(arg, block->second.first);
                    block->second.second.push_back(i);
                },
                [&](const Acir::Opcode::BrilligCall&) {},
                [&](const Acir::Opcode::Call&) {
                    bb::assert_failure("acir_format::circuit_serde_to_acir_format: Call opcode is not supported.");
                },
            },
            gate.value);
    });
    BB_ASSERT_LT(
        header.num_opcodes, UINT32_MAX, "acir_format::circuit_serde_to_acir_format: too many opcodes in circuit.");
    af.num_acir_opcodes = static_cast<uint32_t>(header.num_opcodes);
    af.public_inputs = join({
        transform::map(header.public_parameters.value,
                       [&](const Acir::Witness& e) {
                           update_max_witness_index(e.value, af);
                           return e.value;
                       }),
        transform::map(header.return_values.value,
                       [&](const Acir::Witness& e) {
                           update_max_witness_index(e.value, af);
                           return e.value;
                       }),
    });

    // Pair any buffered batched-eq AssertZeros (≤2-witness linear opcodes) into BATCHED_EQ rows.
    batched_eq_assert_zeros_into_constraints(af, batched_eq_assert_zeros);

    // Add the block constraints to the AcirFormat struct
    for (const auto& [_, block] : block_id_to_block_constraint) {
        af.block_constraints.push_back(block.first);
        af.original_opcode_indices.block_constraints.push_back(block.second);
    }

    BB_ASSERT_LT(af.max_witness_index,
                 UINT32_MAX,
                 "Max witness index above UINT32_MAX, this value is reserved for unset witnesses that will be replaced "
                 "with the zero index.");

    return af;
}

} // namespace

AcirFormat circuit_serde_to_acir_format(Acir::Circuit const& circuit, bool is_mega)
{
    AcirFormat af = circuit_serde_to_acir_format_impl(
        [&](auto&& visit) {
            for (size_t i = 0; i < circuit.opcodes.size(); ++i) {
                visit(i, circuit.opcodes[i]);
            }
            return CircuitHeader{ circuit.public_parameters, circuit.return_values, circuit.opcodes.size() };
        },
        is_mega);
    release_growth_slack(af);
    return af;
}

AcirFormat circuit_buf_to_acir_format(std::vector<uint8_t>&& buf, bool is_mega)
{
    // The program is read as a ProgramWithoutBrillig (ignoring the Brillig parts, so that new Brillig opcodes do not
    // break Barretenberg), in a single pass over the bytes in wire order. Nothing but the opcode being converted is
    // ever materialised as a msgpack object; the Brillig bytecode is skipped without being decoded.
    const std::span<const char> payload = msgpack_payload(buf, "circuit_buf_to_acir_format");
    MsgpackCursor cursor(payload.data(), payload.size());
    msgpack::zone zone;

    AcirFormat af = circuit_serde_to_acir_format_impl(
        [&](auto&& visit) {
            CircuitHeader header;
            bool has_functions = false;
            bool has_opcodes = false;
            for_each_struct_field(cursor, zone, PROGRAM_FIELDS, "ProgramWithoutBrillig", [&](size_t field) {
                if (field != 0) {
                    cursor.skip("unconstrained_functions");
                    return;
                }
                has_functions = true;
                const auto functions = cursor.read_array("functions");
                BB_ASSERT_EQ(
                    functions.count, 1U, "circuit_buf_to_acir_format: expected single function in ACIR program");
                for_each_struct_field(cursor, zone, CIRCUIT_FIELDS, "Circuit", [&](size_t circuit_field) {
                    switch (circuit_field) {
                    case CIRCUIT_OPCODES: {
                        has_opcodes = true;
                        header.num_opcodes = cursor.read_array("opcodes").count;
                        Acir::Opcode opcode;
                        for (size_t i = 0; i < header.num_opcodes; ++i) {
                            cursor.read_into(zone, opcode, "Opcode");
                            visit(i, opcode);
                        }
                        break;
                    }
                    case CIRCUIT_PUBLIC_PARAMETERS:
                        cursor.read_into(zone, header.public_parameters, "Circuit::public_parameters");
                        break;
                    case CIRCUIT_RETURN_VALUES:
                        cursor.read_into(zone, header.return_values, "Circuit::return_values");
                        break;
                    default:
                        cursor.skip(CIRCUIT_FIELDS[circuit_field]);
                    }
                });
            });
            if (!has_functions) {
                MsgpackCursor::fail("circuit_buf_to_acir_format: missing field 'functions' in ProgramWithoutBrillig");
            }
            if (!has_opcodes) {
                MsgpackCursor::fail("circuit_buf_to_acir_format: missing field 'opcodes' in Circuit");
            }
            return header;
        },
        is_mega);
    // The caller handed the serialized program over by rvalue reference; it is not needed past this point. It goes
    // before the vectors are shrunk so the copies that makes do not add to the parse peak.
    std::vector<uint8_t>().swap(buf);
    release_growth_slack(af);
    return af;
}

AcirFormat circuit_buf_to_mega_acir_format(std::vector<uint8_t>&& buf)
{
    return circuit_buf_to_acir_format(std::move(buf), true);
}

namespace {

constexpr std::array<std::string_view, 1> WITNESS_STACK_FIELDS = { "stack" };
constexpr std::array<std::string_view, 2> STACK_ITEM_FIELDS = { "index", "witness" };
constexpr size_t STACK_ITEM_WITNESS = 1;

} // namespace

WitnessVector witness_buf_to_witness_vector(std::vector<uint8_t>&& buf)
{
    // The buffer returned by Noir is a WitnessStack holding a single WitnessMap. Its entries are read one at a time in
    // wire order, which is increasing witness index for a map serialized from a BTreeMap; any other order is restored
    // below so the result matches witness_map_to_witness_vector on the fully deserialized map.
    const std::span<const char> payload = msgpack_payload(buf, "witness_buf_to_witness_vector");
    MsgpackCursor cursor(payload.data(), payload.size());
    msgpack::zone zone;

    std::vector<std::pair<uint32_t, bb::fr>> entries;
    bool sorted = true;
    size_t num_witness_maps = 0;
    for_each_struct_field(cursor, zone, WITNESS_STACK_FIELDS, "WitnessStack", [&](size_t) {
        const auto stack = cursor.read_array("WitnessStack::stack");
        for (uint32_t item = 0; item < stack.count; ++item) {
            for_each_struct_field(cursor, zone, STACK_ITEM_FIELDS, "StackItem", [&](size_t field) {
                if (field != STACK_ITEM_WITNESS) {
                    cursor.skip("StackItem::index");
                    return;
                }
                ++num_witness_maps;
                const auto map = cursor.read_container("WitnessMap");
                if (map.kind != MsgpackCursor::Container::MAP) {
                    MsgpackCursor::fail("witness_buf_to_witness_vector: expected "
                                        "a map for WitnessMap");
                }
                entries.reserve(map.count);
                Witnesses::Witness witness{};
                std::vector<uint8_t> value;
                for (uint32_t entry = 0; entry < map.count; ++entry) {
                    cursor.read_into(zone, witness, "Witness");
                    cursor.read_into(zone, value, "witness value");
                    sorted = sorted && (entries.empty() || entries.back().first < witness.value);
                    entries.emplace_back(witness.value, from_buffer_with_bound_checks(value));
                }
            });
        }
    });
    BB_ASSERT_EQ(num_witness_maps,
                 1U,
                 "acir_format::witness_buf_to_witness_vector: expected single "
                 "WitnessMap in WitnessStack");
    std::vector<uint8_t>().swap(buf);

    if (!sorted) {
        // std::map semantics: ordered by index, and the first of duplicate keys wins.
        std::ranges::stable_sort(entries, {}, &std::pair<uint32_t, bb::fr>::first);
        const auto duplicates = std::ranges::unique(entries, {}, &std::pair<uint32_t, bb::fr>::first);
        entries.erase(duplicates.begin(), duplicates.end());
    }

    WitnessVector witness_vector;
    witness_vector.reserve(entries.empty() ? 0 : entries.back().first + 1);
    for (size_t index = 0; const auto& [witness_index, value] : entries) {
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned. To ensure that
        // witnesses sit at the correct indices in the `WitnessVector`, we fill any indices which do not exist within
        // the `WitnessMap` with the random values. We use random values instead of zero because unassigned witnesses
        // indices are not supposed to be used in any constraint, so filling them with a random value helps catching
        // bugs.
        while (index < witness_index) {
            witness_vector.emplace_back(fr::random_element());
            index++;
        }
        witness_vector.emplace_back(value);
        index++;
    }
    return witness_vector;
}

WitnessVector witness_map_to_witness_vector(Witnesses::WitnessMap const& witness_map)
{
    // Note that the WitnessMap is in increasing order of witness indices because the comparator for the Acir::Witness
    // is defined in terms of the witness index.

    WitnessVector witness_vector;
    for (size_t index = 0; const auto& e : witness_map.value) {
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned.
        // To ensure that witnesses sit at the correct indices in the `WitnessVector`, we fill any indices
        // which do not exist within the `WitnessMap` with the random values. We use random values instead of zero
        // because unassigned witnesses indices are not supposed to be used in any constraint, so filling them with a
        // random value helps catching bugs.
        while (index < e.first.value) {
            witness_vector.emplace_back(fr::random_element());
            index++;
        }
        witness_vector.emplace_back(from_buffer_with_bound_checks(e.second));
        index++;
    }

    return witness_vector;
}

/// ========= ACIR OPCODE HANDLERS ========= ///

std::vector<mul_quad_<fr>> split_into_mul_quad_gates(Acir::Expression const& arg,
                                                     std::map<uint32_t, bb::fr>& linear_terms)
{
    // Lambda to add next linear term from linear_terms to the mul_quad_ gate and erase it from linear_terms
    auto add_linear_term_and_erase = [](uint32_t& idx, fr& scaling, std::map<uint32_t, fr>& linear_terms) {
        BB_ASSERT_EQ(
            idx, bb::stdlib::IS_CONSTANT, "Attempting to override a non-constant witness index in mul_quad_ gate");
        idx = linear_terms.begin()->first;
        scaling += linear_terms.begin()->second;
        linear_terms.erase(idx);
    };

    std::vector<mul_quad_<fr>> result;
    // We cannot precompute the exact number of gates that will result from the expression. Therefore, we reserve the
    // maximum number of gates that could ever be needed: one per multiplication term plus one per linear term. The real
    // number of gates will in general be lower than this.
    BB_ASSERT_LTE(arg.mul_terms.size(),
                  SIZE_MAX - linear_terms.size(),
                  "split_into_mul_quad_gates: overflow when reserving space for mul_quad_ gates.");
    result.reserve(arg.mul_terms.size() + linear_terms.size());

    // Step 1. Add multiplication terms and linear terms with the same witness index
    for (const auto& mul_term : arg.mul_terms) {
        result.emplace_back(mul_quad_<fr>{
            .a = std::get<1>(mul_term).value,
            .b = std::get<2>(mul_term).value,
            .c = bb::stdlib::IS_CONSTANT,
            .d = bb::stdlib::IS_CONSTANT,
            .mul_scaling = from_buffer_with_bound_checks(std::get<0>(mul_term)),
            .a_scaling = fr::zero(),
            .b_scaling = fr::zero(),
            .c_scaling = fr::zero(),
            .d_scaling = fr::zero(),
            .const_scaling = fr::zero(),
        });

        // Add linear terms corresponding to the witnesses involved in the multiplication term
        auto& mul_quad = result.back();
        if (linear_terms.contains(mul_quad.a)) {
            mul_quad.a_scaling += linear_terms.at(mul_quad.a);
            linear_terms.erase(mul_quad.a); // Remove it as the linear term for a has been processed
        }
        if (linear_terms.contains(mul_quad.b)) {
            // Note that we enter here only if b is different from a
            mul_quad.b_scaling += linear_terms.at(mul_quad.b);
            linear_terms.erase(mul_quad.b); // Remove it as the linear term for b has been processed
        }
    }

    // Step 2. Add linear terms to existing gates
    bool is_first_gate = true;
    for (auto& mul_quad : result) {
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.c, mul_quad.c_scaling, linear_terms);
        }

        if (is_first_gate) {
            // First gate contains the constant term and uses all four wires
            mul_quad.const_scaling = from_buffer_with_bound_checks(arg.q_c);
            if (!linear_terms.empty()) {
                add_linear_term_and_erase(mul_quad.d, mul_quad.d_scaling, linear_terms);
            }
            is_first_gate = false;
        }
    }

    // Step 3. Add remaining linear terms
    while (!linear_terms.empty()) {
        // We need to create new mul_quad_ gates to accomodate the remaining linear terms
        mul_quad_<fr> mul_quad = {
            .a = bb::stdlib::IS_CONSTANT,
            .b = bb::stdlib::IS_CONSTANT,
            .c = bb::stdlib::IS_CONSTANT,
            .d = bb::stdlib::IS_CONSTANT,
            .mul_scaling = fr::zero(),
            .a_scaling = fr::zero(),
            .b_scaling = fr::zero(),
            .c_scaling = fr::zero(),
            .d_scaling = fr::zero(),
            .const_scaling = fr::zero(),
        };
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.a, mul_quad.a_scaling, linear_terms);
        }
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.b, mul_quad.b_scaling, linear_terms);
        }
        if (!linear_terms.empty()) {
            add_linear_term_and_erase(mul_quad.c, mul_quad.c_scaling, linear_terms);
        }
        if (is_first_gate) {
            // First gate contains the constant term and uses all four wires
            mul_quad.const_scaling = from_buffer_with_bound_checks(arg.q_c);
            if (!linear_terms.empty()) {
                add_linear_term_and_erase(mul_quad.d, mul_quad.d_scaling, linear_terms);
            }
            is_first_gate = false;
        }

        result.emplace_back(mul_quad);
    }

    BB_ASSERT(!result.empty(),
              "split_into_mul_quad_gates: resulted in zero gates. This means that there is an expression with no  "
              "multiplication terms and no linear terms.");
    result.shrink_to_fit();

    return result;
}

bool resolve_shared_wire_products(Acir::Expression const& arg, uint32_t& w_l, uint32_t& w_r, uint32_t& w_o)
{
    // Two products: a * b, c * d
    const uint32_t a = std::get<1>(arg.mul_terms[0]).value;
    const uint32_t b = std::get<2>(arg.mul_terms[0]).value;
    const uint32_t c = std::get<1>(arg.mul_terms[1]).value;
    const uint32_t d = std::get<2>(arg.mul_terms[1]).value;

    uint32_t shared_index = bb::stdlib::IS_CONSTANT;
    size_t num_shared_indices = 0;

    // Lambda to check whether the witness index matches one of the witness indices from the pair (c,d)
    auto process_witness_index = [&](uint32_t w) {
        if (w == c || w == d) {
            shared_index = w;
            ++num_shared_indices;
        }
    };

    process_witness_index(a);
    if (a != b) {
        // If a != b, we need to check b as well
        process_witness_index(b);
    }

    // The condition we are looking for is num_shared_indices == 1
    // num_shared_indices == 0 means two disjoint products
    // num_shared_indices == 2 is the same wire-pair, which should not happen
    if (num_shared_indices != 1) {
        return false;
    }

    BB_ASSERT_NEQ(
        shared_index, bb::stdlib::IS_CONSTANT, "acir_format::resolve_shared_wire_products: no matched shared_index.");
    w_l = shared_index;
    w_r = (a == shared_index) ? b : a;
    w_o = (c == shared_index) ? d : c;
    return true;
}

bool is_bilinear(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    if (arg.mul_terms.size() != 2) {
        return false;
    }
    uint32_t w_l = bb::stdlib::IS_CONSTANT;
    uint32_t w_r = bb::stdlib::IS_CONSTANT;
    uint32_t w_o = bb::stdlib::IS_CONSTANT;
    if (!resolve_shared_wire_products(arg, w_l, w_r, w_o)) {
        return false;
    }
    // Linear terms must lie on the three product wires plus at most one extra witness, which becomes the
    // linear-only fourth wire w_4.
    bool extra_seen = false;
    for (const auto& [witness, coeff] : linear_terms) {
        if (witness == w_l || witness == w_r || witness == w_o) {
            continue;
        }
        if (extra_seen) {
            return false;
        }
        extra_seen = true;
    }
    return true;
}

bool is_batched_eq(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    return arg.mul_terms.empty() && !linear_terms.empty() && linear_terms.size() <= 2;
}

BilinearConstraint build_bilinear_constraint(Acir::Expression const& arg,
                                             const std::map<uint32_t, bb::fr>& linear_terms)
{
    uint32_t w_l = bb::stdlib::IS_CONSTANT;
    uint32_t w_r = bb::stdlib::IS_CONSTANT;
    uint32_t w_o = bb::stdlib::IS_CONSTANT;
    bool resolved = resolve_shared_wire_products(arg, w_l, w_r, w_o);
    BB_ASSERT(resolved, "acir_format::build_bilinear_constraint: the two products must share exactly one wire.");

    // The fourth wire carries only a linear term; default to the IS_CONSTANT sentinel and bind it to the
    // single linear witness outside {w_l, w_r, w_o} if one is present.
    uint32_t w_4 = bb::stdlib::IS_CONSTANT;

    fr q_l = fr::zero();
    fr q_r = fr::zero();
    fr q_o = fr::zero();
    fr q_4 = fr::zero();
    // The following loop is safe because linear_terms has distinct witnesses
    for (const auto& [w, c] : linear_terms) {
        if (w == w_l) {
            q_l = c;
        } else if (w == w_r) {
            q_r = c;
        } else if (w == w_o) {
            q_o = c;
        } else {
            // Guaranteed by is_bilinear: at most one linear-only witness, which becomes the fourth wire.
            BB_ASSERT(w_4 == bb::stdlib::IS_CONSTANT,
                      "acir_format::build_bilinear_constraint: more than one linear-only witness.");
            w_4 = w;
            q_4 = c;
        }
    }

    return BilinearConstraint{
        .a = w_l,
        .b = w_r,
        .c = w_o,
        .d = w_4,
        .q_m = from_buffer_with_bound_checks(std::get<0>(arg.mul_terms[0])),
        .q_l = q_l,
        .q_r = q_r,
        .q_o = q_o,
        .q_4 = q_4,
        .q_5 = from_buffer_with_bound_checks(std::get<0>(arg.mul_terms[1])),
        .q_c = from_buffer_with_bound_checks(arg.q_c),
    };
}

BatchedEqEntry build_batched_eq_entry(Acir::Expression const& arg,
                                      const std::map<uint32_t, bb::fr>& linear_terms,
                                      size_t opcode_index)
{
    BB_ASSERT(!linear_terms.empty() && linear_terms.size() <= 2, "BatchedEq gate requires at most two linear terms.");
    BatchedEqEntry entry{
        .w1 = bb::stdlib::IS_CONSTANT,
        .w2 = bb::stdlib::IS_CONSTANT,
        .c1 = fr::zero(),
        .c2 = fr::zero(),
        .q_c = from_buffer_with_bound_checks(arg.q_c),
        .opcode_index = opcode_index,
    };
    auto it = linear_terms.begin();
    entry.w1 = it->first;
    entry.c1 = it->second;
    if (++it != linear_terms.end()) {
        entry.w2 = it->first;
        entry.c2 = it->second;
    }
    return entry;
}

BatchedEqCheckConstraint build_batched_eq_check_constraint(const BatchedEqEntry& entry1,
                                                           const std::optional<BatchedEqEntry>& entry2)
{
    bool entry2_has_value = entry2.has_value();
    return BatchedEqCheckConstraint{
        .a = entry1.w1,
        .b = entry1.w2,
        .c = entry2_has_value ? entry2->w1 : bb::stdlib::IS_CONSTANT,
        .d = entry2_has_value ? entry2->w2 : bb::stdlib::IS_CONSTANT,
        .q_l = entry1.c1,
        .q_r = entry1.c2,
        .q_o = entry2_has_value ? entry2->c1 : fr::zero(),
        .q_4 = entry2_has_value ? entry2->c2 : fr::zero(),
        .q_c = entry1.q_c,
        .q_m = entry2_has_value ? entry2->q_c : fr::zero(),
    };
}

void batched_eq_assert_zeros_into_constraints(AcirFormat& af, std::vector<BatchedEqEntry>& pending)
{
    for (size_t i = 0; i + 1 < pending.size(); i += 2) {
        af.batched_eq_check_constraints.push_back(build_batched_eq_check_constraint(pending[i], pending[i + 1]));
        af.original_opcode_indices.batched_eq_check_constraints.push_back(
            { pending[i].opcode_index, pending[i + 1].opcode_index });
    }
    if (pending.size() % 2 == 1) {
        af.batched_eq_check_constraints.push_back(build_batched_eq_check_constraint(pending.back(), std::nullopt));
        af.original_opcode_indices.batched_eq_check_constraints.push_back({ pending.back().opcode_index, SIZE_MAX });
    }
    pending.clear();
}

void assert_zero_to_constraints(Acir::Opcode::AssertZero const& arg,
                                AcirFormat& af,
                                size_t opcode_index,
                                std::vector<BatchedEqEntry>& batched_eq_assert_zeros,
                                bool is_mega)
{
    // Lambda to detect zero gates in mul_quad
    auto is_zero_gate = [](const mul_quad_<fr>& gate) {
        return ((gate.mul_scaling == fr(0)) && (gate.a_scaling == fr(0)) && (gate.b_scaling == fr(0)) &&
                (gate.c_scaling == fr(0)) && (gate.d_scaling == fr(0)) && (gate.const_scaling == fr(0)));
    };

    // Lambda to detect zero gates in batched_eq
    auto is_zero_batched_eq_gate = [](const BatchedEqEntry& gate) {
        return (gate.c1 == fr(0) && gate.c2 == fr(0) && gate.q_c == fr(0));
    };

    auto linear_terms = process_linear_terms(arg.value);

    // Check for unsatisfiable constraint: no variables but a non-zero constant means the circuit requires
    // `constant == 0` which can never be satisfied.
    if (arg.value.mul_terms.empty() && linear_terms.empty()) {
        fr constant = from_buffer_with_bound_checks(arg.value.q_c);
        BB_ASSERT_EQ(constant,
                     fr::zero(),
                     "circuit is unsatisfiable. An AssertZero opcode contains no variables but has a non-zero "
                     "constant, which can never equal zero.");
    }

    // Classify the opcode, then route it to the matching handler. The bilinear / batched-eq gate is Mega-only, so
    // classify_assert_zero only returns Bilinear/BatchedEq when is_mega is true.
    AssertZeroGate gate = classify_assert_zero(arg.value, linear_terms, is_mega);

    switch (gate) {
    case AssertZeroGate::Bilinear: {
        if (!is_mega) {
            throw_or_abort("acir_format::assert_zero_to_constraint: selected AssertZeroGate::Bilinear variant "
                           "when using UltraCircuitBuilder.");
        }
        af.bilinear_constraints.push_back(build_bilinear_constraint(arg.value, linear_terms));
        af.original_opcode_indices.bilinear_constraints.push_back(opcode_index);
        break;
    }
    case AssertZeroGate::BatchedEq: {
        if (!is_mega) {
            throw_or_abort("acir_format::assert_zero_to_constraint: selected AssertZeroGate::BatchedEq variant "
                           "when using UltraCircuitBuilder.");
        }
        batched_eq_assert_zeros.push_back(build_batched_eq_entry(arg.value, linear_terms, opcode_index));
        BB_ASSERT(!is_zero_batched_eq_gate(batched_eq_assert_zeros.back()),
                  "acir_format::asser_zero_to_constraints: produced a BatcheqEq zero gate");
        break;
    }
    case AssertZeroGate::SingleArithmetic: {
        std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms);
        BB_ASSERT_EQ(mul_quads.size(), 1U, "acir_format::assert_zero_to_constraints: expected a single gate.");
        BB_ASSERT(!is_zero_gate(mul_quads[0]),
                  "acir_format::assert_zero_to_constraints: produced a SingleArithmetic zero gate.");
        af.quad_constraints.push_back(mul_quads[0]);
        af.original_opcode_indices.quad_constraints.push_back(opcode_index);
        break;
    }
    case AssertZeroGate::MultiArithmetic: {
        std::vector<mul_quad_<fr>> mul_quads = split_into_mul_quad_gates(arg.value, linear_terms);
        BB_ASSERT_GT(
            mul_quads.size(), 1U, "acir_format::assert_zero_to_constraints: expected multiple gates but found one.");
        for (auto const& mul_quad : mul_quads) {
            BB_ASSERT(!is_zero_gate(mul_quad),
                      "acir_format::assert_zero_to_constraints: produced a MultiArithmetic zero gate.");
        }
        af.big_quad_constraints.push_back(BigQuadConstraint(mul_quads));
        af.original_opcode_indices.big_quad_constraints.push_back(opcode_index);
        break;
    }
    }
}

void add_blackbox_func_call_to_acir_format(Acir::Opcode::BlackBoxFuncCall const& arg,
                                           AcirFormat& af,
                                           size_t opcode_index)
{
    auto to_witness_or_constant = [](const Acir::FunctionInput& e) { return parse_input(e); };
    auto to_witness = [](const Acir::Witness& e) { return e.value; };
    auto to_witness_from_input = [](const Acir::FunctionInput& e) { return get_witness_from_function_input(e); };

    std::visit(
        overloaded{ [&](const Acir::BlackBoxFuncCall::AND& arg) {
                       af.logic_constraints.push_back(LogicConstraint{
                           .a = parse_input(arg.lhs),
                           .b = parse_input(arg.rhs),
                           .result = to_witness(arg.output),
                           .num_bits = arg.num_bits,
                           .is_xor_gate = false,
                       });
                       af.original_opcode_indices.logic_constraints.push_back(opcode_index);
                   },
                    [&](const Acir::BlackBoxFuncCall::XOR& arg) {
                        af.logic_constraints.push_back(LogicConstraint{
                            .a = parse_input(arg.lhs),
                            .b = parse_input(arg.rhs),
                            .result = to_witness(arg.output),
                            .num_bits = arg.num_bits,
                            .is_xor_gate = true,
                        });
                        af.original_opcode_indices.logic_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::RANGE& arg) {
                        af.range_constraints.push_back(RangeConstraint{
                            .witness = get_witness_from_function_input(arg.input),
                            .num_bits = arg.num_bits,
                        });
                        af.original_opcode_indices.range_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::AES128Encrypt& arg) {
                        af.aes128_constraints.push_back(AES128Constraint{
                            .inputs = transform::map(arg.inputs, to_witness_or_constant),
                            .iv = transform::map(*arg.iv, to_witness_or_constant),
                            .key = transform::map(*arg.key, to_witness_or_constant),
                            .outputs = transform::map(arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.aes128_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Sha256Compression& arg) {
                        af.sha256_compression.push_back(Sha256Compression{
                            .inputs = transform::map(*arg.inputs, to_witness_or_constant),
                            .hash_values = transform::map(*arg.hash_values, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.sha256_compression.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Blake2s& arg) {
                        af.blake2s_constraints.push_back(Blake2sConstraint{
                            .inputs = transform::map(arg.inputs, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.blake2s_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Blake3& arg) {
                        af.blake3_constraints.push_back(Blake3Constraint{
                            .inputs = transform::map(arg.inputs, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.blake3_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::EcdsaSecp256k1& arg) {
                        af.ecdsa_k1_constraints.push_back(EcdsaConstraint{
                            .type = bb::CurveType::SECP256K1,
                            .hashed_message = transform::map(*arg.hashed_message, to_witness_from_input),
                            .signature = transform::map(*arg.signature, to_witness_from_input),
                            .pub_x_indices = transform::map(*arg.public_key_x, to_witness_from_input),
                            .pub_y_indices = transform::map(*arg.public_key_y, to_witness_from_input),
                            .predicate = parse_input(arg.predicate),
                            .result = to_witness(arg.output),
                        });
                        af.original_opcode_indices.ecdsa_k1_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::EcdsaSecp256r1& arg) {
                        af.ecdsa_r1_constraints.push_back(EcdsaConstraint{
                            .type = bb::CurveType::SECP256R1,
                            .hashed_message = transform::map(*arg.hashed_message, to_witness_from_input),
                            .signature = transform::map(*arg.signature, to_witness_from_input),
                            .pub_x_indices = transform::map(*arg.public_key_x, to_witness_from_input),
                            .pub_y_indices = transform::map(*arg.public_key_y, to_witness_from_input),
                            .predicate = parse_input(arg.predicate),
                            .result = to_witness(arg.output),
                        });
                        af.original_opcode_indices.ecdsa_r1_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::MultiScalarMul& arg) {
                        af.multi_scalar_mul_constraints.push_back(MultiScalarMul{
                            .points = transform::map(arg.points, to_witness_or_constant),
                            .scalars = transform::map(arg.scalars, to_witness_or_constant),
                            .predicate = parse_input(arg.predicate),
                            .out_point_x = to_witness((*arg.outputs)[0]),
                            .out_point_y = to_witness((*arg.outputs)[1]),
                        });
                        af.original_opcode_indices.multi_scalar_mul_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::EmbeddedCurveAdd& arg) {
                        af.ec_add_constraints.push_back(EcAdd{
                            .input1_x = parse_input((*arg.input1)[0]),
                            .input1_y = parse_input((*arg.input1)[1]),
                            .input2_x = parse_input((*arg.input2)[0]),
                            .input2_y = parse_input((*arg.input2)[1]),
                            .predicate = parse_input(arg.predicate),
                            .result_x = to_witness((*arg.outputs)[0]),
                            .result_y = to_witness((*arg.outputs)[1]),
                        });
                        af.original_opcode_indices.ec_add_constraints.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::Keccakf1600& arg) {
                        af.keccak_permutations.push_back(Keccakf1600{
                            .state = transform::map(*arg.inputs, to_witness_or_constant),
                            .result = transform::map(*arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.keccak_permutations.push_back(opcode_index);
                    },
                    [&](const Acir::BlackBoxFuncCall::RecursiveAggregation& arg) {
                        auto predicate = parse_input(arg.predicate);
                        if (predicate.is_constant && predicate.value.is_zero()) {
                            // No constraint if the recursion is disabled
                            return;
                        }
                        auto c = RecursionConstraint{
                            .key = transform::map(arg.verification_key, to_witness_from_input),
                            .proof = transform::map(arg.proof, to_witness_from_input),
                            .public_inputs = transform::map(arg.public_inputs, to_witness_from_input),
                            .key_hash = get_witness_from_function_input(arg.key_hash),
                            .proof_type = arg.proof_type,
                            .predicate = predicate,
                        };

                        // Add the recursion constraint to the appropriate container based on proof type
                        switch (c.proof_type) {
                        case HONK_ZK:
                        case HONK:
                        case ROLLUP_HONK:
                        case ROOT_ROLLUP_HONK:
                            af.honk_recursion_constraints.push_back(c);
                            af.original_opcode_indices.honk_recursion_constraints.push_back(opcode_index);
                            break;
                        case OINK:
                        case HN:
                        case HN_FINAL:
                            af.hn_recursion_constraints.push_back(c);
                            af.original_opcode_indices.hn_recursion_constraints.push_back(opcode_index);
                            break;
                        case AVM:
                            af.avm_recursion_constraints.push_back(c);
                            af.original_opcode_indices.avm_recursion_constraints.push_back(opcode_index);
                            break;
                        case CHONK:
                            af.chonk_recursion_constraints.push_back(c);
                            af.original_opcode_indices.chonk_recursion_constraints.push_back(opcode_index);
                            break;
                        default:
                            bb::assert_failure(
                                "acir_format::handle_black_box_fun_call: Invalid PROOF_TYPE in RecursionConstraint.");
                        }
                    },
                    [&](const Acir::BlackBoxFuncCall::Poseidon2Permutation& arg) {
                        af.poseidon2_constraints.push_back(Poseidon2Constraint{
                            .state = transform::map(arg.inputs, to_witness_or_constant),
                            .result = transform::map(arg.outputs, to_witness),
                        });
                        af.original_opcode_indices.poseidon2_constraints.push_back(opcode_index);
                    } },
        arg.value.value);
}

BlockConstraint memory_init_to_block_constraint(Acir::Opcode::MemoryInit const& mem_init)
{
    // Noir doesn't distinguish between ROM and RAM table. Therefore, we initialize every table as a ROM table, and
    // then we make it a RAM table if there is at least one write operation
    BlockConstraint block{
        .init = {},
        .trace = {},
        .type = BlockType::ROM,
        .calldata_id = CallDataType::None,
    };

    for (const auto& init : mem_init.init) {
        block.init.push_back(init.value);
    }

    // Databus is only supported for Goblin, non Goblin builders will treat call_data and return_data as normal
    // array.
    if (std::holds_alternative<Acir::BlockType::CallData>(mem_init.block_type.value)) {
        uint32_t calldata_id = std::get<Acir::BlockType::CallData>(mem_init.block_type.value).value;
        BB_ASSERT_LTE(calldata_id,
                      MAX_APPS_PER_KERNEL,
                      "acir_format::handle_memory_init: calldata id exceeds kernel + MAX_APPS_PER_KERNEL app columns");

        block.type = BlockType::CallData;
        block.calldata_id = static_cast<CallDataType>(calldata_id);
    } else if (std::holds_alternative<Acir::BlockType::ReturnData>(mem_init.block_type.value)) {
        block.type = BlockType::ReturnData;
    }

    return block;
}

void add_memory_op_to_block_constraint(Acir::Opcode::MemoryOp const& mem_op, BlockConstraint& block)
{
    // Acir::MemOp::read is the serialized MemOpKind bool: false = Read, true = Write.
    AccessType access_type = mem_op.op.read ? AccessType::Write : AccessType::Read;
    if (access_type == AccessType::Write) {
        // We are not allowed to write on the databus
        BB_ASSERT((block.type != BlockType::CallData) && (block.type != BlockType::ReturnData));
        // Mark the table as a RAM table
        block.type = BlockType::RAM;
    }

    MemOp acir_mem_op = MemOp{
        .access_type = access_type,
        .index = mem_op.op.index.value,
        .value = mem_op.op.value.value,
    };
    block.trace.push_back(acir_mem_op);
}

bool is_single_arithmetic_gate(Acir::Expression const& arg, const std::map<uint32_t, bb::fr>& linear_terms)
{
    // If there are more than NUM_WIRES distinct witnesses in the linear terms, then we need multiple arithmetic gates
    if (linear_terms.size() > NUM_WIRES) {
        return false;
    }

    if (arg.mul_terms.size() > 1) {
        // If there is more than one multiplication gate, then we need multiple arithmetic gates
        return false;
    }

    if (arg.mul_terms.size() == 1) {
        // In this case we have two witnesses coming from the multiplication term plus the linear terms.
        // We proceed as follows:
        //  0. Start from the assumption that all witnesses (from linear terms and multiplication) are distinct
        //  1. Check if the lhs and rhs witness in the multiplication are already contained in the linear terms
        //  2. Check if the lhs witness and the rhs witness are equal
        //     2.a If they are distinct, update the total number of witnesses to be added to wires according to result
        //         of the check at step 1: each distinct witness already in the linear terms subtracts one from the
        //         total
        //     2.b If they are equal, update the total number of witnesses to be added to wires according to result of
        //         the check at step 1: if the witness is already in the linear terms, it removes one from the total

        // Number of witnesses to be put in wires if the witnesses from the linear terms and the multiplication term are
        // all different
        size_t num_witnesses_to_be_put_in_wires = 2 + linear_terms.size();

        uint32_t witness_idx_lhs = std::get<1>(arg.mul_terms[0]).value;
        uint32_t witness_idx_rhs = std::get<2>(arg.mul_terms[0]).value;

        bool lhs_is_distinct_from_linear_terms = !linear_terms.contains(witness_idx_lhs);
        bool rhs_is_distinct_from_linear_terms = !linear_terms.contains(witness_idx_rhs);

        if (witness_idx_lhs != witness_idx_rhs) {
            num_witnesses_to_be_put_in_wires -= lhs_is_distinct_from_linear_terms ? 0U : 1U;
            num_witnesses_to_be_put_in_wires -= rhs_is_distinct_from_linear_terms ? 0U : 1U;
        } else {
            num_witnesses_to_be_put_in_wires -= lhs_is_distinct_from_linear_terms ? 0U : 1U;
        }

        return num_witnesses_to_be_put_in_wires <= NUM_WIRES;
    }

    return linear_terms.size() <= NUM_WIRES;
}

AssertZeroGate classify_assert_zero(Acir::Expression const& arg,
                                    const std::map<uint32_t, bb::fr>& linear_terms,
                                    bool is_mega)
{
    // The bilinear / batched-eq gate is Mega-only; prefer it over the standard arithmetic path when
    // the opcode fits.
    if (is_mega) {
        if (is_bilinear(arg, linear_terms)) {
            return AssertZeroGate::Bilinear;
        }
        if (is_batched_eq(arg, linear_terms)) {
            return AssertZeroGate::BatchedEq;
        }
    }
    return is_single_arithmetic_gate(arg, linear_terms) ? AssertZeroGate::SingleArithmetic
                                                        : AssertZeroGate::MultiArithmetic;
}

std::map<uint32_t, bb::fr> process_linear_terms(Acir::Expression const& expr)
{
    std::map<uint32_t, bb::fr> linear_terms;
    for (const auto& linear_term : expr.linear_combinations) {
        fr selector_value = from_buffer_with_bound_checks(std::get<0>(linear_term));
        uint32_t witness_idx = std::get<1>(linear_term).value;
        if (linear_terms.contains(witness_idx)) {
            linear_terms[witness_idx] += selector_value; // Accumulate coefficients for duplicate witnesses
        } else {
            linear_terms[witness_idx] = selector_value;
        }
    }
    return linear_terms;
}

} // namespace acir_format
