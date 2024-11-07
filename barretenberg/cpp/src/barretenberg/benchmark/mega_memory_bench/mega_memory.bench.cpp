#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/plookup/plookup.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include <benchmark/benchmark.h>
#pragma GCC diagnostic ignored "-Wunused-variable"

using namespace benchmark;
using namespace bb;
using namespace bb::plookup;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using DeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
using Builder = MegaCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using plookup_read = stdlib::plookup_read<Builder>;

// void to_run(State& state, TraceStructure structure)
// {
//     Builder builder;
//     builder.blocks.set_fixed_block_sizes(structure);

//     for (const auto& block : builder.blocks.get()) {
//         info(block.size(), " / ", block.get_fixed_size());
//     }

//     for (auto& block : builder.blocks.get()) {
//         const size_t target_size = block.get_fixed_size() - 10;
//         info("target size: ", target_size);

//         for (auto& vec : block.selectors) {
//             vec.reserve(target_size);
//             std::generate_n(std::back_inserter(vec), target_size, []() { return fr::random_element(); });
//         }

//         for (auto& vec : block.wires) {
//             vec.reserve(target_size);
//             std::generate_n(
//                 std::back_inserter(vec), target_size, []() { return static_cast<uint32_t>(fr::random_element()); });
//         }
//     }

//     for (const auto& block : builder.blocks.get()) {
//         info(block.size(), " / ", block.get_fixed_size());
//     }

//     for (auto _ : state) {
//         auto proving_key = std::make_shared<DeciderProvingKey>(builder, structure);
//         benchmark::DoNotOptimize(proving_key);
//     }
// }

static constexpr size_t NUM_SHORT = 10;

void fill_ecc_op_block(Builder& builder)
{
    const auto point = g1::affine_element::random_element();
    const auto scalar = fr::random_element();
    const size_t num_to_add((builder.blocks.ecc_op.get_fixed_size() - NUM_SHORT) >> 1); // each accum call adds two rows
    for (size_t idx = 0; idx < num_to_add; idx++) {
        builder.queue_ecc_mul_accum(point, scalar);
    }
}

void fill_pub_inputs_block(Builder& builder)
{
    for (size_t idx = 0; idx < builder.blocks.pub_inputs.get_fixed_size() - NUM_SHORT; idx++) {
        builder.add_public_variable(fr::random_element());
    }
}

void fill_databus_blocks(Builder& builder)
{
    static constexpr size_t NUM_BUS_IDS(3);
    const size_t num_gates_per_bus_id((builder.blocks.busread.get_fixed_size() - NUM_SHORT) / NUM_BUS_IDS);
    for (size_t idx = 1; idx < num_gates_per_bus_id + 1; idx++) { // start at 1 to avoid / by zero below
        const uint32_t idx_1_1 = builder.add_variable(fr::random_element());
        const uint32_t idx_1_2 = builder.add_variable(static_cast<uint32_t>(fr::random_element()) % idx);
        builder.add_public_calldata(idx_1_1);
        builder.read_calldata(idx_1_2);
        const uint32_t idx_2_1 = builder.add_variable(fr::random_element());
        const uint32_t idx_2_2 = builder.add_variable(static_cast<uint32_t>(fr::random_element()) % idx);
        builder.add_public_secondary_calldata(idx_2_1);
        builder.read_secondary_calldata(idx_2_2);
        const uint32_t idx_3_1 = builder.add_variable(fr::random_element());
        const uint32_t idx_3_2 = builder.add_variable(static_cast<uint32_t>(fr::random_element()) % idx);
        builder.add_public_return_data(idx_3_1);
        builder.read_return_data(idx_3_2);
    }
}

void fill_delta_range_block(Builder& builder)
{
    // At the moment the trace has space for 90k delta range gates but I don't think it's possible to use them all
    // because there is not enough capacity in the arithmetic block!

    const uint32_t idx_1 = builder.add_variable(1 << 0);
    builder.create_range_constraint(idx_1, 1, "whoops");
    const uint32_t idx_2 = builder.add_variable(1 << 1);
    builder.create_range_constraint(idx_2, 2, "whoops");
    const uint32_t idx_3 = builder.add_variable(1 << 2);
    builder.create_range_constraint(idx_3, 3, "whoops");
    const uint32_t idx_4 = builder.add_variable(1 << 3);
    builder.create_range_constraint(idx_4, 4, "whoops");
    const uint32_t idx_5 = builder.add_variable(1 << 4);
    builder.create_range_constraint(idx_5, 5, "whoops");
    const uint32_t idx_6 = builder.add_variable(1 << 5);
    builder.create_range_constraint(idx_6, 6, "whoops");
    const uint32_t idx_7 = builder.add_variable(1 << 6);
    builder.create_range_constraint(idx_7, 7, "whoops");
    const uint32_t idx_8 = builder.add_variable(1 << 7);
    builder.create_range_constraint(idx_8, 8, "whoops");
    const uint32_t idx_9 = builder.add_variable(1 << 8);
    builder.create_range_constraint(idx_9, 9, "whoops");
    const uint32_t idx_10 = builder.add_variable(1 << 9);
    builder.create_range_constraint(idx_10, 10, "whoops");
    const uint32_t idx_11 = builder.add_variable(1 << 10);
    builder.create_range_constraint(idx_11, 11, "whoops");
    const uint32_t idx_12 = builder.add_variable(1 << 11);
    builder.create_range_constraint(idx_12, 12, "whoops");
    const uint32_t idx_13 = builder.add_variable(1 << 12);
    builder.create_range_constraint(idx_13, 13, "whoops");
    const uint32_t idx_14 = builder.add_variable(1 << 13);
    builder.create_range_constraint(idx_14, 14, "whoops");
    // the above range constraints as 2759 gates
    static constexpr size_t NUM_GATES_ADDED_FOR_ALL_DEFAULT_RANGES = 2759;

    size_t num_range_constraints = 14;

    auto& range_block = builder.blocks.delta_range;
    auto& arith_block = builder.blocks.arithmetic;

    const auto range_block_has_space = [&range_block, &num_range_constraints]() {
        return num_range_constraints <
               4 * (range_block.get_fixed_size() - NUM_GATES_ADDED_FOR_ALL_DEFAULT_RANGES - NUM_SHORT);
    };

    const auto arith_block_has_space = [&arith_block]() {
        return arith_block.size() < arith_block.get_fixed_size() - 100;
    };

    while (range_block_has_space() && arith_block_has_space()) {
        const uint32_t w_idx = builder.add_variable(1023);
        builder.create_range_constraint(w_idx, 10, "failed to create range constraint");
        num_range_constraints++;
    }
}

void fill_arithmetic_block(Builder& builder)
{
    const uint32_t idx_1 = builder.add_variable(fr::random_element());
    const uint32_t idx_2 = builder.add_variable(fr::random_element());
    const uint32_t idx_3 = builder.add_variable(fr::random_element());
    const uint32_t idx_4 = builder.add_variable(fr::random_element());
    while (builder.blocks.arithmetic.size() < builder.blocks.arithmetic.get_fixed_size() - 10 * NUM_SHORT) {
        builder.create_big_add_gate({ idx_1, idx_2, idx_3, idx_4, 1, 1, 1, 1, 1 });
    }
}

void fill_elliptic_block(Builder& builder)
{
    const uint32_t x1_idx = builder.add_variable(fr::random_element());
    const uint32_t y1_idx = builder.add_variable(fr::random_element());
    const uint32_t x2_idx = builder.add_variable(fr::random_element());
    const uint32_t y2_idx = builder.add_variable(fr::random_element());
    const uint32_t x3_idx = builder.add_variable(fr::random_element());
    const uint32_t y3_idx = builder.add_variable(fr::random_element());
    while (builder.blocks.elliptic.size() < builder.blocks.elliptic.get_fixed_size() - 100) {
        builder.create_ecc_add_gate({ x1_idx, y1_idx, x2_idx, y2_idx, x3_idx, y3_idx, 1 });
    }
}

void fill_aux_block(Builder& builder)
{
    // static constexpr size_t NUM_AUX_TYPES = 11;
    auto& block = builder.blocks.aux;

    const uint32_t idx_1 = builder.add_variable(fr::random_element());
    const uint32_t idx_2 = builder.add_variable(fr::random_element());
    const uint32_t idx_3 = builder.add_variable(fr::random_element());
    const uint32_t idx_4 = builder.add_variable(fr::random_element());
    while (block.size() < block.get_fixed_size() - 100) {
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::ROM_READ);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::LIMB_ACCUMULATE_1);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::LIMB_ACCUMULATE_2);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::NON_NATIVE_FIELD_1);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::NON_NATIVE_FIELD_2);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::NON_NATIVE_FIELD_3);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::RAM_CONSISTENCY_CHECK);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::ROM_CONSISTENCY_CHECK);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::RAM_TIMESTAMP_CHECK);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::ROM_READ);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::RAM_READ);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
        builder.apply_aux_selectors(Builder::AUX_SELECTORS::RAM_WRITE);
        block.populate_wires(idx_1, idx_2, idx_3, idx_4);
    }
}

void fill_poseidon2_internal_block(Builder& builder)
{
    auto& block = builder.blocks.poseidon2_internal;
    const uint32_t idx_1 = builder.add_variable(fr::random_element());
    const uint32_t idx_2 = builder.add_variable(fr::random_element());
    const uint32_t idx_3 = builder.add_variable(fr::random_element());
    const uint32_t idx_4 = builder.add_variable(fr::random_element());

    while (block.size() < block.get_fixed_size() - NUM_SHORT) {
        builder.create_poseidon2_internal_gate({ idx_1, idx_2, idx_3, idx_4, 1 });
    }
}

void fill_poseidon2_external_block(Builder& builder)
{
    auto& block = builder.blocks.poseidon2_external;
    const uint32_t idx_1 = builder.add_variable(fr::random_element());
    const uint32_t idx_2 = builder.add_variable(fr::random_element());
    const uint32_t idx_3 = builder.add_variable(fr::random_element());
    const uint32_t idx_4 = builder.add_variable(fr::random_element());

    while (block.size() < block.get_fixed_size() - NUM_SHORT) {
        builder.create_poseidon2_external_gate({ idx_1, idx_2, idx_3, idx_4, 1 });
    }
}

void fill_lookup_block(Builder& builder)
{
    auto& block = builder.blocks.lookup;

    // static constexpr size_t NUM_LOOKUP_TYPES_USED(15);

    while (block.size() < (block.get_fixed_size() - 20 * NUM_SHORT)) {
        uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
        uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

        field_ct left = witness_ct(&builder, bb::fr(left_value));
        field_ct right = witness_ct(&builder, bb::fr(right_value));

        plookup_read::get_lookup_accumulators(MultiTableId::SHA256_CH_INPUT, left, right, true);
        // info("read SHA256_CH_INPUT");
        plookup_read::get_lookup_accumulators(MultiTableId::SHA256_CH_OUTPUT, left, right, true);
        // info("read SHA256_CH_OUTPUT");
        plookup_read::get_lookup_accumulators(MultiTableId::SHA256_MAJ_INPUT, left, right, true);
        // info("read SHA256_MAJ_INPUT");
        plookup_read::get_lookup_accumulators(MultiTableId::SHA256_MAJ_OUTPUT, left, right, true);
        // info("read SHA256_MAJ_OUTPUT");
        plookup_read::get_lookup_accumulators(MultiTableId::SHA256_WITNESS_INPUT, left, right, true);
        // info("read SHA256_WITNESS_INPUT");
        plookup_read::get_lookup_accumulators(MultiTableId::SHA256_WITNESS_OUTPUT, left, right, true);
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_XLO, left, right, true);
        // // info("read BN254_XLO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_XHI, left, right, true);
        // // info("read BN254_XHI");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_YLO, left, right, true);
        // // info("read BN254_YLO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_YHI, left, right, true);
        // // info("read BN254_YHI");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_XYPRIME, left, right, true);
        // // info("read BN254_XYPRIME");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_XLO_ENDO, left, right, true);
        // // info("read BN254_XLO_ENDO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_XHI_ENDO, left, right, true);
        // // info("read BN254_XHI_ENDO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::BN254_XYPRIME_ENDO, left, right, true);
        // // info("read BN254_XYPRIME_ENDO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_XLO, left, right, true);
        // // info("read SECP256K1_XLO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_XHI, left, right, true);
        // // info("read SECP256K1_XHI");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_YLO, left, right, true);
        // // info("read SECP256K1_YLO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_YHI, left, right, true);
        // // info("read SECP256K1_YHI");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_XYPRIME, left, right, true);
        // // info("read SECP256K1_XYPRIME");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_XLO_ENDO, left, right, true);
        // // info("read SECP256K1_XLO_ENDO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_XHI_ENDO, left, right, true);
        // // info("read SECP256K1_XHI_ENDO");
        // // plookup_read::get_lookup_accumulators(MultiTableId::SECP256K1_XYPRIME_ENDO, left, right, true);
        // // info("read SECP256K1_XYPRIME_ENDO");
        // plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR, left, right, true);
        // // info("read BLAKE_XOR");
        // plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR_ROTATE_16, left, right, true);
        // // info("read BLAKE_XOR_ROTATE_16");
        // plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR_ROTATE_8, left, right, true);
        // // info("read BLAKE_XOR_ROTATE_8");
        // plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR_ROTATE_7, left, right, true);
        // // info("read BLAKE_XOR_ROTATE_7");
        // // plookup_read::get_lookup_accumulators(MultiTableId::PEDERSEN_IV, left, right, true);
        // // info("read PEDERSEN_IV");
        // // plookup_read::get_lookup_accumulators(MultiTableId::KECCAK_THETA_OUTPUT, left, right, true);
        // // info("read KECCAK_THETA_OUTPUT");
        // // plookup_read::get_lookup_accumulators(MultiTableId::KECCAK_CHI_OUTPUT, left, right, true);
        // // info("read KECCAK_CHI_OUTPUT");
        // // plookup_read::get_lookup_accumulators(MultiTableId::KECCAK_FORMAT_INPUT, left, right, true);
        // // info("read KECCAK_FORMAT_INPUT");
        // // plookup_read::get_lookup_accumulators(MultiTableId::KECCAK_FORMAT_OUTPUT, left, right, true);
        // // info("read KECCAK_FORMAT_OUTPUT");
        // // plookup_read::get_lookup_accumulators(MultiTableId::KECCAK_NORMALIZE_AND_ROTATE, left, right, true);
        // // info("read KECCAK_NORMALIZE_AND_ROTATE");
    }
}

void to_run(State& state, TraceStructure structure)
{
    Builder builder;
    builder.blocks.set_fixed_block_sizes(structure);

    for (const auto& block : builder.blocks.get()) {
        info(block.size(), " / ", block.get_fixed_size());
    }

    fill_ecc_op_block(builder);
    fill_pub_inputs_block(builder);
    fill_databus_blocks(builder);
    fill_delta_range_block(builder);
    fill_arithmetic_block(builder); // must come after fill_delta_range_block
    fill_elliptic_block(builder);
    fill_aux_block(builder);
    fill_poseidon2_external_block(builder);
    fill_poseidon2_internal_block(builder);
    fill_lookup_block(builder);
    builder.finalize_circuit(/* ensure_nonzero */ false);
    info("DONE FILLING BLOCKS");

    for (size_t idx = 0; const auto& block : builder.blocks.get()) {
        bool overfilled = block.size() >= block.get_fixed_size();
        // ASSERT(!overfilled);
        if (overfilled) {
            info("block overfilled at index ", idx);
        }
        info(block.size(), " / ", block.get_fixed_size());
        idx++;
    }

    for (auto _ : state) {
        auto proving_key = std::make_shared<DeciderProvingKey>(builder, structure);
        benchmark::DoNotOptimize(proving_key);
    }
}

static void construct_dpk(State& state, void (*test_circuit_function)(State&, TraceStructure)) noexcept
{
    test_circuit_function(state, TraceStructure::E2E_FULL_TEST);
}

BENCHMARK_CAPTURE(construct_dpk, TraceStructure::CLIENT_IVC_BENCH, &to_run)->Unit(kMillisecond)->Iterations(1);

BENCHMARK_MAIN();
