// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/public_input_component/public_input_component.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_decider_verification_keys.hpp"
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
         * @brief Set the entries of the bus vector from possibly unnormalized or constant inputs
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

      private:
        mutable std::vector<field_pt> entries; // bus vector entries
        size_t length = 0;
        BusId bus_idx; // Idx of column in bus
        mutable Builder* context = nullptr;
    };

  public:
    // The columns of the DataBus
    bus_vector calldata{ BusId::CALLDATA };
    bus_vector secondary_calldata{ BusId::SECONDARY_CALLDATA };
    bus_vector return_data{ BusId::RETURNDATA };
};

/**
 * @brief Class for managing propagation of databus return data commitments for consistency checks
 * @details The databus consistency checks establish the transfer of data between two circuits (i-1 and i) in a third
 * circuit (i+1) via commitment equality checks of the form [R_{i-1}] = [C_i], where R and C represent return data and
 * calldata, respectively. In practice, circuit (i+1) is given access to [R_{i-1}] via the public inputs of
 * \pi_i, and it has access to [C_i] directly from \pi_i. The consistency checks in circuit (i+1) are thus of the
 * form \pi_i.public_inputs.[R_{i-1}] = \pi_i.[C_i].
 *
 * For consistent behavior across kernels, every kernel propagates two return data commitments via its
 * public inputs. If one of either the app or kernel return data does not exist, it is populated with a default
 * value that will satisfy the consistency check on the next cycle. For example, the first kernel has no previous
 * kernel to verify and thus neither receives a previous kernel return data commitment nor a calldata input
 * corresponding to a previous kernel. The commitment to the "empty" calldata will take a default value and thus we
 * set the same value for the missing return data so that the consistency check will be satisfied in the next kernel.
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
    Commitment app_return_data_commitment;
    Commitment kernel_return_data_commitment;

    // Existence flags indicating whether each return data commitment has been set
    bool app_return_data_commitment_exists = false;
    bool kernel_return_data_commitment_exists = false;

    void set_kernel_return_data_commitment(const Commitment& commitment)
    {
        kernel_return_data_commitment = commitment;
        kernel_return_data_commitment_exists = true;
    }

    void set_app_return_data_commitment(const Commitment& commitment)
    {
        app_return_data_commitment = commitment;
        app_return_data_commitment_exists = true;
    }

    /**
     * @brief Construct a default commitment for the databus return data
     * @details This commitment is used when no genuine return data commitment exists for either the kernel or app
     *
     */
    static Commitment construct_default_commitment(Builder& builder)
    {
        CommitmentNative DEFAULT_COMMITMENT_VALUE = CommitmentNative::one() * FrNative(BusVector::DEFAULT_VALUE);
        auto default_commitment = Commitment(DEFAULT_COMMITMENT_VALUE);
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
    Commitment get_app_return_data_commitment(Builder& builder)
    {
        if (!app_return_data_commitment_exists) {
            return construct_default_commitment(builder);
        }
        app_return_data_commitment_exists = false; // Reset the existence flag after retrieval
        return app_return_data_commitment;
    }
};

} // namespace bb::stdlib
