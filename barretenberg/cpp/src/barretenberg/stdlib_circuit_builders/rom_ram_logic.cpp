#include "rom_ram_logic.hpp"
#include "barretenberg/common/assert.hpp"
#include "ultra_circuit_builder.hpp"
#include <execution>

namespace bb {

template <typename ExecutionTrace> size_t RomRamLogic_<ExecutionTrace>::create_ROM_array(const size_t array_size)
{
    RomTranscript new_transcript;
    for (size_t i = 0; i < array_size; ++i) {
        new_transcript.state.emplace_back(
            std::array<uint32_t, 2>{ UNINITIALIZED_MEMORY_RECORD, UNINITIALIZED_MEMORY_RECORD });
    }
    rom_arrays.emplace_back(new_transcript);
    return rom_arrays.size() - 1;
}
/**
 * @brief Initialize a ROM cell to equal `value_witness` (or, more precisely, `(value_witness, 0)`.
 *
 * @note `index_value` is a RAW VALUE that describes the cell index inside of the specified ROM table (which we treat as
 * an array). It is NOT a witness. When intializing ROM arrays, it is important that the index of the cell is known when
 * compiling the circuit. This ensures that, for a given circuit, we know with 100% certainty that EVERY ROM cell is
 * initialized
 *
 * @note This method does not know what the value of `record_witness` will be.
 * @note There is nothing stopping us from running `set_ROM_element` on the same `rom_id` and `index_value` twice, as
 * long as the `value_witness` is the same both times.
 **/
template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::set_ROM_element(CircuitBuilder* builder,
                                                   const size_t rom_id,
                                                   const size_t index_value,
                                                   const uint32_t value_witness)
{
    BB_ASSERT_GT(rom_arrays.size(), rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    const uint32_t index_witness =
        (index_value == 0) ? builder->zero_idx() : builder->put_constant_variable((uint64_t)index_value);
    BB_ASSERT_GT(rom_array.state.size(), index_value);
    BB_ASSERT_EQ(rom_array.state[index_value][0], UNINITIALIZED_MEMORY_RECORD);

    RomRecord new_record{
        .index_witness = index_witness,
        .value_column1_witness = value_witness,
        .value_column2_witness = builder->zero_idx(),
        .index = static_cast<uint32_t>(index_value),
        .record_witness = 0,
        .gate_index = 0,
    };
    rom_array.state[index_value][0] = value_witness;
    rom_array.state[index_value][1] = builder->zero_idx();
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);
}
/**
 * @brief Initialize a ROM cell to `(value_witness[0], value_witness[1])`.
 */
template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::set_ROM_element_pair(CircuitBuilder* builder,
                                                        const size_t rom_id,
                                                        const size_t index_value,
                                                        const std::array<uint32_t, 2>& value_witnesses)
{
    BB_ASSERT_GT(rom_arrays.size(), rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    const uint32_t index_witness = builder->put_constant_variable((uint64_t)index_value);
    BB_ASSERT_GT(rom_array.state.size(), index_value);
    BB_ASSERT_EQ(rom_array.state[index_value][0], UNINITIALIZED_MEMORY_RECORD);
    RomRecord new_record{
        .index_witness = index_witness,
        .value_column1_witness = value_witnesses[0],
        .value_column2_witness = value_witnesses[1],
        .index = static_cast<uint32_t>(index_value),
        .record_witness = 0,
        .gate_index = 0,
    };
    rom_array.state[index_value][0] = value_witnesses[0];
    rom_array.state[index_value][1] = value_witnesses[1];
    // `create_ROM_gate` fills in the `gate_index` of the `RamRecord`.
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);
}

template <typename ExecutionTrace>
uint32_t RomRamLogic_<ExecutionTrace>::read_ROM_array(CircuitBuilder* builder,
                                                      const size_t rom_id,
                                                      const uint32_t index_witness)
{
    BB_ASSERT_GT(rom_arrays.size(), rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    BB_ASSERT_GT(rom_array.state.size(), index);
    BB_ASSERT(rom_array.state[index][0] != UNINITIALIZED_MEMORY_RECORD);
    const auto value = builder->get_variable(rom_array.state[index][0]);
    const uint32_t value_witness = builder->add_variable(value);
    RomRecord new_record{
        .index_witness = index_witness,
        .value_column1_witness = value_witness,
        .value_column2_witness = builder->zero_idx(),
        .index = index,
        .record_witness = 0,
        .gate_index = 0,
    };
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);

    return value_witness;
}

template <typename ExecutionTrace>
std::array<uint32_t, 2> RomRamLogic_<ExecutionTrace>::read_ROM_array_pair(CircuitBuilder* builder,
                                                                          const size_t rom_id,
                                                                          const uint32_t index_witness)
{
    std::array<uint32_t, 2> value_witnesses;

    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    BB_ASSERT_GT(rom_arrays.size(), rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    BB_ASSERT_GT(rom_array.state.size(), index);
    BB_ASSERT(rom_array.state[index][0] != UNINITIALIZED_MEMORY_RECORD);
    BB_ASSERT(rom_array.state[index][1] != UNINITIALIZED_MEMORY_RECORD);
    const auto value1 = builder->get_variable(rom_array.state[index][0]);
    const auto value2 = builder->get_variable(rom_array.state[index][1]);
    value_witnesses[0] = builder->add_variable(value1);
    value_witnesses[1] = builder->add_variable(value2);
    RomRecord new_record{
        .index_witness = index_witness,
        .value_column1_witness = value_witnesses[0],
        .value_column2_witness = value_witnesses[1],
        .index = index,
        .record_witness = 0,
        .gate_index = 0,
    };
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);

    return value_witnesses;
}

// There is one important difference between `create_ROM_gate` and `create_sorted_ROM_gate`: we apply a different memory
// selectors. We also only call `update_used_witnesses` for `record_witness` in the latter, but this is just for
// Boomerang value detection.

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_ROM_gate(CircuitBuilder* builder, RomRecord& record)
{
    // Record wire value can't yet be computed; it will be filled in later.
    record.record_witness = builder->add_variable(FF(0));
    builder->apply_memory_selectors(CircuitBuilder::MEMORY_SELECTORS::ROM_READ);
    builder->blocks.memory.populate_wires(
        record.index_witness, record.value_column1_witness, record.value_column2_witness, record.record_witness);
    // Note: record the index into the memory block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.memory.size() - 1;
    builder->check_selector_length_consistency();
    builder->increment_num_gates();
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_sorted_ROM_gate(CircuitBuilder* builder, RomRecord& record)
{
    record.record_witness = builder->add_variable(FF(0));
    // record_witness is intentionally used only in a single gate
    builder->update_used_witnesses(record.record_witness);
    builder->apply_memory_selectors(CircuitBuilder::MEMORY_SELECTORS::ROM_CONSISTENCY_CHECK);
    builder->blocks.memory.populate_wires(
        record.index_witness, record.value_column1_witness, record.value_column2_witness, record.record_witness);
    // Note: record the index into the memory block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.memory.size() - 1;
    builder->check_selector_length_consistency();
    builder->increment_num_gates();
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::process_ROM_array(CircuitBuilder* builder, const size_t rom_id)
{
    auto& rom_array = rom_arrays[rom_id];
    // when we process a given ROM array, we apply a "multiset equality check" between the records of the gates and then
    // the records of the sorted gates. at the time of witness generation, the prover certainly knows the permutation;
    // however, incarnating this with copy constraints would make the circuit (i.e., the VK) _witness dependent_.
    const auto read_tag = builder->get_new_tag();        // current_tag + 1;
    const auto sorted_list_tag = builder->get_new_tag(); // current_tag + 2;
    builder->create_tag(read_tag, sorted_list_tag);
    builder->create_tag(sorted_list_tag, read_tag);

    // Make sure that every cell has been initialized
    for (size_t i = 0; i < rom_array.state.size(); ++i) {
        if (rom_array.state[i][0] == UNINITIALIZED_MEMORY_RECORD) {
            set_ROM_element_pair(
                builder, rom_id, static_cast<uint32_t>(i), { builder->zero_idx(), builder->zero_idx() });
        }
    }

#ifdef NO_PAR_ALGOS
    std::sort(rom_array.records.begin(), rom_array.records.end());
#else
    std::sort(std::execution::par_unseq, rom_array.records.begin(), rom_array.records.end());
#endif

    for (const RomRecord& record : rom_array.records) {
        const auto index = record.index;
        const auto value1 = builder->get_variable(record.value_column1_witness);
        const auto value2 = builder->get_variable(record.value_column2_witness);
        const auto index_witness = builder->add_variable(FF((uint64_t)index));
        builder->update_used_witnesses(index_witness);
        const auto value1_witness = builder->add_variable(value1);
        const auto value2_witness = builder->add_variable(value2);
        // (the real values in) `sorted_record` will be identical to (those in) `record`, except with a different
        // `gate_index` field, which will be filled out by `create_sorted_ROM_Gate`.
        RomRecord sorted_record{
            .index_witness = index_witness,
            .value_column1_witness = value1_witness,
            .value_column2_witness = value2_witness,
            .index = index,
            .record_witness = 0,
            .gate_index = 0,
        };
        // the position of the sorted ROM gate in the execution trace depends on the witness data.
        create_sorted_ROM_gate(builder, sorted_record);

        builder->assign_tag(record.record_witness, read_tag);
        builder->assign_tag(sorted_record.record_witness, sorted_list_tag);

        // For ROM/RAM gates, the 'record' wire value (wire column 4) is a linear combination of the first 3 wire
        // values. However, the record value uses the random challenge 'eta', generated after the first 3 wires are
        // committed to. i.e., we can't compute the record witness here because we don't know what `eta` is! Take the
        // gate indices of the two rom gates (original read gate + sorted gate) and store in `memory_records`. Once we
        // generate the `eta` challenge, we'll use `memory_records` to figure out which gates need a record wire value
        // to be computed.
        //
        // `record` (w4) = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag (0 for reads, 1 for writes)
        // Separate containers used to store gate indices of reads and writes. Need to differentiate because of
        // `read_write_flag` (N.B. all ROM accesses are considered reads. Writes are for RAM operations)
        builder->memory_read_records.push_back(static_cast<uint32_t>(sorted_record.gate_index));
        builder->memory_read_records.push_back(static_cast<uint32_t>(record.gate_index));
    }
    // One of the checks we run on the sorted list is to validate the difference between the index field across two
    // adjacent gates is either 0 or 1. To make this work with the last gate, we add a dummy gate at the end of the
    // sorted list, where we set the first wire to equal `m + 1`, where `m` is the maximum allowed index in the sorted
    // list. Moreover, as `m + 1` is a circuit constant, this ensures that the checks correctly constrain the sorted ROM
    // gate chunks.
    FF max_index_value((uint64_t)rom_array.state.size());
    uint32_t max_index = builder->add_variable(max_index_value);

    builder->create_unconstrained_gate(
        builder->blocks.memory, max_index, builder->zero_idx(), builder->zero_idx(), builder->zero_idx());
    builder->create_big_add_gate(
        {
            max_index,
            builder->zero_idx(),
            builder->zero_idx(),
            builder->zero_idx(),
            1,
            0,
            0,
            0,
            -max_index_value,
        },
        false);
    // N.B. If the above check holds, we know the sorted list begins with an index value of 0,
    // because the first cell is explicitly initialized using zero_idx as the index field.
}

template <typename ExecutionTrace> void RomRamLogic_<ExecutionTrace>::process_ROM_arrays(CircuitBuilder* builder)
{
    for (size_t i = 0; i < rom_arrays.size(); ++i) {
        process_ROM_array(builder, i);
    }
}

template <typename ExecutionTrace> size_t RomRamLogic_<ExecutionTrace>::create_RAM_array(const size_t array_size)
{
    RamTranscript new_transcript;
    for (size_t i = 0; i < array_size; ++i) {
        new_transcript.state.emplace_back(UNINITIALIZED_MEMORY_RECORD);
    }
    ram_arrays.emplace_back(new_transcript);
    return ram_arrays.size() - 1;
}
/**
 * @brief Initialize an element of the RAM array
 *
 * @tparam ExecutionTrace
 * @param builder
 * @param ram_id
 * @param index_value raw index in the array specified by `ram_id`. NOT a witness index.
 * @param value_witness
 *
 * @note If not for the line `BB_ASSERT_EQ(ram_array.state[index_value], UNINITIALIZED_MEMORY_RECORD);`, we could
 * reinitialize an entry multiple times; there are no circuit constraints that prevent this. In particular, the
 * functionality is nearly identical to that of `write_RAM_array`. (The only difference is that the current method takes
 * a raw `index_value` while the latter takes a witness index.) Correspondingly, the `access_type` is
 * `RamRecord::AccessType::WRITE`.
 */
template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::init_RAM_element(CircuitBuilder* builder,
                                                    const size_t ram_id,
                                                    const size_t index_value,
                                                    const uint32_t value_witness)
{
    BB_ASSERT_GT(ram_arrays.size(), ram_id);
    RamTranscript& ram_array = ram_arrays[ram_id];
    const uint32_t index_witness =
        (index_value == 0) ? builder->zero_idx() : builder->put_constant_variable((uint64_t)index_value);
    BB_ASSERT_GT(ram_array.state.size(), index_value);
    BB_ASSERT_EQ(ram_array.state[index_value], UNINITIALIZED_MEMORY_RECORD);
    RamRecord new_record{ .index_witness = index_witness,
                          .timestamp_witness = builder->put_constant_variable((uint64_t)ram_array.access_count),
                          .value_witness = value_witness,
                          .index = static_cast<uint32_t>(index_value),
                          .timestamp = static_cast<uint32_t>(ram_array.access_count),
                          .access_type = RamRecord::AccessType::WRITE,
                          .record_witness = 0,
                          .gate_index = 0 };
    ram_array.state[index_value] = value_witness;
    ram_array.access_count++;
    // mutates the gate_index
    create_RAM_gate(builder, new_record);
    ram_array.records.emplace_back(new_record);
}

template <typename ExecutionTrace>
uint32_t RomRamLogic_<ExecutionTrace>::read_RAM_array(CircuitBuilder* builder,
                                                      const size_t ram_id,
                                                      const uint32_t index_witness)
{
    BB_ASSERT_GT(ram_arrays.size(), ram_id);
    RamTranscript& ram_array = ram_arrays[ram_id];
    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    BB_ASSERT_GT(ram_array.state.size(), index);
    BB_ASSERT(ram_array.state[index] != UNINITIALIZED_MEMORY_RECORD);
    const auto value = builder->get_variable(ram_array.state[index]);
    const uint32_t value_witness = builder->add_variable(value);

    RamRecord new_record{ .index_witness = index_witness,
                          .timestamp_witness = builder->put_constant_variable((uint64_t)ram_array.access_count),
                          .value_witness = value_witness,
                          .index = index,
                          .timestamp = static_cast<uint32_t>(ram_array.access_count),
                          .access_type = RamRecord::AccessType::READ,
                          .record_witness = 0,
                          .gate_index = 0 };

    // mutates `gate_index`
    create_RAM_gate(builder, new_record);
    ram_array.records.emplace_back(new_record);

    // increment ram array's access count
    ram_array.access_count++;

    // return witness index of the value in the array
    return value_witness;
}
/**
 * @brief write an value (given by its witness index) to a RAM array
 *
 * @tparam ExecutionTrace
 * @param builder
 * @param ram_id
 * @param index_witness
 * @param value_witness
 *
 * @note Other than taking in an `index_witness` rather than a raw `index`, this is _identical_ to `init_RAM_element`..
 * In particular, both use the `RamRecord::AccessType::WRITE`.
 */
template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::write_RAM_array(CircuitBuilder* builder,
                                                   const size_t ram_id,
                                                   const uint32_t index_witness,
                                                   const uint32_t value_witness)
{
    BB_ASSERT_GT(ram_arrays.size(), ram_id);
    RamTranscript& ram_array = ram_arrays[ram_id];
    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    BB_ASSERT_GT(ram_array.state.size(), index);
    BB_ASSERT(ram_array.state[index] != UNINITIALIZED_MEMORY_RECORD);

    RamRecord new_record{ .index_witness = index_witness,
                          .timestamp_witness = builder->put_constant_variable((uint64_t)ram_array.access_count),
                          .value_witness = value_witness,
                          .index = index,
                          .timestamp = static_cast<uint32_t>(ram_array.access_count),
                          .access_type = RamRecord::AccessType::WRITE,
                          .record_witness = 0,
                          .gate_index = 0 };
    // mutates `gate_index`
    create_RAM_gate(builder, new_record);
    ram_array.records.emplace_back(new_record);

    // increment ram array's access count
    ram_array.access_count++;

    // update Composer's current state of RAM array
    ram_array.state[index] = value_witness;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_RAM_gate(CircuitBuilder* builder, RamRecord& record)
{
    // Record wire value can't yet be computed (uses randomness generated during proof construction).
    // However it needs a distinct witness index,
    // we will be applying copy constraints + set membership constraints.
    // Later on during proof construction we will compute the record wire value + assign it
    record.record_witness = builder->add_variable(FF(0));
    builder->apply_memory_selectors(record.access_type == RamRecord::AccessType::READ
                                        ? CircuitBuilder::MEMORY_SELECTORS::RAM_READ
                                        : CircuitBuilder::MEMORY_SELECTORS::RAM_WRITE);
    builder->blocks.memory.populate_wires(
        record.index_witness, record.timestamp_witness, record.value_witness, record.record_witness);

    // Note: record the index into the block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.memory.size() - 1;
    builder->increment_num_gates();
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_sorted_RAM_gate(CircuitBuilder* builder, RamRecord& record)
{
    record.record_witness = builder->add_variable(FF(0));
    builder->apply_memory_selectors(CircuitBuilder::MEMORY_SELECTORS::RAM_CONSISTENCY_CHECK);
    builder->blocks.memory.populate_wires(
        record.index_witness, record.timestamp_witness, record.value_witness, record.record_witness);
    // Note: record the index into the memory block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.memory.size() - 1;
    builder->check_selector_length_consistency();
    builder->increment_num_gates();
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_final_sorted_RAM_gate(CircuitBuilder* builder,
                                                                RamRecord& record,
                                                                const size_t ram_array_size)
{
    record.record_witness = builder->add_variable(FF(0));
    // Note: record the index into the block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.memory.size(); // no -1 since we _haven't_ added the gate yet

    // Create a final gate with all selectors zero (hence unconstrained). In particular, the `MEMORY_SELECTORS` are not
    // on. Wire values are accessed by the previous RAM gate via shifted wires.
    builder->create_unconstrained_gate(builder->blocks.memory,
                                       record.index_witness,
                                       record.timestamp_witness,
                                       record.value_witness,
                                       record.record_witness);

    // Create an add gate ensuring the final index is consistent with the size of the RAM array
    builder->create_big_add_gate({
        record.index_witness,
        builder->zero_idx(),
        builder->zero_idx(),
        builder->zero_idx(),
        1,
        0,
        0,
        0,
        -FF(static_cast<uint64_t>(ram_array_size) - 1),
    });
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::process_RAM_array(CircuitBuilder* builder, const size_t ram_id)
{
    RamTranscript& ram_array = ram_arrays[ram_id];
    const auto access_tag = builder->get_new_tag();      // current_tag + 1;
    const auto sorted_list_tag = builder->get_new_tag(); // current_tag + 2;
    // when we process a given RAM array, we apply a "multiset equality check" between the records of the gates and then
    // the records of the sorted gates. at the time of witness generation, the prover certainly knows the permutation;
    // however, incarnating this with copy constraints would make the circuit (i.e., the VK) _witness dependent_.
    builder->create_tag(access_tag, sorted_list_tag);
    builder->create_tag(sorted_list_tag, access_tag);

    // NOTE: we simply assert that all cells have been initialized. The circuit should initialize all RAM elements to
    // prevent witness-dependent constraints. For example, if a RAM record is uninitialized but the index of that record
    // is a function of witness data (e.g. public/private inputs), different public inputs will produce different
    // circuit constraints, and in particular VKs will not be independent of witness generation.
    for (size_t i = 0; i < ram_array.state.size(); ++i) {
        BB_ASSERT_NEQ(ram_array.state[i], UNINITIALIZED_MEMORY_RECORD);
    }

#ifdef NO_PAR_ALGOS
    std::sort(ram_array.records.begin(), ram_array.records.end());
#else
    std::sort(std::execution::par_unseq, ram_array.records.begin(), ram_array.records.end());
#endif

    std::vector<RamRecord> sorted_ram_records;

    // Iterate over all but final RAM record. This is because one of the checks for the "interior" RAM gates is that the
    // next gate is also a RAM gate. We therfore apply a simplified check for the last gate.
    for (size_t i = 0; i < ram_array.records.size(); ++i) {
        const RamRecord& record = ram_array.records[i];

        const auto index = record.index;
        const auto value = builder->get_variable(record.value_witness);
        const auto index_witness = builder->add_variable(FF((uint64_t)index));
        const auto timestamp_witess = builder->add_variable(FF(record.timestamp));
        const auto value_witness = builder->add_variable(value);
        // (the values in) `sorted_record` will be identical to (the values in) `record`, except with a different
        // `gate_index` field, which will be fixed by `create_sorted_RAM_Gate` (resp. `created_final_sorted_RAM_Gate`).
        RamRecord sorted_record{
            .index_witness = index_witness,
            .timestamp_witness = timestamp_witess,
            .value_witness = value_witness,
            .index = index,
            .timestamp = record.timestamp,
            .access_type = record.access_type,
            .record_witness = 0,
            .gate_index = 0,
        };

        // create a list of sorted ram records
        sorted_ram_records.emplace_back(sorted_record);

        // We don't apply the RAM consistency check gate to the final record,
        // as this gate expects a RAM record to be present at the next gate
        if (i < ram_array.records.size() - 1) {
            create_sorted_RAM_gate(builder, sorted_record);
        } else {
            // For the final record in the sorted list, we do not apply the full consistency check gate.
            // Only need to check the index value = RAM array size - 1.
            create_final_sorted_RAM_gate(builder, sorted_record, ram_array.state.size());
        }

        // Assign record/sorted records to tags that we will perform set equivalence checks on
        builder->assign_tag(record.record_witness, access_tag);
        builder->assign_tag(sorted_record.record_witness, sorted_list_tag);

        // For ROM/RAM gates, the 'record' wire value (wire column 4) is a linear combination of the first 3 wire
        // values. However, the record value uses the random challenge 'eta', generated after the first 3 wires are
        // committed to. i.e. we can't compute the record witness here because we don't know what `eta` is!
        //
        // Take the gate indices of the two rom gates (original read gate + sorted gate) and store in `memory_records`.
        // Once we generate the `eta` challenge, we'll use `memory_records` to figure out which gates need a record wire
        // value to be computed.

        switch (record.access_type) {
        case RamRecord::AccessType::READ: {
            builder->memory_read_records.push_back(static_cast<uint32_t>(sorted_record.gate_index));
            builder->memory_read_records.push_back(static_cast<uint32_t>(record.gate_index));
            break;
        }
        case RamRecord::AccessType::WRITE: {
            builder->memory_write_records.push_back(static_cast<uint32_t>(sorted_record.gate_index));
            builder->memory_write_records.push_back(static_cast<uint32_t>(record.gate_index));
            break;
        }
        default: {
            throw_or_abort("Unexpected record.access_type."); // shouldn't get here!
        }
        }
    }

    // Step 2: Create gates that validate correctness of RAM timestamps

    std::vector<uint32_t> timestamp_deltas;
    // Guard against empty sorted_ram_records (e.g., RAM array of size 0)
    if (sorted_ram_records.size() <= 1) {
        return;
    }
    for (size_t i = 0; i < sorted_ram_records.size() - 1; ++i) {
        const auto& current = sorted_ram_records[i];
        const auto& next = sorted_ram_records[i + 1];

        const bool share_index = current.index == next.index;

        FF timestamp_delta = 0;
        if (share_index) {
            BB_ASSERT_GT(next.timestamp, current.timestamp);
            timestamp_delta = FF(next.timestamp - current.timestamp);
        }

        uint32_t timestamp_delta_witness = builder->add_variable(timestamp_delta);
        // note that the `index_witness` and `timestamp_witness` are taken from `current`. This means that there are
        // copy constraints, which will mean that once we constrain the sorted gates to be in lexicographic order,
        // these gates will _automatically_ be in lexicographic order.
        builder->apply_memory_selectors(CircuitBuilder::MEMORY_SELECTORS::RAM_TIMESTAMP_CHECK);
        builder->blocks.memory.populate_wires(
            current.index_witness, current.timestamp_witness, timestamp_delta_witness, builder->zero_idx());

        builder->increment_num_gates();

        // store timestamp offsets for later. Need to apply range checks to them, but calling
        // `create_new_range_constraint` can add gates, which could ruin the structure of our sorted timestamp list.
        timestamp_deltas.push_back(timestamp_delta_witness);
    }

    // add the index/timestamp values of the last sorted record in an empty add gate.
    // (the previous gate will access the wires on this gate and requires them to be those of the last record)
    const auto& last = sorted_ram_records[ram_array.records.size() - 1];
    builder->create_unconstrained_gate(
        builder->blocks.memory, last.index_witness, last.timestamp_witness, builder->zero_idx(), builder->zero_idx());

    // Step 3: validate that the timestamp_deltas (successive difference of timestamps for the same index) are
    // monotonically increasing. i.e. are <= maximum timestamp. NOTE: we do _not_ check that every possible
    // timestamp between 0 and `max_timestamp` occurs at least once (which corresponds to an "honest trace," e.g.,
    // one generated by the code in this file). However, our check nonetheless suffices for correct memory accesses.
    const size_t max_timestamp = ram_array.access_count - 1;
    for (auto& w : timestamp_deltas) {
        builder->create_new_range_constraint(w, max_timestamp);
    }
}

template <typename ExecutionTrace> void RomRamLogic_<ExecutionTrace>::process_RAM_arrays(CircuitBuilder* builder)
{
    for (size_t i = 0; i < ram_arrays.size(); ++i) {
        process_RAM_array(builder, i);
    }
}

// Template instantiations
template class RomRamLogic_<UltraExecutionTraceBlocks>;
template class RomRamLogic_<MegaExecutionTraceBlocks>;

} // namespace bb
