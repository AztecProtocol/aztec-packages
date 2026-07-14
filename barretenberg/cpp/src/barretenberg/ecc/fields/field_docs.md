Prime field documentation    {#field_docs}
===
Barretenberg has its own implementation of finite field arithmetic. The implementation targets 254-bit (bn254, grumpkin) and 256-bit (secp256k1, secp256r1) fields. Internally the field is represented as a little-endian C-array of 4 uint64_t limbs. For 254-bit fields, the internal representation must be in the range $[0, 2p)$ (which we refer to as the _coarse representation_), while for 256-bit fields the internal representation is an arbitrary `uint256_t`.

## Field arithmetic
### Introduction to Montgomery form {#field_docs_montgomery_explainer}
We use Montgomery multiplication to speed up field multiplication. For an element $a \in \mathbb F_p$, the element is represented internally as $$a \cdot R \mod p$$ where $R = 2^d$ and $d = 256$ on every backend (x86_64: $4 \times 64 = 256$, generic 64-bit: $4 \times 64 = 256$, and WASM: $8 \times 29 + 24 = 256$ for the standard path, $5 \times 51 + 1 = 256$ for the paired path). Note that WASM uses a different internal representation during Montgomery multiplication, but the canonical 4 × 64-bit Montgomery form at input and output is preserved on all backends. Consequently, Montgomery-form constants (`r_squared`, `cube_root`, `coset_generator`) are shared across all builds.

The goal of using Montgomery form is to avoid heavy division modulo $p$. To compute a representative of element $$c = a⋅b\ mod\ p$$ we compute $$c⋅R = (a⋅R)⋅(b⋅R) / R\ mod\ p,$$ but we use an efficient division trick to avoid the naive modular division. Let's look into the standard 4⋅64 case:
1. First, we compute the value $$c_r=c⋅R⋅R = aR⋅bR$$ in integers and get a value with 8 64-bit limbs
2. Then we take the lowest limb of $c_r$ (i.e., $c_r[0]$) and multiply it by a special _precomputed_ value $$r_{inv} = -1 ⋅ p^{-1}\ mod\  2^{64}$$ As a result we get $$k = r_{inv}⋅ c_r[0]\ mod\ 2^{64}$$
3. Next we update $c_r$ in integers by adding $k⋅p$: $$c_r += k⋅p$$ You might notice that the value of $c_r\ mod\ p$ hasn't changed, since we've added a multiple of the modulus. At the same time, if we look at the expression modulo $2^{64}$: $$c_r + k⋅p = c_r + c_r⋅r_{inv}⋅p = c_r + c_r⋅ (-1)⋅p^{-1}⋅p = c_r - c_r = 0\ mod\ 2^{64}.$$ The result is equivalent modulo $p$, but we zeroed out the lowest limb
4. We perform the same operation for $c_r[1]$, but instead of adding $k⋅p$, we add $2^{64}⋅k⋅p$. In the implementation, instead of adding $k⋅ p$ to limbs of $c_r$ starting with zero, we just start with limb 1. This ensures that $c_r[1]=0$. We then perform the same operation for the remaining low limbs, $c_r[2]$ and $c_r[3]$.
5. At this stage the array $c_r$ has the property that the first 4 limbs of the total 8 limbs are zero. So if we treat the 4 high limbs as a separate integer $c_{r.high}$, $$c_r = c_{r.high}⋅2^{256}=c_{r.high}⋅R\ mod\ p \Rightarrow c_{r.high} = c\cdot R\ mod\ p$$ and we can get the evaluation simply by taking the 4 high limbs of $c_r$.
6. For our 256-bit fields, the previous step has reduced the intermediate value enough that conditionally subtracting one copy of $p$ is sufficient to bring it into the valid range $[0, 2^{256})$. For our 254-bit fields, the result is already in the coarse range $[0,2p)$, so no additional reduction is needed.

On a high level, what we are doing is iteratively adding a multiple of $p$ until the current bottom limb is zero, then shifting by a limb (amounting to dividing by $2^{64}$).
#### Bounds analysis
Why does this work? We present several versions of the analysis, for completeness.

* Suppose both $aR$ and $bR$ are less than the modulus $p$ in integers, so $$aR\cdot bR <= (p-1)^2.$$ During each of the $k\cdot p$ addition rounds we can add at most $(2^{64}-1)p$ to the corresponding digits, so at most we add $(2^{256}-1)p$ and the total is $$aR\cdot bR + k_{0,1,2,3}p \le (p-1)^2+(2^{256}-1)p < 2\cdot 2^{256}p \Rightarrow c_{r.high} = \frac{aR\cdot bR + k_{0,1,2,3}p}{2^{256}} < 2p.$$

* For our 256-bit fields, we _cannot_ assume that $aR$ and $bR$ are less than the modulus $p$; we simply know that they are 256-bit numbers. Nonetheless, the same analysis shows that the output is less than $2^{256} + p -1$. This means that (conditionally) subtracting one copy of $p$ is enough to get us to the valid range of $[0, 2^{256})$.

* For 254-bit fields (e.g. the BN-254 base and scalar fields) we can do even better by employing a simple trick. Note that 4 64-bit limbs allow 256 bits of storage. We relax the internal representation to use values in range $[0,2p)$. The addition, negation and subtraction operation logic doesn't change, we simply replace the modulus $p$ with $2p$, but the multiplication becomes more efficient. The multiplicands are in range $[0,2p)$, but we add multiples of modulus $p$ to reduce limbs, not $2p$. If we revisit the $c_r$ formula:
$$aR\cdot bR + k_{0,1,2,3}p \le (2p-1)^2+(2^{256}-1)p = 2^{256}p+4p^2-5p+1 \Rightarrow$$ $$\Rightarrow c_{r.high} = \frac{aR\cdot bR + k_{0,1,2,3}p}{2^{256}} \le \frac{2^{256}p+4p^2-5p+1}{2^{256}}=p +\frac{4p^2 - 5p +1}{2^{256}}, 4p < 2^{256} \Rightarrow$$ $$\Rightarrow p +\frac{4p^2 - 5p +1}{2^{256}} < 2p$$ So we ended in the same range and we don't have to perform additional reductions.

**N.B.** In the code we refer to this form, when the limbs are only constrained to be in the range $[0,2p)$, as the coarse-representation.

### WASM reduction primitives
For WASM backends it is useful to separate the primitive reduction steps from the full multiplication pipelines that use them. In this subsection we use $\beta$ for the radix of the current reduction step, $x$ for the accumulator before the step, $x_0 = x \mod \beta$ for its lowest radix-$\beta$ digit, and $x'$ for the value after the step.

#### Ordinary Montgomery reduction
This is the same Montgomery reduction pattern explained in [Introduction to Montgomery form](#field_docs_montgomery_explainer). We compute
$$m = x_0 \cdot (-p^{-1}) \mod \beta$$
and form
$$x' = \frac{x + m \cdot p}{\beta} \mod p.$$
By construction,
$$x_0 + m \cdot p \equiv 0 \mod \beta,$$
so the division by $\beta$ is exact.

#### Bounds analysis
Let $B$ be any upper bound on the current accumulator $x$ before this reduction step. Since $m < \beta$, we have $m \cdot p < \beta \cdot p$, and therefore
$$x' < \frac{B}{\beta} + p.$$
This is the local bound used by every ordinary Montgomery reduction step in the WASM backends.

The three concrete instances are:
1. `wasm_reduce_29`, with $\beta = 2^{29}$.
2. `wasm_reduce_24`, with $\beta = 2^{24}$. This is the same step, but only 24 bits are removed from the total shift; the remaining 5 bits of the surrounding 29-bit limb stay live and are packed into the final 4 × 64-bit output.
3. The paired ordinary Montgomery reduction, with $\beta = 2^{51}$. After the rho folds, the paired backend applies this same step twice.

#### Yuval reduction
For our 254-bit WASM multiplication we also use a reduction technique found by Yuval. For a reference, please see this [hackmd](https://hackmd.io/@Ingonyama/Barret-Montgomery). Here we specialize to $\beta = 2^{29}$.

Instead of adding a multiple of $p$ to zero out $x_0$, Yuval's method rewrites the divide-by-$\beta$ step directly:
$$\frac{x}{\beta} = \frac{x - x_0}{\beta} + x_0 \cdot \beta^{-1} \mod p.$$
Thus
$$x' = \frac{x - x_0}{\beta} + x_0 \cdot \beta^{-1} \mod p.$$
In the implementation, the factor $\beta^{-1} \mod p$ is precomputed as `r_inv_wasm`.

#### Bounds analysis
Since $x_0 < \beta$ and $\beta^{-1} \mod p < p$, the correction term satisfies
$$x_0 \cdot \beta^{-1} \mod p < \beta \cdot p.$$
Therefore, if $x < B$ before the Yuval step, then
$$x' < \frac{B}{\beta} + \beta \cdot p.$$
Compared with the ordinary Montgomery bound $\frac{B}{\beta} + p$, this leaves much looser slack. That looser slack is exactly why Yuval is useful locally, but cannot be used for every step if the final result is to remain in the coarse range $[0, 2p)$.

#### Paired rho-fold reduction
On the relaxed-SIMD paired path the first part of reduction is conceptually analogous to Yuval's idea: instead of zeroing a low limb with a multiple of $p$, we replace the bottom limbs by precomputed multiples of inverse powers of the radix.

Let
$$x = \sum_{k=0}^{9} t_k \cdot \beta^k.$$
For each $k \in \{0, 1, 2\}$ we precompute
$$\rho_{2-k} = \beta^{k-3} \mod p,$$
so that
$$t_k \cdot \beta^k \equiv (t_k \cdot \rho_{2-k}) \cdot \beta^3 \mod p.$$
Applying this identity to $t_0$, $t_1$, and $t_2$ gives
$$x = t_0 + t_1 \beta + t_2 \beta^2 + t_3 \beta^3 + \cdots + t_9 \beta^9$$
$$\equiv (t_0 \rho_2 + t_1 \rho_1 + t_2 \rho_0)\beta^3 + t_3 \beta^3 + t_4 \beta^4 + \cdots + t_9 \beta^9 \mod p$$
$$= \beta^3 \left( t_0 \rho_2 + t_1 \rho_1 + t_2 \rho_0 + t_3 + t_4 \beta + \cdots + t_9 \beta^6 \right) \mod p.$$
If we define the resulting 7-limb high window by
$$y = t_0 \rho_2 + t_1 \rho_1 + t_2 \rho_0 + t_3 + t_4 \beta + \cdots + t_9 \beta^6,$$
then
$$x \equiv \beta^3 \cdot y \mod p,$$
so after the rho folds we can drop the bottom three limbs and continue with the high window $y$, which represents the value $x / \beta^3 \mod p$.
Because the three folds do not share inputs, they can be computed in parallel and then combined with a balanced add tree.

#### Bounds analysis
Since the paired kernel is only used on coarse inputs, we have
$$x < (2p)^2 = 4p^2.$$
After the preceding carry-propagation phase, the folded limbs satisfy $0 \le t_0, t_1, t_2 < \beta$, while the rho constants satisfy $0 \le \rho_{2-k} < p$. Hence the three rho corrections contribute less than $3 \beta \cdot p$ in total, and the carried high window contributes less than $x / \beta^3$. Therefore
$$y < \frac{x}{\beta^3} + 3 \beta \cdot p < \frac{4p^2}{\beta^3} + 3 \beta \cdot p.$$
Assuming
$$p < \frac{\beta^5}{2} - \beta^4.$$
we get
$$\frac{4p^2}{\beta^3} < \frac{4p}{\beta^3}\left(\frac{\beta^5}{2} - \beta^4\right) = 2 \beta^2 \cdot p - 4 \beta \cdot p.$$
Substituting this into the generic rho-fold bound gives
$$y < \left(2 \beta^2 \cdot p - 4 \beta \cdot p\right) + 3 \beta \cdot p = 2 \beta^2 \cdot p - \beta \cdot p.$$
So the rho folds preserve the residue modulo $p$, but they do **not** yet produce the final coarse bound. This is why the paired backend then applies two ordinary Montgomery reductions with $\beta = 2^{51}$, each producing the bounds $x' < B / \beta + p$.

#### Paired parity fix and halving
Let $x$ denote the intermediate value after those two ordinary Montgomery reduction steps.

The paired kernel's internal Montgomery factor is
$$R_{\text{kernel}} = \beta^5 = 2^{255},$$
so after the rho folds and two ordinary Montgomery reduction steps we have reduced by 255 bits rather than 256. The last bit is handled by a parity fix followed by a fused halving-and-repack step.

If $x$ is even, we can just shift by 1. If $x$ is odd, we add $p$, and since $p$ is odd, $x + p$ is then even and still congruent to $x$ modulo $p$. Hence we can also shift by 1 to get the final form. This fused final shift is done by `pack_to_4x64_shr_1`.

#### Bounds analysis
If the input to this stage satisfies
$$x < B,$$
then after the optional add-$p$ step we have
$$x + 0 \text{ or } p < B + p.$$
After the final halving,
$$x' = \frac{x + 0 \text{ or } p}{2} < \frac{B + p}{2}.$$
In particular, if $x < 3p$, then $x' < 2p$. Likewise, if $x < 2p + p / \beta$, then
$$x' < \frac{3p + p / \beta}{2} < 2p.$$
This is what closes the paired pipeline back to the same coarse Montgomery range $[0, 2p)$ used by the rest of the small-modulus field code.

### WASM Montgomery multiplication pipelines
All WASM multiplication backends must achieve a net division by
$$R = 2^{256},$$
but they do so with different combinations of the primitives above:
1. For 254-bit fields in the standard 9 × 29-bit backend: 7 Yuval steps, 1 ordinary Montgomery reduction with $\beta = 2^{29}$, and 1 final ordinary Montgomery reduction with $\beta = 2^{24}$.
2. For 256-bit fields in the standard 9 × 29-bit backend: 8 ordinary Montgomery reductions with $\beta = 2^{29}$ and 1 final ordinary Montgomery reduction with $\beta = 2^{24}$.
3. For the relaxed-SIMD paired backend: 3 rho folds, 2 ordinary Montgomery reduction steps, and 1 parity/halving step.

#### Regular WASM multiplication (small moduli)
For our 254-bit WASM multiplication the cumulative shift across all reductions must equal $R = 2^{256}$. We achieve this with 9 reduction steps whose widths sum to 256:
$$256 = 7 \cdot 29 + 29 + 24.$$
The multiplication that produces the 17-limb intermediate is a Karatsuba 5+4 split (`wasm_karatsuba_mul`) that costs 66 multiplications instead of the naive 81. The reduction chain then applies 7 `wasm_reduce_yuval` steps, 1 `wasm_reduce_29` step, and 1 `wasm_reduce_24` step.

Why not use Yuval for all 8 of the 29-bit steps? Because Yuval's local slack is $2^{29} \cdot p$, whereas ordinary Montgomery's local slack is only $p$. Seven Yuval steps are still acceptable, but replacing the eighth 29-bit step with an ordinary Montgomery reduction is what tightens the running bound enough that the final 24-bit step lands back in $[0, 2p)$.

#### Bounds analysis
We must verify that the output is in $[0, 2p)$ (the coarse representation) without requiring an additional subtraction of $p$.

After the Karatsuba multiplication, we have $aR \cdot bR$ stored across 17 relaxed 29-bit limbs. Since both multiplicands are in coarse Montgomery form, we have
$$aR < 2p,\qquad bR < 2p,\qquad aR \cdot bR < 4p^2.$$

As explained above, each Yuval correction `u * r_inv_wasm` can be bounded by $u \cdot p$.

Let $K$ be the total correction coefficient after expressing every correction term at the common pre-division-by-$2^{256}$ scale. We decompose it as
$$K = K_{\mathrm{Yuval}} + K_{29} + K_{24},$$
where
$$K_{\mathrm{Yuval}} = \sum_{i=0}^{6} u_i 2^{29i}, \qquad K_{29} = v 2^{203}, \qquad K_{24} = w 2^{232},$$
with
$$0 \le u_i < 2^{29}, \qquad 0 \le v < 2^{29}, \qquad 0 \le w < 2^{24}.$$

The seven Yuval steps occupy the seven disjoint 29-bit windows covering bit positions $0$ through $202$, so
$$K_{\mathrm{Yuval}} < \sum_{i=0}^{6} (2^{29} - 1)2^{29i} = 2^{203} - 1 < 2^{203}.$$
The eighth step is an ordinary Montgomery correction in the next 29-bit window, covering bit positions $203$ through $231$, so
$$K_{29} < (2^{29} - 1)2^{203} = 2^{232} - 2^{203}.$$
The final 24-bit correction occupies the remaining bit positions $232$ through $255$, so
$$K_{24} < (2^{24} - 1)2^{232} = 2^{256} - 2^{232}.$$
Therefore
$$K < 2^{203} + (2^{232} - 2^{203}) + (2^{256} - 2^{232}) = 2^{256}.$$

So after all 9 steps the result is bounded by
$$\frac{aR \cdot bR + K \cdot p}{2^{256}} < \frac{4p^2 + 2^{256} \cdot p}{2^{256}} = p + \frac{4p^2}{2^{256}}.$$
For 254-bit primes, $p < 2^{254}$, so $4p < 2^{256}$ and hence
$$\frac{4p^2}{2^{256}} = \frac{(4p) \cdot p}{2^{256}} < p.$$
Thus the final result is less than $2p$, which is exactly the desired coarse range. No additional reduction is required.

#### Big-modulus WASM multiplication
For 256-bit fields we do not have a dedicated paired kernel and the standard WASM backend therefore uses only ordinary Montgomery reductions: 8 steps of `wasm_reduce_29` followed by 1 step of `wasm_reduce_24`.

This is the same large-modulus Montgomery logic as the native 4 × 64-bit code, but expressed in 9 × 29-bit limbs. The key difference from the 254-bit case is that the inputs are only known to be arbitrary 256-bit values, so the final target range is $[0, 2^{256})$, not $[0, 2p)$.

#### Bounds analysis
Let the two inputs be arbitrary 256-bit values in Montgomery form. Then
$$aR < 2^{256}, \qquad bR < 2^{256}, \qquad aR \cdot bR < 2^{512}.$$

As above, let $K$ be the total correction coefficient after expressing every correction term at the common pre-division-by-$2^{256}$ scale. We decompose it as
$$K = K_{29} + K_{24},$$
where
$$K_{29} = \sum_{i=0}^{7} u_i 2^{29i}, \qquad K_{24} = w 2^{232},$$
with
$$0 \le u_i < 2^{29}, \qquad 0 \le w < 2^{24}.$$

The eight ordinary 29-bit reductions occupy bit positions $0$ through $231$, so
$$K_{29} < \sum_{i=0}^{7} (2^{29} - 1)2^{29i} = 2^{232} - 1 < 2^{232}.$$
The final 24-bit correction occupies bit positions $232$ through $255$, so
$$K_{24} < (2^{24} - 1)2^{232} = 2^{256} - 2^{232}.$$
Therefore
$$K < 2^{232} + (2^{256} - 2^{232}) = 2^{256}.$$
Therefore the reduced result is bounded by
$$\frac{aR \cdot bR + K \cdot p}{2^{256}} < \frac{2^{512} + 2^{256} \cdot p}{2^{256}} = 2^{256} + p.$$
So a single conditional subtraction of $p$ is sufficient to bring the result back into the valid 256-bit range $[0, 2^{256})$.

#### Paired WASM multiplication
On WASM targets that enable relaxed-SIMD (`__wasm_relaxed_simd__`), we additionally expose a paired kernel that computes two independent Montgomery products in a single pass by using the two SIMD lanes. On non-relaxed-SIMD builds, or when the modulus is 256-bit (secp curves), this dispatches to two ordinary single-lane multiplications.

The paired API surface is `paired_mul`, `paired_sqr`, `paired_to_montgomery_form`, and `paired_from_montgomery_form(_reduced)`.

The paired kernel is restricted to small moduli. At representation level, the 5 × 51-bit layout can only hold values below $2^{255}$, so we must have
$$2p < 2^{255}, \qquad \text{i.e. } p < 2^{254}.$$
In the current implementation we impose the slightly stronger bound
$$p < 2^{254} - 2^{204},$$
because this is the largest threshold for which the paired coarse-output proof closes uniformly.

It uses 5 × 51-bit limbs rather than 9 × 29-bit limbs, which reduces the number of cross-limb multiplications compared with the standard WASM path. This is possible because the relaxed-FMA path uses `ez_mul`, which computes a 51 × 51 limb product. It does so by using two relaxed FMAs together with carefully chosen IEEE-754 bias constants (`C1 = 2^{103}`, `C2 = C1 + 2^{52} + 2^{51}`) to recover the high and low 51-bit halves of each 51 × 51 product without an integer multiplication. After packing the inputs into the 5 × 51-bit layout and converting them to `f64x2`, the kernel runs a 5 × 5 schoolbook multiplication. Because of the extra FMA overhead, the paired kernel is in roughly the same performance range as the regular WASM path; however, since it works in SIMD, it computes two products at once. We could not simply convert the standard WASM kernel to SIMD, because that would require a natural lane-wise 64 × 64 → 64 multiplication path, which WASM SIMD does not provide in the form we need. This is why we use the standard 9 × 29-bit layout for a single product and the 5 × 51-bit layout for the paired product.

The internal Montgomery factor of the 5 × 51-bit layout is
$$R_{\mathrm{kernel}} = (2^{51})^5 = 2^{255},$$
so one further step is needed to convert to the outer Montgomery factor $R = 2^{256}$:

`reduce_and_finalize_paired_rne` first propagates signed carries through $t_0, t_1, t_2, t_3$, then 3 rho folds remove the bottom 3 limbs at once, then 2 ordinary Montgomery reductions remove 2 more 51-bit limbs, and finally a parity fix plus a fused halving/repack step converts from $R_{\mathrm{kernel}} = 2^{255}$ to the outer Montgomery factor $R = 2^{256}$. The two $m$-factors in the ordinary Montgomery phase are still computed with scalar 64-bit multiplications, because `wasm_i64x2_mul` is not attractive on current engines for this step.

#### Bounds analysis
The paired kernel is only used on coarse inputs, so
$$aR < 2p,\qquad bR < 2p,\qquad aR \cdot bR < 4p^2.$$
By the rho-fold bound above, and because we specifically choose the modulus bound
$$p < \frac{\beta^5}{2} - \beta^4,$$
the live window after the three rho folds satisfies
$$y < 2 \beta^2 p - \beta p.$$

Applying the ordinary Montgomery local bound $x' < x/\beta + p$ twice gives
$$2 \beta^2 p - \beta p \;\longrightarrow\; 2 \beta p \;\longrightarrow\; 3p.$$
The final parity fix adds at most one more copy of $p$, and the fused halving then yields
$$\frac{3p + p}{2} = 2p.$$
Since every preceding inequality is strict, the actual output is strictly less than $2p$. Thus the final 4 × 64-bit output is in coarse Montgomery form $[0, 2p)$, as required. No conditional subtraction is needed.

### Converting to and from Montgomery form
Obviously we want to avoid using standard form division when converting between forms, so we use Montgomery form to convert to Montgomery form. If we look at a value $a\ mod\ p$ we can notice that this is the Montgomery form of $a\cdot R^{-1}\ mod\ p$, so if we want to get $aR$ from it, we need to multiply it by the Montgomery form of $R\ mod\ p$, which is $R\cdot R\ mod\ p$. So using Montgomery multiplication we compute

$$a \cdot R^2 / R  = a\cdot R\ mod\ p$$

To convert from Montgomery form into standard form we multiply the element in Montgomery form by 1:

$$ aR \cdot 1 / R = a\ mod\ p$$

## Architecture details {#field_docs_architecture_details}
You could say that for each multiplication or squaring primitive there are 3 implementations:
1. Generic 64-bit implementation when uint128_t type is available (there is efficient multiplication of 64-bit values)
2. Assembly 64-bit implementation (Intel ADX and no Intel ADX versions)
3. Implementation targeting WASM

The generic implementation has 2 purposes:
1. Building barretenberg on platforms we haven't targeted in the past (new ARM-based Macs, for example)
2. Compile-time computation of constant expressions, since we can't use the assembly implementation for those.

The assembly implementation for x86_64 is optimized. There are 2 versions:
1. General x86_64 implementation that uses 64-bit registers. The squaring operation is equivalent to multiplication for simplicity and because the original squaring implementation was quite buggy.
2. Implementation using Intel ADX. It allows simultaneous use of two addition-with carry operations (adox and adcx) on two separate CPU gates (units of execution that can work simultaneously on the same core), which almost halves the time spent adding up the results of uint64_t multiplication.

Implementation for WASM:

We use 9 29-bit limbs for computation while keeping the canonical 4 × 64-bit storage and the same $R = 2^{256}$ Montgomery form as native. The reason for the different internal limb width is that WASM doesn't have:
1. 64 × 64-bit multiplication with a 128-bit result
2. 64-bit addition with carry

On WASM targets that also expose relaxed SIMD, there is also a *paired* implementation that computes two independent Montgomery products at once using a 5 × 51-bit `f64x2` SIMD pipeline. It is an opt-in API surface (`paired_mul`, `paired_sqr`, …); the standard `montgomery_mul` still uses the 9 × 29-bit pipeline. We could not simply convert the standard WASM kernel to SIMD, because that would require a natural lane-wise 64 × 64 → 128 multiplication path, which WASM SIMD does not provide in the form we need. This is why we use the standard 9 × 29-bit layout for a single product and the 5 × 51-bit layout for the paired product.

In the past we implemented a version with 32-bit limbs, but as a result, when we accumulated limb products we always had to split 64-bit results of 32-bit multiplication back into 32-bit chunks. Had we not, the addition of 2 64-bit products would have lost the carry flag and the result would be incorrect. There were 2 issues with this:
1. This spawned in a lot of masking operations
2. We didn't use more efficient algorithms for squaring, because multiplication by 2 of intermediate products would once again overflow.

Switching to 9 29-bit limbs increased the number of multiplications from 136 to 171. However, since the product of 2 limbs is 58 bits, we can safely accumulate 64 of those before we have to reduce. This allowed us to get rid of a lot of intermediate masking operations, shifts and additions, so the resulting computation turned out to be more efficient.

## Interaction of field object with other objects
Most of the time field is used with uint64_t or uint256_t in our codebase, but there is general logic of how we generate field elements from integers:
1. Converting from signed int takes the sign into account. It takes the absolute value, converts it to montgomery and then negates the result if the original value was negative
2. Unsigned integers ( <= 64 bits) are just converted to montgomery
3. uint256_t and uint512_t:
    1. Truncate to 256 bits
    2. Subtract the modulus until the value is within field
    3. Convert to montgomery

Conversion from field elements exists only to unsigned integers and bools. The value is converted from montgomery and appropriate number of lowest bits is used to initialize the value.

**N.B.** Functions for converting from uint256_t and back are not bijective, since values $ \ge p$ will be reduced.

## Field parameters

The field template is instantiated with field parameter classes, for example, class bb::Bn254FqParams. Each such class contains at least the modulus (in 64-bit and 29-bit form), r_inv (used for efficient reductions; the WASM Yuval-style reduction uses an additional `r_inv_wasm = 2^{-29} mod p` precomputation in 9 × 29-bit form), and r_squared used for converting to Montgomery form. Since $R = 2^{256}$ is shared across native and WASM, r_squared is a single value (no separate WASM version), and likewise cube_root, primitive_root and coset_generator — values already in Montgomery form — are defined once and used by every backend.

## Helpful python snippets

Parse field parameters out of a parameter class (doesn't check and reconstitute endomorphism parameters, but checks correctness of everything else)
```python
import re
def parse_field_params(s):
    def parse_number(line):
        """Expects a string without whitespaces"""
        line=line.replace('U','').replace('L','') # Clear away all postfixes
        if line.find('0x')!=-1: # We have to parse hex
            value= int(line,16)
        else:
            value = int(line)
        return value

    def recover_single_value(name):
        nonlocal s
        index=s.find(name)
        if index==-1:
            raise ValueError("Couldn't find value with name "+name)
        eq_position=s[index:].find('=')
        line_end=s[index:].find(';')
        return parse_number(s[index+eq_position+1:index+line_end])

    def recover_single_value_if_present(name):
        nonlocal s
        index=s.find(name)
        if index==-1:
            return None
        eq_position=s[index:].find('=')
        line_end=s[index:].find(';')
        return parse_number(s[index+eq_position+1:index+line_end])

    def recover_array(name):
        nonlocal s
        index = s.find(name)
        number_of_elements=int(re.findall(r'(?<='+name+r'\[)\d+',s)[0])
        start_index=s[index:].find('{')
        end_index=s[index:].find('}')
        all_values=s[index+start_index+1:index+end_index]
        result=[parse_number(x) for (i,x) in enumerate(all_values.split(',')) if i<number_of_elements]
        return result

    def recover_multiple_arrays(prefix):
        chunk_names=re.findall(prefix+r'_\d+',s)
        recovered=dict()
        for name in chunk_names:
            recovered[name]=recover_array(name)
        return recovered

    def recover_element_from_parts(prefix,shift):
        """Recover a field element from its parts"""
        chunk_names=re.findall(prefix+r'_\d+',s)
        val_dict=dict()
        for name in chunk_names:
            val_dict[int(name[len(prefix)+1:])]=recover_single_value(name)
        result=0
        for i in range(len(val_dict)):
            result|=val_dict[i]<<(i*shift)
        return result

    def reconstruct_field_from_4_parts(arr):
        result=0
        for i, v in enumerate(arr):
            result|=v<<(i*64)
        return result
    parameter_dictionary=dict()
    parameter_dictionary['modulus']=recover_element_from_parts('modulus',64)
    parameter_dictionary['r_squared']=recover_element_from_parts('r_squared',64)
    parameter_dictionary['cube_root']=recover_element_from_parts('cube_root',64)
    parameter_dictionary['primitive_root']=recover_element_from_parts('primitive_root',64)

    parameter_dictionary['modulus_wasm']=recover_element_from_parts('modulus_wasm',29)
    parameter_dictionary['r_inv_wasm']=recover_element_from_parts('r_inv_wasm',29)
    parameter_dictionary={**parameter_dictionary,**recover_multiple_arrays('coset_generators')}
    parameter_dictionary['endo_g1_lo']=recover_single_value_if_present('endo_g1_lo')
    parameter_dictionary['endo_g1_mid']=recover_single_value_if_present('endo_g1_mid')
    parameter_dictionary['endo_g1_hi']=recover_single_value_if_present('endo_g1_hi')
    parameter_dictionary['endo_g2_lo']=recover_single_value_if_present('endo_g2_lo')
    parameter_dictionary['endo_g2_mid']=recover_single_value_if_present('endo_g2_mid')
    parameter_dictionary['endo_minus_b1_lo']=recover_single_value_if_present('endo_minus_b1_lo')
    parameter_dictionary['endo_minus_b1_mid']=recover_single_value_if_present('endo_minus_b1_mid')
    parameter_dictionary['endo_b2_lo']=recover_single_value_if_present('endo_b2_lo')
    parameter_dictionary['endo_b2_mid']=recover_single_value_if_present('endo_b2_mid')

    assert(parameter_dictionary['modulus']==parameter_dictionary['modulus_wasm']) # Check modulus representations are equivalent
    modulus=parameter_dictionary['modulus']
    assert(parameter_dictionary['r_squared']==pow(2,512,modulus)) # Check r_squared (R = 2^256)
    assert(parameter_dictionary['r_inv_wasm']*(1<<29)%modulus==1) # Check r_inv_wasm = 2^{-29} mod p
    assert(pow(parameter_dictionary['cube_root']*pow(2,-256,modulus),3,modulus)==1) # Check cubic root

    return parameter_dictionary
```

Convert value from python to string for easy addition to bb's tests:
```python
def to_ff(value):
	print ("FF(uint256_t{"+','.join(["0x%xUL"%((value>>(i*64))&((1<<64)-1))for i in range(4)])+"})")
```
