#pragma once

// Helper macro for accessing members that works with both:
// 1. Lazy edges (with accessor methods like in.w_l())
// 2. Regular entities (with data members like in.w_l)
#define GET(in, member) \
    ([]([[maybe_unused]] const auto& x) { \
        if constexpr (requires { x.member(); }) { \
            return x.member(); \
        } else { \
            return x.member; \
        } \
    }(in))
