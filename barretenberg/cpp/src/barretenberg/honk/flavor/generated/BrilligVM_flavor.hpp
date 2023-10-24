

#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/honk/pcs/kzg/kzg.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/univariate.hpp"

#include "barretenberg/honk/transcript/transcript.hpp"
#include "barretenberg/polynomials/evaluation_domain.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
// #include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/relations/generated/BrilligVM.hpp"

namespace proof_system::honk {
namespace flavor {

template <typename CycleGroup_T, typename Curve_T, typename PCS_T> class BrilligVMFlavorBase {
  public:
    // forward template params into the ECCVMBase namespace
    using CycleGroup = CycleGroup_T;
    using Curve = Curve_T;
    using G1 = typename Curve::Group;
    using PCS = PCS_T;

    using FF = typename G1::subgroup_field;
    using Polynomial = barretenberg::Polynomial<FF>;
    using PolynomialHandle = std::span<FF>;
    using GroupElement = typename G1::element;
    using Commitment = typename G1::affine_element;
    using CommitmentHandle = typename G1::affine_element;
    using CommitmentKey = pcs::CommitmentKey<Curve>;
    using VerifierCommitmentKey = pcs::VerifierCommitmentKey<Curve>;

    static constexpr size_t NUM_WIRES = 65;
    static constexpr size_t NUM_PRECOMPUTED_ENTITIES = 0; // This is zero for now
    static constexpr size_t NUM_WITNESS_ENTITIES = 65;
    // We have two copies of the witness entities, so we subtract the number of fixed ones (they have no shift), one for
    // the unshifted and one for the shifted
    static constexpr size_t NUM_ALL_ENTITIES = 88;

    // using GrandProductRelations = std::tuple<>;
    using Relations = std::tuple<BrilligVM_vm::BrilligVM<FF>>;
    // using LookupRelation = sumcheck::LookupRelation<FF>;

    static constexpr size_t MAX_RELATION_LENGTH = get_max_relation_length<Relations>();
    static constexpr size_t MAX_RANDOM_RELATION_LENGTH = MAX_RELATION_LENGTH + 1;
    static constexpr size_t NUM_RELATIONS = std::tuple_size<Relations>::value;

    // define the containers for storing the contributions from each relation in Sumcheck
    using TupleOfTuplesOfUnivariates = decltype(create_relation_univariates_container<FF, Relations>());
    using TupleOfArraysOfValues = decltype(create_relation_values_container<FF, Relations>());

  private:
    template <typename DataType, typename HandleType>
    class PrecomputedEntities : public PrecomputedEntities_<DataType, HandleType, NUM_PRECOMPUTED_ENTITIES> {
      public:
        std::vector<HandleType> get_selectors() override { return {}; };
        std::vector<HandleType> get_sigma_polynomials() override { return {}; };
        std::vector<HandleType> get_id_polynomials() override { return {}; };
        std::vector<HandleType> get_table_polynomials() { return {}; };
    };

    template <typename DataType, typename HandleType>
    class WitnessEntities : public WitnessEntities_<DataType, HandleType, NUM_WITNESS_ENTITIES> {
      public:
        DataType& main_POSITIVE = std::get<0>(this->_data);
        DataType& main_FIRST = std::get<1>(this->_data);
        DataType& main_LAST = std::get<2>(this->_data);
        DataType& main_STEP = std::get<3>(this->_data);
        DataType& main__romgen_first_step = std::get<4>(this->_data);
        DataType& main_first_step = std::get<5>(this->_data);
        DataType& main_p_line = std::get<6>(this->_data);
        DataType& main_p_X_const = std::get<7>(this->_data);
        DataType& main_p_instr__jump_to_operation = std::get<8>(this->_data);
        DataType& main_p_instr__loop = std::get<9>(this->_data);
        DataType& main_p_instr__reset = std::get<10>(this->_data);
        DataType& main_p_instr_call = std::get<11>(this->_data);
        DataType& main_p_instr_call_param_l = std::get<12>(this->_data);
        DataType& main_p_instr_ret = std::get<13>(this->_data);
        DataType& main_p_instr_return = std::get<14>(this->_data);
        DataType& main_p_reg_write_X_r0 = std::get<15>(this->_data);
        DataType& main_p_reg_write_X_r1 = std::get<16>(this->_data);
        DataType& main_p_reg_write_X_r3 = std::get<17>(this->_data);
        DataType& main__block_enforcer_last_step = std::get<18>(this->_data);
        DataType& main__linker_first_step = std::get<19>(this->_data);
        DataType& main_XInv = std::get<20>(this->_data);
        DataType& main_XIsZero = std::get<21>(this->_data);
        DataType& main_m_addr = std::get<22>(this->_data);
        DataType& main_m_step = std::get<23>(this->_data);
        DataType& main_m_change = std::get<24>(this->_data);
        DataType& main_m_value = std::get<25>(this->_data);
        DataType& main_m_op = std::get<26>(this->_data);
        DataType& main_m_is_write = std::get<27>(this->_data);
        DataType& main_m_is_read = std::get<28>(this->_data);
        DataType& main__operation_id = std::get<29>(this->_data);
        DataType& main__sigma = std::get<30>(this->_data);
        DataType& main_pc = std::get<31>(this->_data);
        DataType& main_X = std::get<32>(this->_data);
        DataType& main_Y = std::get<33>(this->_data);
        DataType& main_Z = std::get<34>(this->_data);
        DataType& main_jump_ptr = std::get<35>(this->_data);
        DataType& main_addr = std::get<36>(this->_data);
        DataType& main_tmp = std::get<37>(this->_data);
        DataType& main_reg_write_X_r0 = std::get<38>(this->_data);
        DataType& main_r0 = std::get<39>(this->_data);
        DataType& main_reg_write_X_r1 = std::get<40>(this->_data);
        DataType& main_r1 = std::get<41>(this->_data);
        DataType& main_r2 = std::get<42>(this->_data);
        DataType& main_reg_write_X_r3 = std::get<43>(this->_data);
        DataType& main_r3 = std::get<44>(this->_data);
        DataType& main_r4 = std::get<45>(this->_data);
        DataType& main_r5 = std::get<46>(this->_data);
        DataType& main_r6 = std::get<47>(this->_data);
        DataType& main_r7 = std::get<48>(this->_data);
        DataType& main_r8 = std::get<49>(this->_data);
        DataType& main_r9 = std::get<50>(this->_data);
        DataType& main_r10 = std::get<51>(this->_data);
        DataType& main_r11 = std::get<52>(this->_data);
        DataType& main_instr_call = std::get<53>(this->_data);
        DataType& main_instr_call_param_l = std::get<54>(this->_data);
        DataType& main_instr_ret = std::get<55>(this->_data);
        DataType& main_instr__jump_to_operation = std::get<56>(this->_data);
        DataType& main_instr__reset = std::get<57>(this->_data);
        DataType& main_instr__loop = std::get<58>(this->_data);
        DataType& main_instr_return = std::get<59>(this->_data);
        DataType& main_X_const = std::get<60>(this->_data);
        DataType& main_X_free_value = std::get<61>(this->_data);
        DataType& main_Y_free_value = std::get<62>(this->_data);
        DataType& main_Z_free_value = std::get<63>(this->_data);
        DataType& main__operation_id_no_change = std::get<64>(this->_data);

        std::vector<HandleType> get_wires() override
        {
            return {
                main_POSITIVE,
                main_FIRST,
                main_LAST,
                main_STEP,
                main__romgen_first_step,
                main_first_step,
                main_p_line,
                main_p_X_const,
                main_p_instr__jump_to_operation,
                main_p_instr__loop,
                main_p_instr__reset,
                main_p_instr_call,
                main_p_instr_call_param_l,
                main_p_instr_ret,
                main_p_instr_return,
                main_p_reg_write_X_r0,
                main_p_reg_write_X_r1,
                main_p_reg_write_X_r3,
                main__block_enforcer_last_step,
                main__linker_first_step,
                main_XInv,
                main_XIsZero,
                main_m_addr,
                main_m_step,
                main_m_change,
                main_m_value,
                main_m_op,
                main_m_is_write,
                main_m_is_read,
                main__operation_id,
                main__sigma,
                main_pc,
                main_X,
                main_Y,
                main_Z,
                main_jump_ptr,
                main_addr,
                main_tmp,
                main_reg_write_X_r0,
                main_r0,
                main_reg_write_X_r1,
                main_r1,
                main_r2,
                main_reg_write_X_r3,
                main_r3,
                main_r4,
                main_r5,
                main_r6,
                main_r7,
                main_r8,
                main_r9,
                main_r10,
                main_r11,
                main_instr_call,
                main_instr_call_param_l,
                main_instr_ret,
                main_instr__jump_to_operation,
                main_instr__reset,
                main_instr__loop,
                main_instr_return,
                main_X_const,
                main_X_free_value,
                main_Y_free_value,
                main_Z_free_value,
                main__operation_id_no_change,

            };
        };

        std::vector<HandleType> get_sorted_polynomials() { return {}; };
    };

    template <typename DataType, typename HandleType>
    class AllEntities : public AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES> {
      public:
        DataType& main_POSITIVE = std::get<0>(this->_data);
        DataType& main_FIRST = std::get<1>(this->_data);
        DataType& main_LAST = std::get<2>(this->_data);
        DataType& main_STEP = std::get<3>(this->_data);
        DataType& main__romgen_first_step = std::get<4>(this->_data);
        DataType& main_first_step = std::get<5>(this->_data);
        DataType& main_p_line = std::get<6>(this->_data);
        DataType& main_p_X_const = std::get<7>(this->_data);
        DataType& main_p_instr__jump_to_operation = std::get<8>(this->_data);
        DataType& main_p_instr__loop = std::get<9>(this->_data);
        DataType& main_p_instr__reset = std::get<10>(this->_data);
        DataType& main_p_instr_call = std::get<11>(this->_data);
        DataType& main_p_instr_call_param_l = std::get<12>(this->_data);
        DataType& main_p_instr_ret = std::get<13>(this->_data);
        DataType& main_p_instr_return = std::get<14>(this->_data);
        DataType& main_p_reg_write_X_r0 = std::get<15>(this->_data);
        DataType& main_p_reg_write_X_r1 = std::get<16>(this->_data);
        DataType& main_p_reg_write_X_r3 = std::get<17>(this->_data);
        DataType& main__block_enforcer_last_step = std::get<18>(this->_data);
        DataType& main__linker_first_step = std::get<19>(this->_data);
        DataType& main_XInv = std::get<20>(this->_data);
        DataType& main_XIsZero = std::get<21>(this->_data);
        DataType& main_m_addr = std::get<22>(this->_data);
        DataType& main_m_step = std::get<23>(this->_data);
        DataType& main_m_change = std::get<24>(this->_data);
        DataType& main_m_value = std::get<25>(this->_data);
        DataType& main_m_op = std::get<26>(this->_data);
        DataType& main_m_is_write = std::get<27>(this->_data);
        DataType& main_m_is_read = std::get<28>(this->_data);
        DataType& main__operation_id = std::get<29>(this->_data);
        DataType& main__sigma = std::get<30>(this->_data);
        DataType& main_pc = std::get<31>(this->_data);
        DataType& main_X = std::get<32>(this->_data);
        DataType& main_Y = std::get<33>(this->_data);
        DataType& main_Z = std::get<34>(this->_data);
        DataType& main_jump_ptr = std::get<35>(this->_data);
        DataType& main_addr = std::get<36>(this->_data);
        DataType& main_tmp = std::get<37>(this->_data);
        DataType& main_reg_write_X_r0 = std::get<38>(this->_data);
        DataType& main_r0 = std::get<39>(this->_data);
        DataType& main_reg_write_X_r1 = std::get<40>(this->_data);
        DataType& main_r1 = std::get<41>(this->_data);
        DataType& main_r2 = std::get<42>(this->_data);
        DataType& main_reg_write_X_r3 = std::get<43>(this->_data);
        DataType& main_r3 = std::get<44>(this->_data);
        DataType& main_r4 = std::get<45>(this->_data);
        DataType& main_r5 = std::get<46>(this->_data);
        DataType& main_r6 = std::get<47>(this->_data);
        DataType& main_r7 = std::get<48>(this->_data);
        DataType& main_r8 = std::get<49>(this->_data);
        DataType& main_r9 = std::get<50>(this->_data);
        DataType& main_r10 = std::get<51>(this->_data);
        DataType& main_r11 = std::get<52>(this->_data);
        DataType& main_instr_call = std::get<53>(this->_data);
        DataType& main_instr_call_param_l = std::get<54>(this->_data);
        DataType& main_instr_ret = std::get<55>(this->_data);
        DataType& main_instr__jump_to_operation = std::get<56>(this->_data);
        DataType& main_instr__reset = std::get<57>(this->_data);
        DataType& main_instr__loop = std::get<58>(this->_data);
        DataType& main_instr_return = std::get<59>(this->_data);
        DataType& main_X_const = std::get<60>(this->_data);
        DataType& main_X_free_value = std::get<61>(this->_data);
        DataType& main_Y_free_value = std::get<62>(this->_data);
        DataType& main_Z_free_value = std::get<63>(this->_data);
        DataType& main__operation_id_no_change = std::get<64>(this->_data);

        DataType& main_r7_shift = std::get<65>(this->_data);
        DataType& main__romgen_first_step_shift = std::get<66>(this->_data);
        DataType& main_r0_shift = std::get<67>(this->_data);
        DataType& main_r8_shift = std::get<68>(this->_data);
        DataType& main_r1_shift = std::get<69>(this->_data);
        DataType& main_r9_shift = std::get<70>(this->_data);
        DataType& main_r10_shift = std::get<71>(this->_data);
        DataType& main_m_is_write_shift = std::get<72>(this->_data);
        DataType& main_pc_shift = std::get<73>(this->_data);
        DataType& main_tmp_shift = std::get<74>(this->_data);
        DataType& main_addr_shift = std::get<75>(this->_data);
        DataType& main_jump_ptr_shift = std::get<76>(this->_data);
        DataType& main_r11_shift = std::get<77>(this->_data);
        DataType& main_r2_shift = std::get<78>(this->_data);
        DataType& main_r3_shift = std::get<79>(this->_data);
        DataType& main_m_value_shift = std::get<80>(this->_data);
        DataType& main_r5_shift = std::get<81>(this->_data);
        DataType& main__operation_id_shift = std::get<82>(this->_data);
        DataType& main__sigma_shift = std::get<83>(this->_data);
        DataType& main_r4_shift = std::get<84>(this->_data);
        DataType& main_m_addr_shift = std::get<85>(this->_data);
        DataType& main_r6_shift = std::get<86>(this->_data);
        DataType& main_first_step_shift = std::get<87>(this->_data);

        std::vector<HandleType> get_wires() override
        {
            return {
                main_POSITIVE,
                main_FIRST,
                main_LAST,
                main_STEP,
                main__romgen_first_step,
                main_first_step,
                main_p_line,
                main_p_X_const,
                main_p_instr__jump_to_operation,
                main_p_instr__loop,
                main_p_instr__reset,
                main_p_instr_call,
                main_p_instr_call_param_l,
                main_p_instr_ret,
                main_p_instr_return,
                main_p_reg_write_X_r0,
                main_p_reg_write_X_r1,
                main_p_reg_write_X_r3,
                main__block_enforcer_last_step,
                main__linker_first_step,
                main_XInv,
                main_XIsZero,
                main_m_addr,
                main_m_step,
                main_m_change,
                main_m_value,
                main_m_op,
                main_m_is_write,
                main_m_is_read,
                main__operation_id,
                main__sigma,
                main_pc,
                main_X,
                main_Y,
                main_Z,
                main_jump_ptr,
                main_addr,
                main_tmp,
                main_reg_write_X_r0,
                main_r0,
                main_reg_write_X_r1,
                main_r1,
                main_r2,
                main_reg_write_X_r3,
                main_r3,
                main_r4,
                main_r5,
                main_r6,
                main_r7,
                main_r8,
                main_r9,
                main_r10,
                main_r11,
                main_instr_call,
                main_instr_call_param_l,
                main_instr_ret,
                main_instr__jump_to_operation,
                main_instr__reset,
                main_instr__loop,
                main_instr_return,
                main_X_const,
                main_X_free_value,
                main_Y_free_value,
                main_Z_free_value,
                main__operation_id_no_change,
                main_r7,
                main__romgen_first_step,
                main_r0,
                main_r8,
                main_r1,
                main_r9,
                main_r10,
                main_m_is_write,
                main_pc,
                main_tmp,
                main_addr,
                main_jump_ptr,
                main_r11,
                main_r2,
                main_r3,
                main_m_value,
                main_r5,
                main__operation_id,
                main__sigma,
                main_r4,
                main_m_addr,
                main_r6,
                main_first_step,

            };
        };

        std::vector<HandleType> get_unshifted() override
        {
            return {
                main_POSITIVE,
                main_FIRST,
                main_LAST,
                main_STEP,
                main__romgen_first_step,
                main_first_step,
                main_p_line,
                main_p_X_const,
                main_p_instr__jump_to_operation,
                main_p_instr__loop,
                main_p_instr__reset,
                main_p_instr_call,
                main_p_instr_call_param_l,
                main_p_instr_ret,
                main_p_instr_return,
                main_p_reg_write_X_r0,
                main_p_reg_write_X_r1,
                main_p_reg_write_X_r3,
                main__block_enforcer_last_step,
                main__linker_first_step,
                main_XInv,
                main_XIsZero,
                main_m_addr,
                main_m_step,
                main_m_change,
                main_m_value,
                main_m_op,
                main_m_is_write,
                main_m_is_read,
                main__operation_id,
                main__sigma,
                main_pc,
                main_X,
                main_Y,
                main_Z,
                main_jump_ptr,
                main_addr,
                main_tmp,
                main_reg_write_X_r0,
                main_r0,
                main_reg_write_X_r1,
                main_r1,
                main_r2,
                main_reg_write_X_r3,
                main_r3,
                main_r4,
                main_r5,
                main_r6,
                main_r7,
                main_r8,
                main_r9,
                main_r10,
                main_r11,
                main_instr_call,
                main_instr_call_param_l,
                main_instr_ret,
                main_instr__jump_to_operation,
                main_instr__reset,
                main_instr__loop,
                main_instr_return,
                main_X_const,
                main_X_free_value,
                main_Y_free_value,
                main_Z_free_value,
                main__operation_id_no_change,

            };
        };

        std::vector<HandleType> get_to_be_shifted() override
        {
            return {
                main_r7,         main__romgen_first_step,
                main_r0,         main_r8,
                main_r1,         main_r9,
                main_r10,        main_m_is_write,
                main_pc,         main_tmp,
                main_addr,       main_jump_ptr,
                main_r11,        main_r2,
                main_r3,         main_m_value,
                main_r5,         main__operation_id,
                main__sigma,     main_r4,
                main_m_addr,     main_r6,
                main_first_step,

            };
        };

        std::vector<HandleType> get_shifted() override
        {
            return {
                main_r7_shift,         main__romgen_first_step_shift,
                main_r0_shift,         main_r8_shift,
                main_r1_shift,         main_r9_shift,
                main_r10_shift,        main_m_is_write_shift,
                main_pc_shift,         main_tmp_shift,
                main_addr_shift,       main_jump_ptr_shift,
                main_r11_shift,        main_r2_shift,
                main_r3_shift,         main_m_value_shift,
                main_r5_shift,         main__operation_id_shift,
                main__sigma_shift,     main_r4_shift,
                main_m_addr_shift,     main_r6_shift,
                main_first_step_shift,

            };
        };

        AllEntities() = default;

        AllEntities(const AllEntities& other)
            : AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>(other){};

        AllEntities(AllEntities&& other) noexcept
            : AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>(other){};

        AllEntities& operator=(const AllEntities& other)
        {
            if (this == &other) {
                return *this;
            }
            AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>::operator=(other);
            return *this;
        }

        AllEntities& operator=(AllEntities&& other) noexcept
        {
            AllEntities_<DataType, HandleType, NUM_ALL_ENTITIES>::operator=(other);
            return *this;
        }

        ~AllEntities() override = default;
    };

  public:
    class ProvingKey : public ProvingKey_<PrecomputedEntities<Polynomial, PolynomialHandle>,
                                          WitnessEntities<Polynomial, PolynomialHandle>> {
      public:
        // Expose constructors on the base class
        using Base = ProvingKey_<PrecomputedEntities<Polynomial, PolynomialHandle>,
                                 WitnessEntities<Polynomial, PolynomialHandle>>;
        using Base::Base;

        // The plookup wires that store plookup read data.
        std::array<PolynomialHandle, 0> get_table_column_wires() { return {}; };
    };

    using VerificationKey = VerificationKey_<PrecomputedEntities<Commitment, CommitmentHandle>>;

    using ProverPolynomials = AllEntities<PolynomialHandle, PolynomialHandle>;

    using FoldedPolynomials = AllEntities<std::vector<FF>, PolynomialHandle>;

    class AllValues : public AllEntities<FF, FF> {
      public:
        using Base = AllEntities<FF, FF>;
        using Base::Base;
        AllValues(std::array<FF, NUM_ALL_ENTITIES> _data_in) { this->_data = _data_in; }
    };

    class AllPolynomials : public AllEntities<Polynomial, PolynomialHandle> {
      public:
        AllValues get_row(const size_t row_idx) const
        {
            AllValues result;
            size_t column_idx = 0; // // TODO(https://github.com/AztecProtocol/barretenberg/issues/391) zip
            for (auto& column : this->_data) {
                result[column_idx] = column[row_idx];
                column_idx++;
            }
            return result;
        }
    };

    using RowPolynomials = AllEntities<FF, FF>;

    class PartiallyEvaluatedMultivariates : public AllEntities<Polynomial, PolynomialHandle> {
      public:
        PartiallyEvaluatedMultivariates() = default;
        PartiallyEvaluatedMultivariates(const size_t circuit_size)
        {
            // Storage is only needed after the first partial evaluation, hence polynomials of size (n / 2)
            for (auto& poly : this->_data) {
                poly = Polynomial(circuit_size / 2);
            }
        }
    };

    template <size_t MAX_RELATION_LENGTH>
    using ExtendedEdges = AllEntities<barretenberg::Univariate<FF, MAX_RELATION_LENGTH>,
                                      barretenberg::Univariate<FF, MAX_RELATION_LENGTH>>;

    class ClaimedEvaluations : public AllEntities<FF, FF> {
      public:
        using Base = AllEntities<FF, FF>;
        using Base::Base;
        ClaimedEvaluations(std::array<FF, NUM_ALL_ENTITIES> _data_in) { this->_data = _data_in; }
    };

    class CommitmentLabels : public AllEntities<std::string, std::string> {
      private:
        using Base = AllEntities<std::string, std::string>;

      public:
        CommitmentLabels()
            : AllEntities<std::string, std::string>()
        {
            Base::main_POSITIVE = "main_POSITIVE";
            Base::main_FIRST = "main_FIRST";
            Base::main_LAST = "main_LAST";
            Base::main_STEP = "main_STEP";
            Base::main__romgen_first_step = "main__romgen_first_step";
            Base::main_first_step = "main_first_step";
            Base::main_p_line = "main_p_line";
            Base::main_p_X_const = "main_p_X_const";
            Base::main_p_instr__jump_to_operation = "main_p_instr__jump_to_operation";
            Base::main_p_instr__loop = "main_p_instr__loop";
            Base::main_p_instr__reset = "main_p_instr__reset";
            Base::main_p_instr_call = "main_p_instr_call";
            Base::main_p_instr_call_param_l = "main_p_instr_call_param_l";
            Base::main_p_instr_ret = "main_p_instr_ret";
            Base::main_p_instr_return = "main_p_instr_return";
            Base::main_p_reg_write_X_r0 = "main_p_reg_write_X_r0";
            Base::main_p_reg_write_X_r1 = "main_p_reg_write_X_r1";
            Base::main_p_reg_write_X_r3 = "main_p_reg_write_X_r3";
            Base::main__block_enforcer_last_step = "main__block_enforcer_last_step";
            Base::main__linker_first_step = "main__linker_first_step";
            Base::main_XInv = "main_XInv";
            Base::main_XIsZero = "main_XIsZero";
            Base::main_m_addr = "main_m_addr";
            Base::main_m_step = "main_m_step";
            Base::main_m_change = "main_m_change";
            Base::main_m_value = "main_m_value";
            Base::main_m_op = "main_m_op";
            Base::main_m_is_write = "main_m_is_write";
            Base::main_m_is_read = "main_m_is_read";
            Base::main__operation_id = "main__operation_id";
            Base::main__sigma = "main__sigma";
            Base::main_pc = "main_pc";
            Base::main_X = "main_X";
            Base::main_Y = "main_Y";
            Base::main_Z = "main_Z";
            Base::main_jump_ptr = "main_jump_ptr";
            Base::main_addr = "main_addr";
            Base::main_tmp = "main_tmp";
            Base::main_reg_write_X_r0 = "main_reg_write_X_r0";
            Base::main_r0 = "main_r0";
            Base::main_reg_write_X_r1 = "main_reg_write_X_r1";
            Base::main_r1 = "main_r1";
            Base::main_r2 = "main_r2";
            Base::main_reg_write_X_r3 = "main_reg_write_X_r3";
            Base::main_r3 = "main_r3";
            Base::main_r4 = "main_r4";
            Base::main_r5 = "main_r5";
            Base::main_r6 = "main_r6";
            Base::main_r7 = "main_r7";
            Base::main_r8 = "main_r8";
            Base::main_r9 = "main_r9";
            Base::main_r10 = "main_r10";
            Base::main_r11 = "main_r11";
            Base::main_instr_call = "main_instr_call";
            Base::main_instr_call_param_l = "main_instr_call_param_l";
            Base::main_instr_ret = "main_instr_ret";
            Base::main_instr__jump_to_operation = "main_instr__jump_to_operation";
            Base::main_instr__reset = "main_instr__reset";
            Base::main_instr__loop = "main_instr__loop";
            Base::main_instr_return = "main_instr_return";
            Base::main_X_const = "main_X_const";
            Base::main_X_free_value = "main_X_free_value";
            Base::main_Y_free_value = "main_Y_free_value";
            Base::main_Z_free_value = "main_Z_free_value";
            Base::main__operation_id_no_change = "main__operation_id_no_change";
        };
    };

    class VerifierCommitments : public AllEntities<Commitment, CommitmentHandle> {
      private:
        using Base = AllEntities<Commitment, CommitmentHandle>;

      public:
        VerifierCommitments(const std::shared_ptr<VerificationKey>& verification_key,
                            const VerifierTranscript<FF>& transcript)
        {
            static_cast<void>(transcript);
            static_cast<void>(verification_key);
        }
    };
};

class BrilligVMFlavor : public BrilligVMFlavorBase<grumpkin::g1, curve::BN254, pcs::kzg::KZG<curve::BN254>> {};

} // namespace flavor
} // namespace proof_system::honk
