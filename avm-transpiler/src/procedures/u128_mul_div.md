# U128 multiply/divide

`mul_div(a, b, d)` computes `floor(a*b/d)` from the full 256-bit product of
U128 operands. It rejects `d == 0` and quotients that exceed U128.

Let `p` be the field modulus, `B = 2^128`, `K = 2^64`, and
`N = a*b = hi*B + lo`. Since `hi < B < p`, the field calculation
`((N mod p) - lo)/B` recovers `hi` exactly. The check
`hi < d` rejects both zero denominators and quotient overflow.

For `d < K`, two native U128 divisions produce the quotient.

For `d >= K`, set `f = floor((B-1)/d)` and scale numerator and denominator
by `f`. The scaled denominator `D = d*f` satisfies `B/2 <= D < B`: if
`D < B/2`, then `D+d <= 2*D < B`, contradicting the choice of `f`.
Since `N < B*d`, the scaled numerator satisfies `N*f < B*D < B^2`.
The same field calculation therefore recovers its high limb exactly, even
when `N*f >= p`. Scaling is skipped when `f == 1`.

Write `D = v*K + w`, where `v >= K/2` and `w < K`. Each division stage has
numerator `H*K + L`, with `H < D` and `L < K`. Its quotient digit `Q` is
below `K`. The estimate `E = floor(H/v)` satisfies `Q <= E <= Q+2`:

- `H >= Q*v`, so `E >= Q`.
- If `E >= Q+3`, then:

  ```text
  (Q+3)*v*K <= H*K <= H*K+L < (Q+1)*(v*K+w)
  2*v*K < (Q+1)*w <= K*(K-1) < K^2
  ```

  This contradicts `v >= K/2`.

At most two decrements therefore correct each estimate. The compared products
are below `(K+2)*B < 2^193 < p`, so field comparisons are exact. The first
stage's remainder is below `D`, fits U128, and feeds the second stage. The
second stage needs no product update after its last decrement.

The high limb and first remainder already have field representations; reusing
those values saves two casts.
