#pragma once
#include "barretenberg/crypto/schnorr/schnorr.hpp"
#include "../../primitives/field/field.hpp"
#include "../../primitives/bool/bool.hpp"
#include "../../primitives/witness/witness.hpp"
#include "../../primitives/byte_array/byte_array.hpp"
#include "../../primitives/point/point.hpp"
#include "../../primitives/group/group.hpp"

namespace proof_system::plonk {
namespace stdlib {
namespace schnorr {

template <typename C> struct signature_bits {
    field_t<C> s_lo;
    field_t<C> s_hi;
    field_t<C> e_lo;
    field_t<C> e_hi;
};

template <typename C> struct wnaf_record {
    std::vector<bool_t<C>> bits;
    bool_t<C> skew;
};

template <typename C> wnaf_record<C> convert_field_into_wnaf(C* context, const field_t<C>& limb);

template <typename C>
point<C> variable_base_mul(const point<C>& pub_key, const point<C>& current_accumulator, const wnaf_record<C>& scalar);
template <typename C>
point<C> variable_base_mul(const point<C>& pub_key, const field_t<C>& low_bits, const field_t<C>& high_bits);

template <typename C> signature_bits<C> convert_signature(C* context, const crypto::schnorr::signature& sig);

template <typename C>
std::array<field_t<C>, 2> verify_signature_internal(const byte_array<C>& message,
                                                    const point<C>& pub_key,
                                                    const signature_bits<C>& sig);

template <typename C>
void verify_signature(const byte_array<C>& message, const point<C>& pub_key, const signature_bits<C>& sig);

template <typename C>
bool_t<C> signature_verification_result(const byte_array<C>& message,
                                        const point<C>& pub_key,
                                        const signature_bits<C>& sig);

#define VARIABLE_BASE_MUL(COMPOSER_TYPE)                                                                               \
    point<COMPOSER_TYPE> variable_base_mul<COMPOSER_TYPE>(                                                             \
        const point<COMPOSER_TYPE>&, const point<COMPOSER_TYPE>&, const wnaf_record<COMPOSER_TYPE>&)

#define CONVERT_FIELD_INTO_WNAF(COMPOSER_TYPE)                                                                         \
    wnaf_record<COMPOSER_TYPE> convert_field_into_wnaf<COMPOSER_TYPE>(COMPOSER_TYPE * context,                         \
                                                                      const field_t<COMPOSER_TYPE>& limb)

#define VERIFY_SIGNATURE_INTERNAL(COMPOSER_TYPE)                                                                       \
    std::array<field_t<COMPOSER_TYPE>, 2> verify_signature_internal<COMPOSER_TYPE>(                                    \
        const byte_array<COMPOSER_TYPE>&, const point<COMPOSER_TYPE>&, const signature_bits<COMPOSER_TYPE>&)

#define VERIFY_SIGNATURE(COMPOSER_TYPE)                                                                                \
    void verify_signature<COMPOSER_TYPE>(                                                                              \
        const byte_array<COMPOSER_TYPE>&, const point<COMPOSER_TYPE>&, const signature_bits<COMPOSER_TYPE>&)

#define SIGNATURE_VERIFICATION_RESULT(COMPOSER_TYPE)                                                                   \
    bool_t<COMPOSER_TYPE> signature_verification_result<COMPOSER_TYPE>(                                                \
        const byte_array<COMPOSER_TYPE>&, const point<COMPOSER_TYPE>&, const signature_bits<COMPOSER_TYPE>&)

#define CONVERT_SIGNATURE(COMPOSER_TYPE)                                                                               \
    signature_bits<COMPOSER_TYPE> convert_signature<COMPOSER_TYPE>(COMPOSER_TYPE*, const crypto::schnorr::signature&)

EXTERN_STDLIB_METHOD(VARIABLE_BASE_MUL)
EXTERN_STDLIB_METHOD(CONVERT_FIELD_INTO_WNAF)
EXTERN_STDLIB_METHOD(VERIFY_SIGNATURE_INTERNAL)
EXTERN_STDLIB_METHOD(VERIFY_SIGNATURE)
EXTERN_STDLIB_METHOD(SIGNATURE_VERIFICATION_RESULT)
EXTERN_STDLIB_METHOD(CONVERT_SIGNATURE)

} // namespace schnorr
} // namespace stdlib
} // namespace proof_system::plonk
