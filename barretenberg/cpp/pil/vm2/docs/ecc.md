---
tag: AVM circuit docs
subsystem: cryptography
---

# ECC Add Subtrace

[PIL Reference Implementation](https://github.com/AztecProtocol/aztec-packages/blob/master/barretenberg/cpp/pil/vm2/ecc.pil)

## Purpose
This subtrace computes point addition over the Grumpkin curve. Given two points, P & Q, this trace computes R = P + Q.

## Assumptions
This subtrace has two assumptions:
1) The inputs P & Q are affine points on the Grumpkin curve (note that the Point at Infinity is considered on the curve).
2) The Point at Infinity is represented by the affine coordinates (0, 0) and a boolean flag set to true 

## Background
1) The Grumpkin Curve Eqn in Short Weierstrass (SW) form is $Y^2 = X^3 − 17$.
2) Grumpkin forms a 2-cycle with BN254, `field` used in the subtrace refers to the BN254 scalar / Grumpkin base field
3) SW addition rules
    1) $P + O = O + P = P$
    2) $p_x == q_x$ and $p_y == -q_y$ ==> $Q == -P$ ==> $P + (-P) = O$
    3) $Q \neq -P$, $r_x = \lambda^2 - p_x - q_x$, $r_y = \lambda * (p_x - r_x) - p_y$

## Usage
This is a non-memory aware subtrace, so it accepts points as input and outputs a single point.
The input points MUST conform to the assumptions listed above, the output point is guaranteed to confrom by this subtrace.
```pil
sel_caller {
    p_x, p_y, p_is_inf, // Point P
    q_x, q_y, q_is_inf, // Point Q
    r_x, r_y, r_is_inf // Point R
} in ecc.sel {
    ecc.p_x, ecc.p_y, ecc.p_is_inf, // Point P
    ecc.q_x, ecc.q_y, ecc.q_is_inf, // Point Q
    ecc.r_x, ecc.r_y, ecc.r_is_inf // Point R
};
```

## Interactions
| Subtrace      | Interaction Type | Constraint Name        |
| ------------- | ---------------- |------------------------|
| ecc_mem.pil   | Lookup           | \#\[INPUT\_OUTPUT\_ECC\_ADD\] |
| scalar_mul.pil | Lookup          | \#\[DOUBLE\] / \#\[ADD\]  |
| address_derivation.pil | Lookup  | \#\[ADDRESS_ECADD\]        |

// Diagram

## High Level Approach To Constraining
The notation will be as follows:
P + Q = R where:
- P = (p_x, p_y, p_is_inf),
- Q = (q_x, q_y, q_is_inf),
- R = (r_x, r_y, r_is_inf),

where the coordinates satisfy: $Y^2 = X^3 - 17$ (unless is_inf is true).

The point at infinity, O, does not exist on the curve (a property of SW curves). We represent it as: O = (0, 0, true).
A reminder that this is NOT enforced here for inputs, see ecc_mem.pil for example of constraining.

### Set up columns
Besides the input point columns, we introduce columns based on the operation we need to perform.
1) The main `sel` in this subtrace is constrained by `double_op || add_op || INVERSE_PRED` (`INVERSE_PRED` defined later)
2) `double_op` indicates if we are performing point doubling
3) `add_op` indicates if we performing point addition

### Check input coordinates
The coordinates of P & Q will decide which operation we will perform
1) Check if p_x == q_x (`x_match`)
2) Check if p_y == q_y (`y_match`)

### Handle Edge Cases that result in infinity
There are two scenarios where the result is infinity: Q = -P (and vice versa) or P == Q == O.
1) Set `INVERSE_PRED = x_match * !y_match`, if `INVERSE_PRED = 1` ==> R = O
2) Use the boolean flags, `p_is_inf` and `q_is_inf` to check `BOTH_INF` and `BOTH_NOT_INF`
3) The `result_infinty == true` IFF 
    a) `INVERSE_PRED && BOTH_NOT_INF` ==> Q = -P ==> P + (-P) = O, or
    b) `BOTH_INF` ==> O + O = O

### Choose operation to perform for successful SW addition
If P == Q, but the above edge conditions are not met then we perform point doubling. Otherwise, we do point addition
1) Activate `double_op` IFF `x_match` == `y_match` == true, otherwise `add_op` is active
2) Compute `lambda` based on if this is an `add_op` or `double_op`. If `INVERSE_PRED = 1`, `lambda = 0`
3) Compute `r_x = lambda * lambda - p_x - q_x` and `r_y = lambda * (p_x - r_x) -p_y`


### Assigning the result
Now we assign the result to the output point based on our final 3 cases using the `use_computed_result` selector.
The selector is computed as `use_computed_result = sel * BOTH_NON_INF * (1 - INVERSE_PRED);`
1) `use_computed_result == true`:
    Neither point is infinity and !result_infinity, the result is (`r_x`, `r_y`, false) computed above
2) `use_computed_result == false & !result_infinity`:
    Either P or Q is infinity but not both, the result is the non-infinity point
3) `use_computed_result == false & result_infinity`:
    The result is the infinity point, (0, 0, true)

# Appendix
## Subtrace Design
### Committed Columns
| Name | Type | Description |
|------|------|-------------|
| `sel` | boolean | Selector with which other subtraces will reference |
| `double_op` | boolean | Doubling operation flag |
| `add_op` | boolean | Add operation flag |
| `p_x` | field | Point P x coordinate in affine form |
| `p_y` | field | Point P y coordinate in affine form |
| `p_is_inf` | boolean | Point P is infinity flag |
| `q_x` | field | Point Q x coordinate in affine form |
| `q_y` | field | Point Q y coordinate in affine form |
| `q_is_inf` | boolean | Point Q is infinity flag |
| `r_x` | field | Resulting Point R x coordinate in affine form |
| `r_y` | field | Resulting Point R y coordinate in affine form |
| `r_is_inf` | boolean | Resulting Point R is infinity flag |
| `x_match` | boolean | Check x coordinates match (p_x == q_x) |
| `inv_x_diff` | field | Inverse of x difference |
| `y_match` | boolean | Check y coordinates match (p_y == q_y) |
| `inv_y_diff` | field | Inverse of y difference |
| `result_infinity` | field | Check if the result should be infinity |
| `inv_2_p_y` | field | Inverse of (2 * p_y) for lambda calculation in doubling |
| `lambda` | field | Lambda value (committed to minimize degree of subsequent relations) |
| `use_computed_result` | field | Intermediate result to not increase degree of relations beyond 6 |

### Aliased Columns

| Name | Definition | Description |
|------|------------|-------------|
| `INFINITY_X` | `0` | X coordinate of infinity point representation |
| `INFINITY_Y` | `0` | Y coordinate of infinity point representation |
| `X_DIFF` | `q_x - p_x` | Difference of x coordinates |
| `Y_DIFF` | `q_y - p_y` | Difference of y coordinates |
| `INFINITY_PRED` | `x_match * (1 - y_match)` | If x matches but y does not (implies p_y = -q_y), result is point at infinity |
| `BOTH_INF` | `p_is_inf * q_is_inf` | Both input points are infinity |
| `BOTH_NON_INF` | `(1 - p_is_inf) * (1 - q_is_inf)` | Both input points are not infinity |
| `COMPUTED_R_X` | `lambda * lambda - p_x - q_x` | Computed x coordinate of result |
| `COMPUTED_R_Y` | `lambda * (p_x - r_x) - p_y` | Computed y coordinate of result |
| `EITHER_INF` | `p_is_inf + q_is_inf - 2 * BOTH_INF` | Either p or q is infinity but not both |

