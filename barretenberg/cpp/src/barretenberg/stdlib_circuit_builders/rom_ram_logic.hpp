#pragma once

#include "barretenberg/common/assert.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace bb {
// Forward declaration
template <typename ExecutionTrace_> class UltraCircuitBuilder_;

// Constants
static constexpr uint32_t UNINITIALIZED_MEMORY_RECORD = UINT32_MAX;

/**
 * @brief A ROM memory record that can be ordered, where the ordering is given by the index (a.k.a. position in the ROM
 * array).
 *
 * @note A `RomRecord` is used both for setting ROM elements and reading ROM elements.
 * @note See `relations/memory_relation.hpp` for more details.
 */
struct RomRecord {
    uint32_t index_witness = 0; // Witness value of the index in the particular ROM block that contains this row.
    uint32_t value_column1_witness = 0;
    uint32_t value_column2_witness = 0;
    uint32_t index = 0;
    uint32_t record_witness = 0; // Record, a.k.a. "fingerprint" of the row.
    size_t gate_index = 0;       // Index in the memory block where the ROM gate will live.
    bool operator<(const RomRecord& other) const { return index < other.index; }
    bool operator==(const RomRecord& other) const noexcept
    {
        return index_witness == other.index_witness && value_column1_witness == other.value_column1_witness &&
               value_column2_witness == other.value_column2_witness && index == other.index &&
               record_witness == other.record_witness && gate_index == other.gate_index;
    }
};

/**
 * @brief A RAM memory record that can be ordered, first by index, then by timestamp.
 *
 * @note In distinction to a `RomRecord`, this also contains an `access_type` member, which records if the memory
 * operation is a READ or WRITE.
 * @note `timestamp` (resp. `timestamp_witness`) will _not_ be constrained to "increase by one". In particular, from the
 * perspective of the constraint system, we could _skip_ timestamps. The _consecutive differences_ of the
 * `timestamp_witness` fields in the sorted records will be constrained to be no greater than the final `access_count`.
 */
struct RamRecord {
    enum AccessType {
        READ,
        WRITE,
    };
    uint32_t index_witness = 0;
    uint32_t timestamp_witness = 0;
    uint32_t value_witness = 0;
    uint32_t index = 0;
    uint32_t timestamp = 0;
    AccessType access_type = AccessType::READ;
    uint32_t record_witness = 0; // Record, a.k.a. "fingerprint" of the row.
    size_t gate_index = 0;       // Index in the memory block where the RAM gate will live.
    bool operator<(const RamRecord& other) const
    {
        bool index_test = (index) < (other.index);
        return index_test || (index == other.index && timestamp < other.timestamp);
    }
    bool operator==(const RamRecord& other) const noexcept
    {
        return index_witness == other.index_witness && timestamp_witness == other.timestamp_witness &&
               value_witness == other.value_witness && index == other.index && timestamp == other.timestamp &&
               access_type == other.access_type && record_witness == other.record_witness &&
               gate_index == other.gate_index;
    }
};

/**
 * @brief `RomTranscript` contains the `RomRecord`s for a particular ROM table as well as the vector whose ith entry
 * corresponds to the ith value (or pair of values) of the ROM table.
 *
 * @note the values in the `state` vector are the _indicies_ of the values in the real variables array.
 */
struct RomTranscript {
    // Contains the value(s) of each index of the array. Note that each index/slot may contain _two_ values.
    std::vector<std::array<uint32_t, 2>> state;
    // A vector of records, each of which contains:
    // + The constant witness with the index
    // + The value in the memory slot
    // + The actual index value
    std::vector<RomRecord> records;
    // Used to check that the state hasn't changed in tests
    bool operator==(const RomTranscript& other) const noexcept
    {
        return (state == other.state && records == other.records);
    }
};

/**
 * @brief `RamTranscript` contains the `RamRecord`s for a particular RAM table (recording READ and WRITE operations) as
 * well as the vector whose ith entry corresponds to the _current_ ith value of the RAM table.
 */
struct RamTranscript {
    // Contains the value of each index of the array
    std::vector<uint32_t> state;
    // A vector of records, each of which contains:
    // + The constant witness with the index
    // + The type of operation (READ or WRITE)
    // + The _current_ value in the memory slot
    // + The actual index value
    std::vector<RamRecord> records;
    // The number of times this RAM array has been touched (i.e., has had a READ or WRITE operation performed on it).
    // used for RAM records, to compute the timestamp when performing a read/write. Note that the timestamp is _not_ a
    // global timestamp; rather, it is a timestamp for the RAM array in question.
    size_t access_count = 0;
    // Used to check that the state hasn't changed in tests
    bool operator==(const RamTranscript& other) const noexcept
    {
        return (state == other.state && records == other.records && access_count == other.access_count);
    }
};

/**
 * @brief ROM/RAM logic handler for UltraCircuitBuilder
 */
template <typename ExecutionTrace> class RomRamLogic_ {
  public:
    using FF = typename ExecutionTrace::FF;
    using CircuitBuilder = UltraCircuitBuilder_<ExecutionTrace>;

    // Storage
    /**
     * @brief Each entry in ram_arrays represents an independent RAM table.
     * RamTranscript tracks the current table state, as well as the 'records' produced by each read and write operation.
     * Used in `compute_prover_instance` to generate consistency check gates required to validate the RAM read/write
     * history
     */
    std::vector<RamTranscript> ram_arrays;
    /**
     * @brief Each entry in rom_arrays represents an independent ROM table.
     * RomTranscript tracks the current table state,
     * as well as the 'records' produced by each read operation.
     * Used in `compute_prover_instance` to generate consistency check gates required to validate the ROM read history
     */
    std::vector<RomTranscript> rom_arrays;

    RomRamLogic_() = default;

    // ROM operations
    /**
     * @brief Create a new read-only memory region
     *
     * @details Creates a transcript object, where the inside memory state array is filled with "uninitialized memory"
     * and empty memory record array. Puts this object into the vector of ROM arrays.
     *
     * @param array_size The size of region in elements
     * @return size_t The index of the element
     */
    size_t create_ROM_array(const size_t array_size);

    /**
     * @brief Initialize a rom cell to equal `value_witness`
     *
     * @param builder
     * @param rom_id The index of the ROM array, which cell we are initializing
     * @param index_value The index of the cell within the array (an actual index, not a witness index)
     * @param value_witness The index of the witness with the value that should be in the
     */
    void set_ROM_element(CircuitBuilder* builder,
                         const size_t rom_id,
                         const size_t index_value,
                         const uint32_t value_witness);
    /**
     * @brief Initialize a ROM array element with a pair of witness values
     *
     * @param builder
     * @param rom_id  ROM array id
     * @param index_value Index in the array
     * @param value_witnesses The witnesses to put in the slot
     */
    void set_ROM_element_pair(CircuitBuilder* builder,
                              const size_t rom_id,
                              const size_t index_value,
                              const std::array<uint32_t, 2>& value_witnesses);
    /**
     * @brief Read a single element from ROM
     *
     * @param builder
     * @param rom_id ROM array id
     * @param index_witness The witness with the index inside the array
     * @return uint32_t Cell value witness index
     *
     * @note If the entry in the index had two entries (i.e., was initialized with `set_ROM_element_pair`), then calling
     * this method will cause a non-satisfying witness (unless we happened to have set the second entry to `FF:zero()`).
     */
    uint32_t read_ROM_array(CircuitBuilder* builder, const size_t rom_id, const uint32_t index_witness);
    /**
     * @brief  Read a pair of elements from ROM
     *
     * @param rom_id The id of the ROM array
     * @param index_witness The witness containing the index in the array
     * @return std::array<uint32_t, 2> A pair of indexes of witness variables of cell values
     */
    std::array<uint32_t, 2> read_ROM_array_pair(CircuitBuilder* builder,
                                                const size_t rom_id,
                                                const uint32_t index_witness);
    /**
     * @brief
     * Gate that'reads' from a ROM table, i.e., the table index is a witness not precomputed
     *
     * @param builder
     * @param record Stores details of this read operation. Mutated by this fn!
     */
    void create_ROM_gate(CircuitBuilder* builder, RomRecord& record);
    /**
     * @brief Gate that performs consistency checks to validate that a claimed ROM read value is correct
     *
     * @details sorted ROM gates are generated sequentially, each ROM record is sorted by index
     *
     * @param builder
     * @param record Stores details of this read operation. Mutated by this fn!
     */
    void create_sorted_ROM_gate(CircuitBuilder* builder, RomRecord& record);
    /**
     * @brief Compute additional gates required to validate ROM reads. Called when generating the proving key
     *
     * @param builder
     * @param rom_id The id of the ROM table
     * @param gate_offset_from_public_inputs Required to track the gate position of where we're adding extra gates
     */
    void process_ROM_array(CircuitBuilder* builder, const size_t rom_id);
    /**
     * @brief Process all of the ROM arrays.
     */
    void process_ROM_arrays(CircuitBuilder* builder);

    // RAM operations
    /**
     * @brief Create a new updatable memory region
     *
     * @details Creates a transcript object, where the inside memory state array is filled with "uninitialized memory"
     * and empty memory record array. Puts this object into the vector of ROM arrays.
     *
     * @param array_size The size of region in elements
     * @return size_t The index of the element
     */
    size_t create_RAM_array(const size_t array_size);
    /**
     * @brief Initialize a RAM cell to equal `value_witness`
     *
     * @param builder
     * @param ram_id The index of the RAM array, which cell we are initializing
     * @param index_value The index of the cell within the array (an actual index, not a witness index)
     * @param value_witness The index of the witness with the value that should be in the
     */
    void init_RAM_element(CircuitBuilder* builder,
                          const size_t ram_id,
                          const size_t index_value,
                          const uint32_t value_witness);
    uint32_t read_RAM_array(CircuitBuilder* builder, const size_t ram_id, const uint32_t index_witness);
    /**
     * @brief Write a cell in a RAM array.
     *
     * @param builder
     * @param ram_id The index of the RAM array, whose cell we are (re)writing
     * @param index_witness The _witness_ of the index cell in the RAM array. This is as a safeguard to make sure we
     * have _already_ initialized the RAM cell, so that we in particular have access to the index witness.
     * @param value_witness
     */
    void write_RAM_array(CircuitBuilder* builder,
                         const size_t ram_id,
                         const uint32_t index_witness,
                         const uint32_t value_witness);
    /**
     * @brief Gate that performs a read/write operation into a RAM table, i.e. table index is a witness not precomputed
     *
     * @param builder
     * @param record Stores details of this read operation. Mutated by this fn!
     */
    void create_RAM_gate(CircuitBuilder* builder, RamRecord& record);
    /**
     * @brief Gate that performs consistency checks to validate that a claimed RAM read/write value is
     * correct
     *
     * @details sorted RAM gates are generated sequentially, each RAM record is sorted first by index then by timestamp
     *
     * @param builder
     * @param record Stores details of this read operation. Mutated by this fn!
     */
    void create_sorted_RAM_gate(CircuitBuilder* builder, RamRecord& record);
    /**
     * @brief Performs consistency checks to validate that a claimed RAM read/write value is correct.
     * Used for the final gate in a list of sorted RAM records
     *
     * @param builder
     * @param record Stores details of this read operation. Mutated by this fn!
     */
    void create_final_sorted_RAM_gate(CircuitBuilder* builder, RamRecord& record, const size_t ram_array_size);
    /**
     * @brief Compute additional gates required to validate RAM read/writes. Called when generating the proving key
     *
     * @param ram_id The id of the RAM table
     * @param gate_offset_from_public_inputs Required to track the gate position of where we're adding extra gates
     */
    void process_RAM_array(CircuitBuilder* builder, const size_t ram_id);
    void process_RAM_arrays(CircuitBuilder* builder);

    bool operator==(const RomRamLogic_& other) const noexcept
    {
        return ram_arrays == other.ram_arrays && rom_arrays == other.rom_arrays;
    }
};

} // namespace bb
