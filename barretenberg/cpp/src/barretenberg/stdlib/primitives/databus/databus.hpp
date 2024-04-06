#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/databus.hpp"

namespace bb::stdlib {

// WORKTODO: template with GoblinBuilder only
// WORKTODO: make this a member of the databus class. dont want it to be usable independently
template <typename Builder> class bus_vector {
  private:
    using field_pt = field_t<Builder>;

  public:
    bus_vector() = default;
    bus_vector(const std::vector<field_pt>& entries);
    bus_vector(const BusId bus_idx)
        : bus_idx(bus_idx){};

    void set_values(const std::vector<field_pt>& entries);

    void initialize() const;

    // Read from bus column with a constant index value. Does not add any gates
    field_pt operator[](size_t index) const;

    // Read from bus column with a witness index value. Creates a read gate
    field_pt operator[](const field_pt& index) const;

    size_t size() const { return length; }

    Builder* get_context() const { return context; }

  private:
    std::vector<field_pt> raw_entries;
    mutable std::vector<field_pt> entries;
    size_t length = 0;
    mutable BusId bus_idx; // Idx of column in bus
    mutable bool initialized = false;
    mutable Builder* context = nullptr;
};

template <typename Builder> struct databus {
    bus_vector<Builder> calldata{ BusId::CALLDATA };
    bus_vector<Builder> return_data{ BusId::RETURNDATA };

    databus() = default;
};
} // namespace bb::stdlib