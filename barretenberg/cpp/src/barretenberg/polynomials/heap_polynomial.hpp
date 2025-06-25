#pragma once
#include <cstddef>
#include <cstdint>
#include <stdexcept>

namespace bb {

// Standard heap-based polynomial implementation
template <typename Fr>
class HeapPolynomial {
  public:
    HeapPolynomial(size_t size) : size_(size) {
        data_ = new Fr[size]();
    }
    
    ~HeapPolynomial() {
        delete[] data_;
    }
    
    // Disable copy, enable move
    HeapPolynomial(const HeapPolynomial&) = delete;
    HeapPolynomial& operator=(const HeapPolynomial&) = delete;
    
    HeapPolynomial(HeapPolynomial&& other) noexcept 
        : data_(other.data_), size_(other.size_) {
        other.data_ = nullptr;
        other.size_ = 0;
    }
    
    HeapPolynomial& operator=(HeapPolynomial&& other) noexcept {
        if (this != &other) {
            delete[] data_;
            data_ = other.data_;
            size_ = other.size_;
            other.data_ = nullptr;
            other.size_ = 0;
        }
        return *this;
    }
    
    Fr& operator[](size_t index) {
        if (index >= size_) {
            throw std::out_of_range("Index out of bounds");
        }
        return data_[index];
    }
    
    const Fr& operator[](size_t index) const {
        if (index >= size_) {
            throw std::out_of_range("Index out of bounds");
        }
        return data_[index];
    }
    
    size_t size() const { return size_; }
    Fr* data() { return data_; }
    const Fr* data() const { return data_; }
    
  private:
    Fr* data_ = nullptr;
    size_t size_ = 0;
};

} // namespace bb