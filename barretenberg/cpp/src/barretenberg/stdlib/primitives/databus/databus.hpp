#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/databus.hpp"

namespace bb::stdlib {

// WORKTODO: template with GoblinBuilder only
template <typename Builder> class databus {
  public:
    databus() = default;

  private:
    class bus_vector {
      private:
        using field_pt = field_t<Builder>;

      public:
        // bus_vector() = default;
        bus_vector(const std::vector<field_pt>& entries_in)
            : raw_entries(entries_in)
            , length(raw_entries.size()){
                // do not initialize the table yet. The input entries might all be constant,
                // if this is the case we might not have a valid pointer to a Builder
                // We get around this, by initializing the table when `operator[]` is called
                // with a non-const field element.
            };

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

  public:
    bus_vector calldata{ BusId::CALLDATA };
    bus_vector return_data{ BusId::RETURNDATA };
};
} // namespace bb::stdlib