# TripleIPA and Batched Chonk Verification

Implementation references:

- `barretenberg/cpp/src/barretenberg/commitment_schemes/triple_ipa/triple_ipa.hpp`
- `barretenberg/cpp/src/barretenberg/commitment_schemes/ipa/ipa.hpp`
- `barretenberg/cpp/src/barretenberg/commitment_schemes/triple_ipa/triple_ipa_claim.hpp`
- `barretenberg/cpp/src/barretenberg/chonk/chonk_verifier.{hpp,cpp}`
- `barretenberg/cpp/src/barretenberg/chonk/chonk_batch_verifier.{hpp,cpp}`

Notation: TripleIPA reduces three structured opening claims to one ordinary IPA claim. The curve is Grumpkin, $\mathbb{F}$ is its scalar field, and $n = 2^k$ with $k = \texttt{log\_poly\_length}$; ECCVM instantiates $n = \texttt{ECCVM\_FIXED\_SIZE}$. The SRS is $\vec{G} = (G_0,\dots,G_{n-1})$. For a coefficient vector $a \in \mathbb{F}^n$, $\langle a, \vec{G}\rangle = \sum_i a_i G_i$ and $\langle a, b\rangle = \sum_i a_i b_i$.

---

## 1. The three opening claims

The ECCVM PCS round produces three opening families against length-$n$ coefficient vectors. TripleIPA treats the three batched witnesses $F$, $F'$, and $P$ as independent inputs; the shifted claim is only the inner product $\langle F', b_{\mathrm{sh}}(\vec{u})\rangle$ against the non-cyclic shifted-eq tensor. It does not assert that $F'$ is the shift of $F$.

| Kind | Tensor vector $b$ | Inner product realises |
|---|---|---|
| $\mathsf{Eq}$ | $b_{\mathrm{eq}}(\vec{u})_i = \mathrm{eq}(\vec{u}, \mathrm{bits}(i))$ | multilinear evaluation $f(\vec{u})$ |
| $\mathsf{Shift}$ | $b_{\mathrm{sh}}(\vec{u})_0 = 0,\; b_{\mathrm{sh}}(\vec{u})_i = b_{\mathrm{eq}}(\vec{u})_{i-1}\ (1\le i<n)$; omits $b_{\mathrm{eq}}(\vec{u})_{n-1}=\prod_i u_i$ | $\langle g,b_{\mathrm{sh}}(\vec{u})\rangle$ (non-cyclic shift) |
| $\mathsf{Pow}$ | $b_{\mathrm{pow}}(x)_i = x^i$ | univariate evaluation $P(x)$ |

Concretely (`triple_ipa.hpp`):

- **Unshifted batch**: all unshifted ECCVM witness polynomials $f_0,\dots,f_{m-1}$ with commitments $[f_i]$, sumcheck evaluations $v_i = f_i(\vec{u})$ at the sumcheck challenge $\vec{u} \in \mathbb{F}^k$, and batching scalars $\rho^0,\dots,\rho^{m-1}$ ($\rho$ is squeezed by the ECCVM verifier *before* TripleIPA starts; both sides carry the powers in the claim).
- **Shifted batch**: to-be-shifted ECCVM source polynomials $g_0,\dots,g_{t-1}$ with commitments $[g_j]$, shifted-eq inner products $\tilde v_j = \langle g_j,b_{\mathrm{sh}}(\vec{u})\rangle$, and the *continued* powers $\rho^{m},\dots,\rho^{m+t-1}$. These sources are selected by the ECCVM claim data; TripleIPA does not prove or assume that this batch is a shift of the unshifted batch $F$.
- **Univariate claim**: the Shplonk-reduced univariate witness $P$ with commitment $[P]$, opened at the Shplonk challenge $x$ with evaluation $P(x)$. This single claim batches the Libra, translation, sumcheck-round, and pow-mask univariate openings before TripleIPA starts, and is independent of the multilinear witnesses $F$ and $F'$.

## 2. Stage 1 — $\rho$-batching into three claims

Both prover and verifier collapse each family with the supplied $\rho$-powers:

$$
F = \sum_{i<m} \rho^i f_i, \qquad
[F] = \sum_{i<m} \rho^i [f_i], \qquad
v_F = \sum_{i<m} \rho^i v_i,
$$

$$
F' = \sum_{j<t} \rho^{m+j} g_j, \qquad
[F'] = \sum_{j<t} \rho^{m+j} [g_j], \qquad
v_{F'} = \sum_{j<t} \rho^{m+j} \tilde v_j,
$$

leaving the three claims

$$
\langle F, b_{\mathrm{eq}}(\vec{u})\rangle = v_F, \qquad
\langle F', b_{\mathrm{sh}}(\vec{u})\rangle = v_{F'}, \qquad
\langle P, b_{\mathrm{pow}}(x)\rangle = P(x).
$$

Each claim $([\,\cdot\,],\ \text{evaluation},\ \text{tensor metadata})$ is absorbed into the Fiat–Shamir hash buffer under labels `TripleIPA:F`, `TripleIPA:F_shift`, `TripleIPA:P`. In code, the verifier's symbolic representation of the combined tensor (the weighted eq / shifted-eq / pow vectors above) is `IpaOpeningVector` (with the shifted-eq and eq folds in `ShiftedEqPolynomial`).

## 3. Stage 2 — reduction to a single IPA claim

This reduction randomizes both sides of the inner product: the witness side becomes
$A=\zeta_1F+\zeta_2F'+\zeta_3P$ and the tensor side becomes
$b=\zeta_1b_{\mathrm{eq}}+\zeta_2b_{\mathrm{sh}}+\zeta_3b_{\mathrm{pow}}$. To run one IPA, the verifier needs the
combined evaluation $\langle A,b\rangle$. Expanding this inner product gives terms where each witness is paired
with its original tensor,
$\langle F,b_{\mathrm{eq}}\rangle$, $\langle F',b_{\mathrm{sh}}\rangle$, and
$\langle P,b_{\mathrm{pow}}\rangle$, which are already known from the three opening claims. It also gives mixed
terms such as $\langle F,b_{\mathrm{sh}}\rangle$ and
$\langle F',b_{\mathrm{eq}}\rangle$, which are not determined by the original claims. The prover therefore sends
enough cross information before $\zeta$ is sampled for the verifier to compute the combined evaluation.

To reduce three claims with *different* tensors to one IPA claim, the prover sends the three **cross-sums**

$$
c_{F,\mathrm{sh}} = \langle F, b_{\mathrm{sh}}\rangle + \langle F', b_{\mathrm{eq}}\rangle, \qquad
c_{F,P} = \langle F, b_{\mathrm{pow}}\rangle + \langle P, b_{\mathrm{eq}}\rangle, \qquad
c_{\mathrm{sh},P} = \langle F', b_{\mathrm{pow}}\rangle + \langle P, b_{\mathrm{sh}}\rangle
$$

(labels `TripleIPA:cross_*`). The prover computes these directly from the already-built batched witnesses $F, F'$. The term $\langle F', b_{\mathrm{eq}}\rangle$ is obtained from the ordinary eq evaluations of the same source polynomials $g_j$, namely $\sum_j \rho^{m+j} g_j(\vec{u})$, when those evaluations are already present in the ECCVM sumcheck claim data.

The verifier squeezes reduction challenges $\zeta = (\zeta_1, \zeta_2, \zeta_3)$ (`TripleIPA:zeta_F`, `TripleIPA:zeta_shift`, `TripleIPA:zeta_P`) and both sides form the **combined claim**

$$
A = \zeta_1 F + \zeta_2 F' + \zeta_3 P, \qquad
[A] = \zeta_1 [F] + \zeta_2 [F'] + \zeta_3 [P],
$$

$$
b = \zeta_1\, b_{\mathrm{eq}}(\vec{u}) + \zeta_2\, b_{\mathrm{sh}}(\vec{u}) + \zeta_3\, b_{\mathrm{pow}}(x)
\quad\text{(a 3-term symbolic tensor, never materialised by the verifier)},
$$

$$
v = \zeta_1^2 v_F + \zeta_2^2 v_{F'} + \zeta_3^2 P(x)
  + \zeta_1\zeta_2\, c_{F,\mathrm{sh}} + \zeta_1\zeta_3\, c_{F,P} + \zeta_2\zeta_3\, c_{\mathrm{sh},P},
$$

so that by bilinearity $\langle A, b\rangle = v$. The combined claim is also absorbed (`TripleIPA:combined`), then a single IPA opening is run for $\langle A, b \rangle = v$.

Soundness of the reduction rests on the cross-sums being committed *before* $\zeta$ is squeezed: $\langle A,b\rangle$ is a quadratic form in $\zeta$, so any incorrect diagonal or cross coefficient is caught by the random reduction challenge except with Schwartz-Zippel probability.

### Knowledge soundness sketch

In the IOP + AGM setting, import the standard IPA-reduce knowledge-soundness statement: for public $b$, commitment $C$, and value $v$, an accepting IPA transcript whose reduced instance is discharged yields either an SRS collision or a vector $a$ with $C=\langle a,\vec G\rangle$ and $\langle a,b\rangle=v$ (BCS21 / Eagen-Gabizon).

AGM gives SRS-coordinate witnesses $F,F',P$ for the public commitments $[F],[F'],[P]$, unless the extractor has already found an SRS collision. For sampled $\vec\zeta$, the verifier constructs

$$
C_{\vec\zeta}=\zeta_1[F]+\zeta_2[F']+\zeta_3[P]=\langle \zeta_1F+\zeta_2F'+\zeta_3P,\vec G\rangle.
$$

The discharged IPA therefore proves

$$
\langle \zeta_1F+\zeta_2F'+\zeta_3P,
        \zeta_1b_{\mathrm{eq}}+\zeta_2b_{\mathrm{sh}}+\zeta_3b_{\mathrm{pow}}\rangle
= Q_{\mathrm{claim}}(\vec\zeta),
$$

where $Q_{\mathrm{claim}}$ is the quadratic built from the three claimed evaluations and the three sent cross-sums. Expanding the left side gives the true quadratic $Q_{\mathrm{true}}(\vec\zeta)$ with coefficients

$$
\langle F,b_{\mathrm{eq}}\rangle,\quad
\langle F',b_{\mathrm{sh}}\rangle,\quad
\langle P,b_{\mathrm{pow}}\rangle,\quad
\langle F,b_{\mathrm{sh}}\rangle+\langle F',b_{\mathrm{eq}}\rangle,\quad
\langle F,b_{\mathrm{pow}}\rangle+\langle P,b_{\mathrm{eq}}\rangle,\quad
\langle F',b_{\mathrm{pow}}\rangle+\langle P,b_{\mathrm{sh}}\rangle.
$$

Since the cross-sums are fixed before $\vec\zeta$ is sampled, a wrong coefficient makes $Q_{\mathrm{true}}-Q_{\mathrm{claim}}$ a non-zero degree-2 polynomial, which vanishes at the random $\vec\zeta$ with probability at most $2/|\mathbb F|$. Thus the extracted $F,F',P$ satisfy the three batched opening claims, except for the imported IPA error and the stated field-size terms. This argument is for the already rho-batched TripleIPA claim; upstream rho batching is standard and separate. Full native verification must also discharge the deferred $G_{\mathrm{fold}}$ SRS check (§5, §7).

#### Shiftable polynomials: no constant-term constraint

TripleIPA does not require $F'_0 = 0$ for a to-be-shifted polynomial, and — unlike Gemini — provides no mechanism to enforce it (the non-cyclic shift is structural in $b_{\mathrm{sh}}$, which never reads $F'_0$). Consequently, if a protocol needs that constraint, it must be imposed explicitly, via a relation or an extra opening.

### Zero knowledge

TripleIPA starts after the ECCVM/Shplonk layers have already produced the three batched inputs above. The ZK input facts used here are:

1. the unshifted multilinear batch contains a dense random mask $r$ with nonzero batching weight,
   $$ F=F_{\mathrm{real}}+r; $$
2. the univariate Shplonk batch contains an independent small random polynomial `pow_mask`, so the pow-tensor input has the form
   $$ P=P_{\mathrm{real}}+P_{\mathrm{mask}}. $$

The dense mask gives the standard hiding argument for the combined IPA transcript: for nonzero $\zeta_1$, the opened vector

$$
A=\zeta_1F+\zeta_2F'+\zeta_3P
 = A_{\mathrm{real}}+\zeta_1r+\zeta_3P_{\mathrm{mask}}
$$

contains a full-size random vector.

The only extra TripleIPA messages to account for are the three cross-sums sent before $\vec\zeta$ is sampled. The first two contain an inner product against $F$ and are therefore blinded by the dense mask:

$$
c_{F,\mathrm{sh}}=
\underbrace{\langle r,b_{\mathrm{sh}}\rangle}_{\text{dense mask}}
+\langle F_{\mathrm{real}},b_{\mathrm{sh}}\rangle
+\langle F',b_{\mathrm{eq}}\rangle,
$$

$$
c_{F,P}=
\underbrace{\langle r,b_{\mathrm{pow}}\rangle}_{r(x)}
+\langle F_{\mathrm{real}},b_{\mathrm{pow}}\rangle
+\langle P,b_{\mathrm{eq}}\rangle.
$$

The remaining cross-sum has no $F$ term, so it is the only place where the pow-side mask matters:

$$
c_{\mathrm{sh},P}=\langle F',b_{\mathrm{pow}}\rangle
+\langle P_{\mathrm{real}},b_{\mathrm{sh}}\rangle
+\underbrace{\langle P_{\mathrm{mask}},b_{\mathrm{sh}}\rangle}_{\text{pow mask}}.
$$

Thus the dense multilinear mask hides the IPA transcript and the two cross-sums involving $F$, while the independent univariate mask folded into $P$ hides the single cross-sum that does not involve $F$.

## 4. Stage 3 — the IPA opening for $\langle A, b\rangle = v$

Standard log-round inner-product argument with an auxiliary generator. The verifier squeezes $\gamma$ (`IPA:generator_challenge`, must be nonzero) and sets $U = \gamma \cdot G_{\mathrm{one}}$. Define

$$
C' = [A] + v\cdot U .
$$

With $a^{(0)} = A$, $b^{(0)} = b$, $\vec{G}^{(0)} = \vec{G}$, for rounds $r = 0,\dots,k-1$ with half-size $d = n/2^{r+1}$, the prover sends

$$
L_r = \langle a^{(r)}_{\mathrm{lo}},\, \vec{G}^{(r)}_{\mathrm{hi}}\rangle + \langle a^{(r)}_{\mathrm{lo}},\, b^{(r)}_{\mathrm{hi}}\rangle\, U,
\qquad
R_r = \langle a^{(r)}_{\mathrm{hi}},\, \vec{G}^{(r)}_{\mathrm{lo}}\rangle + \langle a^{(r)}_{\mathrm{hi}},\, b^{(r)}_{\mathrm{lo}}\rangle\, U
$$

(`IPA:L_i` / `IPA:R_i`, indexed downward), receives the IPA round challenge $\alpha_r \ne 0$, and folds

$$
a^{(r+1)} = a^{(r)}_{\mathrm{lo}} + \alpha_r\, a^{(r)}_{\mathrm{hi}}, \qquad
b^{(r+1)} = b^{(r)}_{\mathrm{lo}} + \alpha_r^{-1}\, b^{(r)}_{\mathrm{hi}}, \qquad
\vec{G}^{(r+1)} = \vec{G}^{(r)}_{\mathrm{lo}} + \alpha_r^{-1}\, \vec{G}^{(r)}_{\mathrm{hi}} .
$$

After $k$ rounds the prover sends the fully folded generator and scalar:

$$
\texttt{IPA:G\_0} = G_{\mathrm{fold}} \in \mathbb{G}, \qquad \texttt{IPA:a\_0} = a_{\mathrm{fold}} \in \mathbb{F}.
$$

### 4.1 Verifier computation

The verifier (`read_transcript_data`) computes, with $s_i = \alpha_{k-1-i}^{-1}$:

$$
C_0 = C' + \sum_{r<k}\bigl(\alpha_r^{-1} L_r + \alpha_r R_r\bigr)
\qquad \text{(one MSM of size } 2k\text{)},
$$

and the folded tensor value $b_{\mathrm{fold}} = b^{(k)}$ **in closed form**, $O(k)$ field operations per structured term, never touching an $n$-vector (`IpaOpeningVector::evaluate_folded`):

- $\mathsf{Eq}$ term at point $\vec{u}$:
  $$ b^{\mathrm{eq}}_{\mathrm{fold}} = \prod_{i<k} \bigl((1-\vec{u}_i) + \vec{u}_i\, s_i\bigr). $$
- $\mathsf{Pow}$ term at challenge $x$ — the IPA *challenge polynomial* evaluation (`IPA::evaluate_challenge_poly`):
  $$ b^{\mathrm{pow}}_{\mathrm{fold}} = h_{\vec{\alpha}}(x), \qquad h_{\vec{\alpha}}(X) := \prod_{i=1}^{k} \bigl(1 + \alpha_{k-i}^{-1} X^{2^{i-1}}\bigr). $$
- $\mathsf{Shift}$ term at point $\vec{u}$ (prefix/suffix product expansion over the lowest set bit $\ell$ of the shifted index):
  $$ b^{\mathrm{sh}}_{\mathrm{fold}} = \sum_{\ell<k} \Bigl(\prod_{i<\ell} \vec{u}_i\Bigr)\,(1-\vec{u}_\ell)\, s_\ell \prod_{i>\ell}\bigl((1-\vec{u}_i)+\vec{u}_i\,s_i\bigr). $$

The combined $b_{\mathrm{fold}} = \zeta_1 b^{\mathrm{eq}}_{\mathrm{fold}} + \zeta_2 b^{\mathrm{sh}}_{\mathrm{fold}} + \zeta_3 b^{\mathrm{pow}}_{\mathrm{fold}}$.

### 4.2 The two verification checks

The full statement splits into a cheap and an expensive half:

1. **Group relation (cheap, $O(k)$ MSM)** — using the *prover-claimed* $G_{\mathrm{fold}}$:
   $$ C_0 \stackrel{?}{=} a_{\mathrm{fold}}\, G_{\mathrm{fold}} + a_{\mathrm{fold}}\, b_{\mathrm{fold}}\, U. $$
2. **SRS certification of $G_{\mathrm{fold}}$ (expensive, one size-$n$ MSM)** — the folded generator must equal the inner product of the challenge polynomial's coefficients with the SRS:
   $$ G_{\mathrm{fold}} \stackrel{?}{=} \bigl\langle\, \mathrm{coeffs}\bigl(h_{\vec{\alpha}}(X)\bigr),\ \vec{G} \,\bigr\rangle, $$
   where $h_{\vec{\alpha}}$ is built by `IPA::construct_poly_from_u_challenges_inv` from $(\alpha_0^{-1},\dots,\alpha_{k-1}^{-1})$.

## 5. Deferral: the `NativeAccumulator`

`reduce_to_accumulator` performs everything up to and including check (1) and returns

```
NativeAccumulator {
    u_challenges_inv   : (u_0^{-1}, ..., u_{k-1}^{-1})   // defines h_u(X)
    claimed_commitment : G_fold                          // prover-claimed
    relation_succeeded : bool                            // result of check (1)
}
```

deferring check (2), the only size-$n$ MSM. At the generic TripleIPA layer, `verify_accumulator(vk, acc)` and `batch_verify_accumulators(vk, accs)` discharge these accumulators against an explicit commitment key. ECCVM fixes the Grumpkin SRS prefix, so production callers use `ECCVMVerifier::verify_accumulator(acc)` and `ECCVMVerifier::batch_verify_accumulators(accs)` instead; Chonk and bbapi never materialise the key or name the underlying scheme.

The recursive (stdlib) verifier instead emits `(round_challenges_inv, G_fold, relation_ok)` as an in-circuit `IpaAccumulator` after constraining check (1) via one `batch_mul` of size $2k+2$:
$$
\sum_r \bigl(\alpha_r^{-1} L_r + \alpha_r R_r\bigr) - a_{\mathrm{fold}} G_{\mathrm{fold}} - \gamma\,\bigl(a_{\mathrm{fold}} b_{\mathrm{fold}} - v\bigr) G_{\mathrm{one}} \stackrel{!}{=} -[A].
$$

## 6. Where this sits in Chonk verification

`ChonkVerifier<false>::reduce_to_triple_ipa_opening(proof)` runs the shared-transcript pipeline up to, but not including, TripleIPA accumulator discharge:

1. **MegaZK Oink** of the hiding kernel → public inputs → `HidingKernelIO`; check the IVC-accumulated pairing points.
2. **Databus consistency**: kernel calldata commitment $=$ kernel return-data commitment.
3. **Merge** verification → pairing check (done immediately, natively).
4. **ECCVM** sumcheck verification → reconstructs the `TripleIpaClaim` of §1, pairs it with the TripleIPA transcript bytes as a deferred `triple_ipa_opening`, and emits translator input data.
5. **Translator** Oink + joint sumcheck + joint PCS → batched pairing check.

It returns `TripleIpaReductionResult { all_checks_passed, triple_ipa_opening }`. Single-proof native verification then simply does

$$
\texttt{verify} = \texttt{all\_checks\_passed} \;\wedge\; \texttt{ECCVMVerifier::verify\_accumulator}\bigl(\texttt{triple\_ipa\_opening.reduce\_to\_accumulator}()\bigr).
$$

## 7. Batched discharge

`ECCVMVerifier::batch_verify_accumulators` discharges many deferred openings with one SRS MSM. Given accumulators $\{(\vec{u}^{(i),-1},\, G^{(i)}_{\mathrm{fold}},\, \mathrm{ok}_i)\}_{i<B}$:

1. **Rehash (Halo2-style binding).** A fresh `NativeTranscript` absorbs every $\vec{u}^{(i),-1}$ and $G^{(i)}_{\mathrm{fold}}$ (`IPA:batch_u_i`, `IPA:batch_U_i`), then squeezes one batching challenge $\rho_b$ (`IPA:batch_rho`). This binds the prover-supplied commitments before they are randomly combined.
2. **Combine.**
   $$
   h_{\mathrm{comb}}(X) = \sum_{i<B} \rho_b^{\,i}\, h_{\vec{u}^{(i)}}(X), \qquad
   C_{\mathrm{comb}} = \sum_{i<B} \rho_b^{\,i}\, G^{(i)}_{\mathrm{fold}}.
   $$
3. **One MSM.** Accept iff
   $$
   \bigl\langle \mathrm{coeffs}(h_{\mathrm{comb}}),\ \vec{G} \bigr\rangle \stackrel{?}{=} C_{\mathrm{comb}}
   \qquad \wedge \qquad \bigwedge_{i<B} \mathrm{ok}_i .
   $$

Cost: a single size-$n$ Pippenger MSM amortised over the whole batch (plus $B$ cheap $O(n)$ field passes to build $h_{\mathrm{comb}}$ and a size-$B$ commitment combination), versus $B$ size-$n$ MSMs unbatched. Soundness: by Schwartz–Zippel over $\rho_b$, equality of the combined MSM implies $G^{(i)}_{\mathrm{fold}} = \langle h_{\vec{u}^{(i)}}, \vec{G}\rangle$ for every $i$ except with probability $\approx (B-1)/|\mathbb{F}|$.

## 8. The `ChonkBatchVerifier` service

A background coordinator that turns a stream of `(proof, vk_index)` requests into batched verifications:

```
enqueue ──► queue ──► coordinator: take up to batch_size
                          │
            Phase 1: parallel_reduce
              one worker thread per core (work-stealing index),
              each runs ChonkVerifier::reduce_to_triple_ipa_opening single-threaded
              → per-proof { triple_ipa_opening, all_checks_passed }
              failures emitted immediately
                          │
            Phase 2: batch_check (all cores)
              per proof: reduce_to_accumulator   (cheap: O(k) MSM + transcript)
              once:      batch_verify_accumulators (one size-n SRS MSM)
                          │
              ok ──► emit OK for all     not ok ──► bisect
```

**Bisection.** If the combined check fails, the batch is split in half and each half re-checked recursively (each re-check is one fresh rehash + combined MSM over that subset), isolating the bad proof(s) in $O(\log B)$ extra MSMs while still amortising for the good ones; a singleton failure is reported with its bisection depth. The left/right recursion short-circuits: if the left half passes, only the right half is bisected further.

**Threading model.** Phase 1 sets `parallel_for_concurrency(1)` inside each worker so $B$ proofs reduce concurrently with no nested parallelism; Phase 2 restores full `num_cores_` concurrency for the single large Pippenger MSM.

The ECCVM verifier key is fixed inside `ECCVMVerifier`: all accumulators use the same Grumpkin SRS prefix of length `ECCVMFlavor::ECCVM_FIXED_SIZE`, which is what makes the single combined MSM well-defined.

## 9. Recursive propagation and root discharge

§6–§8 cover *native* discharge: the verifier reduces each deferred opening to an accumulator and checks the final SRS relation itself. In the recursive setting the TripleIPA proof is instead consumed inside the rollup circuit, and only the resulting IPA accumulator is propagated.

The reduction in §5 is the reason this composes with the existing IPA recursion path. Once stdlib `reduce_verify` has constrained relation (1) and emitted an `IpaAccumulator` $(\vec{u}^{-1}, G_{\mathrm{fold}}, \mathrm{ok})$, every TripleIPA-specific quantity ($[A]$, $v$, $b_{\mathrm{fold}}$, the cross-sums, $\vec\zeta$) has already been consumed. From that point on, the accumulator has the same shape as an ordinary IPA accumulator; TripleIPA only changes how the first accumulator is produced.

$$
\begin{array}{cl}
\textsf{chonk / goblin-avm proof} & \\[8pt]
\big\downarrow & \texttt{ECCVMVerifier::reduce\_to\_triple\_ipa\_claim} \\[8pt]
\textsf{DeferredTripleIpaOpening}\{\text{claim},\text{proof}\} & \text{carried, not discharged} \\[8pt]
\big\downarrow & \texttt{reduce\_verify}\ \text{(inside the rollup circuit)} \\[8pt]
\textsf{IpaAccumulator}\,(\vec{u}^{-1}, G_{\mathrm{fold}}, \text{ok}) & \\[8pt]
\big\downarrow & \texttt{perform\_IPA\_accumulation} \\[8pt]
\textsf{RollupIO}\ \text{ordinary IPA claim} + \textsf{builder.ipa\_proof} & \text{carried to the parent layer} \\[8pt]
\big\downarrow & \texttt{full\_verify\_recursive}\ \text{at the root} \\[8pt]
\textsf{root SRS discharge} &
\end{array}
$$

1. **Deferred opening construction.** `ECCVMVerifier::reduce_to_triple_ipa_claim` reconstructs the `TripleIpaClaim` from the ECCVM proof. The Chonk / Goblin-AVM verifier pairs that claim with the separate TripleIPA transcript bytes, producing `DeferredTripleIpaOpening { claim, proof }`.
2. **Recursive reduction.** `DeferredTripleIpaOpening::reduce_verify` runs inside the rollup circuit. It consumes the TripleIPA proof as witness data, constrains relation (1), and emits an `IpaAccumulator`. The final SRS relation is still deferred.
3. **Shared IPA accumulation.** `HonkRecursionConstraintsOutput::perform_IPA_accumulation` collects ordinary nested IPA claims (`nested_ipa_claims`) and fresh TripleIPA-derived openings (`nested_triple_ipa_openings`). Each deferred TripleIPA opening is first reduced to an `IpaAccumulator`; then the existing IPA code either folds two accumulators with `IPA::accumulate`, converts one accumulator with `IPA::prove_accumulator_claim`, or emits a dummy valid IPA claim/proof when there are none.
4. **Public boundary.** Non-root rollup layers publish the resulting ordinary IPA claim through `RollupIO` public inputs and carry its proof in `builder.ipa_proof`. A parent sees this as an ordinary nested IPA claim/proof, not as TripleIPA.
5. **Root discharge.** At the root, `full_verify_recursive` performs the final ordinary IPA verification. This is where the deferred SRS relation is actually discharged.

The recursive boundary keeps proof bytes as private witness data and exposes only the claim produced by accumulation. The shared IPA accumulation path accepts accumulators from both ordinary IPA `reduce_verify` and `DeferredTripleIpaOpening::reduce_verify`.

**Soundness note.** The final root fact, $G_{\mathrm{fold}} = \langle h_{\vec u}, \vec{G}\rangle$ (§4 check (2), §7), depends only on the IPA round challenges $\vec{u}^{-1}$; it is tensor-agnostic. Every TripleIPA-specific quantity must therefore be bound before the accumulator is handed to the ordinary IPA path. In particular, `evaluate_folded` must compute the inner product of the intended combined tensor $b = \zeta_1 b_{\mathrm{eq}} + \zeta_2 b_{\mathrm{sh}} + \zeta_3 b_{\mathrm{pow}}$ with the IPA $s$-vector. A prover/verifier disagreement breaks completeness, but agreement on the wrong tensor would be a soundness bug; this is why the tensor formulas in §3.1 and the independent folded-evaluation tests are critical.
