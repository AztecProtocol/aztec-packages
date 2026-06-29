#include "barretenberg/vm2/testing/fixtures.hpp"

#include <utility>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/testing/bytecode_builder.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
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
            .contract_address = FF::random_element(),
        });
    }
    return messages;
}

std::vector<PublicCallRequestWithCalldata> random_enqueued_calls(size_t n)
{
    std::vector<PublicCallRequestWithCalldata> calls;
    calls.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        calls.push_back(PublicCallRequestWithCalldata{
            .request{
                .msg_sender = FF::random_element(),
                .contract_address = FF::random_element(),
                .is_static_call = rand() % 2 == 0,
            },
            .calldata = random_fields(5),
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
    uint16_t addressing_mode = 0;
    operands.reserve(format.size()); // Might be a bit larger (due to addressing_mode)

    for (const auto& operand_type : format) {
        switch (operand_type) {
        case OperandType::INDIRECT8:
            addressing_mode = random_operand(operand_type).as<uint8_t>();
            break;
        case OperandType::INDIRECT16:
            addressing_mode = random_operand(operand_type).as<uint16_t>();
            break;
        default:
            operands.emplace_back(random_operand(operand_type));
            break;
        }
    }

    return Instruction{
        .opcode = w_opcode,
        .addressing_mode = addressing_mode,
        .operands = std::move(operands),
    };
}

TestTraceContainer empty_trace()
{
    using C = Column;
    return TestTraceContainer({ { { C::precomputed_first_row, 1 } }, { { C::precomputed_idx, 1 } } });
}

ContractInstance random_contract_instance()
{
    ContractInstance instance = { .salt = FF::random_element(),
                                  .deployer = FF::random_element(),
                                  .current_contract_class_id = FF::random_element(),
                                  .original_contract_class_id = FF::random_element(),
                                  .initialization_hash = FF::random_element(),
                                  .immutables_hash = FF::random_element(),
                                  .public_keys = PublicKeys{
                                      .nullifier_key_hash = FF::random_element(),
                                      .incoming_viewing_key = AffinePoint::random_element(),
                                      .outgoing_viewing_key_hash = FF::random_element(),
                                      .tagging_key_hash = FF::random_element(),
                                      .message_signing_key_hash = FF::random_element(),
                                      .fallback_key_hash = FF::random_element(),
                                  } };
    return instance;
}

ContractInstance random_protocol_contract_instance()
{
    ContractInstance instance = random_contract_instance();
    instance.current_contract_class_id = instance.original_contract_class_id;
    return instance;
}

ContractClass random_contract_class(size_t bytecode_size)
{
    return ContractClass{ .id = FF::random_element(),
                          .artifact_hash = FF::random_element(),
                          .private_functions_root = FF::random_element(),
                          .packed_bytecode = random_bytes(bytecode_size) };
}

AvmProvingInputs get_minimal_proving_inputs()
{
    // Minimal program: SET 1 -> [0], SET 2 -> [1], ADD [0]+[1] -> [2], RETURN mem[0..mem[0]) from [2].
    auto bytecode = BytecodeBuilder()
                        .add(InstructionBuilder(WireOpCode::SET_8)
                                 .operand<uint8_t>(0)
                                 .operand(MemoryTag::U32)
                                 .operand<uint8_t>(1)
                                 .build())
                        .add(InstructionBuilder(WireOpCode::SET_8)
                                 .operand<uint8_t>(1)
                                 .operand(MemoryTag::U32)
                                 .operand<uint8_t>(2)
                                 .build())
                        .add(InstructionBuilder(WireOpCode::ADD_8)
                                 .operand<uint8_t>(0)
                                 .operand<uint8_t>(1)
                                 .operand<uint8_t>(2)
                                 .build())
                        .add(InstructionBuilder(WireOpCode::RETURN).operand<uint16_t>(0).operand<uint16_t>(2).build())
                        .build();

    PublicTxSimulationTester tester;
    const auto deployed = tester.deploy_contract(bytecode);

    PublicSimulatorConfig config = PublicTxSimulationTester::default_config();
    config.collect_hints = true;
    config.collect_public_inputs = true;
    const TxSimulationResult result =
        tester.simulate_tx({ TestEnqueuedCall{ .contract_address = deployed.address } }, config);

    return AvmProvingInputs{ .public_inputs = result.public_inputs.value(), .hints = result.hints.value() };
}

std::pair<tracegen::TraceContainer, PublicInputs> get_minimal_trace_with_pi()
{
    AvmProvingInputs inputs = get_minimal_proving_inputs();

    AvmSimulationHelper simulation_helper;

    auto events = simulation_helper.simulate_for_witgen(inputs.hints);

    AvmTraceGenHelper trace_gen_helper;
    auto trace = trace_gen_helper.generate_trace(std::move(events), inputs.public_inputs);

    return { std::move(trace), inputs.public_inputs };
}

bool skip_slow_tests()
{
    return std::getenv("AVM_SKIP_SLOW_TESTS") != nullptr;
}

} // namespace bb::avm2::testing
