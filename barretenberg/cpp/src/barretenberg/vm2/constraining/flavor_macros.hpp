#pragma once

#define DEFINE_AVM_GETTER(name, start, count)                                                                          \
    std::span<DataType> get_##name()                                                                                   \
    {                                                                                                                  \
        return get_all().subspan(start, count);                                                                        \
    }                                                                                                                  \
    std::span<const DataType> get_##name() const                                                                       \
    {                                                                                                                  \
        return get_all().subspan(start, count);                                                                        \
    }                                                                                                                  \
    std::span<const std::string> get_##name##_labels() const                                                           \
    {                                                                                                                  \
        return get_labels().subspan(start, count);                                                                     \
    }
