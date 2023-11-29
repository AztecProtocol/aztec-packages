#pragma once
#include "barretenberg/common/assert.hpp"
#include <cstddef>
#include <initializer_list>
#include <iterator>
#include <stdexcept>
#include <vector>

// TODO(https://github.com/AztecProtocol/barretenberg/issues/794) namespace this once convenient
/**
 * @brief A template class for a reference vector. Behaves as if std::vector<T&> was possible.
 *
 * This class provides a dynamic-size vector of pointers to elements of type T, exposed as references.
 * It offers random access to its elements and provides an iterator class
 * for traversal.
 *
 * @tparam T The type of elements stored in the vector.
 * This should NOT be used for long-term storage, only for efficient passing. Any long-term sharing of values should use
 * shared pointers.
 */
template <typename T> class RefVector {
  public:
    explicit RefVector(const std::vector<T*>& ptr_vector)
        : storage(ptr_vector)
    {}

    explicit RefVector(std::vector<T>& vector)
        : storage(vector.size())
    {
        for (size_t i = 0; i < vector.size(); i++) {
            storage[i] = &vector[i];
        }
    }

    template <typename... Ts> RefVector(T& ref, Ts&... rest)
    {
        storage.push_back(&ref);
        (storage.push_back(&rest), ...);
    }

    T& operator[](std::size_t idx) const
    {
        ASSERT(idx < storage.size());
        return *storage[idx];
    }

    /**
     * @brief Nested iterator class for RefVector, based on indexing into the pointer vector.
     * Provides semantics similar to what would be expected if std::vector<T&, N> was possible.
     */
    class iterator {
      public:
        /**
         * @brief Constructs an iterator for a given RefVector object.
         *
         * @param vector Pointer to the RefVector object.
         * @param pos The starting position in the vector.
         */
        iterator(RefVector const* vector, std::size_t pos)
            : vector(vector)
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

    void push_back(T& element) { storage.push_back(element); }
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
    // Reserve our final space
    concatenated.reserve(ref_vector.size + (ref_vectors.size() + ...));

    auto append = [&](const auto& vec) { std::copy(vec.begin(), vec.end(), std::back_inserter(concatenated)); };

    append(ref_vector);
    // Unpack and append each RefVector's elements to concatenated
    (append(ref_vectors), ...);

    return RefVector<T>{ concatenated };
}

template <typename T> static std::vector<RefVector<T>> to_vector_of_ref_vectors(std::vector<std::vector<T>>& vec)
{
    std::vector<RefVector<T>> result;
    for (std::vector<T>& inner : vec) {
        result.push_back(RefVector{ inner });
    }
    return result;
}