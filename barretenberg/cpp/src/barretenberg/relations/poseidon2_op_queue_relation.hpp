#pragma once
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

/**
 * @brief Constrains poseidon2_op_wire polynomials to equal shifted wires on the Poseidon2 op domain,
 * and zero elsewhere.
 *
 * @details Structurally identical to EccOpQueueRelation. The relation enforces:
 *
 *   For j = 0..3:
 *     (poseidon2_op_wire_j - w_j_shift) * lagrange_poseidon2_op = 0   (copy on domain)
 *     poseidon2_op_wire_j * (1 - lagrange_poseidon2_op) = 0           (vanish elsewhere)
 *
 * This copies the sponge state (4 elements) and hash output from the circuit's wires into
 * dedicated op wire columns. Each Poseidon2 hash uses 2 rows:
 *   Row 0: state[0], state[1], state[2], state[3]  (sponge state before permutation)
 *   Row 1: output,   0,        0,        0          (hash output)
 *
 * Unlike EccOpQueueRelation (which uses w_shift because ecc_op is the first block after the
 * zero row), this relation uses the non-shifted wires w_l, w_r, w_o, w_4 directly. The
 * poseidon2_op_wire data is stored at the same trace positions as the poseidon2_op block,
 * so w_j[i] at a poseidon2_op position directly contains the op data.
 *
 * The op wire commitments are accumulated via the Poseidon2 merge protocol across IVC
 * iterations, and verified in a single Poseidon2SingleRowFlavor proof at the end.
 *
 * NOTE: This is a separate implementation from EccOpQueueRelation. In a future refactor,
 * both could be templated on the op wire and selector names to share the identical logic.
 */
template <typename FF_> class Poseidon2OpQueueRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 8> SUBRELATION_PARTIAL_LENGTHS{
        3, // wire - poseidon2-op-wire consistency sub-relation 1
        3, // wire - poseidon2-op-wire consistency sub-relation 2
        3, // wire - poseidon2-op-wire consistency sub-relation 3
        3, // wire - poseidon2-op-wire consistency sub-relation 4
        3, // poseidon2-op-wire vanishes sub-relation 1
        3, // poseidon2-op-wire vanishes sub-relation 2
        3, // poseidon2-op-wire vanishes sub-relation 3
        3  // poseidon2-op-wire vanishes sub-relation 4
    };

    template <typename AllEntities> inline static bool skip([[maybe_unused]] const AllEntities& in)
    {
        return in.lagrange_poseidon2_op.is_zero();
    }

    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const Parameters&,
                                  const FF& scaling_factor)
    {
        using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
        using CoefficientAccumulator = typename Accumulator::CoefficientAccumulator;

        // Read non-shifted wires (unlike EccOpQueueRelation which uses w_shift because ecc_op
        // is the first block after the zero row; poseidon2_op is not first, so we use w directly)
        auto w_1 = Accumulator(CoefficientAccumulator(in.w_l));
        auto w_2 = Accumulator(CoefficientAccumulator(in.w_r));
        auto w_3 = Accumulator(CoefficientAccumulator(in.w_o));
        auto w_4 = Accumulator(CoefficientAccumulator(in.w_4));
        auto op_wire_1 = Accumulator(CoefficientAccumulator(in.poseidon2_op_wire_1));
        auto op_wire_2 = Accumulator(CoefficientAccumulator(in.poseidon2_op_wire_2));
        auto op_wire_3 = Accumulator(CoefficientAccumulator(in.poseidon2_op_wire_3));
        auto op_wire_4 = Accumulator(CoefficientAccumulator(in.poseidon2_op_wire_4));
        auto lagrange = Accumulator(CoefficientAccumulator(in.lagrange_poseidon2_op));

        auto lagrange_by_scaling = lagrange * scaling_factor;
        auto complement_by_scaling = -lagrange_by_scaling + scaling_factor;

        // Copy constraints: poseidon2_op_wire_j = w_j on the poseidon2 op domain
        auto tmp = op_wire_1 - w_1;
        tmp *= lagrange_by_scaling;
        std::get<0>(accumulators) += tmp;

        tmp = op_wire_2 - w_2;
        tmp *= lagrange_by_scaling;
        std::get<1>(accumulators) += tmp;

        tmp = op_wire_3 - w_3;
        tmp *= lagrange_by_scaling;
        std::get<2>(accumulators) += tmp;

        tmp = op_wire_4 - w_4;
        tmp *= lagrange_by_scaling;
        std::get<3>(accumulators) += tmp;

        // Vanishing constraints: poseidon2_op_wire_j = 0 outside the poseidon2 op domain
        tmp = op_wire_1 * complement_by_scaling;
        std::get<4>(accumulators) += tmp;

        tmp = op_wire_2 * complement_by_scaling;
        std::get<5>(accumulators) += tmp;

        tmp = op_wire_3 * complement_by_scaling;
        std::get<6>(accumulators) += tmp;

        tmp = op_wire_4 * complement_by_scaling;
        std::get<7>(accumulators) += tmp;
    };
};

template <typename FF> using Poseidon2OpQueueRelation = Relation<Poseidon2OpQueueRelationImpl<FF>>;

} // namespace bb
