#include "barretenberg/vm2/generated/relations/ecc.hpp"
#include <cassert>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>
#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/groups/affine_element.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/ecc_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;

using avm2::AffinePoint;
using bb::avm2::EmbeddedCurvePoint;
using bb::avm2::FF;
using bb::avm2::MemoryAddress;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using ecc_rel = bb::avm2::ecc<FF>;

namespace {

avm2::Fq random_fq_scalar(std::mt19937_64& rng)
{
    std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());

    std::array<uint64_t, 4> limbs;
    for (size_t i = 0; i < 4; ++i) {
        limbs[i] = dist(rng);
    }

    return avm2::Fq(limbs[0], limbs[1], limbs[2], limbs[3]);
}

// Right now just mutate the address within the u32 range
MemoryAddress mutate_memory_address(MemoryAddress addr, std::mt19937_64& rng)
{
    int choose_mutation = std::uniform_int_distribution<int>(0, 2)(rng);
    switch (choose_mutation) {
    case 0: {
        // Mutate by fixed amount
        std::uniform_int_distribution<int32_t> offset_dist(-1024, 1024);
        uint32_t offset = static_cast<uint32_t>(offset_dist(rng));
        return addr + offset;
    } break;
    case 1: {
        // Random new address
        std::uniform_int_distribution<uint32_t> dist(0, std::numeric_limits<uint32_t>::max());
        return dist(rng);
    }
    default:
        // No mutation
        return addr;
    }
}

} // namespace

struct EccFuzzerInput {
    AffinePoint p = AffinePoint::one();
    AffinePoint q = AffinePoint::one();
    // Addresses are organised as:
    // p_x, p_y, p_inf, q_x, q_y, q_inf, output_addr
    std::array<MemoryAddress, 7> addresses{};
    EccFuzzerInput() = default;

    // Serialize to buffer
    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        AffinePoint::serialize_to_buffer(p, buffer + offset);
        offset += sizeof(AffinePoint);
        AffinePoint::serialize_to_buffer(q, buffer + offset);
        offset += sizeof(AffinePoint);
        // Serialize memory addresses
        std::memcpy(buffer + offset, &addresses[0], sizeof(MemoryAddress) * 7);
    }

    static EccFuzzerInput from_buffer(const uint8_t* buffer)
    {
        EccFuzzerInput input;
        size_t offset = 0;
        input.p = AffinePoint::serialize_from_buffer(buffer + offset);
        offset += sizeof(AffinePoint);
        input.q = AffinePoint::serialize_from_buffer(buffer + offset);
        offset += sizeof(AffinePoint);
        // Deserialize memory addresses
        std::memcpy(&input.addresses[0], buffer + offset, sizeof(MemoryAddress) * 7);

        return input;
    }
};

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    if (size < sizeof(EccFuzzerInput)) {
        // Initialize with default input
        EccFuzzerInput input;
        input.to_buffer(data);
        return sizeof(EccFuzzerInput);
    }

    std::mt19937_64 rng(seed);

    // Deserialize current input
    EccFuzzerInput input = EccFuzzerInput::from_buffer(data);

    // We want to define sensible mutation of points as random bits are unlikely to yield valid points.
    // Lib Fuzzer will stack 5-6 mutations on top of each other by default
    std::uniform_int_distribution<int> dist(0, 4);
    int choice = dist(rng);

    switch (choice) {
    case 0: {
        // Set P to random valid point
        avm2::Fq rand_scalar = random_fq_scalar(rng);
        input.p = AffinePoint::one() * rand_scalar;
        break;
    }
    case 1: {
        // Set P to random invalid point
        avm2::FF rand_x = FF(random_fq_scalar(rng));
        avm2::FF rand_y = FF(random_fq_scalar(rng));
        input.p = AffinePoint(FF(rand_x), FF(rand_y));
        while (input.p.on_curve()) {
            // Ensure it's invalid
            input.p = AffinePoint(FF(rand_x + FF(1)), FF(rand_y));
        }

        break;
    }
    case 2: {
        // Set P to point at infinity
        input.p.set_infinity();
        break;
    }
    case 3: {
        // Swap P and Q
        std::swap(input.p, input.q);
        break;
    }
    case 4: {
        // Mutate memory addresses
        // Select a random address to mutate
        std::uniform_int_distribution<size_t> addr_dist(0, 6);
        size_t addr_index = addr_dist(rng);
        input.addresses[addr_index] = mutate_memory_address(input.addresses[addr_index], rng);
        break;
    }
    default:
        break;
    }

    // Serialize mutated input back to buffer
    input.to_buffer(data);

    if (max_size > sizeof(EccFuzzerInput)) {
        return sizeof(EccFuzzerInput);
    }

    return sizeof(EccFuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    if (size < sizeof(EccFuzzerInput)) {
        info("Input size too small");
        return 0;
    }

    // Parse input
    const EccFuzzerInput input = EccFuzzerInput::from_buffer(data);
    bool error = false;

    EmbeddedCurvePoint point_p =
        input.p.is_point_at_infinity() ? EmbeddedCurvePoint::infinity() : EmbeddedCurvePoint(input.p);
    EmbeddedCurvePoint point_q =
        input.q.is_point_at_infinity() ? EmbeddedCurvePoint::infinity() : EmbeddedCurvePoint(input.q);

    // Set up gadgets and event emitters
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    EventEmitter<EccAddEvent> ecadd_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_emitter;
    EventEmitter<EccAddMemoryEvent> add_memory_emitter;
    EventEmitter<ToRadixEvent> to_radix_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_memory_emitter;
    EventEmitter<MemoryEvent> memory_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);
    ExecutionIdManager execution_id_manager(0);
    ToRadix to_radix(execution_id_manager, greater_than, to_radix_emitter, to_radix_memory_emitter);
    Ecc ecc(execution_id_manager, greater_than, to_radix, ecadd_emitter, scalar_mul_emitter, add_memory_emitter);

    MemoryProvider mem_provider(range_check, execution_id_manager, memory_emitter);
    auto mem = mem_provider.make_memory(0);

    mem->set(/*p_x_addr*/ input.addresses[0], MemoryValue::from_tag(MemoryTag::FF, point_p.x()));
    mem->set(/*p_y_addr*/ input.addresses[1], MemoryValue::from_tag(MemoryTag::FF, point_p.y()));
    mem->set(/*p_inf*/ input.addresses[2], MemoryValue::from_tag(MemoryTag::U1, point_p.is_infinity() ? FF(1) : FF(0)));
    mem->set(/*q_x_addr*/ input.addresses[3], MemoryValue::from_tag(MemoryTag::FF, point_q.x()));
    mem->set(/*q_y_addr*/ input.addresses[4], MemoryValue::from_tag(MemoryTag::FF, point_q.y()));
    mem->set(/*q_inf*/ input.addresses[5], MemoryValue::from_tag(MemoryTag::U1, point_q.is_infinity() ? FF(1) : FF(0)));

    try {
        ecc.add(*mem, input.p, input.q, /* output_addr */ input.addresses[6]);
    } catch (std::exception& e) {
        // info("Caught exception during ECC add: {}", e.what());
        error = true;
    }
    if (!error) {
        AffinePoint expected_result = input.p + input.q;

        // Verify output in memory
        MemoryValue res_x = mem->get(input.addresses[6]);
        MemoryValue res_y = mem->get(input.addresses[6] + 1);
        MemoryValue res_inf = mem->get(input.addresses[6] + 2);

        EmbeddedCurvePoint result_point = EmbeddedCurvePoint(res_x.as_ff(), res_y.as_ff(), res_inf.as_ff() == FF(1));

        BB_ASSERT(result_point.x() == expected_result.x, "Result x-coordinate mismatch");
        BB_ASSERT(result_point.y() == expected_result.y, "Result y-coordinate mismatch");
        BB_ASSERT(result_point.is_infinity() == expected_result.is_point_at_infinity(),
                  "Result infinity flag mismatch");
    }

    // Initialize trace container and execution trace columns
    auto trace = TestTraceContainer({ {
        { avm2::Column::execution_context_id, 0 },
        // Point P
        { avm2::Column::execution_register_0_, point_p.x() },                           // = px
        { avm2::Column::execution_register_1_, point_p.y() },                           // = py
        { avm2::Column::execution_register_2_, point_p.is_infinity() ? FF(1) : FF(0) }, // = p_inf
        // Point Q
        { avm2::Column::execution_register_3_, point_q.x() },                           // = qx
        { avm2::Column::execution_register_4_, point_q.y() },                           // = qy
        { avm2::Column::execution_register_5_, point_q.is_infinity() ? FF(1) : FF(0) }, // = q_inf
        // Dst address
        { avm2::Column::execution_rop_6_, input.addresses[6] },      // = dst_addr
        { avm2::Column::execution_sel_exec_dispatch_ecc_add, 1 },    // = sel
        { avm2::Column::execution_sel_opcode_error, error ? 1 : 0 }, // = sel_err
    } });

    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    ToRadixTraceBuilder to_radix_builder;
    EccTraceBuilder builder;

    precomputed_builder.process_misc(trace, 2);
    range_check_builder.process(range_check_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_emitter.dump_events(), trace);
    gt_builder.process(greater_than_emitter.dump_events(), trace);
    to_radix_builder.process(to_radix_emitter.dump_events(), trace);
    builder.process_add_with_memory(add_memory_emitter.dump_events(), trace);
    builder.process_add(ecadd_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<ecc_rel>(trace);
    check_all_interactions<EccTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, bb::avm2::perm_execution_dispatch_to_ecc_add_settings>(trace);

    return 0;
}
