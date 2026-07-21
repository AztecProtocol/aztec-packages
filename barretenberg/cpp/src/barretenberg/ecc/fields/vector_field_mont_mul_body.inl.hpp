// Body of VectorField<Params>::operator* under WASM SIMD. Included inside
// per-Params explicit specializations in vector_field_wasm.cpp so each one
// stamps a fresh kernel resolving R_INV_WASM / P_WASM / R_INV_MOD_2_29
// against the surrounding class's static constexpr Params constants.
//
// The macros it expands (BB_VF_LOAD_LIMBS, BB_VF_KARATSUBA_STAGES_1_4,
// BB_VF_RUN_STAGES_6_THROUGH_10) are Params-agnostic — they use unqualified
// names that resolve in the enclosing scope. Stage 5 (the temp_*/tlo_*/thi_*
// combine between the two macros) is pure arithmetic over the previous
// stage's locals and is likewise Params-agnostic.
//
// Including this file inside `{ ... }` of a `VectorField<Foo>::operator*`
// specialization is the supported use; do not include it at namespace scope.
VectorField result;

BB_VF_LOAD_LIMBS(*this, other);
BB_VF_KARATSUBA_STAGES_1_4();

// ============================================================
// Stage 5: Combine into temp_0..temp_16.
//   temp[k]         = pl[k]                       for k in 0..4
//   temp[k]         = pl[k] + (pc[k-5] - pl[k-5] - ph[k-5])  for k in 5..8
//   temp[9]         = pc[4] - pl[4] - ph[4]
//   temp[k]         = (pc[k-5] - pl[k-5]) - ph[k-5] + ph[k-10]  for k in 10..13
//                     (ph[k-5] only defined for k-5 <= 6 i.e. k <= 11; k=12,13 omit)
//   temp[k]         = ph[k-10]                    for k in 14..16
// Scalar math uses uint64_t subtraction (wrap); quad math uses i64x2 sub.
// ============================================================
uint64_t temp_0 = pl0;
v128_t tlo_0 = pl0_lo;
v128_t thi_0 = pl0_hi;
uint64_t temp_1 = pl1;
v128_t tlo_1 = pl1_lo;
v128_t thi_1 = pl1_hi;
uint64_t temp_2 = pl2;
v128_t tlo_2 = pl2_lo;
v128_t thi_2 = pl2_hi;
uint64_t temp_3 = pl3;
v128_t tlo_3 = pl3_lo;
v128_t thi_3 = pl3_hi;
uint64_t temp_4 = pl4;
v128_t tlo_4 = pl4_lo;
v128_t thi_4 = pl4_hi;

uint64_t temp_5 = pl5 + (pc0 - pl0 - ph0);
v128_t tlo_5 = wasm_i64x2_add(pl5_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc0_lo, pl0_lo), ph0_lo));
v128_t thi_5 = wasm_i64x2_add(pl5_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc0_hi, pl0_hi), ph0_hi));
uint64_t temp_6 = pl6 + (pc1 - pl1 - ph1);
v128_t tlo_6 = wasm_i64x2_add(pl6_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc1_lo, pl1_lo), ph1_lo));
v128_t thi_6 = wasm_i64x2_add(pl6_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc1_hi, pl1_hi), ph1_hi));
uint64_t temp_7 = pl7 + (pc2 - pl2 - ph2);
v128_t tlo_7 = wasm_i64x2_add(pl7_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc2_lo, pl2_lo), ph2_lo));
v128_t thi_7 = wasm_i64x2_add(pl7_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc2_hi, pl2_hi), ph2_hi));
uint64_t temp_8 = pl8 + (pc3 - pl3 - ph3);
v128_t tlo_8 = wasm_i64x2_add(pl8_lo, wasm_i64x2_sub(wasm_i64x2_sub(pc3_lo, pl3_lo), ph3_lo));
v128_t thi_8 = wasm_i64x2_add(pl8_hi, wasm_i64x2_sub(wasm_i64x2_sub(pc3_hi, pl3_hi), ph3_hi));

uint64_t temp_9 = pc4 - pl4 - ph4;
v128_t tlo_9 = wasm_i64x2_sub(wasm_i64x2_sub(pc4_lo, pl4_lo), ph4_lo);
v128_t thi_9 = wasm_i64x2_sub(wasm_i64x2_sub(pc4_hi, pl4_hi), ph4_hi);

uint64_t temp_10 = (pc5 - pl5 - ph5) + ph0;
v128_t tlo_10 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_lo, pl5_lo), ph5_lo), ph0_lo);
v128_t thi_10 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc5_hi, pl5_hi), ph5_hi), ph0_hi);
uint64_t temp_11 = (pc6 - pl6 - ph6) + ph1;
v128_t tlo_11 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_lo, pl6_lo), ph6_lo), ph1_lo);
v128_t thi_11 = wasm_i64x2_add(wasm_i64x2_sub(wasm_i64x2_sub(pc6_hi, pl6_hi), ph6_hi), ph1_hi);
uint64_t temp_12 = (pc7 - pl7) + ph2;
v128_t tlo_12 = wasm_i64x2_add(wasm_i64x2_sub(pc7_lo, pl7_lo), ph2_lo);
v128_t thi_12 = wasm_i64x2_add(wasm_i64x2_sub(pc7_hi, pl7_hi), ph2_hi);
uint64_t temp_13 = (pc8 - pl8) + ph3;
v128_t tlo_13 = wasm_i64x2_add(wasm_i64x2_sub(pc8_lo, pl8_lo), ph3_lo);
v128_t thi_13 = wasm_i64x2_add(wasm_i64x2_sub(pc8_hi, pl8_hi), ph3_hi);

uint64_t temp_14 = ph4;
v128_t tlo_14 = ph4_lo;
v128_t thi_14 = ph4_hi;
uint64_t temp_15 = ph5;
v128_t tlo_15 = ph5_lo;
v128_t thi_15 = ph5_hi;
uint64_t temp_16 = ph6;
v128_t tlo_16 = ph6_lo;
v128_t thi_16 = ph6_hi;

// ============================================================
// Stage 6: 8 x Yuval reductions.
// Stage 7: 1 x wasm_reduce on (temp_8..temp_16).
// Stage 8: Carry propagation temp_9..temp_16, out to temp_17.
// Stage 9/10: Store output (no conditional subtract needed — Karatsuba+Yuval
// result is already in [0, p]; scalar/quad AND with mask29 strips deferred
// Stage 8 carry bits. See field_impl_generic.hpp line 863 and Stage 8/9
// comments in BB_VF_RUN_STAGES_6_THROUGH_10 below.
// ============================================================
BB_VF_RUN_STAGES_6_THROUGH_10();
return result;
