# ROM tables

ROM (read-only memory) tables let a circuit commit to a fixed array of values at construction time and
later read entries by index. Two arguments coexist inside the single `MemoryRelation`
(`memory_relation.hpp`), chosen per array by how many values each index stores:

- **Single-value tables** (one value per index) use a **LogUp** argument (subrelations 6 and 7). One
  table row per initialized index plus one row per read, with no sorted copy of the trace.
- **Pair-value tables** (two values per index) use the **sorted-trace** argument (subrelations 0, 1,
  2), the classic plookup-style ROM: every access is duplicated into a second, index-sorted set whose
  consistency is checked locally and whose multiset-equality with the access set is a permutation.

The split is per array, not per circuit: a circuit may have some single-value and some pair-value ROM
arrays, but a given array commits to one scheme on its first operation (`RomTranscript::use_logup`).
The schemes never mix within an array; `set_ROM_element` / `read_ROM_array` assert this.

The two schemes are not interchangeable in cost. The LogUp scheme spends one row per table entry and
one per read; the sorted scheme spends one row per access **plus** one sorted row per access, so it
roughly doubles the trace footprint of single-value reads. That cost gap is why single-value tables
use LogUp.

Both schemes share the wire and selector budget of the memory custom gate. RAM gates (read/write,
timestamp, consistency) live in the same relation and reuse the same wires and `eta` powers; this file
documents only the two ROM arguments. See `memory_relation.hpp` for the full RAM identities.

## Notation

All ROM gates are gated by the precomputed memory selector $q_{\text{mem}}$ (`q_memory`). The
remaining arithmetic selectors $q_1,\dots,q_4,q_m$ and the constant selector $q_c$ encode the gate
type as a bitpattern, and the four wires carry the row data. The relation reads the wires under their
generic names $w_1,w_2,w_3,w_4$ (`w_l, w_r, w_o, w_4`).

| Symbol | Source identifier | Meaning |
|---|---|---|
| $q_{\text{mem}}$ | `q_memory` | precomputed selector enabling all memory gates |
| $q_1,\dots,q_4$ | `q_l, q_r, q_o, q_4` | arithmetic selectors used as a gate-type bitpattern |
| $q_m$ | `q_m` | multiplication selector (set on the pair-value access gate) |
| $q_c$ | `q_c` | constant selector; carries the **ROM array id** on LogUp rows |
| $w_1,w_2,w_3,w_4$ | `w_l, w_r, w_o, w_4` | the four wires of the row |
| $\eta$ | `eta` | batching challenge; $\eta_2 = \eta^2$ (`eta_two`), $\eta_3 = \eta^3$ (`eta_three`) |
| $\gamma$ | `rom_logup_gamma` | LogUp additive offset, **independent** of $\eta$ |
| $I$ | $w_4$ on a LogUp row | inverse helper, $1/\text{denom}$ |
| $m_i$ | $w_3$ on a LogUp table row | read count (multiplicity) of index $i$ |

$\eta$, $\eta_2$, $\eta_3$, and $\gamma$ are sampled in oink after the wire commitments. The verifier
and prover squeeze $\eta$ and $\gamma$ from one Fiat–Shamir call gated on `Flavor::HasMemory`:

```
get_challenges<FF>({"eta", "rom_logup_gamma"})
```

The labels are exactly `"eta"` and `"rom_logup_gamma"`. The eta powers and $\gamma$ are skipped
entirely when the flavor has no memory relation, keeping prover and verifier in lockstep on the
transcript state. The LogUp inverse wire ($w_4$) is filled only after these challenges are known, then
committed alongside the other oink commitments.

---

## Single-value tables: LogUp

### Claim

For a single-value array, let the read accesses be claims $L_1,\dots,L_n$ and the table entries be
$T_1,\dots,T_k$ with read counts (multiplicities) $m_1,\dots,m_k$. The argument establishes that every
read hits an entry of the same array, i.e. the multiset of reads is contained in the table. Over the
random challenges it reduces to the single LogUp identity

$$\sum_{\text{reads } j} \frac{1}{\gamma + t(L_j)} \; - \; \sum_{\text{entries } i} \frac{m_i}{\gamma + t(T_i)} \; = \; 0,$$

where $t(\cdot)$ is the fingerprint below. Because $\gamma$ is independent of the fingerprints, the
reciprocals $1/(\gamma + t)$ have simple poles at distinct points $-t$, so the sum vanishing as a
rational function in $\gamma$ forces the net multiplicity at every fingerprint to be zero — each read
is matched by a table entry of the same fingerprint. Soundness follows from Schwartz–Zippel over
$\eta$ (distinct triples collide with negligible probability) and the partial-fraction argument over
$\gamma$; the same reasoning is spelled out for the lookup relation in
`logderiv_lookup_relation.hpp`.

### Term encoding

An entry of a single-value table is the triple `(index, value, array_id)`, stored as

$$w_1 = \text{index}, \qquad w_2 = \text{value}, \qquad q_c = \text{array\_id}.$$

`array_id` is a precomputed selector, not a witness, so the array separation is committed in the
verification key. The triple is batched into a single field element — the **fingerprint** — with the
$\eta$ powers and the additive offset $\gamma$ (degree 1):

$$\text{denom} \;=\; \gamma + w_1 + \eta\, w_2 + \eta_2\, q_c.$$

Two table entries with distinct `(index, value, array_id)` map to the same fingerprint only when a
nonzero degree $\le 2$ polynomial in $\eta$ vanishes, which happens with negligible probability.
Folding `array_id` into the fingerprint is what makes a read match an entry of *its own* array even
though the LogUp sum below runs over the whole trace. The offset $\gamma$ being independent (not a
power of $\eta$) is what validates the partial-fraction argument, and it also keeps every denominator
nonzero — the all-zero row (`index = value = array_id = 0`) still has denominator $\gamma \neq 0$.

### Row types

Both LogUp row types share the layout

$$(w_1, w_2, w_3, w_4) = (\text{index},\; \text{value},\; \text{multiplicity or } 0,\; I)$$

and are distinguished from each other and from every RAM/ROM gate by the bitpattern under
$q_{\text{mem}} = 1$:

| Row type | Selector | `MEMORY_SELECTORS` | $w_3$ | LogUp contribution |
|---|---|---|---|---|
| Table entry | $q_2 = 1,\; q_1 = 0$ | `ROM_LOGUP_TABLE` | $m_i$ (read count) | $-m_i \cdot I$ |
| Read access | $q_4 = 1,\; q_1 = 0$ | `ROM_LOGUP_READ` | $0$ | $+I$ |

Define the indicator selectors used by the relation:

$$q_{\text{table}} = q_2(1 - q_1), \qquad q_{\text{read}} = q_4(1 - q_1), \qquad q_{\text{any}} = q_{\text{table}} + q_{\text{read}}.$$

The $(1 - q_1)$ factor separates these from `ROM_CONSISTENCY_CHECK` (which sets $q_1 = q_2 = 1$) and
from `RAM_TIMESTAMP_CHECK` (which sets $q_1 = q_4 = 1$). The read row carries multiplicity $+1$
implicitly via $q_{\text{read}}$, so its $w_3$ wire is left at `zero_idx()`; the read count $m_i$ lives
on the **table** row's $w_3$.

### Inverse polynomial

We store the reciprocal in a witness $I = w_4$:

$$I \;=\; \frac{1}{\gamma + w_1 + \eta\, w_2 + \eta_2\, q_c}$$

on every LogUp row, and is unconstrained elsewhere.
This allows us to write the inverse relation as the vanishing of a multivariate polynomial.

### Subrelations

The two LogUp subrelations are indices 6 and 7 of `MemoryRelation`:

**Subrelation 6 — inverse correctness (per-row, degree 5).** Forces $I$ to be the reciprocal on any
row whose bitpattern fires:

$$q_{\text{mem}} \cdot q_{\text{any}} \cdot \big(I \cdot \text{denom} - 1\big) = 0.$$

**Subrelation 7 — LogUp sum (linearly dependent, degree 5).** Summed across the whole trace:

$$\sum_{\text{rows}} q_{\text{mem}} \cdot \big(q_{\text{read}} - q_{\text{table}} \cdot w_3\big) \cdot w_4 \;=\; 0.$$

On a read row this contributes $+I$; on a table row it contributes $-m_i \cdot I$. **Subrelation 7 is
linearly dependent**: it constrains a sum over the trace rather than holding at each row, so it is
*not* multiplied by the per-row `scaling_factor` during accumulation
(`SUBRELATION_LINEARLY_INDEPENDENT[7] = false`). Both terms are gated by precomputed selectors, so
rows outside the two LogUp bitpatterns contribute zero regardless of their $w_3$/$w_4$; no separate
locality subrelation is needed (table entries *are* gates, and their selector is the indicator).

---

## Pair-value tables: sorted trace

A pair-value array stores two values per index (`value1`, `value2`) and uses the plookup-style sorted
ROM argument. Every access — initialization or read — emits one **access gate**, and finalization
emits a parallel set of gates sorted by index. Consistency of the table is checked locally on the
sorted set; equality of the access set and the sorted set as multisets is enforced by the global
permutation (copy-constraint) argument, so it needs no extra gate here.

### Access gate and record

The access gate stores the row as

$$w_1 = \text{index}, \qquad w_2 = \text{value1}, \qquad w_3 = \text{value2}, \qquad w_4 = \text{record},$$

under the bitpattern $q_{\text{mem}} = 1,\; q_1 = 1,\; q_m = 1$. The **record** (fingerprint) batches
the row with the $\eta$ powers; for ROM the constant $q_c = 0$:

$$\text{record} \;=\; q_c + \eta\, w_1 + \eta_2\, w_2 + \eta_3\, w_3.$$

The memory-record identity, contributed into subrelation 0 gated by $q_m q_1$, fixes $w_4$ to this
value:

$$q_{\text{mem}}\, q_m q_1 \cdot \big(q_c + \eta\, w_1 + \eta_2\, w_2 + \eta_3\, w_3 - w_4\big) = 0.$$

### Sorted gates and consistency

Finalization emits a second copy of the records sorted by index, sharing the same record witnesses
$w_4$ (this is what realizes the multiset equality as a permutation). Sorted gates carry the
bitpattern $q_{\text{mem}} = 1,\; q_1 = 1,\; q_2 = 1$, i.e. the indicator $q_1 q_2$, and three
subrelations check them. With $\Delta = w_1^{\text{(next)}} - w_1$ (the index delta to the next sorted
row):

**Subrelation 0 — sorted record reconstruction (degree 5).** The sorted row's $w_4$ equals its
recomputed record:

$$q_{\text{mem}}\, q_1 q_2 \cdot \big(q_c + \eta\, w_1 + \eta_2\, w_2 + \eta_3\, w_3 - w_4\big) = 0.$$

**Subrelation 1 — equal indices imply equal records (degree 5).** If adjacent sorted indices match,
their records match:

$$q_{\text{mem}}\, q_1 q_2 \cdot (1 - \Delta)\,\big(w_4^{\text{(next)}} - w_4\big) = 0.$$

**Subrelation 2 — index step is $0$ or $1$ (degree 5).** Sorted indices are monotonic with unit steps:

$$q_{\text{mem}}\, q_1 q_2 \cdot \big(\Delta^2 - \Delta\big) = 0.$$

Together: the sorted set is monotone in index, records are consistent within a repeated index, and the
permutation ties the sorted set back to the access set — so every read returns the value the array was
initialized with. Subrelation 1 is named after the multiset check in the plookup paper; here the
multiset equality itself is discharged by the wiring permutation, not by a separate gate.

The RAM consistency identity (subrelation 3) is degree 3, which caps how many selectors may gate it;
this is why the quotient degree is kept at $\le 5$ across the whole relation. ROM uses none of the RAM
subrelations.

---

## Prover and verifier

### Construction time (`rom_ram_logic.cpp`)

| Step | Single-value | Pair-value |
|---|---|---|
| Initialize entry | `set_ROM_element` → `create_ROM_logup_gate(is_read=false)` | `set_ROM_element_pair` → `create_ROM_gate` |
| Read | `read_ROM_array` → `create_ROM_logup_gate(is_read=true)` | `read_ROM_array_pair` → `create_ROM_gate` |
| Finalize | `process_ROM_logup_array` | `process_ROM_array` (emits sorted gates via `create_sorted_ROM_gate`) |

`create_ROM_logup_gate` applies the `ROM_LOGUP_TABLE` / `ROM_LOGUP_READ` selectors, writes the array
id into `q_c`, leaves $w_3$ at `zero_idx()` and $w_4$ as a placeholder, and records the gate index in
`builder->rom_logup_records`. `process_ROM_logup_array` emits no gates: it asserts every index was
initialized exactly once, counts the reads per index, and repoints each table row's $w_3$ wire at a
fresh witness holding that index's read count $m_i$. `RomTranscript::use_logup`, set on the first
operation, routes each array to the right finalizer and guards against mixing the schemes.

### Oink (`oink_prover.cpp`)

After the wire commitments and the $\eta$/$\gamma$ challenges, `add_rom_logup_inverses_to_wire_4`
computes the denominators at every row in `rom_logup_records`, batch-inverts them
(`FF::batch_invert`), and writes the result into $w_4$ — *before* $w_4$ is committed. The pair-value
record witnesses are filled by `add_ram_rom_memory_records_to_wire_4` in the same phase.

### Verifier

The verifier evaluates the full `MemoryRelation` once at the sumcheck challenge point, so both ROM
schemes are part of every recursive verification regardless of whether the proven circuit used ROM.
Subrelation 7 is folded into the sumcheck batching without a row scaling factor because it is linearly
dependent.

---

## Key files

| File | Contents |
|---|---|
| `relations/memory_relation.hpp` | `MemoryRelation` — all ROM/RAM subrelations, including LogUp subrelations 6 and 7 |
| `relations/logderiv_lookup_relation.hpp` | LogUp partial-fraction soundness argument (referenced by subrelation 7) |
| `stdlib_circuit_builders/rom_ram_logic.cpp` | gate emission and finalization for both ROM schemes |
| `stdlib_circuit_builders/rom_ram_logic.hpp` | `RomRecord` (with `access_type`) and `RomTranscript` (with `use_logup`) |
| `stdlib_circuit_builders/ultra_circuit_builder.cpp` | `apply_memory_selectors` — the ROM gate bitpatterns |
| `ultra_honk/oink_prover.cpp` | `add_rom_logup_inverses_to_wire_4` — fills the LogUp inverse wire |
| `relations/relation_parameters.hpp` | `eta` powers and `rom_logup_gamma` |

## References

1. Ulrich Haböck, *Multivariate lookups based on logarithmic derivatives* (LogUp), IACR ePrint
   2022/1530. <https://eprint.iacr.org/2022/1530>
2. Ariel Gabizon and Zachary J. Williamson, *plookup: A simplified polynomial protocol for lookup
   tables*, IACR ePrint 2020/315. <https://eprint.iacr.org/2020/315>
