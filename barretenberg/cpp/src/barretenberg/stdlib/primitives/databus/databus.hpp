#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
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

    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>;
    using RecursiveDeciderVerificationKeys =
        bb::stdlib::recursion::honk::RecursiveDeciderVerificationKeys_<RecursiveFlavor, 2>;
    using WitnessCommitments = RecursiveFlavor::WitnessCommitments;

    static constexpr size_t NUM_FR_LIMBS_PER_FQ = Fq::NUM_LIMBS;
    static constexpr size_t NUM_FR_LIMBS_PER_COMMITMENT = NUM_FR_LIMBS_PER_FQ * 2;

    Commitment app_return_data_commitment;
    Commitment kernel_return_data_commitment;
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

        // If the input data corresponds to a kernel, perform consistency checks between the provided calldata
        // commitments and the return data commitments stored in the provided kernel proof public inputs
        if (propagation_data.is_kernel) {
            // Reconstruct the kernel and app return data commitments stored in the public inputs of the kernel proof
            size_t start_idx = propagation_data.kernel_return_data_public_input_idx;
            Commitment kernel_return_data = reconstruct_commitment_from_public_inputs(public_inputs, start_idx);
            start_idx = propagation_data.app_return_data_public_input_idx;
            Commitment app_return_data = reconstruct_commitment_from_public_inputs(public_inputs, start_idx);

            // Assert equality between the corresponding calldata and return data commitments
            assert_equality_of_commitments(kernel_return_data, calldata);
            assert_equality_of_commitments(app_return_data, secondary_calldata);
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
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1138): Resolve issues around default commitment value
     * and bool_t "existence" type flags.
     * @note The ordering of the kernel/app return data commitments within the public inputs is arbitrary but must be
     * consistent across all kernels in order for the corresponding conistency check constraints to be consistent.
     *
     * @param builder
     */
    void propagate_return_data_commitments(Builder& builder)
    {
        // Set default commitment value to be used in the absence of one or the other return_data commitment
        CommitmentNative default_commitment_val = CommitmentNative::one() * FrNative(BusVector::DEFAULT_VALUE);
        if (kernel_return_data_commitment_exists) {
            propagate_commitment_via_public_inputs(kernel_return_data_commitment, /*is_kernel=*/true);
        } else {
            Commitment default_commitment(default_commitment_val);
            default_commitment.convert_constant_to_fixed_witness(&builder);
            propagate_commitment_via_public_inputs(default_commitment, /*is_kernel=*/true);
        }

        if (app_return_data_commitment_exists) {
            propagate_commitment_via_public_inputs(app_return_data_commitment, /*is_kernel=*/false);
        } else {
            Commitment default_commitment(default_commitment_val);
            default_commitment.convert_constant_to_fixed_witness(&builder);
            propagate_commitment_via_public_inputs(default_commitment, /*is_kernel=*/false);
        }
        // Reset flags indicating existence of return data commitments
        kernel_return_data_commitment_exists = false;
        app_return_data_commitment_exists = false;
    }

    /**
     * @brief Set the witness indices for a commitment to public
     * @details Indicate the presence of the propagated commitment by setting the corresponding flag and index in the
     * public inputs. A distinction is made between kernel and app return data so consistency can be checked against the
     * correct calldata entry later on.
     *
     * @param commitment
     * @param is_kernel Indicates whether the return data being propagated is from a kernel or an app
     */
    void propagate_commitment_via_public_inputs(const Commitment& commitment, bool is_kernel = false)
    {
        auto context = commitment.get_context();

        // Set flag indicating propagation of return data; save the index at which it will be stored in public inputs
        auto start_idx = static_cast<uint32_t>(context->public_inputs.size());
        if (is_kernel) {
            context->databus_propagation_data.kernel_return_data_public_input_idx = start_idx;
        } else {
            context->databus_propagation_data.app_return_data_public_input_idx = start_idx;
        }

        // Set public the witness indices corresponding to the limbs of the point coordinates
        for (auto& index : get_witness_indices_for_commitment(commitment)) {
            context->set_public_input(index);
        }
    }

    /**
     * @brief Reconstruct a commitment from limbs stored in public inputs
     *
     * @param public_inputs Vector of public inputs in which a propagated return data commitment is stored
     * @param return_data_commitment_limbs_start_idx Start index for range where commitment limbs are stored
     * @return Commitment
     */
    Commitment reconstruct_commitment_from_public_inputs(std::span<const Fr> public_inputs,
                                                         const size_t& return_data_commitment_limbs_start_idx)
    {
        // Extract from the public inputs the limbs needed reconstruct a commitment
        std::span<const Fr, NUM_FR_LIMBS_PER_COMMITMENT> return_data_commitment_limbs{
            public_inputs.data() + return_data_commitment_limbs_start_idx, NUM_FR_LIMBS_PER_COMMITMENT
        };
        return reconstruct_commitment_from_fr_limbs(return_data_commitment_limbs);
    }

  private:
    /**
     * @brief Reconstruct a commitment (point) from the Fr limbs of the coordinates (Fq, Fq)
     *
     * @param limbs
     * @return Commitment
     */
    Commitment reconstruct_commitment_from_fr_limbs(std::span<const Fr, NUM_FR_LIMBS_PER_COMMITMENT> limbs)
    {
        std::span<const Fr, NUM_FR_LIMBS_PER_FQ> x_limbs{ limbs.data(), NUM_FR_LIMBS_PER_FQ };
        std::span<const Fr, NUM_FR_LIMBS_PER_FQ> y_limbs{ limbs.data() + NUM_FR_LIMBS_PER_FQ, NUM_FR_LIMBS_PER_FQ };
        const Fq x = reconstruct_fq_from_fr_limbs(x_limbs);
        const Fq y = reconstruct_fq_from_fr_limbs(y_limbs);

        return Commitment(x, y);
    }

    /**
     * @brief Reconstruct a bn254 Fq from four limbs represented as bn254 Fr's
     *
     * @param limbs
     * @return Fq
     */
    Fq reconstruct_fq_from_fr_limbs(std::span<const Fr, NUM_FR_LIMBS_PER_FQ>& limbs)
    {
        const Fr l0 = limbs[0];
        const Fr l1 = limbs[1];
        const Fr l2 = limbs[2];
        const Fr l3 = limbs[3];
        l0.create_range_constraint(Fq::NUM_LIMB_BITS, "l0");
        l1.create_range_constraint(Fq::NUM_LIMB_BITS, "l1");
        l2.create_range_constraint(Fq::NUM_LIMB_BITS, "l2");
        l3.create_range_constraint(Fq::NUM_LAST_LIMB_BITS, "l3");
        return Fq::construct_from_limbs(l0, l1, l2, l3, /*can_overflow=*/false);
    }

    void assert_equality_of_commitments(const Commitment& P0, const Commitment& P1)
    {
        if (P0.get_value() != P1.get_value()) { // debug print indicating consistency check failure
            info("DataBusDepot: Databus consistency check failed!");
        }
        P0.x.assert_equal(P1.x);
        P0.y.assert_equal(P1.y);
    }

    /**
     * @brief Get the witness indices for a commitment (biggroup)
     *
     * @param point A biggroup element
     * @return std::array<uint32_t, NUM_FR_LIMBS_PER_COMMITMENT>
     */
    std::array<uint32_t, NUM_FR_LIMBS_PER_COMMITMENT> get_witness_indices_for_commitment(const Commitment& point)
        requires(!IsMegaBuilder<Builder>)
    {
        return { point.x.binary_basis_limbs[0].element.normalize().witness_index,
                 point.x.binary_basis_limbs[1].element.normalize().witness_index,
                 point.x.binary_basis_limbs[2].element.normalize().witness_index,
                 point.x.binary_basis_limbs[3].element.normalize().witness_index,
                 point.y.binary_basis_limbs[0].element.normalize().witness_index,
                 point.y.binary_basis_limbs[1].element.normalize().witness_index,
                 point.y.binary_basis_limbs[2].element.normalize().witness_index,
                 point.y.binary_basis_limbs[3].element.normalize().witness_index };
    }

    std::array<uint32_t, NUM_FR_LIMBS_PER_COMMITMENT> get_witness_indices_for_commitment(const Commitment& point)
        requires(IsMegaBuilder<Builder>)
    {
        // If using a goblin-plonk compatible builder, goblin element coordinates are stored as 2 field elements not 4.
        // We convert to stdlib::bigfield elements so data is stored in the databus uniformly regardless of flavor
        using BigFq = stdlib::bigfield<Builder, typename Curve::BaseFieldNative::Params>;
        const auto to_bigfield = [](Fr lo, Fr hi) {
            BigFq r(lo, hi);
            return std::array<uint32_t, 4>{
                r.binary_basis_limbs[0].element.normalize().witness_index,
                r.binary_basis_limbs[1].element.normalize().witness_index,
                r.binary_basis_limbs[2].element.normalize().witness_index,
                r.binary_basis_limbs[3].element.normalize().witness_index,
            };
        };
        auto x = to_bigfield(point.x.limbs[0], point.x.limbs[1]);
        auto y = to_bigfield(point.y.limbs[0], point.y.limbs[1]);
        return {
            x[0], x[1], x[2], x[3], y[0], y[1], y[2], y[3],
        };
    }
};

} // namespace bb::stdlib