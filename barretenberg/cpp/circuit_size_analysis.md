# Circuit Size Analysis

This document shows circuit sizes from real examples, identifying circuits just below and just above powers of two.

## Key Findings

### Example: Around 2^16 = 65,536

**Circuit just BELOW the power of two:**
- **private_kernel_init**: 43,331 gates → rounds up to 65,536 (2^16)
  - This is **21,705 gates below** 65,536

**Circuits just ABOVE the previous power of two (2^15 = 32,768):**
- **hiding_kernel**: 36,214 gates → rounds up to 65,536 (2^16)
  - This is **3,446 gates above** 32,768
  - This is **29,322 gates below** 65,536

- **private_kernel_tail**: 40,010 gates → rounds up to 65,536 (2^16)
  - This is **7,242 gates above** 32,768
  - This is **25,526 gates below** 65,536

### Example: Around 2^17 = 131,072

**Circuits BELOW the power of two:**
- **private_kernel_inner**: 89,695 gates → rounds up to 131,072 (2^17)
  - This is **41,377 gates below** 131,072

- **private_kernel_reset**: 101,819 gates → rounds up to 131,072 (2^17)
  - This is **29,253 gates below** 131,072

**Circuit just BELOW the power of two:**
- **EcdsaRAccount:entrypoint**: 77,869 gates → rounds up to 131,072 (2^17)
  - This is **12,333 gates above** 65,536
  - This is **53,203 gates below** 131,072

## Summary Table

| Circuit Name | Original Gates | Dyadic Size | Power of 2 | Distance from Previous Power | Distance from Next Power |
|--------------|---------------|-------------|------------|------------------------------|--------------------------|
| SponsoredFPC:sponsor_unconditionally | 4,049 | 8,192 | 2^13 | +49 from 2^12 (4,096) | -4,143 to 2^13 (8,192) |
| Token:transfer | 21,924 | 65,536 | 2^16 | -10,844 from 2^15 (32,768) | -43,612 to 2^16 (65,536) |
| hiding_kernel | 36,214 | 65,536 | 2^16 | +3,446 from 2^15 (32,768) | -29,322 to 2^16 (65,536) |
| private_kernel_tail | 40,010 | 65,536 | 2^16 | +7,242 from 2^15 (32,768) | -25,526 to 2^16 (65,536) |
| private_kernel_init | 43,331 | 65,536 | 2^16 | +10,563 from 2^15 (32,768) | -22,205 to 2^16 (65,536) |
| EcdsaRAccount:entrypoint | 77,869 | 131,072 | 2^17 | +12,333 from 2^16 (65,536) | -53,203 to 2^17 (131,072) |
| private_kernel_inner | 89,695 | 131,072 | 2^17 | +24,159 from 2^16 (65,536) | -41,377 to 2^17 (131,072) |
| private_kernel_reset | 101,819 | 131,072 | 2^17 | +36,283 from 2^16 (65,536) | -29,253 to 2^17 (131,072) |

## Best Examples for Testing

### Circuits Just Below a Power of Two
1. **private_kernel_init** (43,331 gates): 21,705 gates below 2^16 = 65,536
2. **private_kernel_tail** (40,010 gates): 25,526 gates below 2^16 = 65,536
3. **private_kernel_reset** (101,819 gates): 29,253 gates below 2^17 = 131,072

### Circuits Just Above a Power of Two
1. **hiding_kernel** (36,214 gates): 3,446 gates above 2^15 = 32,768
2. **private_kernel_tail** (40,010 gates): 7,242 gates above 2^15 = 32,768
3. **EcdsaRAccount:entrypoint** (77,869 gates): 12,333 gates above 2^16 = 65,536

## Answer to Original Question

**Circuit just BELOW a power of two:** `private_kernel_init` with **43,331 gates** (rounds to 65,536 = 2^16)

**Circuit just ABOVE the same power of two:** `hiding_kernel` with **36,214 gates** (just above 32,768 = 2^15, rounds to 65,536 = 2^16)

These two circuits both round to the same dyadic size (65,536) but are on opposite sides of the 32,768 boundary, making them ideal examples for testing the behavior around power-of-two boundaries.
