#Legend

- Unique output: find two witnesses $w_1, w_2$ s.t. $C(x, w_1) = C(x, w_2) = 1, F(x) \ne y$.
- Unique input: find $w_1, w_2$ s.t $C(x_1, w_1) = C(x_2, w_2) = 1, F(x_1) = F(x_2)$(if it's supposed to be bijective)
- Unique witness: find $w_1, w_2$ s.t. $C(x, w_1) = C(x, w_2) = 1, w_1 \ne w_2$.
- Strict Equivalence: find $w_1, w_2$ s.t. $C(x, y) \ne F(x) = y$

- Unique random solution: take the random input and check one of the above properties with this particular input(for example helps to avoid binary decomposition)

- `nt` - did not terminate
- `k` - was killed by mainframe reboot, I guess
- `m` - memory

- `FF` - `FFTerm` type used
- `IM` - `FFIterm` type used
- `BV` - `BVTerm` type used
- `gb` - gb solver mode
- `gbs` - split-gb solver mode
- `dj` - disjunctive_bit mode

#Range Constraints Standard

`nvars = ngates = 2 + 2 * Bits`

Unique witness check: `FFTerm`

| Bits | gb             | Result   | gb dj          | Result   | gbs            | Result   | gbs dj         | Result   |
| ---- | -------------- | -------- | -------------- | -------- | -------------- | -------- | -------------- | -------- |
| 1    |  0 min  0 sec  | verified |  0 min  0 sec  | verified |  0 min  0 sec  | verified |  0 min  0 sec  | verified |
| 2    |  0 min  0 sec  | verified |  0 min  0 sec  | verified |  0 min  0 sec  | verified |  0 min  0 sec  | verified |
| 3    |  0 min  0 sec  | verified |  0 min  0 sec  | verified |  0 min  0 sec  | verified |                |          |
| 4    |  0 min  0 sec  | verified |  0 min  0 sec  | verified |  0 min  0 sec  | verified |                |          |
| 5    |  0 min  1 sec  | verified |  0 min  1 sec  | verified |  0 min  2 sec  | verified |                |          |
| 6    |  0 min  7 sec  | verified |  0 min 24 sec  | verified |  0 min 16 sec  | verified |                |          |
| 7    |  1 min  3 sec  | verified | 29 min  5 sec  | verified |  1 min 44 sec  | verified |                |          |
| 8    | 18 min 26 sec  | verified | > 5 h (nt m)   |          | 17 min 54 sec  | verified |                |          |

`BVTerm`

| Bits | gb             | Result   |
| ---- | -------------- | -------- |
| 1    |  0 min  0 sec  | verified |
| 2    |  0 min  0 sec  | verified |
| 3    |  0 min  0 sec  | verified |
| 4    |  0 min  0 sec  | verified |
| 5    |  0 min  0 sec  | verified |
| 6    |  0 min  0 sec  | verified |
| 7    |  0 min  0 sec  | verified |
| 8    |  0 min  0 sec  | verified |
| 9    |  0 min  2 sec  | verified |
| 10   |  0 min  9 sec  | verified |
| 11   |  0 min 38 sec  | verified |
| 12   |  2 min 36 sec  | verified |
| 13   |  2 min 36 sec  | verified |
| 14   | 15 min 23 sec  | verified |

#Uint32 Standard

| FF(gb)          | Unique witness | Unique output | Unique RS | Equivalence | Extra      | Extra desc    |
| --------------- | -------------- | ------------- | --------- | ----------- | ---------- | ------------- |
| Range           | > 7 days(nt k) | -             | -         | -           | ?          | ?             |
| Add             |                |               | -         | -           |            |               |
| And             |                |               |           | -           |            |               |
| Mul             |                |               | -         | _           |            |               |
| Or              |                |               |           |             |            |               |
| Rot             |                |               |           |             | > 2h(nt)   | ror(rol) = e  |
| Shift           |                |               |           |             |            |               |
| Xor             | > 7 days(nt k) | > 7 days(nt k)| -         | _           |            |               |

| FF(sgb dj)      | Unique witness | Unique output | Unique RS | Equivalence | Extra      | Extra desc    |
| --------------- | -------------- | ------------- | --------- | ----------- | ---------- | ------------- |
| Range           | > 25 hs(nt k)  | -             | -         | -           | ?          | ?             |

### Found something

TODO(alex): unique input?

| FF(gb)                 | Unique witness | Result                | Unique output | Result        | Unique RS   | Equivalence | Extra | Extra desc |
| ---------------------- | -------------- | --------------------- | ------------- | ------------- | ----------- | ----------- | ----- | ---------- |
| Add(overflow)          |   0 min  1 sec |  0+0 = -2^33          |  0 min  1 sec |  0+0 = -2^32  | -           | -           |       |            |
| Xor(quads)             |  10 min 42 sec |  0^0 = 1              | 29 min 12 sec |  0^0 = 1      | -           | -           |       |            |
| And(quads)             |  10 min 38 sec |  0&0 = 1              | 29 min 04 sec |  0&0 = 1      | -           | -           |       |            |
| Or(quads, apparently*) |  11 min 31 sec |  0\|0 = +-2^32        | 31 min 18 sec |  0\|0 = 2^32  |             |             |       |            |
| Xor(copy)              |   6 min 22 sec |  0^0 = 1              |  0 min 18 sec |  0^0 = 1      |             |             |       |            |
| And(copy)              |   5 min 42 sec |  0&0 = 0, out_acc = 1 |  0 min 23 sec |  0&0 = 1      |             |             |       |            |
| Or(copy, apparently*)  |   0 min 52 sec |  0\|0 = -2^32         |  1 min 11 sec |  0\|0 = -2^32 |             |             |       |            |

\* \- Didn't check before patch

| FF(gbs)        | Unique witness | Result      | Unique output  | Result          | Unique RS | Equivalence | Extra | Extra desc |
| -------------- | -------------- | ----------- | -------------- | --------------  | --------- | ----------- | ----- | ---------- |
| Add(overflow)  |  13 min 54 sec | 0+0 = -2^33 |  13 min 39 sec |  0+0 = -2^32    |           |             |       |            |
| Xor(quads)     | 400 min 57 sec | 0^0 = 1     | 353 min 40 sec |  0^0 = 1        |           |             |       |            |
| Xor(copy)      | > 24 h(nt k)   | -           | > 25 h(nt k)   |  -              |           |             |       |            |

| FF(gbs + dj)  | Unique witness  | Result  | Unique output | Result  | Unique RS | Equivalence | Extra | Extra desc |
| ------------- | --------------- | ------- | ------------- | ------- | --------- | ----------- | ----- | ---------- |
| Add(overflow) |                 |         |               |         |           |             |       |            |
| Xor(quads)    | 110 min 39 sec  | 0^0 = 1 | 124 min 2 sec | 0^0 = 1 |           |             |       |            |
| Xor(copy)     | > 14 h(nt k)    | -       | > 14 h(nt k)  | -       |           |             |       |            |

#SHA256 Standard

#BIGFIELD