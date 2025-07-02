#include "rom_ram_logic.hpp"
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
 * Initialize a ROM cell to equal `value_witness`
 * `index_value` is a RAW VALUE that describes the cell index. It is NOT a witness
 * When intializing ROM arrays, it is important that the index of the cell is known when compiling the circuit.
 * This ensures that, for a given circuit, we know with 100% certainty that EVERY rom cell is initialized
 **/
template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::set_ROM_element(CircuitBuilder* builder,
                                                   const size_t rom_id,
                                                   const size_t index_value,
                                                   const uint32_t value_witness)
{
    ASSERT(rom_arrays.size() > rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    const uint32_t index_witness =
        (index_value == 0) ? builder->zero_idx : builder->put_constant_variable((uint64_t)index_value);
    ASSERT(rom_array.state.size() > index_value);
    ASSERT(rom_array.state[index_value][0] == UNINITIALIZED_MEMORY_RECORD);

    RomRecord new_record{
        .index_witness = index_witness,
        .value_column1_witness = value_witness,
        .value_column2_witness = builder->zero_idx,
        .index = static_cast<uint32_t>(index_value),
        .record_witness = 0,
        .gate_index = 0,
    };
    rom_array.state[index_value][0] = value_witness;
    rom_array.state[index_value][1] = builder->zero_idx;
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::set_ROM_element_pair(CircuitBuilder* builder,
                                                        const size_t rom_id,
                                                        const size_t index_value,
                                                        const std::array<uint32_t, 2>& value_witnesses)
{
    ASSERT(rom_arrays.size() > rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    const uint32_t index_witness =
        (index_value == 0) ? builder->zero_idx : builder->put_constant_variable((uint64_t)index_value);
    ASSERT(rom_array.state.size() > index_value);
    ASSERT(rom_array.state[index_value][0] == UNINITIALIZED_MEMORY_RECORD);
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
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);
}

template <typename ExecutionTrace>
uint32_t RomRamLogic_<ExecutionTrace>::read_ROM_array(CircuitBuilder* builder,
                                                      const size_t rom_id,
                                                      const uint32_t index_witness)
{
    ASSERT(rom_arrays.size() > rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    ASSERT(rom_array.state.size() > index);
    ASSERT(rom_array.state[index][0] != UNINITIALIZED_MEMORY_RECORD);
    const auto value = builder->get_variable(rom_array.state[index][0]);
    const uint32_t value_witness = builder->add_variable(value);
    RomRecord new_record{
        .index_witness = index_witness,
        .value_column1_witness = value_witness,
        .value_column2_witness = builder->zero_idx,
        .index = index,
        .record_witness = 0,
        .gate_index = 0,
    };
    create_ROM_gate(builder, new_record);
    rom_array.records.emplace_back(new_record);

    // create_read_gate
    return value_witness;
}

template <typename ExecutionTrace>
std::array<uint32_t, 2> RomRamLogic_<ExecutionTrace>::read_ROM_array_pair(CircuitBuilder* builder,
                                                                          const size_t rom_id,
                                                                          const uint32_t index_witness)
{
    std::array<uint32_t, 2> value_witnesses;

    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    ASSERT(rom_arrays.size() > rom_id);
    RomTranscript& rom_array = rom_arrays[rom_id];
    ASSERT(rom_array.state.size() > index);
    ASSERT(rom_array.state[index][0] != UNINITIALIZED_MEMORY_RECORD);
    ASSERT(rom_array.state[index][1] != UNINITIALIZED_MEMORY_RECORD);
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

    // create_read_gate
    return value_witnesses;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_ROM_gate(CircuitBuilder* builder, RomRecord& record)
{
    // Record wire value can't yet be computed
    record.record_witness = builder->add_variable(0);
    builder->apply_aux_selectors(CircuitBuilder::AUX_SELECTORS::ROM_READ);
    builder->blocks.aux.populate_wires(
        record.index_witness, record.value_column1_witness, record.value_column2_witness, record.record_witness);
    // Note: record the index into the aux block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.aux.size() - 1;
    builder->check_selector_length_consistency();
    ++builder->num_gates;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_sorted_ROM_gate(CircuitBuilder* builder, RomRecord& record)
{
    record.record_witness = builder->add_variable(0);
    // record_witness is intentionally used only in a single gate
    builder->update_used_witnesses(record.record_witness);
    builder->apply_aux_selectors(CircuitBuilder::AUX_SELECTORS::ROM_CONSISTENCY_CHECK);
    builder->blocks.aux.populate_wires(
        record.index_witness, record.value_column1_witness, record.value_column2_witness, record.record_witness);
    // Note: record the index into the aux block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.aux.size() - 1;
    builder->check_selector_length_consistency();
    ++builder->num_gates;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::process_ROM_array(CircuitBuilder* builder, const size_t rom_id)
{
    auto& rom_array = rom_arrays[rom_id];
    const auto read_tag = builder->get_new_tag();        // current_tag + 1;
    const auto sorted_list_tag = builder->get_new_tag(); // current_tag + 2;
    builder->create_tag(read_tag, sorted_list_tag);
    builder->create_tag(sorted_list_tag, read_tag);

    // Make sure that every cell has been initialized
    for (size_t i = 0; i < rom_array.state.size(); ++i) {
        if (rom_array.state[i][0] == UNINITIALIZED_MEMORY_RECORD) {
            set_ROM_element_pair(builder, rom_id, static_cast<uint32_t>(i), { builder->zero_idx, builder->zero_idx });
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
        // the same thing as with the record witness
        builder->update_used_witnesses(index_witness);
        const auto value1_witness = builder->add_variable(value1);
        const auto value2_witness = builder->add_variable(value2);
        RomRecord sorted_record{
            .index_witness = index_witness,
            .value_column1_witness = value1_witness,
            .value_column2_witness = value2_witness,
            .index = index,
            .record_witness = 0,
            .gate_index = 0,
        };
        create_sorted_ROM_gate(builder, sorted_record);

        builder->assign_tag(record.record_witness, read_tag);
        builder->assign_tag(sorted_record.record_witness, sorted_list_tag);

        // For ROM/RAM gates, the 'record' wire value (wire column 4) is a linear combination of the first 3 wire
        // values. However...the record value uses the random challenge 'eta', generated after the first 3 wires are
        // committed to. i.e. we can't compute the record witness here because we don't know what `eta` is! Take the
        // gate indices of the two rom gates (original read gate + sorted gate) and store in `memory_records`. Once
        // we
        // generate the `eta` challenge, we'll use `memory_records` to figure out which gates need a record wire
        // value
        // to be computed.
        // record (w4) = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag (0 for reads, 1 for writes)
        // Separate containers used to store gate indices of reads and writes. Need to differentiate because of
        // `read_write_flag` (N.B. all ROM accesses are considered reads. Writes are for RAM operations)
        builder->memory_read_records.push_back(static_cast<uint32_t>(sorted_record.gate_index));
        builder->memory_read_records.push_back(static_cast<uint32_t>(record.gate_index));
    }
    // One of the checks we run on the sorted list, is to validate the difference between
    // the index field across two gates is either 0 or 1.
    // If we add a dummy gate at the end of the sorted list, where we force the first wire to
    // equal `m + 1`, where `m` is the maximum allowed index in the sorted list,
    // we have validated that all ROM reads are correctly constrained
    FF max_index_value((uint64_t)rom_array.state.size());
    uint32_t max_index = builder->add_variable(max_index_value);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/879): This was formerly a single arithmetic gate. A
    // dummy gate has been added to allow the previous gate to access the required wire data via shifts, allowing the
    // arithmetic gate to occur out of sequence.
    builder->create_dummy_gate(builder->blocks.aux, max_index, builder->zero_idx, builder->zero_idx, builder->zero_idx);
    builder->create_big_add_gate(
        {
            max_index,
            builder->zero_idx,
            builder->zero_idx,
            builder->zero_idx,
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

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::init_RAM_element(CircuitBuilder* builder,
                                                    const size_t ram_id,
                                                    const size_t index_value,
                                                    const uint32_t value_witness)
{
    ASSERT(ram_arrays.size() > ram_id);
    RamTranscript& ram_array = ram_arrays[ram_id];
    const uint32_t index_witness =
        (index_value == 0) ? builder->zero_idx : builder->put_constant_variable((uint64_t)index_value);
    ASSERT(ram_array.state.size() > index_value);
    ASSERT(ram_array.state[index_value] == UNINITIALIZED_MEMORY_RECORD);
    RamRecord new_record{ .index_witness = index_witness,
                          .timestamp_witness = builder->put_constant_variable((uint64_t)ram_array.access_count),
                          .value_witness = value_witness,
                          .index = static_cast<uint32_t>(index_value), // TODO: size_t?
                          .timestamp = static_cast<uint32_t>(ram_array.access_count),
                          .access_type = RamRecord::AccessType::WRITE,
                          .record_witness = 0,
                          .gate_index = 0 };
    ram_array.state[index_value] = value_witness;
    ram_array.access_count++;
    create_RAM_gate(builder, new_record);
    ram_array.records.emplace_back(new_record);
}

template <typename ExecutionTrace>
uint32_t RomRamLogic_<ExecutionTrace>::read_RAM_array(CircuitBuilder* builder,
                                                      const size_t ram_id,
                                                      const uint32_t index_witness)
{
    ASSERT(ram_arrays.size() > ram_id);
    RamTranscript& ram_array = ram_arrays[ram_id];
    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    ASSERT(ram_array.state.size() > index);
    ASSERT(ram_array.state[index] != UNINITIALIZED_MEMORY_RECORD);
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
    create_RAM_gate(builder, new_record);
    ram_array.records.emplace_back(new_record);

    // increment ram array's access count
    ram_array.access_count++;

    // return witness index of the value in the array
    return value_witness;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::write_RAM_array(CircuitBuilder* builder,
                                                   const size_t ram_id,
                                                   const uint32_t index_witness,
                                                   const uint32_t value_witness)
{
    ASSERT(ram_arrays.size() > ram_id);
    RamTranscript& ram_array = ram_arrays[ram_id];
    const uint32_t index = static_cast<uint32_t>(uint256_t(builder->get_variable(index_witness)));
    ASSERT(ram_array.state.size() > index);
    ASSERT(ram_array.state[index] != UNINITIALIZED_MEMORY_RECORD);

    RamRecord new_record{ .index_witness = index_witness,
                          .timestamp_witness = builder->put_constant_variable((uint64_t)ram_array.access_count),
                          .value_witness = value_witness,
                          .index = index,
                          .timestamp = static_cast<uint32_t>(ram_array.access_count),
                          .access_type = RamRecord::AccessType::WRITE,
                          .record_witness = 0,
                          .gate_index = 0 };
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
    // Record wire value can't yet be computed (uses randomnes generated during proof construction).
    // However it needs a distinct witness index,
    // we will be applying copy constraints + set membership constraints.
    // Later on during proof construction we will compute the record wire value + assign it
    record.record_witness = builder->add_variable(0);
    builder->apply_aux_selectors(record.access_type == RamRecord::AccessType::READ
                                     ? CircuitBuilder::AUX_SELECTORS::RAM_READ
                                     : CircuitBuilder::AUX_SELECTORS::RAM_WRITE);
    builder->blocks.aux.populate_wires(
        record.index_witness, record.timestamp_witness, record.value_witness, record.record_witness);

    // Note: record the index into the block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.aux.size() - 1;
    ++builder->num_gates;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_sorted_RAM_gate(CircuitBuilder* builder, RamRecord& record)
{
    record.record_witness = builder->add_variable(0);
    builder->apply_aux_selectors(CircuitBuilder::AUX_SELECTORS::RAM_CONSISTENCY_CHECK);
    builder->blocks.aux.populate_wires(
        record.index_witness, record.timestamp_witness, record.value_witness, record.record_witness);
    // Note: record the index into the aux block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.aux.size() - 1;
    builder->check_selector_length_consistency();
    ++builder->num_gates;
}

template <typename ExecutionTrace>
void RomRamLogic_<ExecutionTrace>::create_final_sorted_RAM_gate(CircuitBuilder* builder,
                                                                RamRecord& record,
                                                                const size_t ram_array_size)
{
    record.record_witness = builder->add_variable(0);
    // Note: record the index into the block that contains the RAM/ROM gates
    record.gate_index = builder->blocks.aux.size(); // no -1 since we havent added the gate yet

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/879): This method used to add a single arithmetic gate
    // with two purposes: (1) to provide wire values to the previous RAM gate via shifts, and (2) to perform a
    // consistency check on the value in wire 1. These two purposes have been split into a dummy gate and a simplified
    // arithmetic gate, respectively. This allows both purposes to be served even after arithmetic gates are sorted out
    // of sequence with the RAM gates.

    // Create a final gate with all selectors zero; wire values are accessed by the previous RAM gate via
    // shifted wires
    builder->create_dummy_gate(builder->blocks.aux,
                               record.index_witness,
                               record.timestamp_witness,
                               record.value_witness,
                               record.record_witness);

    // Create an add gate ensuring the final index is consistent with the size of the RAM array
    builder->create_big_add_gate({
        record.index_witness,
        builder->zero_idx,
        builder->zero_idx,
        builder->zero_idx,
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
    builder->create_tag(access_tag, sorted_list_tag);
    builder->create_tag(sorted_list_tag, access_tag);

    // Make sure that every cell has been initialized
    // TODO: throw some kind of error here? Circuit should initialize all RAM elements to prevent errors.
    // e.g. if a RAM record is uninitialized but the index of that record is a function of public/private inputs,
    // different public iputs will produce different circuit constraints.
    for (size_t i = 0; i < ram_array.state.size(); ++i) {
        if (ram_array.state[i] == UNINITIALIZED_MEMORY_RECORD) {
            init_RAM_element(builder, ram_id, static_cast<uint32_t>(i), builder->zero_idx);
        }
    }

#ifdef NO_PAR_ALGOS
    std::sort(ram_array.records.begin(), ram_array.records.end());
#else
    std::sort(std::execution::par_unseq, ram_array.records.begin(), ram_array.records.end());
#endif

    std::vector<RamRecord> sorted_ram_records;

    // Iterate over all but final RAM record.
    for (size_t i = 0; i < ram_array.records.size(); ++i) {
        const RamRecord& record = ram_array.records[i];

        const auto index = record.index;
        const auto value = builder->get_variable(record.value_witness);
        const auto index_witness = builder->add_variable(FF((uint64_t)index));
        const auto timestamp_witess = builder->add_variable(record.timestamp);
        const auto value_witness = builder->add_variable(value);
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
        // values. However...the record value uses the random challenge 'eta', generated after the first 3 wires are
        // committed to. i.e. we can't compute the record witness here because we don't know what `eta` is! Take the
        // gate indices of the two rom gates (original read gate + sorted gate) and store in `memory_records`. Once
        // we
        // generate the `eta` challenge, we'll use `memory_records` to figure out which gates need a record wire
        // value
        // to be computed.

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
            ASSERT(false); // shouldn't get here!
        }
        }
    }

    // Step 2: Create gates that validate correctness of RAM timestamps

    std::vector<uint32_t> timestamp_deltas;
    for (size_t i = 0; i < sorted_ram_records.size() - 1; ++i) {
        // create_RAM_timestamp_gate(sorted_records[i], sorted_records[i + 1])
        const auto& current = sorted_ram_records[i];
        const auto& next = sorted_ram_records[i + 1];

        const bool share_index = current.index == next.index;

        FF timestamp_delta = 0;
        if (share_index) {
            ASSERT(next.timestamp > current.timestamp);
            timestamp_delta = FF(next.timestamp - current.timestamp);
        }

        uint32_t timestamp_delta_witness = builder->add_variable(timestamp_delta);

        builder->apply_aux_selectors(CircuitBuilder::AUX_SELECTORS::RAM_TIMESTAMP_CHECK);
        builder->blocks.aux.populate_wires(
            current.index_witness, current.timestamp_witness, timestamp_delta_witness, builder->zero_idx);

        ++builder->num_gates;

        // store timestamp offsets for later. Need to apply range checks to them, but calling
        // `create_new_range_constraint` can add gates. Would ruin the structure of our sorted timestamp list.
        timestamp_deltas.push_back(timestamp_delta_witness);
    }

    // add the index/timestamp values of the last sorted record in an empty add gate.
    // (the previous gate will access the wires on this gate and requires them to be those of the last record)
    const auto& last = sorted_ram_records[ram_array.records.size() - 1];
    builder->create_dummy_gate(
        builder->blocks.aux, last.index_witness, last.timestamp_witness, builder->zero_idx, builder->zero_idx);

    // Step 3: validate difference in timestamps is monotonically increasing. i.e. is <= maximum timestamp
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
