#pragma once
#include "polynomial.hpp"
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <filesystem>
#include <atomic>
#include <string>

namespace bb {

/**
 * @brief File-backed polynomial class that stores coefficients in a persistent file using mmap.
 * This allows processing of very large polynomials without consuming heap memory.
 * 
 * @tparam Fr the finite field type.
 */
template <typename Fr> 
class FileBackedPolynomial {
  public:
    using FF = Fr;
    
    FileBackedPolynomial(size_t size, const std::string& base_filename = "");
    FileBackedPolynomial(const FileBackedPolynomial& other) = delete; // No copy for now
    FileBackedPolynomial(FileBackedPolynomial&& other) noexcept;
    FileBackedPolynomial& operator=(const FileBackedPolynomial& other) = delete;
    FileBackedPolynomial& operator=(FileBackedPolynomial&& other) noexcept;
    ~FileBackedPolynomial();

    /**
     * @brief Convert to a regular heap-based polynomial
     */
    Polynomial<Fr> to_buffer() const;

    /**
     * @brief Add another polynomial to this one
     */
    FileBackedPolynomial& operator+=(const Polynomial<Fr>& other);
    FileBackedPolynomial& operator+=(const FileBackedPolynomial& other);

    /**
     * @brief Multiply by a scalar
     */
    FileBackedPolynomial& operator*=(const Fr& scalar);

    /**
     * @brief Access elements
     */
    Fr& at(size_t index);
    const Fr& at(size_t index) const;
    Fr& operator[](size_t index) { return at(index); }
    const Fr& operator[](size_t index) const { return at(index); }

    /**
     * @brief Get size information
     */
    size_t size() const { return size_; }
    bool is_empty() const { return size_ == 0; }

    /**
     * @brief Check if polynomial is zero
     */
    bool is_zero() const;

    /**
     * @brief Static factory for random polynomial
     */
    static FileBackedPolynomial random(size_t size, const std::string& base_filename = "");

    /**
     * @brief Get raw data pointer (use with caution)
     */
    Fr* data() { return data_; }
    const Fr* data() const { return data_; }

    /**
     * @brief Force sync to disk
     */
    void sync();

  private:
    void create_file(size_t size);
    void cleanup();
    
    static std::atomic<size_t> file_counter_;
    
    size_t size_ = 0;
    Fr* data_ = nullptr;
    int fd_ = -1;
    std::string filename_;
    bool owns_file_ = false;
};

// Implementation
template <typename Fr>
std::atomic<size_t> FileBackedPolynomial<Fr>::file_counter_{0};

template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(size_t size, const std::string& base_filename)
    : size_(size)
{
    if (size == 0) {
        return;
    }
    
    // Generate unique filename
    if (base_filename.empty()) {
        size_t id = file_counter_.fetch_add(1);
        filename_ = "./fbpoly_" + std::to_string(getpid()) + "_" + std::to_string(id) + ".dat";
    } else {
        filename_ = base_filename;
    }
    
    create_file(size);
    owns_file_ = true;
}

template <typename Fr>
void FileBackedPolynomial<Fr>::create_file(size_t size)
{
    // Create and open file
    fd_ = open(filename_.c_str(), O_CREAT | O_RDWR | O_TRUNC, 0644);
    if (fd_ < 0) {
        throw std::runtime_error("Failed to create file-backed polynomial file: " + filename_);
    }
    
    // Set file size
    size_t file_size = size * sizeof(Fr);
    if (ftruncate(fd_, file_size) != 0) {
        close(fd_);
        throw std::runtime_error("Failed to set file size");
    }
    
    // Memory map the file
    void* addr = mmap(nullptr, file_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0);
    if (addr == MAP_FAILED) {
        close(fd_);
        throw std::runtime_error("Failed to mmap file");
    }
    
    data_ = static_cast<Fr*>(addr);
    
    // Initialize to zero
    memset(data_, 0, file_size);
}

template <typename Fr>
FileBackedPolynomial<Fr>::FileBackedPolynomial(FileBackedPolynomial&& other) noexcept
    : size_(other.size_)
    , data_(other.data_)
    , fd_(other.fd_)
    , filename_(std::move(other.filename_))
    , owns_file_(other.owns_file_)
{
    other.size_ = 0;
    other.data_ = nullptr;
    other.fd_ = -1;
    other.owns_file_ = false;
}

template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator=(FileBackedPolynomial&& other) noexcept
{
    if (this != &other) {
        cleanup();
        
        size_ = other.size_;
        data_ = other.data_;
        fd_ = other.fd_;
        filename_ = std::move(other.filename_);
        owns_file_ = other.owns_file_;
        
        other.size_ = 0;
        other.data_ = nullptr;
        other.fd_ = -1;
        other.owns_file_ = false;
    }
    return *this;
}

template <typename Fr>
FileBackedPolynomial<Fr>::~FileBackedPolynomial()
{
    cleanup();
}

template <typename Fr>
void FileBackedPolynomial<Fr>::cleanup()
{
    if (data_ != nullptr && size_ > 0) {
        munmap(data_, size_ * sizeof(Fr));
        data_ = nullptr;
    }
    
    if (fd_ >= 0) {
        close(fd_);
        fd_ = -1;
    }
    
    if (owns_file_ && !filename_.empty()) {
        std::filesystem::remove(filename_);
    }
}

template <typename Fr>
Polynomial<Fr> FileBackedPolynomial<Fr>::to_buffer() const
{
    if (size_ == 0) {
        return Polynomial<Fr>(0);
    }
    
    Polynomial<Fr> result(size_);
    memcpy(result.data(), data_, size_ * sizeof(Fr));
    return result;
}

template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator+=(const Polynomial<Fr>& other)
{
    size_t min_size = std::min(size_, other.size());
    for (size_t i = 0; i < min_size; ++i) {
        data_[i] += other[i];
    }
    return *this;
}

template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator+=(const FileBackedPolynomial& other)
{
    size_t min_size = std::min(size_, other.size_);
    for (size_t i = 0; i < min_size; ++i) {
        data_[i] += other.data_[i];
    }
    return *this;
}

template <typename Fr>
FileBackedPolynomial<Fr>& FileBackedPolynomial<Fr>::operator*=(const Fr& scalar)
{
    for (size_t i = 0; i < size_; ++i) {
        data_[i] *= scalar;
    }
    return *this;
}

template <typename Fr>
Fr& FileBackedPolynomial<Fr>::at(size_t index)
{
    if (index >= size_) {
        throw std::out_of_range("FileBackedPolynomial index out of range");
    }
    return data_[index];
}

template <typename Fr>
const Fr& FileBackedPolynomial<Fr>::at(size_t index) const
{
    if (index >= size_) {
        throw std::out_of_range("FileBackedPolynomial index out of range");
    }
    return data_[index];
}

template <typename Fr>
bool FileBackedPolynomial<Fr>::is_zero() const
{
    for (size_t i = 0; i < size_; ++i) {
        if (data_[i] != Fr::zero()) {
            return false;
        }
    }
    return true;
}

template <typename Fr>
FileBackedPolynomial<Fr> FileBackedPolynomial<Fr>::random(size_t size, const std::string& base_filename)
{
    FileBackedPolynomial<Fr> result(size, base_filename);
    for (size_t i = 0; i < size; ++i) {
        result.data_[i] = Fr::random_element();
    }
    return result;
}

template <typename Fr>
void FileBackedPolynomial<Fr>::sync()
{
    if (data_ != nullptr && size_ > 0) {
        msync(data_, size_ * sizeof(Fr), MS_SYNC);
    }
}

} // namespace bb