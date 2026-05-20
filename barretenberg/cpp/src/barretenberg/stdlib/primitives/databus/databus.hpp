// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
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
        bus_vector() = default;

        bus_vector(const BusId bus_idx)
            : bus_idx(bus_idx) {};

        /**
         * @brief Set the entries of the bus vector from possibly unnormalized or constant inputs
         * @details Creates a databus read gate for each slot to bind the bus entry to its corresponding witness in the
         * main wires.
         * @note A builder/context is assumed to be known at this stage, otherwise the first read will fail if index is
         * constant
         *
         * @tparam Builder
         * @param entries_in
         */
        void set_values(const std::vector<field_pt>& entries_in)
            requires IsMegaBuilder<Builder>;

        /**
         * @brief Read from the bus vector with a witness index value. Creates a read gate
         *
         * @param index
         * @return field_pt
         */
        field_pt operator[](const field_pt& index) const
            requires IsMegaBuilder<Builder>;

        size_t size() const { return length; }
        Builder* get_context() const { return context; }
        void set_context(Builder* builder_context) { context = builder_context; }

      private:
        mutable std::vector<field_pt> entries; // bus vector entries
        std::vector<OriginTag> _tags;          // origin tags for each entry (restored on read)
        size_t length = 0;
        BusId bus_idx; // Idx of column in bus
        mutable Builder* context = nullptr;
    };

  public:
    // The columns of the DataBus.
    bus_vector kernel_calldata{ BusId::KERNEL_CALLDATA };
    std::array<bus_vector, MAX_APPS_PER_KERNEL> app_calldata = []() {
        std::array<bus_vector, MAX_APPS_PER_KERNEL> result{};
        for (uint8_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
            result[idx] = bus_vector{ static_cast<BusId>(idx + 1) };
        }
        return result;
    }();
    bus_vector return_data{ BusId::RETURNDATA };
};

/**
 * @brief Class for managing propagation of databus return data commitments used in consistency checks
 * @details The databus consistency checks establish the transfer of data between two circuits (i-1 and i) in a third
 * circuit (i+1) via commitment equality checks of the form [R_{i-1}] = [C_i], where R and C represent return data and
 * calldata, respectively. In practice, circuit (i+1) is given access to [R_{i-1}] via the public inputs of
 * \pi_i, and it has access to [C_i] directly from \pi_i. The consistency checks in circuit (i+1) are thus of the
 * form \pi_i.public_inputs.[R_{i-1}] = \pi_i.[C_i].
 *
 * For consistent behavior across kernels, every kernel propagates `MAX_APPS_PER_KERNEL + 1` return-data commitments
 * via its public inputs: one for the previous kernel and one per app slot. If any of these does not exist (e.g., the
 * first kernel has no previous kernel; a kernel with fewer than MAX apps leaves the trailing app slots unset), it is
 * populated with a default commitment value that will satisfy the consistency check on the next cycle. The "empty"
 * calldata column on the next kernel side will commit to the same default value, so the commitments agree and the
 * consistency check passes trivially.
 *
 * @tparam Builder
 */
template <class Builder> class DataBusDepot {
  public:
    using Curve = stdlib::bn254<Builder>;
    using Commitment = typename Curve::Group;
    using CommitmentNative = typename Curve::AffineElementNative;
    using FrNative = typename Curve::ScalarFieldNative;

    // Storage for the return data commitments to be propagated via the public inputs
    std::array<Commitment, MAX_APPS_PER_KERNEL> app_return_data_commitments;
    Commitment kernel_return_data_commitment;

    // Existence flags indicating whether each return data commitment has been set
    std::array<bool, MAX_APPS_PER_KERNEL> app_return_data_commitment_exists = []() {
        std::array<bool, MAX_APPS_PER_KERNEL> result{};
        result.fill(false);
        return result;
    }();
    bool kernel_return_data_commitment_exists = false;

    void set_kernel_return_data_commitment(const Commitment& commitment)
    {
        kernel_return_data_commitment = commitment;
        kernel_return_data_commitment_exists = true;
    }

    /**
     * @brief Whether all app return-data slots are currently empty.
     * @details Used to assert the kernel-boundary invariant: at the start of each kernel completion, every slot must
     * have been drained by the prior kernel's get-loop so that `set_app_return_data_commitment` begins filling from
     * slot 0.
     */
    bool app_return_data_slots_are_empty() const
    {
        for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
            if (app_return_data_commitment_exists[idx]) {
                return false;
            }
        }
        return true;
    }

    /**
     * @brief Record an app return-data commitment in the next available slot.
     * @details Slot assignment is implicit: the depot fills slot 0 first, then slot 1, etc., as apps are processed in
     * the kernel's verification queue. Slots are released by `get_app_return_data_commitment`; each kernel-completion
     * pass drains every slot via the get-loop in `Chonk::complete_kernel_circuit_logic`, so the next kernel begins
     * filling from slot 0 again.
     */
    void set_app_return_data_commitment(const Commitment& commitment)
    {
        for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
            if (!app_return_data_commitment_exists[idx]) {
                app_return_data_commitments[idx] = commitment;
                app_return_data_commitment_exists[idx] = true;
                return;
            }
        }
        BB_ASSERT(false, "DataBusDepot has no free app return-data slot");
    }

    /**
     * @brief Construct a default commitment for the databus return data
     * @details Returns the point at infinity. This matches the commitment to a databus column containing only
     * zero-valued entries (DEFAULT_VALUE = 0), regardless of the polynomial offset used for disabled rows.
     */
    static Commitment construct_default_commitment(Builder& builder)
    {
        auto default_commitment = Commitment(CommitmentNative::infinity());
        default_commitment.convert_constant_to_fixed_witness(&builder);
        return default_commitment;
    }

    /**
     * @brief Get the previously set kernel return data commitment if it exists, else a default one
     *
     */
    Commitment get_kernel_return_data_commitment(Builder& builder)
    {
        if (!kernel_return_data_commitment_exists) {
            return construct_default_commitment(builder);
        }
        kernel_return_data_commitment_exists = false; // Reset the existence flag after retrieval
        return kernel_return_data_commitment;
    }

    /**
     * @brief Get the previously set app return data commitment if it exists, else a default one
     *
     */
    Commitment get_app_return_data_commitment(Builder& builder, const size_t idx)
    {
        BB_ASSERT_LT(idx, MAX_APPS_PER_KERNEL, "DataBusDepot app return-data index out of bounds");
        if (!app_return_data_commitment_exists[idx]) {
            return construct_default_commitment(builder);
        }
        app_return_data_commitment_exists[idx] = false; // Reset the existence flag after retrieval
        return app_return_data_commitments[idx];
    }
};

} // namespace bb::stdlib
