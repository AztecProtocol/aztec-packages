#pragma once

#include <cstddef> // std::size_t
#include <memory>  // std::unique_ptr
#include <utility> // std::forward

namespace bb {

/*============================================================
 *  SingleLinkListNode<T>
 *  ----------------------------------------------------------
 *  A **NON-intrusive** singly-linked list node: the user-supplied
 *  payload `T` lives by value inside the node, while the `next`
 *  pointer is managed by the container.  Your data type `T`
 *  therefore needs no special awareness of the list infrastructure.
 *===========================================================*/
template <typename T> struct SingleLinkListNode {
    T value;                            // user payload
    SingleLinkListNode* next = nullptr; // next node in the same list (nullptr == end)
};

/*============================================================
 *  PackedListVector<T>
 *  ----------------------------------------------------------
 *  Purpose
 *  --------
 *  * Allocate **one** contiguous “slab” of `N` SingleLinkListNode<T> objects
 *    up-front, then carve it into **M** independent forward lists.
 *  * After construction **no further dynamic allocations** occur;
 *    pushing a value is just placement-new into the slab plus a
 *    couple of pointer writes — extremely cache-friendly.
 *
 *  When is it useful?
 *    • Situations where the tightest memory layout and predictable
 *      allocation costs outweigh the flexibility of std containers.
 *      Particularly, small allocations can cause outsized issues for
 *      fragmentation.
 *===========================================================*/
template <typename T> class PackedListVector {
  public:
    using Node = SingleLinkListNode<T>;

    /*--------------------------------------------------------
     *  ctor / dtor
     *  -------------------------------------------------------
     *  * `total_elements`  – max number of nodes (N)
     *  * `num_lists`       – number of independent lists (M)
     *  The slab is raw, uninitialised memory; values are
     *  constructed lazily as nodes are pushed.
     *-------------------------------------------------------*/
    PackedListVector(std::size_t total_elements, std::size_t num_lists);
    ~PackedListVector();

    PackedListVector(const PackedListVector&) = delete;
    PackedListVector& operator=(const PackedListVector&) = delete;
    PackedListVector(PackedListVector&&) noexcept = default;
    PackedListVector& operator=(PackedListVector&&) noexcept = default;

    /*--------------------------------------------------------
     *  add_to_list
     *  -------------------------------------------------------
     *  Pushes `element` to the *front* of list `list_index`
     *  (0 ≤ list_index < M) and returns the node’s address
     *  inside the slab.  O(1) – never reallocates.
     *-------------------------------------------------------*/
    Node* add_to_list(std::size_t list_index, const T& element);

    /*--------------------------------------------------------
     *  get_list
     *  -------------------------------------------------------
     *  Returns the head pointer of list `list_index` or
     *  nullptr if the list is empty.  Safe to call anytime.
     *-------------------------------------------------------*/
    Node* get_list(std::size_t list_index) const noexcept;

    std::size_t size() const noexcept { return list_count_; }

  private:
    /*--------------------------------------------------------
     *  slab_deleter
     *  -------------------------------------------------------
     *  Custom deleter for the slab pointer – only releases the
     *  raw bytes, because individual destructors are invoked
     *  manually in the PackedListVector destructor.
     *-------------------------------------------------------*/
    static void slab_deleter(Node* p) noexcept { ::operator delete[](p); }

    /*----------- layout / bookkeeping ----------------------*/
    std::size_t capacity_;   // N : total nodes in the slab
    std::size_t list_count_; // M : number of independent lists

    /* Raw, uninitialised storage for N nodes.  The unique_ptr
       owns the bytes; its custom deleter simply frees them.   */
    std::unique_ptr<Node, void (*)(Node*)> slab_{ nullptr, &PackedListVector::slab_deleter };

    std::size_t slab_top_ = 0;       // index of the next free slot
    std::unique_ptr<Node*[]> heads_; // heads_[i] is the first node of list i
};

} // namespace bb
