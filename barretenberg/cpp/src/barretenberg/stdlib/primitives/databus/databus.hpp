#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/recursive_instances.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
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

template <class Builder> class DataBusDepot {
  public:
    using Curve = stdlib::bn254<Builder>;
    using Commitment = typename Curve::Group;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;

    using RecursiveFlavor = MegaRecursiveFlavor_<Builder>;
    using RecursiveVerifierInstances = bb::stdlib::recursion::honk::RecursiveVerifierInstances_<RecursiveFlavor, 2>;

    static constexpr size_t NUM_FR_LIMBS_PER_FQ = Fq::NUM_LIMBS;
    static constexpr size_t NUM_FR_LIMBS_PER_COMMITMENT = NUM_FR_LIMBS_PER_FQ * 2;

    /**
     * @brief Execute circuit logic to establish proper transfer of databus data between circuits
     * @details The databus mechanism establishes the transfer of data between two circuits (i-1 and i) in a third
     * circuit (i+1) via commitment equality checks of the form [R_{i-1}] = [C_i]. In practice, circuit (i+1) is given
     * access to [R_{i-1}] via the public inputs of \pi_i, and it has access to [C_i] directly from \pi_i. The
     * consistency checks in circuit (i+1) are thus of the form \pi_i.public_inputs.[R_{i-1}] = \pi_i.[C_i]. This method
     * peforms the two primary operations required for these checks: (1) extract commitments [R] from proofs received as
     * private witnesses and propagate them to the next circuit via adding them to the public inputs. (2) Asserting
     * equality of commitments.
     *
     * In Aztec private function execution, this mechanism is used as follows. Kernel circuit K_{i+1} must in general
     * perform two databus consistency checks: (1) that the return_data of app circuit A_{i} was calldata to K_{i}, and
     * (2) that the return_data of K_{i-1} was calldata to K_{i}. (Note that kernel circuits have two databus calldata
     * columns). The relevant databus column commitments are extracted from non-accumulator verifier instances (which
     * contain all witness polynomial commitments extracted from a proof in oink).
     *
     * @param instances
     */
    void execute([[maybe_unused]] RecursiveVerifierInstances& instances)
    {
        auto inst_0 = instances[0]; // instance being folded *into* (an accumulator, except on the initial round)
        auto inst_1 = instances[1]; // instance being folded

        // The first folding round is a special case in that it folds an instance into a non-accumulator instance. The
        // fold proof thus contains two oink proofs. The return data R_0' from the first app will be contained in the
        // first oink proof (stored in instance 0), and its calldata counterpart C_0' in the kernel will be
        // contained in the second oink proof (stored in instance 1). In this special case, we can check directly that
        // \pi_0.R_0' = \pi_0.C_0', without having had to propagate the return data commitment via the public inputs.
        if (!inst_0->is_accumulator) {
            // Assert equality of \pi_0.R_0' and \pi_0.C_0'
            auto& app_return_data = inst_0->witness_commitments.return_data;
            auto& secondary_calldata = inst_1->witness_commitments.secondary_calldata;
            assert_equality_of_commitments(app_return_data, secondary_calldata);
        }

        auto vkey = inst_1->verification_key;
        auto& public_inputs = inst_1->public_inputs;
        auto& commitments = inst_1->witness_commitments;

        // Assert equality between the app return data commitment and the kernel secondary calldata commitment
        if (vkey->databus_propagation_data.contains_app_return_data_commitment) {
            ASSERT(!vkey->databus_propagation_data.is_kernel);
            size_t start_idx = vkey->databus_propagation_data.app_return_data_public_input_idx;
            Commitment app_return_data = reconstruct_commitment_from_public_inputs(public_inputs, start_idx);
            assert_equality_of_commitments(app_return_data, commitments.secondary_calldata);
        }

        // Assert equality between the previous kernel return data commitment and the kernel calldata commitment
        if (vkey->databus_propagation_data.contains_kernel_return_data_commitment) {
            ASSERT(!vkey->databus_propagation_data.is_kernel);
            size_t start_idx = vkey->databus_propagation_data.kernel_return_data_public_input_idx;
            Commitment kernel_return_data = reconstruct_commitment_from_public_inputs(public_inputs, start_idx);
            assert_equality_of_commitments(kernel_return_data, commitments.calldata);
        }

        // Propagate return data via the public inputs mechanism
        propagate_commitment_via_public_inputs(commitments.return_data, vkey->databus_propagation_data.is_kernel);
    };

    /**
     * @brief Reconstruct a commitment from limbs stored in public inputs
     *
     * @param public_inputs Vector of public inputs in which a propagated return data commitment is stored
     * @param return_data_commitment_limbs_start_idx Index at which the commitment is stored
     * @return Commitment
     */
    Commitment reconstruct_commitment_from_public_inputs(const std::span<Fr> public_inputs,
                                                         size_t& return_data_commitment_limbs_start_idx)
    {
        std::span<Fr, NUM_FR_LIMBS_PER_COMMITMENT> return_data_commitment_limbs{
            public_inputs.data() + return_data_commitment_limbs_start_idx, NUM_FR_LIMBS_PER_COMMITMENT
        };
        return reconstruct_commitment_from_fr_limbs(return_data_commitment_limbs);
    }

  private:
    Commitment reconstruct_commitment_from_fr_limbs(std::span<Fr, NUM_FR_LIMBS_PER_COMMITMENT> limbs)
    {
        std::span<Fr, NUM_FR_LIMBS_PER_FQ> x_limbs{ limbs.data(), NUM_FR_LIMBS_PER_FQ };
        std::span<Fr, NUM_FR_LIMBS_PER_FQ> y_limbs{ limbs.data() + NUM_FR_LIMBS_PER_FQ, NUM_FR_LIMBS_PER_FQ };
        const Fq x = reconstruct_fq_from_fr_limbs(x_limbs);
        const Fq y = reconstruct_fq_from_fr_limbs(y_limbs);

        return Commitment(x, y);
    }

    Fq reconstruct_fq_from_fr_limbs(std::span<Fr, NUM_FR_LIMBS_PER_FQ>& limbs)
    {
        const Fr l0 = limbs[0];
        const Fr l1 = limbs[1];
        const Fr l2 = limbs[2];
        const Fr l3 = limbs[3];
        l0.create_range_constraint(Fq::NUM_LIMB_BITS, "l0");
        l1.create_range_constraint(Fq::NUM_LIMB_BITS, "l1");
        l2.create_range_constraint(Fq::NUM_LIMB_BITS, "l2");
        l3.create_range_constraint(Fq::NUM_LAST_LIMB_BITS, "l3");
        return Fq(l0, l1, l2, l3, /*can_overflow=*/false);
    }

    void assert_equality_of_commitments(Commitment& P0, Commitment& P1)
    {
        P0.x.assert_equal(P1.x);
        P0.y.assert_equal(P1.y);
    }

    void propagate_commitment_via_public_inputs(Commitment& commitment, bool is_kernel = false)
    {
        auto context = commitment.get_context();

        // Set flag indicating propagation of return data and save the index at which it's stored in public inputs.
        size_t start_idx = context->public_inputs.size();
        if (is_kernel) {
            context->databus_propagation_data.contains_kernel_return_data_commitment = true;
            context->databus_propagation_data.kernel_return_data_public_input_idx = start_idx;
        } else {
            context->databus_propagation_data.contains_app_return_data_commitment = true;
            context->databus_propagation_data.app_return_data_public_input_idx = start_idx;
        }

        // Set public the witness indices corresponding to the limbs of the point coordinates
        auto witness_indices = commitment_to_witness_indices(commitment);
        for (auto& index : witness_indices) {
            context->set_public_input(index);
        }
    }

    std::array<uint32_t, NUM_FR_LIMBS_PER_COMMITMENT> commitment_to_witness_indices(Commitment& point)
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
};

} // namespace bb::stdlib