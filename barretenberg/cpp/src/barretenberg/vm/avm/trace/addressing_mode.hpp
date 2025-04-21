#pragma once

#include "barretenberg/vm/avm/trace/errors.hpp"
#include "barretenberg/vm/avm/trace/mem_trace.hpp"
#include <cstdint>

namespace bb::avm_trace {

enum class AddressingMode {
    DIRECT = 0,
    INDIRECT = 1,
    RELATIVE = 2,
    INDIRECT_RELATIVE = 3,
};

struct AddressWithMode {
    AddressingMode mode;
    uint32_t offset;

    AddressWithMode() = default;
    AddressWithMode(uint32_t offset)
        : mode(AddressingMode::DIRECT)
        , offset(offset)
    {}
    AddressWithMode(AddressingMode mode, uint32_t offset)
        : mode(mode)
        , offset(offset)
    {}

    // Dont mutate
    AddressWithMode operator+(uint val) const noexcept { return { mode, offset + val }; }
};

template <size_t N> struct AddressResolution {
    std::array<uint32_t, N> addresses;
    AvmError error;
};

template <size_t N> class Addressing {
  public:
    Addressing(const std::array<AddressingMode, N>& mode_per_operand, uint8_t space_id)
        : mode_per_operand(mode_per_operand)
        , space_id(space_id){};

    static Addressing<N> fromWire(uint16_t wireModes, uint8_t space_id)
    {
        std::array<AddressingMode, N> modes;
        for (size_t i = 0; i < N; i++) {
            modes[i] = static_cast<AddressingMode>(
                (((wireModes >> i) & 1) * static_cast<uint16_t>(AddressingMode::INDIRECT)) |
                (((wireModes >> (i + N)) & 1) * static_cast<uint16_t>(AddressingMode::RELATIVE)));
        }
        return Addressing<N>(modes, space_id);
    }

    AddressResolution<N> resolve(const std::array<uint32_t, N>& offsets, AvmMemTraceBuilder& mem_builder) const
    {
        std::array<uint32_t, N> resolved_addresses;

        for (size_t i = 0; i < N; i++) {
            auto& res_addr = resolved_addresses[i];
            res_addr = offsets[i];
            const auto mode = mode_per_operand[i];
            if ((static_cast<uint8_t>(mode) & static_cast<uint8_t>(AddressingMode::RELATIVE)) != 0) {
                const auto mem_tag = mem_builder.unconstrained_get_memory_tag(space_id, 0);

                if (mem_tag != AvmMemoryTag::U32) {
                    return AddressResolution<N>{ .addresses = resolved_addresses,
                                                 .error = AvmError::ADDR_RES_TAG_ERROR };
                }

                const auto base_addr = static_cast<uint32_t>(mem_builder.unconstrained_read(space_id, 0));

                // Test if we overflow over uint32_t
                if (res_addr + base_addr < base_addr) {
                    return AddressResolution<N>{ .addresses = resolved_addresses,
                                                 .error = AvmError::REL_ADDR_OUT_OF_RANGE };
                }

                res_addr += base_addr;
            }

            if ((static_cast<uint8_t>(mode) & static_cast<uint8_t>(AddressingMode::INDIRECT)) != 0) {
                const auto mem_tag = mem_builder.unconstrained_get_memory_tag(space_id, res_addr);

                if (mem_tag != AvmMemoryTag::U32) {
                    return AddressResolution<N>{ .addresses = resolved_addresses,
                                                 .error = AvmError::ADDR_RES_TAG_ERROR };
                }

                res_addr = static_cast<uint32_t>(mem_builder.unconstrained_read(space_id, res_addr));
            }
        }
        return AddressResolution<N>{ .addresses = resolved_addresses, .error = AvmError::NO_ERROR };
    }

  private:
    std::array<AddressingMode, N> mode_per_operand;
    uint8_t space_id;
};

} // namespace bb::avm_trace