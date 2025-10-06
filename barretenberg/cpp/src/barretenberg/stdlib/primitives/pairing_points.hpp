// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"

namespace bb::stdlib::recursion {

/**
 * @brief An object storing two EC points that represent the inputs to a pairing check.
 * @details The points may represent the output of a single partial recursive verification or the linear combination of
 * multiple sets of pairing points.
 *
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1421): Proper tests for `PairingPoints`
 * @tparam Builder_
 */
template <typename Builder_> struct PairingPoints {
    using Builder = Builder_;
    using Curve = bn254<Builder>;
    using Group = typename Curve::Group;
    using Fr = typename Curve::ScalarField;
    Group P0;
    Group P1;

    bool has_data = false;

    // Number of bb::fr field elements used to represent a goblin element in the public inputs
    static constexpr size_t PUBLIC_INPUTS_SIZE = PAIRING_POINTS_SIZE;

    PairingPoints() = default;

    PairingPoints(const Group& P0, const Group& P1)
        : P0(P0)
        , P1(P1)
        , has_data(true)
    {}

    PairingPoints(std::array<Group, 2> const& points)
        : PairingPoints(points[0], points[1])
    {}

    typename Curve::bool_ct operator==(PairingPoints const& other) const { return P0 == other.P0 && P1 == other.P1; };

    /**
     * @brief Compute a linear combination of the present pairing points with an input set of pairing points
     * @details The linear combination is done with a recursion separator that is the hash of the two sets of pairing
     * points.
     * @param other
     * @param recursion_separator
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1376): Potentially switch a batch_mul approach to
    // aggregation rather than individually aggregating 1 object at a time.
    void aggregate(PairingPoints const& other)
    {
        ASSERT(other.has_data, "Cannot aggregate null pairing points.");

        // If LHS is empty, simply set it equal to the incoming pairing points
        if (!this->has_data && other.has_data) {
            *this = other;
            return;
        }
        // We use a Transcript because it provides us an easy way to hash to get a "random" separator.
        BaseTranscript<stdlib::recursion::honk::StdlibTranscriptParams<Builder>> transcript{};
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1375): Sometimes unnecesarily hashing constants

        transcript.add_to_hash_buffer("Accumulator_P0", P0);
        transcript.add_to_hash_buffer("Accumulator_P1", P1);
        transcript.add_to_hash_buffer("Aggregated_P0", other.P0);
        transcript.add_to_hash_buffer("Aggregated_P1", other.P1);
        auto recursion_separator =
            transcript.template get_challenge<typename Curve::ScalarField>("recursion_separator");
        // If Mega Builder is in use, the EC operations are deferred via Goblin
        if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1385): Can we improve efficiency here?
            P0 = Group::batch_mul({ P0, other.P0 }, { 1, recursion_separator });
            P1 = Group::batch_mul({ P1, other.P1 }, { 1, recursion_separator });
        } else {
            // Save gates using short scalars. We don't apply `bn254_endo_batch_mul` to the vector {1,
            // recursion_separator} directly to avoid edge cases.
            Group point_to_aggregate = other.P0.scalar_mul(recursion_separator, 128);
            P0 += point_to_aggregate;
            point_to_aggregate = other.P1.scalar_mul(recursion_separator, 128);
            P1 += point_to_aggregate;
        }
    }

    /**
     * @brief Set the witness indices for the limbs of the pairing points to public
     *
     * @return uint32_t The index into the public inputs array at which the representation is stored
     */
    uint32_t set_public()
    {
        ASSERT(this->has_data, "Calling set_public on empty pairing points.");
        uint32_t start_idx = P0.set_public();
        P1.set_public();

        return start_idx;
    }

    /**
     * @brief Reconstruct an PairingPoints from its representation as limbs (generally stored in the public inputs)
     *
     * @param limbs The limbs of the pairing points
     * @return PairingPoints<Builder>
     */
    static PairingPoints<Builder> reconstruct_from_public(const std::span<const Fr, PUBLIC_INPUTS_SIZE>& limbs)
    {
        const size_t FRS_PER_POINT = Group::PUBLIC_INPUTS_SIZE;
        std::span<const Fr, FRS_PER_POINT> P0_limbs{ limbs.data(), FRS_PER_POINT };
        std::span<const Fr, FRS_PER_POINT> P1_limbs{ limbs.data() + FRS_PER_POINT, FRS_PER_POINT };
        Group P0 = Group::reconstruct_from_public(P0_limbs);
        Group P1 = Group::reconstruct_from_public(P1_limbs);
        return { P0, P1 };
    }

    static std::array<fr, PUBLIC_INPUTS_SIZE> construct_dummy()
    {
        // We just biggroup here instead of Group (which is either biggroup or biggroup_goblin) because this is the most
        // efficient way of setting the default pairing points. If we use biggroup_goblin elements, we have to convert
        // them back to biggroup elements anyway to add them to the public inputs...
        using BigGroup = element_default::
            element<Builder, bigfield<Builder, bb::Bn254FqParams>, field_t<Builder>, curve::BN254::Group>;
        std::array<fr, PUBLIC_INPUTS_SIZE> dummy_pairing_points_values;
        size_t idx = 0;
        for (size_t i = 0; i < 2; i++) {
            std::array<fr, BigGroup::PUBLIC_INPUTS_SIZE> element_vals = BigGroup::construct_dummy();
            for (auto& val : element_vals) {
                dummy_pairing_points_values[idx++] = val;
            }
        }

        return dummy_pairing_points_values;
    }

    /**
     * @brief Adds default public inputs to the builder.
     * @details This should cost exactly 20 gates because there's 4 bigfield elements and each have 5 total
     * witnesses including the prime limb.
     *
     * @param builder
     */
    static void add_default_to_public_inputs(Builder& builder)
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): These are pairing points extracted from a
        // valid proof. This is a workaround because we can't represent the point at infinity in biggroup yet.
        bigfield<Builder, bb::Bn254FqParams> x0(
            fq("0x031e97a575e9d05a107acb64952ecab75c020998797da7842ab5d6d1986846cf"));
        bigfield<Builder, bb::Bn254FqParams> y0(
            fq("0x178cbf4206471d722669117f9758a4c410db10a01750aebb5666547acf8bd5a4"));
        bigfield<Builder, bb::Bn254FqParams> x1(
            fq("0x0f94656a2ca489889939f81e9c74027fd51009034b3357f0e91b8a11e7842c38"));
        bigfield<Builder, bb::Bn254FqParams> y1(
            fq("0x1b52c2020d7464a0c80c0da527a08193fe27776f50224bd6fb128b46c1ddb67f"));

        x0.convert_constant_to_fixed_witness(&builder);
        y0.convert_constant_to_fixed_witness(&builder);
        x1.convert_constant_to_fixed_witness(&builder);
        y1.convert_constant_to_fixed_witness(&builder);

        x0.set_public();
        y0.set_public();
        x1.set_public();
        y1.set_public();
    }
};

template <typename Builder> void read(uint8_t const*& it, PairingPoints<Builder>& as)
{
    using serialize::read;

    read(it, as.P0);
    read(it, as.P1);
    read(it, as.has_data);
};

template <typename Builder> void write(std::vector<uint8_t>& buf, PairingPoints<Builder> const& as)
{
    using serialize::write;

    write(buf, as.P0);
    write(buf, as.P1);
    write(buf, as.has_data);
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, PairingPoints<NCT> const& as)
{
    return os << "P0: " << as.P0 << "\n"
              << "P1: " << as.P1 << "\n"
              << "has_data: " << as.has_data << "\n";
}

} // namespace bb::stdlib::recursion
