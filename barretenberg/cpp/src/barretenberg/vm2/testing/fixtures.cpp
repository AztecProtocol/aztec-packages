#include "barretenberg/vm2/testing/fixtures.hpp"

#include <utility>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

using bb::avm2::tracegen::TestTraceContainer;

namespace bb::avm2::testing {

using simulation::Instruction;
using simulation::Operand;
using simulation::OperandType;

std::vector<FF> random_fields(size_t n)
{
    std::vector<FF> fields;
    fields.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        fields.push_back(FF::random_element());
    }
    return fields;
}

std::vector<uint8_t> random_bytes(size_t n)
{
    std::vector<uint8_t> bytes;
    bytes.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        bytes.push_back(static_cast<uint8_t>(rand() % 256));
    }
    return bytes;
}

Operand random_operand(OperandType operand_type)
{
    const auto rand_bytes = random_bytes(simulation::testonly::get_operand_type_sizes().at(operand_type));
    const uint8_t* pos_ptr = &rand_bytes.at(0);

    switch (operand_type) {
    case OperandType::INDIRECT8: // Irrelevant bits might be toggled but they are ignored during address resolution.
    case OperandType::UINT8: {
        uint8_t operand_u8 = 0;
        serialize::read(pos_ptr, operand_u8);
        return Operand::u8(operand_u8);
    }
    case OperandType::TAG: {
        uint8_t operand_u8 = 0;
        serialize::read(pos_ptr, operand_u8);
        return Operand::u8(operand_u8 % static_cast<uint8_t>(MemoryTag::MAX) +
                           1); // Insecure bias but it is fine for testing purposes.
    }
    case OperandType::INDIRECT16: // Irrelevant bits might be toggled but they are ignored during address resolution.
    case OperandType::UINT16: {
        uint16_t operand_u16 = 0;
        serialize::read(pos_ptr, operand_u16);
        return Operand::u16(operand_u16);
    }
    case OperandType::UINT32: {
        uint32_t operand_u32 = 0;
        serialize::read(pos_ptr, operand_u32);
        return Operand::u32(operand_u32);
    }
    case OperandType::UINT64: {
        uint64_t operand_u64 = 0;
        serialize::read(pos_ptr, operand_u64);
        return Operand::u64(operand_u64);
    }
    case OperandType::UINT128: {
        uint128_t operand_u128 = 0;
        serialize::read(pos_ptr, operand_u128);
        return Operand::u128(operand_u128);
    }
    case OperandType::FF:
        return Operand::ff(FF::random_element());
    }

    // Need this for gcc compilation even though we fully handle the switch cases.
    // We never reach this point.
    __builtin_unreachable();
}

Instruction random_instruction(WireOpCode w_opcode)
{
    const auto format = simulation::testonly::get_instruction_wire_formats().at(w_opcode);
    std::vector<Operand> operands;
    uint16_t indirect = 0;
    operands.reserve(format.size()); // Might be a bit larger (due to indirect)

    for (const auto& operand_type : format) {
        switch (operand_type) {
        case OperandType::INDIRECT8:
        case OperandType::INDIRECT16:
            indirect = static_cast<uint16_t>(random_operand(operand_type));
            break;
        default:
            operands.emplace_back(random_operand(operand_type));
            break;
        }
    }

    return Instruction{
        .opcode = w_opcode,
        .indirect = indirect,
        .operands = std::move(operands),
    };
}

TestTraceContainer empty_trace()
{
    return TestTraceContainer::from_rows({ { .precomputed_first_row = 1 }, { .precomputed_clk = 1 } });
}

ContractInstance random_contract_instance()
{
    ContractInstance instance = { .salt = FF::random_element(),
                                  .deployer_addr = FF::random_element(),
                                  .contract_class_id = FF::random_element(),
                                  .initialisation_hash = FF::random_element(),
                                  .public_keys = PublicKeys{
                                      .nullifier_key = AffinePoint::random_element(),
                                      .incoming_viewing_key = AffinePoint::random_element(),
                                      .outgoing_viewing_key = AffinePoint::random_element(),
                                      .tagging_key = AffinePoint::random_element(),
                                  } };
    return instance;
}

std::pair<tracegen::TraceContainer, PublicInputs> get_minimal_trace_with_pi()
{
    AvmTraceGenHelper trace_gen_helper;

    auto trace = trace_gen_helper.generate_trace({
            .alu = { { .operation = simulation::AluOperation::ADD, .a = 1, .b = 2, .c = 3, .tag = MemoryTag::U16 }, },
        });

    return std::make_pair<tracegen::TraceContainer, PublicInputs>(std::move(trace), { .reverted = false });
}

bool skip_slow_tests()
{
    return std::getenv("AVM_SLOW_TESTS") == nullptr;
}

} // namespace bb::avm2::testing
