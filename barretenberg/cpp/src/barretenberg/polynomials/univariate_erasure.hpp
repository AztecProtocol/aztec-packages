// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

namespace bb {

namespace detail {

template <class Fr> class UnivariateConcept {
  public:
    virtual ~UnivariateConcept() = default;

    // Core access methods
    virtual Fr& value_at(size_t i) = 0;
    virtual const Fr& value_at(size_t i) const = 0;
    virtual size_t size() const = 0;

    // Utility methods
    virtual bool is_zero() const = 0;
    virtual std::vector<uint8_t> to_buffer() const = 0;

    // Arithmetic operations (returning self)
    virtual UnivariateConcept& operator+=(const UnivariateConcept& other) = 0;
    virtual UnivariateConcept& operator-=(const UnivariateConcept& other) = 0;
    virtual UnivariateConcept& operator*=(const UnivariateConcept& other) = 0;
    virtual UnivariateConcept& operator+=(const Fr& scalar) = 0;
    virtual UnivariateConcept& operator-=(const Fr& scalar) = 0;
    virtual UnivariateConcept& operator*=(const Fr& scalar) = 0;
    virtual UnivariateConcept& self_sqr() = 0;

    // Arithmetic operations (returning new object)
    virtual std::unique_ptr<UnivariateConcept<Fr>> operator+(const UnivariateConcept& other) const = 0;
    virtual std::unique_ptr<UnivariateConcept<Fr>> operator-(const UnivariateConcept& other) const = 0;
    virtual std::unique_ptr<UnivariateConcept<Fr>> operator*(const UnivariateConcept& other) const = 0;
    virtual std::unique_ptr<UnivariateConcept<Fr>> operator+(const Fr& scalar) const = 0;
    virtual std::unique_ptr<UnivariateConcept<Fr>> operator-(const Fr& scalar) const = 0;
    virtual std::unique_ptr<UnivariateConcept<Fr>> operator*(const Fr& scalar) const = 0;

    // Evaluation
    virtual Fr evaluate(const Fr& u) const = 0;

    // Iterators
    virtual Fr* begin() = 0;
    virtual const Fr* begin() const = 0;
    virtual Fr* end() = 0;
    virtual const Fr* end() const = 0;
};

template <class Fr, class UnivariateImpl> class UnivariateModel : public UnivariateConcept<Fr> {
  public:
    UnivariateModel(UnivariateImpl&& impl)
        : impl_(std::move(impl))
    {}

    Fr& value_at(size_t i) override { return impl_.value_at(i); }
    const Fr& value_at(size_t i) const override { return impl_.value_at(i); }
    size_t size() const override { return impl_.size(); }
    bool is_zero() const override { return impl_.is_zero(); }
    std::vector<uint8_t> to_buffer() const override { return impl_.to_buffer(); }

    UnivariateModel& operator+=(const UnivariateConcept<Fr>& other) override
    {
        assert(impl_.size() == other.size());
        auto* other_model = dynamic_cast<const UnivariateModel<Fr, UnivariateImpl>*>(&other);
        assert(other_model != nullptr);
        impl_ += other_model->impl_;
        return *this;
    }
    UnivariateModel& operator-=(const UnivariateConcept<Fr>& other) override
    {
        assert(impl_.size() == other.size());
        auto* other_model = dynamic_cast<const UnivariateModel<Fr, UnivariateImpl>*>(&other);
        assert(other_model != nullptr);
        impl_ -= other_model->impl_;
        return *this;
    }
    UnivariateModel& operator*=(const UnivariateConcept<Fr>& other) override
    {
        assert(impl_.size() == other.size());
        auto* other_model = dynamic_cast<const UnivariateModel<Fr, UnivariateImpl>*>(&other);
        assert(other_model != nullptr);
        impl_ *= other_model->impl_;
        return *this;
    }
    UnivariateModel& operator+=(const Fr& scalar) override
    {
        impl_.operator+=(scalar);
        return *this;
    }
    UnivariateModel& operator-=(const Fr& scalar) override
    {
        impl_.operator-=(scalar);
        return *this;
    }
    UnivariateModel& operator*=(const Fr& scalar) override
    {
        impl_.operator*=(scalar);
        return *this;
    }
    UnivariateModel& self_sqr() override
    {
        impl_.self_sqr();
        return *this;
    }

    std::unique_ptr<UnivariateConcept<Fr>> operator+(const UnivariateConcept<Fr>& other) const override
    {
        auto* other_model = dynamic_cast<const UnivariateModel<Fr, UnivariateImpl>*>(&other);
        assert(other_model != nullptr);
        auto result_impl = impl_ + other_model->impl_;
        return std::make_unique<UnivariateModel<Fr, UnivariateImpl>>(std::move(result_impl));
    }
    std::unique_ptr<UnivariateConcept<Fr>> operator-(const UnivariateConcept<Fr>& other) const override
    {
        auto* other_model = dynamic_cast<const UnivariateModel<Fr, UnivariateImpl>*>(&other);
        assert(other_model != nullptr);
        auto result_impl = impl_ - other_model->impl_;
        return std::make_unique<UnivariateModel<Fr, UnivariateImpl>>(std::move(result_impl));
    }
    std::unique_ptr<UnivariateConcept<Fr>> operator*(const UnivariateConcept<Fr>& other) const override
    {
        auto* other_model = dynamic_cast<const UnivariateModel<Fr, UnivariateImpl>*>(&other);
        assert(other_model != nullptr);
        auto result_impl = impl_ * other_model->impl_;
        return std::make_unique<UnivariateModel<Fr, UnivariateImpl>>(std::move(result_impl));
    }
    std::unique_ptr<UnivariateConcept<Fr>> operator+(const Fr& scalar) const override
    {
        auto result_impl = impl_ + scalar;
        return std::make_unique<UnivariateModel<Fr, UnivariateImpl>>(std::move(result_impl));
    }
    std::unique_ptr<UnivariateConcept<Fr>> operator-(const Fr& scalar) const override
    {
        auto result_impl = impl_ - scalar;
        return std::make_unique<UnivariateModel<Fr, UnivariateImpl>>(std::move(result_impl));
    }
    std::unique_ptr<UnivariateConcept<Fr>> operator*(const Fr& scalar) const override
    {
        auto result_impl = impl_ * scalar;
        return std::make_unique<UnivariateModel<Fr, UnivariateImpl>>(std::move(result_impl));
    }

    Fr evaluate(const Fr& u) const override { return impl_.evaluate(u); }

    Fr* begin() override { return impl_.begin(); }
    const Fr* begin() const override { return impl_.begin(); }
    Fr* end() override { return impl_.end(); }
    const Fr* end() const override { return impl_.end(); }

  private:
    UnivariateImpl impl_;
};

} // namespace detail

/**
 * @brief Type-erased univariate polynomial.
 *
 * @tparam Fr The field type used for polynomial coefficients and evaluations
 */
template <class Fr> class ErasedUnivariate {
  public:
    using value_type = Fr;
    // using View = ???;

    template <class UnivariateImpl>
    ErasedUnivariate(UnivariateImpl&& impl)
        requires(!std::is_same_v<std::remove_cvref_t<UnivariateImpl>, ErasedUnivariate>)
        : impl_(std::make_unique<detail::UnivariateModel<Fr, UnivariateImpl>>(std::forward<UnivariateImpl>(impl)))
    {}

    // Core access methods
    Fr& value_at(size_t i) { return impl_->value_at(i); }
    const Fr& value_at(size_t i) const { return impl_->value_at(i); }
    size_t size() const { return impl_->size(); }

    // Utility methods
    bool is_zero() const { return impl_->is_zero(); }
    std::vector<uint8_t> to_buffer() const { return impl_->to_buffer(); }

    // Arithmetic operations
    ErasedUnivariate& operator+=(const ErasedUnivariate& other)
    {
        impl_->operator+=(*other.impl_);
        return *this;
    }
    ErasedUnivariate& operator-=(const ErasedUnivariate& other)
    {
        impl_->operator-=(*other.impl_);
        return *this;
    }
    ErasedUnivariate& operator*=(const ErasedUnivariate& other)
    {
        impl_->operator*=(*other.impl_);
        return *this;
    }
    ErasedUnivariate& operator+=(const Fr& scalar)
    {
        impl_->operator+=(scalar);
        return *this;
    }
    ErasedUnivariate& operator-=(const Fr& scalar)
    {
        impl_->operator-=(scalar);
        return *this;
    }
    ErasedUnivariate& operator*=(const Fr& scalar)
    {
        impl_->operator*=(scalar);
        return *this;
    }
    ErasedUnivariate& self_sqr()
    {
        impl_->self_sqr();
        return *this;
    }

    ErasedUnivariate operator+(const ErasedUnivariate& other) const
    {
        auto new_impl = impl_->operator+(*other.impl_);
        return ErasedUnivariate(std::move(new_impl));
    }
    ErasedUnivariate operator-(const ErasedUnivariate& other) const
    {
        auto new_impl = impl_->operator-(*other.impl_);
        return ErasedUnivariate(std::move(new_impl));
    }
    ErasedUnivariate operator*(const ErasedUnivariate& other) const
    {
        auto new_impl = impl_->operator*(*other.impl_);
        return ErasedUnivariate(std::move(new_impl));
    }
    ErasedUnivariate operator+(const Fr& scalar) const
    {
        auto new_impl = impl_->operator+(scalar);
        return ErasedUnivariate(std::move(new_impl));
    }
    ErasedUnivariate operator-(const Fr& scalar) const
    {
        auto new_impl = impl_->operator-(scalar);
        return ErasedUnivariate(std::move(new_impl));
    }
    ErasedUnivariate operator*(const Fr& scalar) const
    {
        auto new_impl = impl_->operator*(scalar);
        return ErasedUnivariate(std::move(new_impl));
    }

    // Evaluation
    Fr evaluate(const Fr& u) const { return impl_->evaluate(u); }

    // Iterators
    Fr* begin() { return impl_->begin(); }
    const Fr* begin() const { return impl_->begin(); }
    Fr* end() { return impl_->end(); }
    const Fr* end() const { return impl_->end(); }

  private:
    explicit ErasedUnivariate(std::unique_ptr<detail::UnivariateConcept<Fr>> impl)
        : impl_(std::move(impl))
    {}

    std::unique_ptr<detail::UnivariateConcept<Fr>> impl_;
};

} // namespace bb
