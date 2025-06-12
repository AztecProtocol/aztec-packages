#include "barretenberg/vm2/testing/fixtures.hpp"

#include <utility>
#include <vector>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
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

std::vector<ScopedL2ToL1Message> random_l2_to_l1_messages(size_t n)
{
    std::vector<ScopedL2ToL1Message> messages;
    messages.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        messages.push_back(ScopedL2ToL1Message{
            .message =
                L2ToL1Message{
                    .recipient = FF::random_element(),
                    .content = FF::random_element(),
                },
            .contractAddress = FF::random_element(),
        });
    }
    return messages;
}

std::vector<EnqueuedCallHint> random_enqueued_calls(size_t n)
{
    std::vector<EnqueuedCallHint> calls;
    calls.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        calls.push_back(EnqueuedCallHint{
            .msgSender = FF::random_element(),
            .contractAddress = FF::random_element(),
            .calldata = random_fields(5),
            .isStaticCall = rand() % 2 == 0,
        });
    }
    return calls;
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
        return Operand::from<uint8_t>(operand_u8);
    }
    case OperandType::TAG: {
        uint8_t operand_u8 = 0;
        serialize::read(pos_ptr, operand_u8);
        return Operand::from<uint8_t>(operand_u8 % static_cast<uint8_t>(MemoryTag::MAX) +
                                      1); // Insecure bias but it is fine for testing purposes.
    }
    case OperandType::INDIRECT16: // Irrelevant bits might be toggled but they are ignored during address resolution.
    case OperandType::UINT16: {
        uint16_t operand_u16 = 0;
        serialize::read(pos_ptr, operand_u16);
        return Operand::from<uint16_t>(operand_u16);
    }
    case OperandType::UINT32: {
        uint32_t operand_u32 = 0;
        serialize::read(pos_ptr, operand_u32);
        return Operand::from<uint32_t>(operand_u32);
    }
    case OperandType::UINT64: {
        uint64_t operand_u64 = 0;
        serialize::read(pos_ptr, operand_u64);
        return Operand::from<uint64_t>(operand_u64);
    }
    case OperandType::UINT128: {
        uint128_t operand_u128 = 0;
        serialize::read(pos_ptr, operand_u128);
        return Operand::from<uint128_t>(operand_u128);
    }
    case OperandType::FF:
        return Operand::from<FF>(FF::random_element());
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
            indirect = random_operand(operand_type).as<uint8_t>();
            break;
        case OperandType::INDIRECT16:
            indirect = random_operand(operand_type).as<uint16_t>();
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
                                  .current_class_id = FF::random_element(),
                                  .original_class_id = FF::random_element(),
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
    // cwd is expected to be barretenberg/cpp/build.
    auto data = read_file("../src/barretenberg/vm2/testing/minimal_tx.testdata.bin");
    AvmProvingInputs inputs = AvmProvingInputs::from(data);

    AvmSimulationHelper simulation_helper(inputs.hints);

    auto events = simulation_helper.simulate();

    AvmTraceGenHelper trace_gen_helper;

    auto trace = trace_gen_helper.generate_trace(std::move(events), inputs.publicInputs);

    return { std::move(trace), inputs.publicInputs };
}

bool skip_slow_tests()
{
    return std::getenv("AVM_SLOW_TESTS") == nullptr;
}

} // namespace bb::avm2::testing
