#pragma once
#include "barretenberg/common/assert.hpp"
#include <cstddef>
#include <initializer_list>
#include <iterator>
#include <stdexcept>
#include <vector>

/**
 * @brief A template class for a reference vector. Behaves as if std::vector<T&> was possible.
 *
 * This class provides a dynamic-size vector of pointers to elements of type T, exposed as references.
 * It offers random access to its elements and provides an iterator class
 * for traversal.
 *
 * @tparam T The type of elements stored in the vector.
 */
template <typename T> class RefVector {
  public:
    RefVector() = default;

    explicit RefVector(const std::vector<T*>& ptr_vector)
        : storage(ptr_vector)
    {}

    template <typename... Ts> RefVector(T& ref, Ts&... rest)
    {
        storage.push_back(&ref);
        (storage.push_back(&rest), ...);
    }

    RefVector(const RefVector& other) = default;

    T& operator[](std::size_t idx) const
    {
        ASSERT(idx < storage.size());
        return *storage[idx];
    }

    /**
     * @brief Nested iterator class for RefArray, based on indexing into the pointer array.
     * Provides semantics similar to what would be expected if std::array<T&, N> was possible.
     */
    class iterator {
      public:
        /**
         * @brief Constructs an iterator for a given RefArray object.
         *
         * @param array Pointer to the RefArray object.
         * @param pos The starting position in the array.
         */
        iterator(RefVector const* array, std::size_t pos)
            : vector(array)
            , pos(pos)
        {}

        T& operator*() const { return (*vector)[pos]; }

        iterator& operator++()
        {
            pos++;
            return *this;
        }

        iterator operator++(int)
        {
            iterator temp = *this;
            ++(*this);
            return temp;
        }

        bool operator==(iterator const& other) const { return pos == other.pos; }
        bool operator!=(iterator const& other) const { return pos != other.pos; }

      private:
        RefVector const* vector;
        std::size_t pos;
    };

    [[nodiscard]] std::size_t size() const { return storage.size(); }

    iterator begin() const { return iterator(this, 0); }
    iterator end() const { return iterator(this, storage.size()); }

    template <typename ConvertibleFromT> operator std::vector<ConvertibleFromT>() const
    {
        std::vector<ConvertibleFromT> ret;
        for (T* elem : storage) {
            ret.push_back(*elem);
        }
        return ret;
    }

  private:
    std::vector<T*> storage;
};

/**
 * @brief Deduction guide for the RefVector class.
 * Allows for RefVector {a, b, c} without explicit template params.
 */
template <typename T, typename... Ts> RefVector(T&, Ts&...) -> RefVector<T>;

/**
 * @brief Concatenates multiple RefVector objects into a single RefVector.
 *
 * This function takes multiple RefVector objects as input and concatenates them into a single
 * RefVector.
 *
 * @tparam T The type of elements in the RefVector.
 * @param ref_vectors The RefVector objects to be concatenated.
 * @return RefVector object containing all elements from the input vectors.
 */
template <typename T> RefVector<T> concatenate(const RefVector<T>& ref_vector, const auto&... ref_vectors)
{
    std::vector<T*> concatenated;
    auto append = [&](const auto& ref_vector) {
        for (std::size_t i = 0; i < ref_vector.size(); ++i) {
            concatenated.push_back(&ref_vector[i]);
        }
    };

    append(ref_vector);
    // Unpack and append each RefVector's elements to concatenated
    (append(ref_vectors), ...);

    return RefVector<T>{ concatenated };
}
