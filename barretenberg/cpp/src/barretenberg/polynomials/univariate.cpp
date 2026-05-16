#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace bb {
namespace {

template <class Fr> void extend_univariate_evaluations_impl(std::span<Fr> result, std::span<const Fr> evaluations)
{
    BB_ASSERT_GTE(result.size(), evaluations.size());
    if (evaluations.empty()) {
        return;
    }

    std::copy(evaluations.begin(), evaluations.end(), result.begin());
    if (result.size() == evaluations.size()) {
        return;
    }

    std::array<Fr, 64> differences;
    std::array<Fr, 64> tail_differences;
    BB_ASSERT_LTE(evaluations.size(), differences.size());
    std::copy(evaluations.begin(), evaluations.end(), differences.begin());

    const size_t source_length = evaluations.size();
    tail_differences[0] = evaluations[source_length - 1];
    for (size_t level = 1; level < source_length; ++level) {
        for (size_t idx = source_length - 1; idx >= level; --idx) {
            differences[idx] -= differences[idx - 1];
        }
        tail_differences[level] = differences[source_length - 1];
    }

    for (size_t idx = source_length; idx < result.size(); ++idx) {
        for (size_t level = source_length - 1; level > 0; --level) {
            tail_differences[level - 1] += tail_differences[level];
        }
        result[idx] = tail_differences[0];
    }
}

template <class Fr> void add_assign_univariate_evaluations_impl(std::span<Fr> lhs, std::span<const Fr> rhs)
{
    BB_ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t idx = 0; idx < lhs.size(); ++idx) {
        lhs[idx] += rhs[idx];
    }
}

template <class Fr> void sub_assign_univariate_evaluations_impl(std::span<Fr> lhs, std::span<const Fr> rhs)
{
    BB_ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t idx = 0; idx < lhs.size(); ++idx) {
        lhs[idx] -= rhs[idx];
    }
}

template <class Fr> void mul_assign_univariate_evaluations_impl(std::span<Fr> lhs, std::span<const Fr> rhs)
{
    BB_ASSERT_EQ(lhs.size(), rhs.size());
    for (size_t idx = 0; idx < lhs.size(); ++idx) {
        lhs[idx] *= rhs[idx];
    }
}

template <class Fr> void sqr_univariate_evaluations_impl(std::span<Fr> values)
{
    for (auto& value : values) {
        value.self_sqr();
    }
}

template <class Fr> void add_assign_univariate_evaluations_impl(std::span<Fr> values, const Fr& scalar)
{
    for (auto& value : values) {
        value += scalar;
    }
}

template <class Fr> void sub_assign_univariate_evaluations_impl(std::span<Fr> values, const Fr& scalar)
{
    for (auto& value : values) {
        value -= scalar;
    }
}

template <class Fr> void mul_assign_univariate_evaluations_impl(std::span<Fr> values, const Fr& scalar)
{
    for (auto& value : values) {
        value *= scalar;
    }
}

template <class Fr> void negate_univariate_evaluations_impl(std::span<Fr> values)
{
    for (auto& value : values) {
        value = -value;
    }
}

} // namespace

void extend_univariate_evaluations(std::span<fr> result, std::span<const fr> evaluations)
{
    extend_univariate_evaluations_impl(result, evaluations);
}

void add_assign_univariate_evaluations(std::span<fr> lhs, std::span<const fr> rhs)
{
    add_assign_univariate_evaluations_impl(lhs, rhs);
}

void sub_assign_univariate_evaluations(std::span<fr> lhs, std::span<const fr> rhs)
{
    sub_assign_univariate_evaluations_impl(lhs, rhs);
}

void mul_assign_univariate_evaluations(std::span<fr> lhs, std::span<const fr> rhs)
{
    mul_assign_univariate_evaluations_impl(lhs, rhs);
}

void sqr_univariate_evaluations(std::span<fr> values)
{
    sqr_univariate_evaluations_impl(values);
}

void add_assign_univariate_evaluations(std::span<fr> values, const fr& scalar)
{
    add_assign_univariate_evaluations_impl(values, scalar);
}

void sub_assign_univariate_evaluations(std::span<fr> values, const fr& scalar)
{
    sub_assign_univariate_evaluations_impl(values, scalar);
}

void mul_assign_univariate_evaluations(std::span<fr> values, const fr& scalar)
{
    mul_assign_univariate_evaluations_impl(values, scalar);
}

void negate_univariate_evaluations(std::span<fr> values)
{
    negate_univariate_evaluations_impl(values);
}

void extend_univariate_evaluations(std::span<fq> result, std::span<const fq> evaluations)
{
    extend_univariate_evaluations_impl(result, evaluations);
}

void add_assign_univariate_evaluations(std::span<fq> lhs, std::span<const fq> rhs)
{
    add_assign_univariate_evaluations_impl(lhs, rhs);
}

void sub_assign_univariate_evaluations(std::span<fq> lhs, std::span<const fq> rhs)
{
    sub_assign_univariate_evaluations_impl(lhs, rhs);
}

void mul_assign_univariate_evaluations(std::span<fq> lhs, std::span<const fq> rhs)
{
    mul_assign_univariate_evaluations_impl(lhs, rhs);
}

void sqr_univariate_evaluations(std::span<fq> values)
{
    sqr_univariate_evaluations_impl(values);
}

void add_assign_univariate_evaluations(std::span<fq> values, const fq& scalar)
{
    add_assign_univariate_evaluations_impl(values, scalar);
}

void sub_assign_univariate_evaluations(std::span<fq> values, const fq& scalar)
{
    sub_assign_univariate_evaluations_impl(values, scalar);
}

void mul_assign_univariate_evaluations(std::span<fq> values, const fq& scalar)
{
    mul_assign_univariate_evaluations_impl(values, scalar);
}

void negate_univariate_evaluations(std::span<fq> values)
{
    negate_univariate_evaluations_impl(values);
}

} // namespace bb
