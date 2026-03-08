# BatchedHonkTranslator: Joint Sumcheck Bug Analysis

## Setup

The `BatchedHonkTranslator` runs a **joint 17-round sumcheck** over:
- **Hiding kernel** (MegaZKFlavor): circuit size `2^n` where `n = hiding_log_n < 17`
- **Translator** (TranslatorFlavor): always `2^17` rows

The joint univariate at round `i` is:
```
U_joint_i(X) = U_H_i(X) + α^{K_H} · U_T_i(X) + L_i(X)
```
where `L_i` is the joint Libra masking contribution.

## The Bug: Sumcheck Consistency Failure at Round `n`

### What the prover currently sends

For rounds `i < n`:  `U_joint_i` includes the hiding contribution `U_H_i`.

For rounds `i >= n` (virtual): `U_H_i = 0` (hiding sends zero).

### Why this breaks sumcheck

The target sum evolves as `T_{i+1} = U_joint_i(u_i)`.

After the last real hiding round `i = n-1`:

```
T_n = U_joint_{n-1}(u_{n-1})
    = U_H_{n-1}(u_{n-1}) + α^{K_H}·U_T_{n-1}(u_{n-1}) + L_{n-1}(u_{n-1})
```

where `U_H_{n-1}(u_{n-1})` = **hiding FRV** = `pow_β_n(u) · (1-L_n)(u) · F_H_n(u)` (nonzero for a valid circuit).

At round `n`, the prover sends `U_joint_n = α^{K_H}·U_T_n + L_n`. The verifier checks:

```
U_joint_n(0) + U_joint_n(1) == T_n
```

By translator consistency: `U_T_n(0) + U_T_n(1) = U_T_{n-1}(u_{n-1})`.
By Libra consistency: `L_n(0) + L_n(1) = L_{n-1}(u_{n-1})`.

So the check becomes:

```
α^{K_H}·U_T_{n-1}(u_{n-1}) + L_{n-1}(u_{n-1}) == T_n
```

**The discrepancy is exactly `hiding_FRV_n = pow_β_n · (1-L_n) · F_H_n`.**

This matches the debug output: `diff = 0x15529f6d...` = hiding FRV value.

## What Should Happen: Virtual Contributions

### Correct 17-variable embedding

The hiding kernel's polynomial is zero-padded to 17 variables:
```
F_H^{17}(x_0,...,x_{16}) = (1-L_n)(x_0,...,x_{n-1}) · F_H(x_0,...,x_{n-1}) · τ_n(x_n,...,x_{16})
```
where `τ_n(x_n,...,x_{16}) = ∏_{k=n}^{16} (1-x_k)` is the indicator that all virtual dimensions are 0.

The joint 17-variable sum is:
```
∑_{x∈{0,1}^{17}} pow_β_{17}(x) · [(1-L_n)(x)·F_H^{17}(x) + α^{K_H}·F_T(x)]
```

The first term factors as:
```
∑_{x_0,...,x_{n-1}} pow_β_n(x_0,...,x_{n-1}) · (1-L_n)(x) · F_H(x)
  · [∑_{x_n,...,x_{16}} τ_n · pow_β_extra]
```

Since `∑_{x_k=0,1} (1-x_k)(1-x_k+x_k·β_k) = 1` for each virtual variable, the bracketed sum = 1.
Therefore the joint sum is identically 0 for a valid circuit. ✓

### Virtual round univariates (correct formula)

For virtual round `k ≥ n`, collapsing the sum over remaining variables (τ_n forces `x_{k+1}=...=x_{16}=0`):

```
U_H^k(X_k) = pow_β_k(u_0,...,u_{k-1}) · (1-X_k + X_k·β_k) · (1-X_k) · decay_k · RDP_n · F_H_n
```

where:
- `pow_β_k = ∏_{j=0}^{k-1}(1-u_j+u_j·β_j)` = gate sep accumulated through round k-1
- `decay_k = ∏_{j=n}^{k-1}(1-u_j)` = tau_n's contribution from previous virtual rounds (= 1 for k=n)
- `RDP_n = 1 - u_2·...·u_{n-1}` = n-variable row disabling poly eval
- `F_H_n = F_H(p_j(u_0,...,u_{n-1}))` = hiding relation value at n-variable challenge

**Consistency check:**
```
U_H^k(0) + U_H^k(1) = pow_β_k · 1 · decay_k · RDP_n · F_H_n
                     = pow_β_k · decay_k · RDP_n · F_H_n
```

And the previous evaluation:
```
U_H^{k-1}(u_{k-1}) = pow_β_{k-1} · (1-u_{k-1}+u_{k-1}·β_{k-1}) · (1-u_{k-1}) · decay_{k-1} · RDP_n · F_H_n
                    = pow_β_k · (1-u_{k-1}) · decay_{k-1} · RDP_n · F_H_n
                    = pow_β_k · decay_k · RDP_n · F_H_n  ✓
```

### Final target (after 17 rounds)

After all virtual rounds with challenges u_n,...,u_{16}:
```
U_H^{16}(u_{16}) = pow_β_{17} · ∏_{k=n}^{16}(1-u_k) · RDP_n · F_H_n
                 = pow_β_{17} · pcs_scale · RDP_n · F_H_n
```

where `pcs_scale = ∏_{k=n}^{16}(1-u_k)`.

## Required Fixes

### Fix 1: Prover — include virtual contributions

After the last real hiding round (`round_idx = n-1`), compute:
```cpp
FF hiding_frv_val = hiding_frv_round.compute_full_relation_purported_value(
    hiding_partial[0], hiding_params, hiding_gate_sep, hiding_alphas);
hiding_frv_val *= rdp_n_eval;  // multiply by RDP_n = 1 - u_2*...*u_{n-1}
```

For each virtual round `k ≥ n`, instead of `U_H = 0`, send:
```cpp
// U_H_virtual(X) = hiding_virtual_val · (1-X+X·β_k) · (1-X)
// where hiding_virtual_val is initialized to hiding_frv_val and decays each round
SumcheckRoundUnivariate U_H_virtual;
for (auto& eval : U_H_virtual.evaluations) {
    // evaluate (1-X+X*beta_k) * (1-X) at each sample point X
    FF X = ...;
    eval = hiding_virtual_val * (FF(1) - X + X * hiding_gate_sep.current_element()) * (FF(1) - X);
}
U_joint += U_H_virtual;
// After receiving round challenge u_k:
hiding_virtual_val *= (FF(1) - u_k + u_k * beta_k) * (FF(1) - u_k);
```

Note: the gate separator `hiding_gate_sep.partially_evaluate(round_challenge)` must also continue being called for virtual rounds (already done in the current code).

### Fix 2: Verifier — correct hiding FRV

**Current verifier FRV computation:**
```
frv_hiding = pow_β_n · RDP_n · F_H_n(unscaled_evals)
```
(using `hiding_final_gate_sep` with `hiding_padding` indicator = stops at round n)

**Correct verifier FRV:**
```
frv_hiding_correct = pow_β_{17} · RDP_n · F_H_n(unscaled_evals) · pcs_scale
```

where:
- `pow_β_{17}` = gate separator evaluated at ALL 17 challenges (use `final_gate_sep` without indicator stopping)
- `RDP_n = 1 - u_2·...·u_{n-1}` (n-variable, same as before)
- `pcs_scale = ∏_{k=n}^{16}(1-u_k)` = tau_n factor

**Verifier code fix:**
```cpp
// Use the FULL 17-variable gate separator for hiding FRV (same as translator)
SumcheckVerifierRound<HidingFlavor> hiding_frv_round;
FF frv_hiding = hiding_frv_round.compute_full_relation_purported_value(
    hiding_evals, hiding_relation_parameters, final_gate_sep, hiding_alphas);  // final_gate_sep = pow_β_{17}

// Apply n-variable RDP
FF rdp_eval = RowDisablingPolynomial<FF>::evaluate_at_challenge(
    joint_challenge, hiding_log_n);
frv_hiding *= rdp_eval;

// Apply pcs_scale = ∏_{k=n}^{16}(1-u_k)
FF pcs_scale_for_frv = FF(1);
for (size_t i = hiding_log_n; i < JOINT_LOG_N; i++) {
    pcs_scale_for_frv *= FF(1) - joint_challenge[i];
}
frv_hiding *= pcs_scale_for_frv;
```

Note: the existing `pcs_scale` computed later (for PCS claims) is the same value — can be reused.

## Why the RDP Doesn't Change

The "extended to 17 variables" RDP is:
```
RDP_{17}(u) = 1 - u_2·...·u_{n-1}·(1-u_n)·...·(1-u_{16})
```

This is NOT what we use. The correct formula uses `RDP_n · pcs_scale` as separate multiplicative factors in the FRV, not the combined 17-variable RDP applied once. This is because:

```
pow_β_{17} · (1-L_{17})(u) · F_H_{17}(u)
= pow_β_{17} · [1 - u_2·...·u_{n-1}·pcs_scale] · F_H_n · pcs_scale
= pow_β_{17} · pcs_scale · F_H_n - pow_β_{17} · u_2·...·u_{n-1} · pcs_scale² · F_H_n
```

but the correct FRV (from our virtual contribution derivation) is:
```
pow_β_{17} · RDP_n · F_H_n · pcs_scale
= pow_β_{17} · pcs_scale · F_H_n - pow_β_{17} · u_2·...·u_{n-1} · pcs_scale · F_H_n
```

These differ by a `pcs_scale` factor in the last term (`pcs_scale²` vs `pcs_scale`). So using `RDP_17` in the verifier would be incorrect; the correct form is `RDP_n · pcs_scale` as separate factors.

## Connection to PCS Scaling

The `pcs_scale = ∏_{k=n}^{16}(1-u_k)` already appears in the verifier for the PCS step:
```cpp
FF pcs_scale = FF(1);
for (size_t i = 0; i < JOINT_LOG_N; i++) {
    pcs_scale *= FF(1) - (FF(1) - hiding_padding[i]) * joint_challenge[i];
}
for (auto& eval : hiding_evals.get_all()) {
    eval *= pcs_scale;
}
```

This is the SAME `pcs_scale` needed for the FRV fix. We should compute it BEFORE the FRV check and reuse it for both:
1. FRV: multiply `frv_hiding` by `pcs_scale`
2. PCS: scale the hiding evals by `pcs_scale`

## Summary

| Component | Current | Correct |
|-----------|---------|---------|
| Prover virtual rounds | `U_H = 0` | `U_H^k(X) = val_k·(1-X+X·β_k)·(1-X)` |
| Verifier gate sep for hiding FRV | `pow_β_n` (n-variable) | `pow_β_{17}` (full 17-variable) |
| Verifier RDP for hiding FRV | `1 - u_2·...·u_{n-1}` | same (`RDP_n`) |
| Verifier pcs_scale for hiding FRV | not applied | multiply by `∏_{k=n}^{16}(1-u_k)` |
