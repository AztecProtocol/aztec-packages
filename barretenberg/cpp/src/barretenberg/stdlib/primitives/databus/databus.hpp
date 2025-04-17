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
 * @brief Class for managing the linking circuit input/output via the databus
 *
 * @tparam Builder
 */
template <class Builder> class DataBusDepot {
  public:
    using Curve = stdlib::bn254<Builder>;
    using Commitment = typename Curve::Group;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;
    using CommitmentNative = typename Curve::AffineElementNative;
    using FrNative = typename Curve::ScalarFieldNative;
    using PublicPoint = stdlib::PublicInputComponent<Commitment>;

    // Storage for the return data commitments to be propagated via the public inputs
    Commitment app_return_data_commitment;
    Commitment kernel_return_data_commitment;

    // Existence flags indicating whether each return data commitment has been set to be propagated
    bool app_return_data_commitment_exists = false;
    bool kernel_return_data_commitment_exists = false;

    /**
     * @brief Execute circuit logic to establish proper transfer of databus data between circuits
     * @details The databus mechanism establishes the transfer of data between two circuits (i-1 and i) in a third
     * circuit (i+1) via commitment equality checks of the form [R_{i-1}] = [C_i], where R and C represent return data
     * and calldata, respectively. In practice, circuit (i+1) is given access to [R_{i-1}] via the public inputs of
     * \pi_i, and it has access to [C_i] directly from \pi_i. The consistency checks in circuit (i+1) are thus of the
     * form \pi_i.public_inputs.[R_{i-1}] = \pi_i.[C_i]. This method performs these consistency checks. It also prepares
     * return data commitments [R] to be propagated via the public inputs of the present circuit.
     *
     * @note In Aztec private function execution, this mechanism is used as follows. Kernel circuit K_{i+1} must in
     * general perform two databus consistency checks: (1) that the return_data of app circuit A_{i} was secondary
     * calldata to K_{i}, and (2) that the return_data of K_{i-1} was calldata to K_{i}.
     *
     * @param return_data Return data from either an app or a kernel
     * @param calldata Calldata corresponding to return data from a previous kernel
     * @param secondary_calldata Calldata corresponding to some app return data
     * @param public_inputs Public inputs of a kernel proof which contain propagated return data commitments
     * @param propagation_data Info about the return data commitments stored in the provided public inputs
     */
    void set_return_data_to_be_propagated_and_perform_consistency_checks(const Commitment& return_data,
                                                                         const Commitment& calldata,
                                                                         const Commitment& secondary_calldata,
                                                                         const std::vector<Fr>& public_inputs,
                                                                         const DatabusPropagationData& propagation_data)
    {
        // Set the kernel/app return data commitment to be propagated via the public inputs
        if (propagation_data.is_kernel) {
            kernel_return_data_commitment = return_data;
            kernel_return_data_commitment_exists = true;
        } else {
            app_return_data_commitment = return_data;
            app_return_data_commitment_exists = true;
        }

        // If the input data corresponds to a kernel, perform commitment consistency checks
        if (propagation_data.is_kernel) {
            // Reconstruct the kernel and app return data commitments stored in the public inputs of the kernel proof
            Commitment kernel_return_data =
                PublicPoint::reconstruct(public_inputs, propagation_data.kernel_return_data_commitment_pub_input_key);
            Commitment app_return_data =
                PublicPoint::reconstruct(public_inputs, propagation_data.app_return_data_commitment_pub_input_key);

            // Assert equality between the corresponding calldata and return data commitments
            kernel_return_data.assert_equal(calldata);
            app_return_data.assert_equal(secondary_calldata);
        }
    }

    /**
     * @brief Propagate the existing return data commitments via the public inputs of the provided circuit
     * @details For consistent behavior across kernels, every kernel propagates two return data commitments via its
     * public inputs. If one of either the app or kernel return data does not exist, it is populated with a default
     * value that will satisfy the consistency check on the next cycle. For example, the first kernel has no previous
     * kernel to verify and thus neither receives a previous kernel return data commitment nor a calldata input
     * corresponding to a previous kernel. The commitment to the "empty" calldata will take a default value and thus we
     * set the same value for the missing return data so that the consistency check will be satisfied.
     *
     * @note The ordering of the kernel/app return data commitments within the public inputs is arbitrary but must be
     * consistent across all kernels in order for the corresponding conistency check constraints to be consistent.
     *
     * @param builder
     */
    void propagate_return_data_commitments(Builder& builder)
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1138): Resolve issues around default commitment
        // value and bool_t "existence" type flags.

        // Set default commitment value to be used in the absence of one or the other return_data commitment
        if (!kernel_return_data_commitment_exists) {
            CommitmentNative DEFAULT_COMMITMENT_VALUE = CommitmentNative::one() * FrNative(BusVector::DEFAULT_VALUE);
            kernel_return_data_commitment = Commitment(DEFAULT_COMMITMENT_VALUE);
            kernel_return_data_commitment.convert_constant_to_fixed_witness(&builder);
        }
        if (!app_return_data_commitment_exists) {
            CommitmentNative DEFAULT_COMMITMENT_VALUE = CommitmentNative::one() * FrNative(BusVector::DEFAULT_VALUE);
            app_return_data_commitment = Commitment(DEFAULT_COMMITMENT_VALUE);
            app_return_data_commitment.convert_constant_to_fixed_witness(&builder);
        }

        // Set the return data commitments to public and store the corresponding public input keys in the builder
        builder.databus_propagation_data.kernel_return_data_commitment_pub_input_key =
            PublicPoint::set(kernel_return_data_commitment);
        builder.databus_propagation_data.app_return_data_commitment_pub_input_key =
            PublicPoint::set(app_return_data_commitment);

        // Reset flags indicating existence of return data commitments
        kernel_return_data_commitment_exists = false;
        app_return_data_commitment_exists = false;
    }
};

} // namespace bb::stdlib
