#pragma once

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <string>

namespace bb::bbapi {

struct BenchEnableTrace {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BenchEnableTrace";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BenchEnableTraceResponse";
        uint8_t dummy = 0;
        SERIALIZATION_FIELDS(dummy);
        bool operator==(const Response&) const = default;
    };

    bool enable = false;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(enable);
    bool operator==(const BenchEnableTrace&) const = default;
};

struct BenchDump {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BenchDump";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BenchDumpResponse";
        std::string aggregate_json;
        std::string trace_events_json;
        SERIALIZATION_FIELDS(aggregate_json, trace_events_json);
        bool operator==(const Response&) const = default;
    };

    bool reset = false;
    bool include_trace = false;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(reset, include_trace);
    bool operator==(const BenchDump&) const = default;
};

} // namespace bb::bbapi
