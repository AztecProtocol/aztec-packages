#pragma once
#include "barretenberg/common/assert.hpp"
#include "packed_list_vector.hpp"
#include <cassert>
#include <new> // placement new

namespace bb {
/*----------- constructor ------------------------------------*/
template <typename T>
PackedListVector<T>::PackedListVector(std::size_t total_elements, std::size_t num_lists)
    : capacity_(total_elements)
    , list_count_(num_lists)
    , heads_(num_lists != 0 ? std::make_unique<Node*[]>(num_lists) : nullptr)
{
    /* Allocate one big uninitialised slab; no T ctor runs here */
    if (capacity_)
        slab_.reset(reinterpret_cast<Node*>(::operator new[](capacity_ * sizeof(Node))));

    /* All lists start empty */
    for (std::size_t i = 0; i < list_count_; ++i)
        heads_[i] = nullptr;
}

/*----------- destructor -------------------------------------*/
template <typename T> PackedListVector<T>::~PackedListVector()
{
    /* Destroy only the nodes that were actually constructed */
    for (std::size_t i = 0; i < slab_top_; ++i)
        std::launder(slab_.get() + i)->~Node();
}

/*----------- add_to_list ------------------------------------*/
template <typename T>
typename PackedListVector<T>::Node* PackedListVector<T>::add_to_list(std::size_t list_index, const T& element)
{
    BB_ASSERT_LT(list_index, list_count_, "List index out of bounds");
    BB_ASSERT_LT(slab_top_, capacity_, "Slab is full, cannot add more elements");

    Node* slot = &slab_.get()[slab_top_];
    new (slot) Node{ element, heads_[list_index] };

    heads_[list_index] = slot;
    ++slab_top_;
    return slot;
}

/*----------- get_list ---------------------------------------*/
template <typename T>
typename PackedListVector<T>::Node* PackedListVector<T>::get_list(std::size_t list_index) const noexcept
{
    assert(list_index < list_count_);
    return heads_[list_index];
}

} // namespace bb
