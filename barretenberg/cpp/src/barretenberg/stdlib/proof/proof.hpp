// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <cstdint>

namespace bb::stdlib {

/**
 * @brief A simple wrapper around a vector of stdlib field elements representing a proof
 *
 * @tparam Builder
 */
template <typename Builder> class Proof : public std::vector<bb::stdlib::field_t<Builder>> {
  public:
    using Base = std::vector<bb::stdlib::field_t<Builder>>;
    using Base::Base; // Inherit all constructors from std::vector

    // Explicitly define vector copy constructor (not inherited by default)
    Proof(const std::vector<bb::stdlib::field_t<Builder>>& fields)
        : Base(fields)
    {}

    // Constructor from a native Proof
    Proof(Builder& builder, const HonkProof& native_proof)
    {
        for (const auto& element : native_proof) {
            this->push_back(bb::stdlib::witness_t<Builder>(&builder, element));
        }
    };

    // Extract the native HonkProof
    HonkProof get_value() const
    {
        HonkProof result;
        result.reserve(this->size());
        for (const auto& element : *this) {
            result.push_back(element.get_value());
        }
        return result;
    };
};

} // namespace bb::stdlib
