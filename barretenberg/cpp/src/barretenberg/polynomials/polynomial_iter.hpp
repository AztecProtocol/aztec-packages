#pragma once

#include "barretenberg/common/assert.hpp"
#include "polynomial_arithmetic.hpp"

namespace bb {

// Forward declare for reference and iterator classes.
template <typename Fr> class Polynomial;

/**
 * @brief A proxy class to represent a reference to an element in the Polynomial.
 *
 * @tparam Fr The finite field type.
 *
 * This class exists because not all elements of a Polynomial (namely, zeroes at beginning and end) are not stored in a
 * contiguous block of memory. As a result, we cannot use normal references to elements in the Polynomial. Instead, this
 * class acts as a proxy, providing the ability to read and write elements as if they were accessed by reference.
 */
template <typename Fr> class PolynomialReference {
  public:
    /**
     * @brief Constructor for the PolynomialReference.
     * @param polynomial A pointer to the Polynomial object.
     * @param index The index of the element within the Polynomial.
     */
    PolynomialReference(Polynomial<Fr>* polynomial, size_t index)
        : polynomial_(polynomial)
        , index_(index)
    {}

    /**
     * @brief Assignment operator to set the value of the referenced element.
     * @param value The value to be assigned to the element.
     * @return PolynomialReference& Reference to the current object.
     */
    PolynomialReference& operator=(const Fr& value);

    /**
     * @brief Implicit conversion operator to allow the proxy to be used as an Fr.
     * @return Fr The value of the element in the Polynomial.
     */
    operator Fr() const { return polynomial_->get(index_); }

    // WORKTODO(sparse) implement this?
    // /**
    //  * @brief Address-of operator to mimic a true reference.
    //  * @return Fr* Pointer to the element in the Polynomial.
    //  */
    // Fr* operator&() { return &polynomial_->get(index_); }

    // Arithmetic operators
    PolynomialReference& operator+=(const Fr& rhs)
    {
        Fr value = polynomial_->get(index_);
        value += rhs;
        polynomial_->set(index_, value);
        return *this;
    }

    PolynomialReference& operator-=(const Fr& rhs)
    {
        Fr value = polynomial_->get(index_);
        value -= rhs;
        polynomial_->set(index_, value);
        return *this;
    }

    PolynomialReference& operator*=(const Fr& rhs)
    {
        Fr value = polynomial_->get(index_);
        value *= rhs;
        polynomial_->set(index_, value);
        return *this;
    }

    PolynomialReference& operator/=(const Fr& rhs)
    {
        Fr value = polynomial_->get(index_);
        value /= rhs; // Assumes Fr supports division
        polynomial_->set(index_, value);
        return *this;
    }

    // Unary operators
    PolynomialReference& operator++()
    { // Prefix increment
        Fr value = polynomial_->get(index_);
        ++value;
        polynomial_->set(index_, value);
        return *this;
    }

    PolynomialReference operator++(int)
    { // Postfix increment
        PolynomialReference temp = *this;
        ++(*this);
        return temp;
    }

    PolynomialReference& operator--()
    { // Prefix decrement
        Fr value = polynomial_->get(index_);
        --value;
        polynomial_->set(index_, value);
        return *this;
    }

    PolynomialReference operator--(int)
    { // Postfix decrement
        PolynomialReference temp = *this;
        --(*this);
        return temp;
    }

  private:
    Polynomial<Fr>* polynomial_; ///< Pointer to the Polynomial.
    size_t index_;               ///< Index of the element within the Polynomial.
};

// Non-member arithmetic operators for PolynomialReference with Fr
template <typename Fr> Fr operator+(const PolynomialReference<Fr>& lhs, const Fr& rhs)
{
    return static_cast<Fr>(lhs) + rhs;
}

template <typename Fr> Fr operator-(const PolynomialReference<Fr>& lhs, const Fr& rhs)
{
    return static_cast<Fr>(lhs) - rhs;
}

template <typename Fr> Fr operator*(const PolynomialReference<Fr>& lhs, const Fr& rhs)
{
    return static_cast<Fr>(lhs) * rhs;
}

template <typename Fr> Fr operator/(const PolynomialReference<Fr>& lhs, const Fr& rhs)
{
    return static_cast<Fr>(lhs) / rhs;
}

// Non-member arithmetic operators for Fr with PolynomialReference
template <typename Fr> Fr operator+(const Fr& lhs, const PolynomialReference<Fr>& rhs)
{
    return lhs + static_cast<Fr>(rhs);
}

template <typename Fr> Fr operator-(const Fr& lhs, const PolynomialReference<Fr>& rhs)
{
    return lhs - static_cast<Fr>(rhs);
}

template <typename Fr> Fr operator*(const Fr& lhs, const PolynomialReference<Fr>& rhs)
{
    return lhs * static_cast<Fr>(rhs);
}

template <typename Fr> Fr operator/(const Fr& lhs, const PolynomialReference<Fr>& rhs)
{
    return lhs / static_cast<Fr>(rhs);
}

// Non-member arithmetic operators for two PolynomialReferences
template <typename Fr> Fr operator+(const PolynomialReference<Fr>& lhs, const PolynomialReference<Fr>& rhs)
{
    return static_cast<Fr>(lhs) + static_cast<Fr>(rhs);
}

template <typename Fr> Fr operator-(const PolynomialReference<Fr>& lhs, const PolynomialReference<Fr>& rhs)
{
    return static_cast<Fr>(lhs) - static_cast<Fr>(rhs);
}

template <typename Fr> Fr operator*(const PolynomialReference<Fr>& lhs, const PolynomialReference<Fr>& rhs)
{
    return static_cast<Fr>(lhs) * static_cast<Fr>(rhs);
}

template <typename Fr> Fr operator/(const PolynomialReference<Fr>& lhs, const PolynomialReference<Fr>& rhs)
{
    return static_cast<Fr>(lhs) / static_cast<Fr>(rhs);
}

/**
 * @brief An iterator class for the Polynomial, designed to work with std::span.
 *
 * @tparam Fr The finite field type.
 *
 * This class exists because the elements of a Polynomial are not stored in a contiguous block of memory.
 * Normal pointers cannot be used to iterate over Polynomial elements. Instead, this iterator provides
 * random access to the elements using a proxy reference (PolynomialReference) to ensure seamless access
 * and modification.
 */
template <typename Fr> class PolynomialIterator {
  public:
    using iterator_category = std::random_access_iterator_tag;
    using value_type = PolynomialReference<Fr>;
    using difference_type = std::ptrdiff_t;
    using pointer = value_type*;
    using reference = value_type;

    /**
     * @brief Constructor for the PolynomialIterator.
     * @param polynomial A pointer to the Polynomial object.
     * @param index The starting index for the iterator.
     */
    PolynomialIterator(Polynomial<Fr>* polynomial, size_t index)
        : polynomial_(polynomial)
        , index_(index)
    {}

    /**
     * @brief Dereference operator to access the element at the current iterator position.
     * @return PolynomialReference<Fr> A proxy reference to the element.
     */
    reference operator*() const { return reference(polynomial_, index_); }

    /**
     * @brief Pre-increment operator to advance the iterator.
     * @return PolynomialIterator& Reference to the current iterator.
     */
    PolynomialIterator& operator++()
    {
        ++index_;
        return *this;
    }

    /**
     * @brief Post-increment operator to advance the iterator.
     * @return PolynomialIterator The iterator before it was incremented.
     */
    PolynomialIterator operator++(int)
    {
        PolynomialIterator tmp = *this;
        ++(*this);
        return tmp;
    }

    /**
     * @brief Equality operator to compare two iterators.
     * @param other The other iterator to compare to.
     * @return true If the iterators are equal.
     * @return false If the iterators are not equal.
     */
    bool operator==(const PolynomialIterator& other) const
    {
        return index_ == other.index_ && polynomial_ == other.polynomial_;
    }

    /**
     * @brief Inequality operator to compare two iterators.
     * @param other The other iterator to compare to.
     * @return true If the iterators are not equal.
     * @return false If the iterators are equal.
     */
    bool operator!=(const PolynomialIterator& other) const { return !(*this == other); }

    /**
     * @brief Subtraction operator to calculate the distance between two iterators.
     * @param other The other iterator to compare to.
     * @return difference_type The distance between the iterators.
     */
    difference_type operator-(const PolynomialIterator& other) const
    {
        return static_cast<difference_type>(index_) - static_cast<difference_type>(other.index_);
    }

    /**
     * @brief Addition assignment operator to advance the iterator by n steps.
     * @param n The number of steps to advance.
     * @return PolynomialIterator& Reference to the current iterator.
     */
    PolynomialIterator& operator+=(difference_type n)
    {
        index_ += n;
        return *this;
    }

    /**
     * @brief Addition operator to create a new iterator advanced by n steps.
     * @param n The number of steps to advance.
     * @return PolynomialIterator The new iterator.
     */
    PolynomialIterator operator+(difference_type n) const
    {
        PolynomialIterator tmp = *this;
        tmp += n;
        return tmp;
    }

    /**
     * @brief Pre-decrement operator to move the iterator backward.
     * @return PolynomialIterator& Reference to the current iterator.
     */
    PolynomialIterator& operator--()
    {
        --index_;
        return *this;
    }

    /**
     * @brief Post-decrement operator to move the iterator backward.
     * @return PolynomialIterator The iterator before it was decremented.
     */
    PolynomialIterator operator--(int)
    {
        PolynomialIterator tmp = *this;
        --(*this);
        return tmp;
    }

    /**
     * @brief Subtraction assignment operator to move the iterator backward by n steps.
     * @param n The number of steps to move backward.
     * @return PolynomialIterator& Reference to the current iterator.
     */
    PolynomialIterator& operator-=(difference_type n)
    {
        index_ -= n;
        return *this;
    }

    /**
     * @brief Subtraction operator to create a new iterator moved backward by n steps.
     * @param n The number of steps to move backward.
     * @return PolynomialIterator The new iterator.
     */
    PolynomialIterator operator-(difference_type n) const
    {
        PolynomialIterator tmp = *this;
        tmp -= n;
        return tmp;
    }

  private:
    Polynomial<Fr>* polynomial_; ///< Pointer to the Polynomial.
    size_t index_;               ///< Current index within the Polynomial.
};

template <typename Fr> struct PolynomialSpan {
    size_t start_index;
    std::span<Fr> span;
    size_t end_index() const { return start_index + size(); }
    Fr* data() { return span.data(); }
    size_t size() const { return span.size(); }
    Fr& operator[](size_t index) { return span[index]; }
    const Fr& operator[](size_t index) const { return span[index]; }
};

} // namespace bb