#!/usr/bin/env python3
"""
Convert trusted_setup.txt to embedded C++ arrays.
This avoids needing to load the trusted setup from a file at runtime.
"""

import sys

def hex_string_to_bytes(hex_str):
    """Convert hex string like 'a0413c0d...' to bytes."""
    # Remove any whitespace
    hex_str = hex_str.strip()
    # Convert to bytes
    return bytes.fromhex(hex_str)

def generate_embedded_setup(input_file, output_file):
    """Generate C++ file with embedded trusted setup."""

    with open(input_file, 'r') as f:
        lines = [line.strip() for line in f if line.strip()]

    # Parse header
    num_g1 = int(lines[0])
    num_g2 = int(lines[1])

    print(f"Parsing {num_g1} G1 points and {num_g2} G2 points...")

    # Parse G1 Lagrange (lines 2 to 2+num_g1)
    g1_lagrange_hex = lines[2:2+num_g1]
    g1_lagrange_bytes = b''.join(hex_string_to_bytes(h) for h in g1_lagrange_hex)

    # Parse G2 Monomial (lines 2+num_g1 to 2+num_g1+num_g2)
    g2_monomial_hex = lines[2+num_g1:2+num_g1+num_g2]
    g2_monomial_bytes = b''.join(hex_string_to_bytes(h) for h in g2_monomial_hex)

    # Parse G1 Monomial (lines 2+num_g1+num_g2 to end)
    g1_monomial_hex = lines[2+num_g1+num_g2:2+num_g1+num_g2+num_g1]
    g1_monomial_bytes = b''.join(hex_string_to_bytes(h) for h in g1_monomial_hex)

    print(f"G1 Lagrange: {len(g1_lagrange_bytes)} bytes")
    print(f"G2 Monomial: {len(g2_monomial_bytes)} bytes")
    print(f"G1 Monomial: {len(g1_monomial_bytes)} bytes")
    print(f"Total: {len(g1_lagrange_bytes) + len(g2_monomial_bytes) + len(g1_monomial_bytes)} bytes")

    # Generate C++ file
    with open(output_file, 'w') as f:
        f.write("""// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// AUTO-GENERATED - DO NOT EDIT
// Generated from c-kzg/trusted_setup.txt
// This embeds the Ethereum KZG trusted setup directly in the binary

#include "trusted_setup_embed.hpp"

namespace bb::crypto::kzg {

// G1 points in Lagrange form
""")

        # Write G1 Lagrange
        f.write("alignas(32) const uint8_t G1_LAGRANGE_BYTES[NUM_G1_POINTS * BYTES_PER_G1] = {\n")
        for i in range(0, len(g1_lagrange_bytes), 16):
            chunk = g1_lagrange_bytes[i:i+16]
            hex_str = ', '.join(f'0x{b:02x}' for b in chunk)
            f.write(f"    {hex_str},\n")
        f.write("};\n\n")

        # Write G2 Monomial
        f.write("// G2 points in monomial form\n")
        f.write("alignas(32) const uint8_t G2_MONOMIAL_BYTES[NUM_G2_POINTS * BYTES_PER_G2] = {\n")
        for i in range(0, len(g2_monomial_bytes), 16):
            chunk = g2_monomial_bytes[i:i+16]
            hex_str = ', '.join(f'0x{b:02x}' for b in chunk)
            f.write(f"    {hex_str},\n")
        f.write("};\n\n")

        # Write G1 Monomial
        f.write("// G1 points in monomial form\n")
        f.write("alignas(32) const uint8_t G1_MONOMIAL_BYTES[NUM_G1_POINTS * BYTES_PER_G1] = {\n")
        for i in range(0, len(g1_monomial_bytes), 16):
            chunk = g1_monomial_bytes[i:i+16]
            hex_str = ', '.join(f'0x{b:02x}' for b in chunk)
            f.write(f"    {hex_str},\n")
        f.write("};\n\n")

        f.write("} // namespace bb::crypto::kzg\n")

    print(f"Generated {output_file}")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input_trusted_setup.txt> <output.cpp>")
        sys.exit(1)

    generate_embedded_setup(sys.argv[1], sys.argv[2])
