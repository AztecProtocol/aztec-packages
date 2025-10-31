// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib {

// A runtime-defined read-write memory table. Table entries must be initialized in the constructor.
// Works with UltraBuilder and MegaBuilder.
template <typename Builder> class ram_table {
  private:
    typedef field_t<Builder> field_pt;

  public:
    ram_table() {}
    ram_table(Builder* builder, const size_t table_size);
    ram_table(const std::vector<field_pt>& table_entries);
    ram_table(const ram_table& other);
    ram_table(ram_table&& other);

    void initialize_table() const;

    ram_table& operator=(const ram_table& other);
    ram_table& operator=(ram_table&& other);

    field_pt read(const field_pt& index) const;

    void write(const field_pt& index, const field_pt& value);

    size_t size() const { return length; }

    Builder* get_context() const { return context; }

    bool check_indices_initialized() const
    {
        if (all_entries_written_to_with_constant_index) {
            return true;
        }
        if (length == 0) {
            return false;
        }
        bool all_initialized = true;
        for (auto idx_init : index_initialized) {
            all_initialized = all_initialized && idx_init;
        }
        all_entries_written_to_with_constant_index = all_initialized;
        return all_entries_written_to_with_constant_index;
    }

  private:
    std::vector<field_pt> raw_entries;
    // Origin Tags for detection of dangerous interactions within stdlib primitives
    mutable std::vector<OriginTag> _tags;
    mutable std::vector<bool> index_initialized; // Keeps track if the indicies of the RAM table have been initialized
    size_t length = 0;
    mutable size_t ram_id = 0; // Identifier of this ROM table for the builder
    mutable bool ram_table_generated_in_builder = false;
    mutable bool all_entries_written_to_with_constant_index = false;
    mutable Builder* context = nullptr;
};
} // namespace bb::stdlib
