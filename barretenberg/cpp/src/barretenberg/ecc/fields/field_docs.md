Prime field documentation    {#field_docs}
===
Barretenberg has its own implementation of finite field arithmetic. The implementation targets 254 (bn254, grumpkin) and 256-bit (secp256k1, secp256r1) fields. Internally the field is representate as a little-endian C-array of 4 uint64_t limbs.

## Field arithmetic
We use Montgomery reduction to speed up field multiplication. For an original element  \f$ a ∈ F_p\f$ the element is represented internally as \f$ a⋅R\ mod\ p\f$, where \f$R = 2^k\ mod\ p\f$. The chosen \f$k\f$ depends on the build configurations. For builds that don't support the uint128_t type, for example, for WASM build, \f$k=29⋅9=261\f$, while for standard builds the value of \f$k=64⋅4=256\f$. The idea behind this form is to avoid heavy division modulo \f$p\f$. To compute a representative of element \f$c = a⋅b\ mod\ p\f$ we compute \f$c⋅R = (a⋅R)⋅(b⋅R) / R\ mod\ p\f$, but we use an efficient division trick to avoid straight modular division (explanation for the 4⋅64 case):
1. First, we compute the value \f$c_r=c⋅R\f$ in integers and get a value with 8 64-bit limbs
2. Then we take the lowest limb of \f$c_r\f$ (\f$c_r[0]\f$) and multiply it by a special value \f$r_{inv} = -1 ⋅ p^{-1}\ mod\  2^{64}\f$, getting \f$k = r_{inv}⋅ c_r[0]\ mod\ 2^{64}\f$
3. Next we update \f$c_r\f$ in integers by adding a value \f$k⋅p\f$: \f$c_r += k⋅p\f$. You might notice that the value of \f$c_r\ mod\ p\f$ hasn't changes, since we've added a multiple of the modulus. A the same time, if we look at the expression modulo \f$2^{64}\f$: \f$c_r + k⋅p = c_r + c_r⋅r_{inv}⋅p = c_r + c_r⋅ (-1)⋅p^{-1}⋅p = c_r - c_r = 0\ mod\ 2^{64}\f$
4. We perform the same operation for \f$c_r[1]\f$, but instead of adding \f$k⋅p\f$, we add \f$2^{64}⋅k⋅p\f$. In the implementation, instead of adding $k⋅ p$ to limbs of $c_r$ starting with zero, we just start with limb number 1. This ensures that \f$c_r[1]=0\f$. We then perform the same operation for 2 more limbs.


This is my field documentation \f$\frac{1}{2}= 0\f$ alalalalalalala

## Helpful python snippets

Parse field parameters
```python
print(help)
```