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

        /**
         * @brief Set the raw bus vector entries (possibly unnormalized or constant)
         * @note A builder/context may not be known at the time when this data is set
         *
         * @tparam Builder
         * @param entries_in
         */
        void set_values(const std::vector<field_pt>& entries_in);

        /**
         * @brief Initialize the bus vector entries from the raw entries (which are unnormalized and possibly constants)
         * @note This method must be called only once the context has been set, e.g. after performing the first read
         *
         * @tparam Builder
         */
        void initialize() const;

        // Read from bus column with a constant index value. Does not add any gates
        field_pt operator[](size_t index) const;

        /**
         * @brief Read from the bus vector with a witness index value. Creates a read gate
         *
         * @param index
         * @return field_pt
         */
        field_pt operator[](const field_pt& index) const;

        size_t size() const { return length; }
        Builder* get_context() const { return context; }

      private:
        std::vector<field_pt> raw_entries;     // equivalent precursor to 'entries': unnormalized and possibly constant
        mutable std::vector<field_pt> entries; // genuine bus vector entries
        size_t length = 0;
        BusId bus_idx; // Idx of column in bus
        mutable bool initialized = false;
        mutable Builder* context = nullptr;
    };

  public:
    // The columns of the DataBus
    bus_vector calldata{ BusId::CALLDATA };
    bus_vector return_data{ BusId::RETURNDATA };
};
} // namespace bb::stdlib