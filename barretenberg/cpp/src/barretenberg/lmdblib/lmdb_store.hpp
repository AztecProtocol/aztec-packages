

#include <memory>
namespace bb::lmdblib {
class LMDBStore {
    using Ptr = std::unique_ptr<LMDBStore>;
    using SharedPtr std::shared_ptr<LMDBStore>;
};
} // namespace bb::lmdblib