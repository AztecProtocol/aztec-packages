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

    void execute([[maybe_unused]] RecursiveVerifierInstances& instances)
    {
        info("instances[0]->is_accumulator = ", instances[0]->is_accumulator);
        info("instances[1]->is_accumulator = ", instances[1]->is_accumulator);

        auto inst_0 = instances[0];
        auto inst_1 = instances[1];

        // The first folding round is a special case in that it folds an instance into a non-accumulator instance. The
        // fold proof thus contains two oink proofs. The return data R_0' from the first app will be contained in the
        // first oink proof (stored in instance 0), and its calldata counterpart C_0' in the kernel will be
        // contained in the second oink proof (stored in instance 1). In this special case, we can check directly that
        // \pi_0.R_0' = \pi_0.C_0', without needing to utilize the public inputs mechanism.
        if (!inst_0->is_accumulator) {
            // Assert equality of \pi_0.R_0' and \pi_0.C_0'
            auto& app_return_data = inst_0->witness_commitments.return_data;
            auto& secondary_calldata = inst_1->witness_commitments.secondary_calldata;
            assert_equality_of_commitments(app_return_data, secondary_calldata);
        }

        auto vkey = inst_1->verification_key;
        auto& public_inputs = inst_1->public_inputs;
        auto& commitments = inst_1->witness_commitments;

        // Check app return data equal to kernel secondary calldata
        if (vkey->contains_propagated_app_return_data) {
            uint32_t start_idx = vkey->app_return_data_public_input_idx;
            Commitment app_return_data = reconstruct_commitment_from_public_inputs(public_inputs, start_idx);
            assert_equality_of_commitments(app_return_data, commitments.secondary_calldata);
        }

        // Check previous kernel return data equal to kernel calldata
        if (vkey->contains_propagated_kernel_return_data) {
            uint32_t start_idx = vkey->kernel_return_data_public_input_idx;
            Commitment kernel_return_data = reconstruct_commitment_from_public_inputs(public_inputs, start_idx);
            assert_equality_of_commitments(kernel_return_data, commitments.calldata);
        }

        // Propagate return data via the public inputs mechanism
        bool is_kernel = false; // WORKTODO: set based on something
        propagate_commitment_via_public_inputs(commitments.return_data, is_kernel);
    };

    /**
     * @brief Reconstruct a commitment from limbs stored in public inputs
     *
     * @param public_inputs Vector of public inputs in which a propagated return data commitment is stored
     * @param return_data_commitment_limbs_start_idx Index at which the commitment is stored
     * @return Commitment
     */
    Commitment reconstruct_commitment_from_public_inputs(const std::span<Fr> public_inputs,
                                                         uint32_t& return_data_commitment_limbs_start_idx)
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

    uint32_t propagate_commitment_via_public_inputs(Commitment& commitment, bool is_kernel = false)
    {
        auto context = commitment.get_context();

        // Set flag indicating propagation of return data and save the index at which it's stored in public inputs.
        uint32_t start_idx = context->public_inputs.size();
        if (is_kernel) {
            context->contains_propagated_kernel_return_data = true;
            context->kernel_return_data_public_input_idx = start_idx;
        } else {
            context->contains_propagated_app_return_data = true;
            context->app_return_data_public_input_idx = start_idx;
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