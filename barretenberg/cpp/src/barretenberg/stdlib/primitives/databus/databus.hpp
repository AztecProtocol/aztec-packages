#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/databus.hpp"

namespace bb::stdlib {

template <typename Builder> class databus {
  public:
    databus() = default;

  private:
    class bus_vector {
      private:
        using field_pt = field_t<Builder>;

      public:
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
        BusId bus_idx; // Idx of column in bus
        mutable bool initialized = false;
        mutable Builder* context = nullptr;
    };

  public:
    bus_vector calldata{ BusId::CALLDATA };
    bus_vector return_data{ BusId::RETURNDATA };
};
} // namespace bb::stdlib