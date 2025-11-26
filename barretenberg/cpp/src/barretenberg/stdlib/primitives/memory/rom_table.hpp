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

// A runtime-defined read-only memory table. Table entries must be initialized in the constructor.
// Works with UltraBuilder and MegaBuilder.
template <typename Builder> class rom_table {
  private:
    using field_pt = field_t<Builder>;

  public:
    rom_table() {};
    rom_table(const std::vector<field_pt>& table_entries);
    rom_table(const rom_table& other);
    rom_table(rom_table&& other);

    void initialize_table() const;

    rom_table& operator=(const rom_table& other);
    rom_table& operator=(rom_table&& other);

    // read from table with a constant index value. Does not add any gates
    field_pt operator[](const size_t index) const;

    // read from table with a witness index value. Adds 2 gates
    field_pt operator[](const field_pt& index) const;

    size_t size() const { return length; }

    Builder* get_context() const { return context; }

  private:
    std::vector<field_pt> raw_entries;     // the entries of the ROM table
    mutable std::vector<field_pt> entries; // processed version of `raw_entries`, where circuit constants are explicitly
                                           // turned into constant witnesses.
    // Origin Tags for detecting problematic interactions of stdlib primitives
    mutable std::vector<OriginTag> _tags;
    size_t length = 0;
    mutable size_t rom_id = 0; // Identifier of this ROM table for the builder.
    mutable bool initialized = false;
    mutable Builder* context = nullptr;
};
} // namespace bb::stdlib
