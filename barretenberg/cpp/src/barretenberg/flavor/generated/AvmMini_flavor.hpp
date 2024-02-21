

#pragma once
#include "../relation_definitions.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

#include "barretenberg/relations/generic_permutation/generic_permutation_relation.hpp"

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/flavor_macros.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/generated/AvmMini/alu_chip.hpp"
#include "barretenberg/relations/generated/AvmMini/avm_mini.hpp"
#include "barretenberg/relations/generated/AvmMini/mem_trace.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

class AvmMiniFlavor {
  public:
    using Curve = curve::BN254;
    using G1 = Curve::Group;
    using PCS = KZG<Curve>;

    using FF = G1::subgroup_field;
    using Polynomial = bb::Polynomial<FF>;
    using GroupElement = G1::element;
    using Commitment = G1::affine_element;
    using CommitmentKey = bb::CommitmentKey<Curve>;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<Curve>;
    using RelationSeparator = FF;

    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 2;
    static constexpr size_t NUM_WITNESS_ENTITIES = 69;
    static constexpr size_t NUM_WIRES = NUM_WITNESS_ENTITIES + NUM_PRECOMPUTED_ENTITIES;
    // We have two copies of the witness entities, so we subtract the number of fixed ones (they have no shift), one for
    // the unshifted and one for the shifted
    static constexpr size_t NUM_ALL_ENTITIES = 85;

    using Relations = std::tuple<AvmMini_vm::alu_chip<FF>, AvmMini_vm::avm_mini<FF>, AvmMini_vm::mem_trace<FF>>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();

    // BATCHED_RELATION_PARTIAL_LENGTH = algebraic degree of sumcheck relation *after* multiplying by the `pow_zeta`
    // random polynomial e.g. For \sum(x) [A(x) * B(x) + C(x)] * PowZeta(X), relation length = 2 and random relation
    // length = 3
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    template <size_t NUM_INSTANCES>
    using ProtogalaxyTupleOfTuplesOfUnivariates =
        decltype(create_protogalaxy_tuple_of_tuples_of_univariates<Relations, NUM_INSTANCES>());
    using SumcheckTupleOfTuplesOfUnivariates = decltype(create_sumcheck_tuple_of_tuples_of_univariates<Relations>());
    using TupleOfArraysOfValues = decltype(create_tuple_of_arrays_of_values<Relations>());

    static constexpr bool has_zero_row = true;

  private:
    template <typename DataType_> class PrecomputedEntities : public PrecomputedEntitiesBase {
      public:
        using DataType = DataType_;

        DEFINE_FLAVOR_MEMBERS(DataType, avmMini_clk, avmMini_first)

        auto get_selectors() { return RefArray{ avmMini_clk, avmMini_first }; };
        auto get_sigma_polynomials() { return RefArray<DataType, 0>{}; };
        auto get_id_polynomials() { return RefArray<DataType, 0>{}; };
        auto get_table_polynomials() { return RefArray<DataType, 0>{}; };
    };

    template <typename DataType> class WitnessEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              memTrace_m_clk,
                              memTrace_m_sub_clk,
                              memTrace_m_addr,
                              memTrace_m_tag,
                              memTrace_m_val,
                              memTrace_m_lastAccess,
                              memTrace_m_last,
                              memTrace_m_rw,
                              memTrace_m_in_tag,
                              memTrace_m_tag_err,
                              memTrace_m_one_min_inv,
                              aluChip_alu_clk,
                              aluChip_alu_ia,
                              aluChip_alu_ib,
                              aluChip_alu_ic,
                              aluChip_alu_op_add,
                              aluChip_alu_op_sub,
                              aluChip_alu_op_mul,
                              aluChip_alu_op_div,
                              aluChip_alu_op_not,
                              aluChip_alu_op_eq,
                              aluChip_alu_ff_tag,
                              aluChip_alu_u8_tag,
                              aluChip_alu_u16_tag,
                              aluChip_alu_u32_tag,
                              aluChip_alu_u64_tag,
                              aluChip_alu_u128_tag,
                              aluChip_alu_u8_r0,
                              aluChip_alu_u8_r1,
                              aluChip_alu_u16_r0,
                              aluChip_alu_u16_r1,
                              aluChip_alu_u16_r2,
                              aluChip_alu_u16_r3,
                              aluChip_alu_u16_r4,
                              aluChip_alu_u16_r5,
                              aluChip_alu_u16_r6,
                              aluChip_alu_u16_r7,
                              aluChip_alu_u64_r0,
                              aluChip_alu_cf,
                              aluChip_alu_inv_diff,
                              avmMini_pc,
                              avmMini_internal_return_ptr,
                              avmMini_sel_internal_call,
                              avmMini_sel_internal_return,
                              avmMini_sel_jump,
                              avmMini_sel_halt,
                              avmMini_sel_op_add,
                              avmMini_sel_op_sub,
                              avmMini_sel_op_mul,
                              avmMini_sel_op_div,
                              avmMini_sel_op_not,
                              avmMini_sel_op_eq,
                              avmMini_in_tag,
                              avmMini_op_err,
                              avmMini_tag_err,
                              avmMini_inv,
                              avmMini_ia,
                              avmMini_ib,
                              avmMini_ic,
                              avmMini_mem_op_a,
                              avmMini_mem_op_b,
                              avmMini_mem_op_c,
                              avmMini_rwa,
                              avmMini_rwb,
                              avmMini_rwc,
                              avmMini_mem_idx_a,
                              avmMini_mem_idx_b,
                              avmMini_mem_idx_c,
                              avmMini_last)

        auto get_wires()
        {
            return RefArray{ memTrace_m_clk,
                             memTrace_m_sub_clk,
                             memTrace_m_addr,
                             memTrace_m_tag,
                             memTrace_m_val,
                             memTrace_m_lastAccess,
                             memTrace_m_last,
                             memTrace_m_rw,
                             memTrace_m_in_tag,
                             memTrace_m_tag_err,
                             memTrace_m_one_min_inv,
                             aluChip_alu_clk,
                             aluChip_alu_ia,
                             aluChip_alu_ib,
                             aluChip_alu_ic,
                             aluChip_alu_op_add,
                             aluChip_alu_op_sub,
                             aluChip_alu_op_mul,
                             aluChip_alu_op_div,
                             aluChip_alu_op_not,
                             aluChip_alu_op_eq,
                             aluChip_alu_ff_tag,
                             aluChip_alu_u8_tag,
                             aluChip_alu_u16_tag,
                             aluChip_alu_u32_tag,
                             aluChip_alu_u64_tag,
                             aluChip_alu_u128_tag,
                             aluChip_alu_u8_r0,
                             aluChip_alu_u8_r1,
                             aluChip_alu_u16_r0,
                             aluChip_alu_u16_r1,
                             aluChip_alu_u16_r2,
                             aluChip_alu_u16_r3,
                             aluChip_alu_u16_r4,
                             aluChip_alu_u16_r5,
                             aluChip_alu_u16_r6,
                             aluChip_alu_u16_r7,
                             aluChip_alu_u64_r0,
                             aluChip_alu_cf,
                             aluChip_alu_inv_diff,
                             avmMini_pc,
                             avmMini_internal_return_ptr,
                             avmMini_sel_internal_call,
                             avmMini_sel_internal_return,
                             avmMini_sel_jump,
                             avmMini_sel_halt,
                             avmMini_sel_op_add,
                             avmMini_sel_op_sub,
                             avmMini_sel_op_mul,
                             avmMini_sel_op_div,
                             avmMini_sel_op_not,
                             avmMini_sel_op_eq,
                             avmMini_in_tag,
                             avmMini_op_err,
                             avmMini_tag_err,
                             avmMini_inv,
                             avmMini_ia,
                             avmMini_ib,
                             avmMini_ic,
                             avmMini_mem_op_a,
                             avmMini_mem_op_b,
                             avmMini_mem_op_c,
                             avmMini_rwa,
                             avmMini_rwb,
                             avmMini_rwc,
                             avmMini_mem_idx_a,
                             avmMini_mem_idx_b,
                             avmMini_mem_idx_c,
                             avmMini_last };
        };
        auto get_sorted_polynomials() { return RefArray<DataType, 0>{}; };
    };

    template <typename DataType> class AllEntities {
      public:
        DEFINE_FLAVOR_MEMBERS(DataType,
                              avmMini_clk,
                              avmMini_first,
                              memTrace_m_clk,
                              memTrace_m_sub_clk,
                              memTrace_m_addr,
                              memTrace_m_tag,
                              memTrace_m_val,
                              memTrace_m_lastAccess,
                              memTrace_m_last,
                              memTrace_m_rw,
                              memTrace_m_in_tag,
                              memTrace_m_tag_err,
                              memTrace_m_one_min_inv,
                              aluChip_alu_clk,
                              aluChip_alu_ia,
                              aluChip_alu_ib,
                              aluChip_alu_ic,
                              aluChip_alu_op_add,
                              aluChip_alu_op_sub,
                              aluChip_alu_op_mul,
                              aluChip_alu_op_div,
                              aluChip_alu_op_not,
                              aluChip_alu_op_eq,
                              aluChip_alu_ff_tag,
                              aluChip_alu_u8_tag,
                              aluChip_alu_u16_tag,
                              aluChip_alu_u32_tag,
                              aluChip_alu_u64_tag,
                              aluChip_alu_u128_tag,
                              aluChip_alu_u8_r0,
                              aluChip_alu_u8_r1,
                              aluChip_alu_u16_r0,
                              aluChip_alu_u16_r1,
                              aluChip_alu_u16_r2,
                              aluChip_alu_u16_r3,
                              aluChip_alu_u16_r4,
                              aluChip_alu_u16_r5,
                              aluChip_alu_u16_r6,
                              aluChip_alu_u16_r7,
                              aluChip_alu_u64_r0,
                              aluChip_alu_cf,
                              aluChip_alu_inv_diff,
                              avmMini_pc,
                              avmMini_internal_return_ptr,
                              avmMini_sel_internal_call,
                              avmMini_sel_internal_return,
                              avmMini_sel_jump,
                              avmMini_sel_halt,
                              avmMini_sel_op_add,
                              avmMini_sel_op_sub,
                              avmMini_sel_op_mul,
                              avmMini_sel_op_div,
                              avmMini_sel_op_not,
                              avmMini_sel_op_eq,
                              avmMini_in_tag,
                              avmMini_op_err,
                              avmMini_tag_err,
                              avmMini_inv,
                              avmMini_ia,
                              avmMini_ib,
                              avmMini_ic,
                              avmMini_mem_op_a,
                              avmMini_mem_op_b,
                              avmMini_mem_op_c,
                              avmMini_rwa,
                              avmMini_rwb,
                              avmMini_rwc,
                              avmMini_mem_idx_a,
                              avmMini_mem_idx_b,
                              avmMini_mem_idx_c,
                              avmMini_last,
                              aluChip_alu_u16_r2_shift,
                              aluChip_alu_u16_r0_shift,
                              aluChip_alu_u16_r5_shift,
                              aluChip_alu_u16_r6_shift,
                              aluChip_alu_u16_r1_shift,
                              aluChip_alu_u16_r7_shift,
                              aluChip_alu_u16_r3_shift,
                              aluChip_alu_u16_r4_shift,
                              avmMini_pc_shift,
                              avmMini_internal_return_ptr_shift,
                              memTrace_m_tag_shift,
                              memTrace_m_rw_shift,
                              memTrace_m_addr_shift,
                              memTrace_m_val_shift)

        auto get_wires()
        {
            return RefArray{ avmMini_clk,
                             avmMini_first,
                             memTrace_m_clk,
                             memTrace_m_sub_clk,
                             memTrace_m_addr,
                             memTrace_m_tag,
                             memTrace_m_val,
                             memTrace_m_lastAccess,
                             memTrace_m_last,
                             memTrace_m_rw,
                             memTrace_m_in_tag,
                             memTrace_m_tag_err,
                             memTrace_m_one_min_inv,
                             aluChip_alu_clk,
                             aluChip_alu_ia,
                             aluChip_alu_ib,
                             aluChip_alu_ic,
                             aluChip_alu_op_add,
                             aluChip_alu_op_sub,
                             aluChip_alu_op_mul,
                             aluChip_alu_op_div,
                             aluChip_alu_op_not,
                             aluChip_alu_op_eq,
                             aluChip_alu_ff_tag,
                             aluChip_alu_u8_tag,
                             aluChip_alu_u16_tag,
                             aluChip_alu_u32_tag,
                             aluChip_alu_u64_tag,
                             aluChip_alu_u128_tag,
                             aluChip_alu_u8_r0,
                             aluChip_alu_u8_r1,
                             aluChip_alu_u16_r0,
                             aluChip_alu_u16_r1,
                             aluChip_alu_u16_r2,
                             aluChip_alu_u16_r3,
                             aluChip_alu_u16_r4,
                             aluChip_alu_u16_r5,
                             aluChip_alu_u16_r6,
                             aluChip_alu_u16_r7,
                             aluChip_alu_u64_r0,
                             aluChip_alu_cf,
                             aluChip_alu_inv_diff,
                             avmMini_pc,
                             avmMini_internal_return_ptr,
                             avmMini_sel_internal_call,
                             avmMini_sel_internal_return,
                             avmMini_sel_jump,
                             avmMini_sel_halt,
                             avmMini_sel_op_add,
                             avmMini_sel_op_sub,
                             avmMini_sel_op_mul,
                             avmMini_sel_op_div,
                             avmMini_sel_op_not,
                             avmMini_sel_op_eq,
                             avmMini_in_tag,
                             avmMini_op_err,
                             avmMini_tag_err,
                             avmMini_inv,
                             avmMini_ia,
                             avmMini_ib,
                             avmMini_ic,
                             avmMini_mem_op_a,
                             avmMini_mem_op_b,
                             avmMini_mem_op_c,
                             avmMini_rwa,
                             avmMini_rwb,
                             avmMini_rwc,
                             avmMini_mem_idx_a,
                             avmMini_mem_idx_b,
                             avmMini_mem_idx_c,
                             avmMini_last,
                             aluChip_alu_u16_r2_shift,
                             aluChip_alu_u16_r0_shift,
                             aluChip_alu_u16_r5_shift,
                             aluChip_alu_u16_r6_shift,
                             aluChip_alu_u16_r1_shift,
                             aluChip_alu_u16_r7_shift,
                             aluChip_alu_u16_r3_shift,
                             aluChip_alu_u16_r4_shift,
                             avmMini_pc_shift,
                             avmMini_internal_return_ptr_shift,
                             memTrace_m_tag_shift,
                             memTrace_m_rw_shift,
                             memTrace_m_addr_shift,
                             memTrace_m_val_shift };
        };
        auto get_unshifted()
        {
            return RefArray{ avmMini_clk,
                             avmMini_first,
                             memTrace_m_clk,
                             memTrace_m_sub_clk,
                             memTrace_m_addr,
                             memTrace_m_tag,
                             memTrace_m_val,
                             memTrace_m_lastAccess,
                             memTrace_m_last,
                             memTrace_m_rw,
                             memTrace_m_in_tag,
                             memTrace_m_tag_err,
                             memTrace_m_one_min_inv,
                             aluChip_alu_clk,
                             aluChip_alu_ia,
                             aluChip_alu_ib,
                             aluChip_alu_ic,
                             aluChip_alu_op_add,
                             aluChip_alu_op_sub,
                             aluChip_alu_op_mul,
                             aluChip_alu_op_div,
                             aluChip_alu_op_not,
                             aluChip_alu_op_eq,
                             aluChip_alu_ff_tag,
                             aluChip_alu_u8_tag,
                             aluChip_alu_u16_tag,
                             aluChip_alu_u32_tag,
                             aluChip_alu_u64_tag,
                             aluChip_alu_u128_tag,
                             aluChip_alu_u8_r0,
                             aluChip_alu_u8_r1,
                             aluChip_alu_u16_r0,
                             aluChip_alu_u16_r1,
                             aluChip_alu_u16_r2,
                             aluChip_alu_u16_r3,
                             aluChip_alu_u16_r4,
                             aluChip_alu_u16_r5,
                             aluChip_alu_u16_r6,
                             aluChip_alu_u16_r7,
                             aluChip_alu_u64_r0,
                             aluChip_alu_cf,
                             aluChip_alu_inv_diff,
                             avmMini_pc,
                             avmMini_internal_return_ptr,
                             avmMini_sel_internal_call,
                             avmMini_sel_internal_return,
                             avmMini_sel_jump,
                             avmMini_sel_halt,
                             avmMini_sel_op_add,
                             avmMini_sel_op_sub,
                             avmMini_sel_op_mul,
                             avmMini_sel_op_div,
                             avmMini_sel_op_not,
                             avmMini_sel_op_eq,
                             avmMini_in_tag,
                             avmMini_op_err,
                             avmMini_tag_err,
                             avmMini_inv,
                             avmMini_ia,
                             avmMini_ib,
                             avmMini_ic,
                             avmMini_mem_op_a,
                             avmMini_mem_op_b,
                             avmMini_mem_op_c,
                             avmMini_rwa,
                             avmMini_rwb,
                             avmMini_rwc,
                             avmMini_mem_idx_a,
                             avmMini_mem_idx_b,
                             avmMini_mem_idx_c,
                             avmMini_last };
        };
        auto get_to_be_shifted()
        {
            return RefArray{ aluChip_alu_u16_r2, aluChip_alu_u16_r0,
                             aluChip_alu_u16_r5, aluChip_alu_u16_r6,
                             aluChip_alu_u16_r1, aluChip_alu_u16_r7,
                             aluChip_alu_u16_r3, aluChip_alu_u16_r4,
                             avmMini_pc,         avmMini_internal_return_ptr,
                             memTrace_m_tag,     memTrace_m_rw,
                             memTrace_m_addr,    memTrace_m_val };
        };
        auto get_shifted()
        {
            return RefArray{ aluChip_alu_u16_r2_shift, aluChip_alu_u16_r0_shift,
                             aluChip_alu_u16_r5_shift, aluChip_alu_u16_r6_shift,
                             aluChip_alu_u16_r1_shift, aluChip_alu_u16_r7_shift,
                             aluChip_alu_u16_r3_shift, aluChip_alu_u16_r4_shift,
                             avmMini_pc_shift,         avmMini_internal_return_ptr_shift,
                             memTrace_m_tag_shift,     memTrace_m_rw_shift,
                             memTrace_m_addr_shift,    memTrace_m_val_shift };
        };
    };

  public:
    class ProvingKey : public ProvingKey_<PrecomputedEntities<Polynomial>, WitnessEntities<Polynomial>> {
      public:
        // Expose constructors on the base class
        using Base = ProvingKey_<PrecomputedEntities<Polynomial>, WitnessEntities<Polynomial>>;
        using Base::Base;

        auto get_to_be_shifted()
        {
            return RefArray{ aluChip_alu_u16_r2, aluChip_alu_u16_r0,
                             aluChip_alu_u16_r5, aluChip_alu_u16_r6,
                             aluChip_alu_u16_r1, aluChip_alu_u16_r7,
                             aluChip_alu_u16_r3, aluChip_alu_u16_r4,
                             avmMini_pc,         avmMini_internal_return_ptr,
                             memTrace_m_tag,     memTrace_m_rw,
                             memTrace_m_addr,    memTrace_m_val };
        };

        // The plookup wires that store plookup read data.
        RefArray<Polynomial, 0> get_table_column_wires() { return {}; };
    };

    using VerificationKey = VerificationKey_<PrecomputedEntities<Commitment>>;

    using FoldedPolynomials = AllEntities<std::vector<FF>>;

    class AllValues : public AllEntities<FF> {
      public:
        using Base = AllEntities<FF>;
        using Base::Base;
    };

    /**
     * @brief A container for the prover polynomials handles.
     */
    class ProverPolynomials : public AllEntities<Polynomial> {
      public:
        // Define all operations as default, except move construction/assignment
        ProverPolynomials() = default;
        ProverPolynomials& operator=(const ProverPolynomials&) = delete;
        ProverPolynomials(const ProverPolynomials& o) = delete;
        ProverPolynomials(ProverPolynomials&& o) noexcept = default;
        ProverPolynomials& operator=(ProverPolynomials&& o) noexcept = default;
        ~ProverPolynomials() = default;
        [[nodiscard]] size_t get_polynomial_size() const { return memTrace_m_clk.size(); }
        /**
         * @brief Returns the evaluations of all prover polynomials at one point on the boolean hypercube, which
         * represents one row in the execution trace.
         */
        [[nodiscard]] AllValues get_row(size_t row_idx) const
        {
            AllValues result;
            for (auto [result_field, polynomial] : zip_view(result.get_all(), this->get_all())) {
                result_field = polynomial[row_idx];
            }
            return result;
        }
    };

    using RowPolynomials = AllEntities<FF>;

    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto& poly : get_all()) {
                poly = Polynomial(circuit_size / 2);
            }
        }
    };

    /**
     * @brief A container for univariates used during Protogalaxy folding and sumcheck.
     * @details During folding and sumcheck, the prover evaluates the relations on these univariates.
     */
    template <size_t LENGTH> using ProverUnivariates = AllEntities<bb::Univariate<FF, LENGTH>>;

    /**
     * @brief A container for univariates produced during the hot loop in sumcheck.
     */
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    class CommitmentLabels : public AllEntities<std::string> {
      private:
        using Base = AllEntities<std::string>;

      public:
        CommitmentLabels()
            : AllEntities<std::string>()
        {
            Base::avmMini_clk = "AVMMINI_CLK";
            Base::avmMini_first = "AVMMINI_FIRST";
            Base::memTrace_m_clk = "MEMTRACE_M_CLK";
            Base::memTrace_m_sub_clk = "MEMTRACE_M_SUB_CLK";
            Base::memTrace_m_addr = "MEMTRACE_M_ADDR";
            Base::memTrace_m_tag = "MEMTRACE_M_TAG";
            Base::memTrace_m_val = "MEMTRACE_M_VAL";
            Base::memTrace_m_lastAccess = "MEMTRACE_M_LASTACCESS";
            Base::memTrace_m_last = "MEMTRACE_M_LAST";
            Base::memTrace_m_rw = "MEMTRACE_M_RW";
            Base::memTrace_m_in_tag = "MEMTRACE_M_IN_TAG";
            Base::memTrace_m_tag_err = "MEMTRACE_M_TAG_ERR";
            Base::memTrace_m_one_min_inv = "MEMTRACE_M_ONE_MIN_INV";
            Base::aluChip_alu_clk = "ALUCHIP_ALU_CLK";
            Base::aluChip_alu_ia = "ALUCHIP_ALU_IA";
            Base::aluChip_alu_ib = "ALUCHIP_ALU_IB";
            Base::aluChip_alu_ic = "ALUCHIP_ALU_IC";
            Base::aluChip_alu_op_add = "ALUCHIP_ALU_OP_ADD";
            Base::aluChip_alu_op_sub = "ALUCHIP_ALU_OP_SUB";
            Base::aluChip_alu_op_mul = "ALUCHIP_ALU_OP_MUL";
            Base::aluChip_alu_op_div = "ALUCHIP_ALU_OP_DIV";
            Base::aluChip_alu_op_not = "ALUCHIP_ALU_OP_NOT";
            Base::aluChip_alu_op_eq = "ALUCHIP_ALU_OP_EQ";
            Base::aluChip_alu_ff_tag = "ALUCHIP_ALU_FF_TAG";
            Base::aluChip_alu_u8_tag = "ALUCHIP_ALU_U8_TAG";
            Base::aluChip_alu_u16_tag = "ALUCHIP_ALU_U16_TAG";
            Base::aluChip_alu_u32_tag = "ALUCHIP_ALU_U32_TAG";
            Base::aluChip_alu_u64_tag = "ALUCHIP_ALU_U64_TAG";
            Base::aluChip_alu_u128_tag = "ALUCHIP_ALU_U128_TAG";
            Base::aluChip_alu_u8_r0 = "ALUCHIP_ALU_U8_R0";
            Base::aluChip_alu_u8_r1 = "ALUCHIP_ALU_U8_R1";
            Base::aluChip_alu_u16_r0 = "ALUCHIP_ALU_U16_R0";
            Base::aluChip_alu_u16_r1 = "ALUCHIP_ALU_U16_R1";
            Base::aluChip_alu_u16_r2 = "ALUCHIP_ALU_U16_R2";
            Base::aluChip_alu_u16_r3 = "ALUCHIP_ALU_U16_R3";
            Base::aluChip_alu_u16_r4 = "ALUCHIP_ALU_U16_R4";
            Base::aluChip_alu_u16_r5 = "ALUCHIP_ALU_U16_R5";
            Base::aluChip_alu_u16_r6 = "ALUCHIP_ALU_U16_R6";
            Base::aluChip_alu_u16_r7 = "ALUCHIP_ALU_U16_R7";
            Base::aluChip_alu_u64_r0 = "ALUCHIP_ALU_U64_R0";
            Base::aluChip_alu_cf = "ALUCHIP_ALU_CF";
            Base::aluChip_alu_inv_diff = "ALUCHIP_ALU_INV_DIFF";
            Base::avmMini_pc = "AVMMINI_PC";
            Base::avmMini_internal_return_ptr = "AVMMINI_INTERNAL_RETURN_PTR";
            Base::avmMini_sel_internal_call = "AVMMINI_SEL_INTERNAL_CALL";
            Base::avmMini_sel_internal_return = "AVMMINI_SEL_INTERNAL_RETURN";
            Base::avmMini_sel_jump = "AVMMINI_SEL_JUMP";
            Base::avmMini_sel_halt = "AVMMINI_SEL_HALT";
            Base::avmMini_sel_op_add = "AVMMINI_SEL_OP_ADD";
            Base::avmMini_sel_op_sub = "AVMMINI_SEL_OP_SUB";
            Base::avmMini_sel_op_mul = "AVMMINI_SEL_OP_MUL";
            Base::avmMini_sel_op_div = "AVMMINI_SEL_OP_DIV";
            Base::avmMini_sel_op_not = "AVMMINI_SEL_OP_NOT";
            Base::avmMini_sel_op_eq = "AVMMINI_SEL_OP_EQ";
            Base::avmMini_in_tag = "AVMMINI_IN_TAG";
            Base::avmMini_op_err = "AVMMINI_OP_ERR";
            Base::avmMini_tag_err = "AVMMINI_TAG_ERR";
            Base::avmMini_inv = "AVMMINI_INV";
            Base::avmMini_ia = "AVMMINI_IA";
            Base::avmMini_ib = "AVMMINI_IB";
            Base::avmMini_ic = "AVMMINI_IC";
            Base::avmMini_mem_op_a = "AVMMINI_MEM_OP_A";
            Base::avmMini_mem_op_b = "AVMMINI_MEM_OP_B";
            Base::avmMini_mem_op_c = "AVMMINI_MEM_OP_C";
            Base::avmMini_rwa = "AVMMINI_RWA";
            Base::avmMini_rwb = "AVMMINI_RWB";
            Base::avmMini_rwc = "AVMMINI_RWC";
            Base::avmMini_mem_idx_a = "AVMMINI_MEM_IDX_A";
            Base::avmMini_mem_idx_b = "AVMMINI_MEM_IDX_B";
            Base::avmMini_mem_idx_c = "AVMMINI_MEM_IDX_C";
            Base::avmMini_last = "AVMMINI_LAST";
        };
    };

    class VerifierCommitments : public AllEntities<Commitment> {
      private:
        using Base = AllEntities<Commitment>;

      public:
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key)
        {
            avmMini_clk = verification_key->avmMini_clk;
            avmMini_first = verification_key->avmMini_first;
        }
    };

    class Transcript : public NativeTranscript {
      public:
        uint32_t circuit_size;

        Commitment memTrace_m_clk;
        Commitment memTrace_m_sub_clk;
        Commitment memTrace_m_addr;
        Commitment memTrace_m_tag;
        Commitment memTrace_m_val;
        Commitment memTrace_m_lastAccess;
        Commitment memTrace_m_last;
        Commitment memTrace_m_rw;
        Commitment memTrace_m_in_tag;
        Commitment memTrace_m_tag_err;
        Commitment memTrace_m_one_min_inv;
        Commitment aluChip_alu_clk;
        Commitment aluChip_alu_ia;
        Commitment aluChip_alu_ib;
        Commitment aluChip_alu_ic;
        Commitment aluChip_alu_op_add;
        Commitment aluChip_alu_op_sub;
        Commitment aluChip_alu_op_mul;
        Commitment aluChip_alu_op_div;
        Commitment aluChip_alu_op_not;
        Commitment aluChip_alu_op_eq;
        Commitment aluChip_alu_ff_tag;
        Commitment aluChip_alu_u8_tag;
        Commitment aluChip_alu_u16_tag;
        Commitment aluChip_alu_u32_tag;
        Commitment aluChip_alu_u64_tag;
        Commitment aluChip_alu_u128_tag;
        Commitment aluChip_alu_u8_r0;
        Commitment aluChip_alu_u8_r1;
        Commitment aluChip_alu_u16_r0;
        Commitment aluChip_alu_u16_r1;
        Commitment aluChip_alu_u16_r2;
        Commitment aluChip_alu_u16_r3;
        Commitment aluChip_alu_u16_r4;
        Commitment aluChip_alu_u16_r5;
        Commitment aluChip_alu_u16_r6;
        Commitment aluChip_alu_u16_r7;
        Commitment aluChip_alu_u64_r0;
        Commitment aluChip_alu_cf;
        Commitment aluChip_alu_inv_diff;
        Commitment avmMini_pc;
        Commitment avmMini_internal_return_ptr;
        Commitment avmMini_sel_internal_call;
        Commitment avmMini_sel_internal_return;
        Commitment avmMini_sel_jump;
        Commitment avmMini_sel_halt;
        Commitment avmMini_sel_op_add;
        Commitment avmMini_sel_op_sub;
        Commitment avmMini_sel_op_mul;
        Commitment avmMini_sel_op_div;
        Commitment avmMini_sel_op_not;
        Commitment avmMini_sel_op_eq;
        Commitment avmMini_in_tag;
        Commitment avmMini_op_err;
        Commitment avmMini_tag_err;
        Commitment avmMini_inv;
        Commitment avmMini_ia;
        Commitment avmMini_ib;
        Commitment avmMini_ic;
        Commitment avmMini_mem_op_a;
        Commitment avmMini_mem_op_b;
        Commitment avmMini_mem_op_c;
        Commitment avmMini_rwa;
        Commitment avmMini_rwb;
        Commitment avmMini_rwc;
        Commitment avmMini_mem_idx_a;
        Commitment avmMini_mem_idx_b;
        Commitment avmMini_mem_idx_c;
        Commitment avmMini_last;

        std::vector<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>> sumcheck_univariates;
        std::array<FF, NUM_ALL_ENTITIES> sumcheck_evaluations;
        std::vector<Commitment> zm_cq_comms;
        Commitment zm_cq_comm;
        Commitment zm_pi_comm;

        Transcript() = default;

        Transcript(const std::vector<FF>& proof)
            : NativeTranscript(proof)
        {}

        void deserialize_full_transcript()
        {
            size_t num_frs_read = 0;
            circuit_size = deserialize_from_buffer<uint32_t>(proof_data, num_frs_read);
            size_t log_n = numeric::get_msb(circuit_size);

            memTrace_m_clk = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_sub_clk = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_addr = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_val = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_lastAccess = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_last = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_rw = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_in_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_tag_err = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            memTrace_m_one_min_inv = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_clk = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_ia = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_ib = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_ic = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_op_add = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_op_sub = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_op_mul = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_op_div = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_op_not = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_op_eq = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_ff_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u8_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u32_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u64_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u128_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u8_r0 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u8_r1 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r0 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r1 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r2 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r3 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r4 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r5 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r6 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u16_r7 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_u64_r0 = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_cf = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            aluChip_alu_inv_diff = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_pc = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_internal_return_ptr = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_internal_call = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_internal_return = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_jump = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_halt = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_op_add = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_op_sub = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_op_mul = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_op_div = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_op_not = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_sel_op_eq = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_in_tag = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_op_err = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_tag_err = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_inv = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_ia = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_ib = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_ic = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_mem_op_a = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_mem_op_b = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_mem_op_c = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_rwa = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_rwb = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_rwc = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_mem_idx_a = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_mem_idx_b = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_mem_idx_c = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);
            avmMini_last = deserialize_from_buffer<Commitment>(Transcript::proof_data, num_frs_read);

            for (size_t i = 0; i < log_n; ++i) {
                sumcheck_univariates.emplace_back(
                    deserialize_from_buffer<bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH>>(Transcript::proof_data,
                                                                                                 num_frs_read));
            }
            sumcheck_evaluations =
                deserialize_from_buffer<std::array<FF, NUM_ALL_ENTITIES>>(Transcript::proof_data, num_frs_read);
            for (size_t i = 0; i < log_n; ++i) {
                zm_cq_comms.push_back(deserialize_from_buffer<Commitment>(proof_data, num_frs_read));
            }
            zm_cq_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
            zm_pi_comm = deserialize_from_buffer<Commitment>(proof_data, num_frs_read);
        }

        void serialize_full_transcript()
        {
            size_t old_proof_length = proof_data.size();
            Transcript::proof_data.clear();
            size_t log_n = numeric::get_msb(circuit_size);

            serialize_to_buffer(circuit_size, Transcript::proof_data);

            serialize_to_buffer<Commitment>(memTrace_m_clk, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_sub_clk, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_addr, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_val, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_lastAccess, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_last, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_rw, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_in_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_tag_err, Transcript::proof_data);
            serialize_to_buffer<Commitment>(memTrace_m_one_min_inv, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_clk, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_ia, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_ib, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_ic, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_op_add, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_op_sub, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_op_mul, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_op_div, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_op_not, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_op_eq, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_ff_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u8_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u32_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u64_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u128_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u8_r0, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u8_r1, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r0, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r1, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r2, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r3, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r4, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r5, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r6, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u16_r7, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_u64_r0, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_cf, Transcript::proof_data);
            serialize_to_buffer<Commitment>(aluChip_alu_inv_diff, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_pc, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_internal_return_ptr, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_internal_call, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_internal_return, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_jump, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_halt, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_op_add, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_op_sub, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_op_mul, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_op_div, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_op_not, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_sel_op_eq, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_in_tag, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_op_err, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_tag_err, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_inv, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_ia, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_ib, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_ic, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_mem_op_a, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_mem_op_b, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_mem_op_c, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_rwa, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_rwb, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_rwc, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_mem_idx_a, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_mem_idx_b, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_mem_idx_c, Transcript::proof_data);
            serialize_to_buffer<Commitment>(avmMini_last, Transcript::proof_data);

            for (size_t i = 0; i < log_n; ++i) {
                serialize_to_buffer(sumcheck_univariates[i], Transcript::proof_data);
            }
            serialize_to_buffer(sumcheck_evaluations, Transcript::proof_data);
            for (size_t i = 0; i < log_n; ++i) {
                serialize_to_buffer(zm_cq_comms[i], proof_data);
            }
            serialize_to_buffer(zm_cq_comm, proof_data);
            serialize_to_buffer(zm_pi_comm, proof_data);

            // sanity check to make sure we generate the same length of proof as before.
            ASSERT(proof_data.size() == old_proof_length);
        }
    };
};

} // namespace bb
