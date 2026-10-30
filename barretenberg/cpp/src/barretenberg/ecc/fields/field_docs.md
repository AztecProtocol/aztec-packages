Prime field documentation    {#field_docs}
===
Barretenberg has its own implementation of finite field arithmetic. The implementation targets 254-bit (bn254, grumpkin) and 256-bit (secp256k1, secp256r1) fields. Internally the field is represented as a little-endian C-array of 4 uint64_t limbs. For 254-bit fields, the internal representation must be in the range $[0, 2p)$. We call this the _coarse representation_. For 256-bit fields, the internal representation is an arbitrary `uint256_t`.

## Field arithmetic
### Introduction to Montgomery form {#field_docs_montgomery_explainer}
We use Montgomery multiplication to speed up field multiplication. For an original element  $ a \in \mathbb F_p$ the element is represented internally as $$ a⋅R\ mod\ p$$ where $R = 2^d\ mod\ p$. The chosen $d$ depends on the build configuration:
1. $d=29⋅9=261$ for builds that don't support the `uint128_t` type, for example, for WASM build
2. $d=64⋅4=256$ for standard builds (x86_64).

The goal of using Montgomery form is to avoid heavy division modulo $p$. To compute a representative of element $$c = a⋅b\ mod\ p$$ we compute $$c⋅R = (a⋅R)⋅(b⋅R) / R\ mod\ p,$$ but we use an efficient division trick to avoid the naive modular division. For the 4⋅64 case:
1. First, we compute the value $$c_r=c⋅R⋅R = aR⋅bR$$ in integers and get a value with 8 64-bit limbs
2. Then we take the lowest limb of $c_r$ (i.e., $c_r[0]$) and multiply it by a special _precomputed_ value $$r_{inv} = -1 ⋅ p^{-1}\ mod\  2^{64}$$ As a result we get $$k = r_{inv}⋅ c_r[0]\ mod\ 2^{64}$$
3. Next we update $c_r$ in integers by adding $k⋅p$: $$c_r += k⋅p$$ The value of $c_r\ mod\ p$ does not change, since we've added a multiple of the modulus. At the same time, if we look at the expression modulo $2^{64}$: $$c_r + k⋅p = c_r + c_r⋅r_{inv}⋅p = c_r + c_r⋅ (-1)⋅p^{-1}⋅p = c_r - c_r = 0\ mod\ 2^{64}.$$ The result is equivalent modulo $p$, but we zeroed out the lowest limb
4. We perform the same operation for $c_r[1]$, but instead of adding $k⋅p$, we add $2^{64}⋅k⋅p$. In the implementation, instead of adding $k⋅ p$ to limbs of $c_r$ starting with zero, we just start with limb 1. This ensures that $c_r[1]=0$. We then perform the same operation for 2 more limbs.
5. At this stage the array $c_r$ has the property that the first 4 limbs of the total 8 limbs are zero. So if we treat the 4 high limbs as a separate integer $c_{r.high}$, $$c_r = c_{r.high}⋅2^{256}=c_{r.high}⋅R\ mod\ p \Rightarrow c_{r.high} = c\cdot R\ mod\ p$$ and we can get the evaluation simply by taking the 4 high limbs of $c_r$.
6. The previous step has reduced the intermediate value of $cR$ to range $[0,2p)$, so we must check if it is more than $p$ and subtract the modulus once if it overflows.

On a high level, what we are doing is iteratively adding a multiple of $p$ until the current bottom limb is zero, then shifting by a limb (amounting to dividing by $2^{64}$).
#### Bounds analysis
Why does this work? The analysis depends on the field class.

* Suppose both $aR$ and $bR$ are less than the modulus $p$ in integers, so $$aR\cdot bR <= (p-1)^2.$$ During each of the $k\cdot p$ addition rounds we can add at most $(2^{64}-1)p$ to the corresponding digits, so at most we add $(2^{256}-1)p$ and the total is $$aR\cdot bR + k_{0,1,2,3}p \le (p-1)^2+(2^{256}-1)p < 2\cdot 2^{256}p \Rightarrow c_{r.high} = \frac{aR\cdot bR + k_{0,1,2,3}p}{2^{256}} < 2p.$$

* For our 256-bit fields, we _cannot_ assume that $aR$ and $bR$ are less than the modulus $p$; we simply know that they are 256-bit numbers. Nonetheless, the same analysis shows that the output is less than $2^{256} + p -1$. This means that (conditionally) subtracting one copy of $p$ is enough to get us to the valid range of $[0, 2^{256})$.

* For 254-bit fields (e.g. the BN-254 base and scalar fields) we can do even better by employing a simple trick. Note that 4 64-bit limbs allow 256 bits of storage. We relax the internal representation to use values in range $[0,2p)$. The addition, negation and subtraction operation logic doesn't change, we simply replace the modulus $p$ with $2p$, but the multiplication becomes more efficient. The multiplicands are in range $[0,2p)$, but we add multiples of modulus $p$ to reduce limbs, not $2p$. If we revisit the $c_r$ formula:
$$aR\cdot bR + k_{0,1,2,3}p \le (2p-1)^2+(2^{256}-1)p = 2^{256}p+4p^2-5p+1 \Rightarrow$$ $$\Rightarrow c_{r.high} = \frac{aR\cdot bR + k_{0,1,2,3}p}{2^{256}} \le \frac{2^{256}p+4p^2-5p+1}{2^{256}}=p +\frac{4p^2 - 5p +1}{2^{256}}, 4p < 2^{256} \Rightarrow$$ $$\Rightarrow p +\frac{4p^2 - 5p +1}{2^{256}} < 2p$$ So we ended in the same range and we don't have to perform additional reductions.

**N.B.** In the code we refer to this form, when the limbs are only constrained to be in the range $[0,2p)$, as the coarse-representation.

### Yuval reduction
For our 254-bit multiplication in WASM, we use a reduction technique found by Yuval. For a reference, please see this [hackmd](https://hackmd.io/@Ingonyama/Barret-Montgomery).

Recall that in standard Montgomery reduction, we zero out the lowest limb by adding a carefully chosen multiple of the modulus $p$. In particular, if we were to use standard Montgomery reduction given our limb-decomposition for WASM: given an accumulator $x = \sum_{i=0}^{n} \text{result}_i \cdot 2^{29i}$, we compute $k = \text{result}_0 \cdot (-p^{-1}) \mod 2^{29}$ and add $k \cdot p$ to $x$. This makes the lowest 29 bits zero (since $\text{result}_0 + k \cdot p_0 \equiv 0 \mod 2^{29}$), allowing us to "shift right" by discarding the zeroed limb.

Yuval's method takes a different approach. Instead of adding a multiple of $p$ to zero out the low bits, we directly compute the equivalent value after the divide by $2^{29}$ step. Given the same accumulator $x$, we want to find $x / 2^{29} \mod p$. We can rewrite this as:
$$x / 2^{29} = (x - \text{result}_0) / 2^{29} + \text{result}_0 / 2^{29} \mod p.$$

The first term $(x - \text{result}_0) / 2^{29}$ is simply the higher limbs shifted down. The second term requires computing $\text{result}_0 \cdot 2^{-29} \mod p$, which we precompute as `r_inv_wasm` (stored in 9 limbs).

So instead of computing $k = \text{result}_0 \cdot (-p^{-1})$ and adding $k \cdot p$ (9 multiply-accumulates), we compute $\text{result}_0 \cdot r\_inv\_wasm$ and add it to the higher limbs (also 9 multiply-accumulates). Both approaches cost 9 multiply-accumulates; Yuval's needs no separate "zero out and shift" step, because the shift is implicit in how we interpret the result.

In code, `wasm_reduce_yuval` implements this as:
```cpp
result_1 += result_0_masked * wasm_r_inv[0] + (result_0 >> 29);
result_2 += result_0_masked * wasm_r_inv[1];
// ... and so on for result_3 through result_9
```

The term `(result_0 >> 29)` handles any overflow bits in `result_0` beyond the lowest 29 bits, propagating them to `result_1`. After this operation, `result_0` is effectively discarded, and `result_1` through `result_9` hold the Montgomery-reduced value.

#### Structure of WASM Montgomery multiplication

In 254-bit WASM multiplication, the full Montgomery reduction requires 9 limb-reductions (to divide by $2^{261} = 2^{29 \cdot 9}$). **We apply Yuval's method for the first 8 reductions, and standard Montgomery reduction for the 9th (final) reduction.**

Why not use Yuval for all 9? The key issue is that Yuval's method takes a 10-limb input and produces a 10-limb output (the reduced value spans 9 limbs, shifted up by one position). If we used Yuval for the 9th reduction, we would end up with a 10-limb result instead of the desired 9-limb result. The standard Montgomery reduction (`wasm_reduce`), by contrast, takes 9 limbs and produces 9 limbs (with the lowest limb zeroed and discardable), giving us exactly the 9-limb output we need.

#### Bounds analysis

We must verify that the output is in $[0, 2p)$ (the coarse representation) without requiring an additional subtraction of $p$.

The 9×9-limb product $aR \cdot bR$ is computed with one level of Karatsuba (66 limb multiplications) into 17 relaxed limbs. Since both $aR$ and $bR$ are in $[0, 2p)$, this product is less than $4p^2$.

After 8 Yuval reductions and 1 standard reduction, the result is the integer part of a numerator divided by $2^{261}$. The numerator is at most
$$aR \cdot bR + \sum_{i=0}^{7} k_i \cdot r_{inv} \cdot 2^{29(i+1)} + k_8 \cdot p \cdot 2^{232}$$

where $k_i < 2^{29}$ is the limb masked at reduction step $i$ (`result_0_masked` in `wasm_reduce_yuval`), and $r_{inv} = 2^{-29} \bmod p$ is `r_inv_wasm`. By construction:
- The Yuval terms sum to at most $r_{inv} \cdot 2^{29} \cdot (2^{232} - 1) < r_{inv} \cdot 2^{261}$.
- The final standard reduction adds less than $2^{261} \cdot p$.

The bound needs $r_{inv} < p/2$. This holds for the bn254 `fq` and `fr` parameters; `field_impl_generic.hpp` calls it empirical. With it, the Yuval terms are less than $2^{260} \cdot p$, and the numerator is bounded by:
$$4p^2 + 2^{260} \cdot p + 2^{261} \cdot p$$

Dividing by $2^{261}$:
$$\frac{4p^2}{2^{261}} + \frac{p}{2} + p$$

For 254-bit primes, $4p < 2^{256}$, so $\frac{4p^2}{2^{261}} < \frac{p}{32}$. The result is therefore less than $1.5p + p/32 < 2p$, which is in the coarse representation range $[0, 2p)$. No additional reduction is required.

### Converting to and from Montgomery form
Conversion between forms avoids standard division by using Montgomery multiplication. If we look at a value $a\ mod\ p$ we can notice that this is the Montgomery form of $a\cdot R^{-1}\ mod\ p$, so if we want to get $aR$ from it, we need to multiply it by the Montgomery form of $R\ mod\ p$, which is $R\cdot R\ mod\ p$. So using Montgomery multiplication we compute

$$a \cdot R^2 / R  = a\cdot R\ mod\ p$$

To convert from Montgomery form into standard form we multiply the element in Montgomery form by 1:

$$ aR \cdot 1 / R = a\ mod\ p$$

## Architecture details {#field_docs_architecture_details}
Each multiplication or squaring primitive has 3 implementations:
1. Generic 64-bit implementation when uint128_t type is available (there is efficient multiplication of 64-bit values)
2. Assembly 64-bit implementation (Intel ADX and no Intel ADX versions)
3. Implementation targeting WASM

The generic implementation has 2 purposes:
1. Building barretenberg on platforms without an assembly implementation (for example, ARM64)
2. Compile-time computation of constant expressions, since we can't use the assembly implementation for those.

The assembly implementation for x86_64 is optimized. There are 2 versions:
1. General x86_64 implementation that uses 64-bit registers. Without ADX, squaring calls the MUL macro (`field_impl_x64.hpp`, `#if !defined(__ADX__) || defined(DISABLE_ADX)`); `SQR` is defined only in the ADX branch of `asm_macros.hpp`. The code comment gives the reason: the non-ADX SQR has a rare bug.
2. Implementation using Intel ADX. It allows simultaneous use of two addition-with carry operations (adox and adcx) on two separate CPU gates (units of execution that can work simultaneously on the same core), which almost halves the time spent adding up the results of uint64_t multiplication.

Implementation for WASM:

We use 9 29-bit limbs for computation (storage stays the same) and we change the Montgomery form. The reason for a different architecture is that WASM doesn't have:
1. 128-bit result 64*64 bit multiplication
2. 64-bit addition with carry

32-bit limbs need a mask after every product accumulation, because the sum of two 64-bit products loses the carry. 29-bit limbs give 58-bit products with 6 bits of headroom, so 64 products can be summed before a carry. This removes most intermediate masking, shifts and additions. The 9×9-limb product uses one level of Karatsuba (5+4 limb split, 66 limb multiplications instead of 81 for schoolbook).

## Interaction of field object with other objects
Most of the time field is used with uint64_t or uint256_t in our codebase, but there is general logic of how we generate field elements from integers:
1. Converting from signed int takes the sign into account. It takes the absolute value, converts it to montgomery and then negates the result if the original value was negative
2. Unsigned integers ( <= 64 bits) are just converted to montgomery
3. uint256_t: the limbs are copied and converted with one Montgomery multiplication by $R^2$ (any 256-bit value is accepted).
4. uint512_t: reduced mod $p$, then converted. This is used for unbiased random sampling.

Conversion from field elements exists only to unsigned integers and bools. The value is converted from montgomery and appropriate number of lowest bits is used to initialize the value.

**N.B.** Functions for converting from uint256_t and back are not bijective, since values $ \ge p$ will be reduced.

## Inversion

`field::invert()` (`field_impl.hpp`) uses the Bernstein–Yang inverse for fields with $p < 2^{255}$; see [bernstein_yang_inverse.md](bernstein_yang_inverse.md). It is variable-time. Other fields, and compile-time evaluation, use Fermat inversion.

## Field parameters

The field template is instantiated with field parameter classes, for example, class bb::Bn254FqParams. Each such class contains at least the modulus (in 64-bit and 29-bit form), r_inv (used for efficient reductions) and 2 versions of r_squared used for converting to Montgomery form (64-bit and WASM/29-bit version). r_squared and other parameters (such as cube_root, primitive_root and coset_generator) are defined for wasm separately, because the values represent an element already in Montgomery form.

## Helpful python snippets

`parameter_helper.py` parses every parameter class in the bn254, secp256k1 and secp256r1 headers, checks the derived values, and prints them as JSON. It reads the endomorphism parameters but does not check them. It finds the headers relative to its own location, so it runs from any directory:
```bash
python3 barretenberg/cpp/src/barretenberg/ecc/fields/parameter_helper.py
```

Convert value from python to string for easy addition to bb's tests:
```python
def to_ff(value):
	print ("FF(uint256_t{"+','.join(["0x%xUL"%((value>>(i*64))&((1<<64)-1))for i in range(4)])+"})")
```
