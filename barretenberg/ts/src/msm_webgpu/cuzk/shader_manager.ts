import mustache from 'mustache';
import {
  barrett as barrett_funcs,
  ba_reduce_level_bench as ba_reduce_level_bench_shader,
  ba_planner_classify as ba_planner_classify_shader,
  ba_planner_meta_fixup as ba_planner_meta_fixup_shader,
  ba_planner_radix_count as ba_planner_radix_count_shader,
  ba_planner_radix_scan as ba_planner_radix_scan_shader,
  ba_planner_radix_scatter as ba_planner_radix_scatter_shader,
  ba_planner_cumsum as ba_planner_cumsum_shader,
  ba_planner_partition_wg as ba_planner_partition_wg_shader,
  ba_planner_partition_thread as ba_planner_partition_thread_shader,
  ba_size1 as ba_size1_shader,
  ba_planner_partition_task as ba_planner_partition_task_shader,
  ba_stream_walker as ba_stream_walker_shader,
  ba_walker_combine_count as ba_walker_combine_count_shader,
  ba_walker_combine_scan as ba_walker_combine_scan_shader,
  ba_walker_combine_scatter as ba_walker_combine_scatter_shader,
  ba_walker_combine_filter as ba_walker_combine_filter_shader,
  ba_walker_combine_batched as ba_walker_combine_batched_shader,
  ba_walker_combine_sort_count as ba_walker_combine_sort_count_shader,
  ba_walker_combine_sort_scan as ba_walker_combine_sort_scan_shader,
  ba_walker_combine_sort_scatter as ba_walker_combine_sort_scatter_shader,
  ba_walker_pt_init_scan as ba_walker_pt_init_scan_shader,
  ba_walker_pt_init_copy as ba_walker_pt_init_copy_shader,
  ba_walker_pt_build as ba_walker_pt_build_shader,
  ba_walker_pt_dispatch_chain as ba_walker_pt_dispatch_chain_shader,
  ba_unified_combine as ba_unified_combine_shader,
  ba_walker_pt_finalize as ba_walker_pt_finalize_shader,
  bigint as bigint_funcs,
  bigint_by as bigint_by_funcs,
  bigint_f32 as bigint_f32_funcs,
  // Register-minimal BY safegcd inverse (BATCH=12 / NUM_OUTER=62, rolling
  // apply_matrix). Hosts BylMat, byl_divsteps, byl_apply_matrix, the
  // byl_reduce_to_canonical chain, and the fr_inv_by_loop driver.
  by_inverse_loop as by_inverse_loop_funcs,
  // Fully-expanded, mustache-free packed 13-bit safegcd inverse (the LIVE pk
  // path: fr_inv_by_loop_pk + pk_* + byl_divsteps + BylMat). Hand-editable.
  by_inverse_loop_pk_native as by_inverse_loop_pk_native_funcs,
  // 14-bit variant (19 limbs, BATCH=28): fewer apply_matrix products per call.
  by_inverse_loop_pk14_native as by_inverse_loop_pk14_native_funcs,
  by_inverse_loop_pk_wg as by_inverse_loop_pk_wg_funcs,
  // 15-bit sibling: BATCH=30, 18-limb BY state, 2-word (macc) apply_matrix.
  // Selected at word_size=15 (host-validated bit-exact in cios15n/by15_*.mjs).
  by_inverse_loop_15 as by_inverse_loop_15_funcs,
  convert_points_only as convert_points_only_shader,
  csr_to_v2_active_sums as csr_to_v2_active_sums_shader,
  csr_to_v2_meta as csr_to_v2_meta_shader,
  decompose_scalars_booth as decompose_scalars_booth_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  field as field_funcs,
  field8 as field8_funcs,
  fr_pow as fr_pow_funcs,
  microbench as microbench_shader,
  mont_pro_product_cios_unrolled as montgomery_product_cios_unrolled_funcs,
  mont_pro_product_cios_unrolled_wg as montgomery_product_cios_unrolled_wg_funcs,
  mont_pro_product_f8_native as montgomery_product_f8_native_funcs,
  mont_pro_product_f32_22_sos3uv3 as montgomery_product_f32_22_sos3uv3_funcs,
  mont_pro_product_karat_yuval as montgomery_product_karat_yuval_funcs,
  mulhilo_22 as mulhilo_22_funcs,
  structs,
  transpose_parallel_scan as transpose_parallel_scan_shader,
  transpose_count_tiled as transpose_count_tiled_shader,
  transpose_reduce_tiled as transpose_reduce_tiled_shader,
  transpose_scatter_tiled as transpose_scatter_tiled_shader,
} from '../wgsl/_generated/shaders.js';
import {
  compute_by_p_inv_a,
  compute_by_p_inv_split,
  compute_misc_params,
  compute_mod_inverse_pow2,
  gen_p_limbs,
  gen_p_limbs_by_initializer,
  gen_p_limbs_f32,
  gen_r_limbs,
  gen_mu_limbs,
  gen_wgsl_limbs_code,
} from './utils.js';
import { BN254_CURVE_CONFIG, CurveConfig } from './curve_config.js';
import { genCiosLimbBody, type Correction } from './cios_limb_gen.js';

// Modular inverse via extended Euclidean. Returns a^-1 mod m. Both inputs > 0.
function modinv(a: bigint, m: bigint): bigint {
  let [old_r, r] = [((a % m) + m) % m, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return ((old_s % m) + m) % m;
}

// Generates parameterised WGSL shader sources for the BN254 MSM
// pipeline. Pre-computes Montgomery / Barrett constants for the
// configured word size on construction so the per-shader render
// calls just pull from instance fields.
// Base-field Montgomery-multiply body selector for ShaderManager.
//  - 'karat'         : generic grouped-Karatsuba + Yuval reduction (default).
//  - 'cios_unrolled' : register-resident fully-unrolled CIOS; device-validated
//                      −26% on Mali-G715 at logn=17. BN254 @ 20×13-bit only.
export type MontMulVariant = 'karat' | 'cios_unrolled';

export class ShaderManager {
  public p: bigint;
  public word_size: number;
  public chunk_size: number;
  public input_size: number;
  public num_words: number;
  public index_shift: number;
  public mask: number;
  public two_pow_word_size: number;
  public two_pow_chunk_size: number;
  public n0: bigint;
  public r: bigint;
  public rinv: bigint;
  public p_bitlength: number;
  public slack: number;
  public w_mask: number;
  public p_limbs: string;
  public r_limbs: string;
  public r_cubed_limbs: string;
  public b3_mont_limbs: string;
  public sqrt_exp_limbs: string;
  // (p - 2) as a BigInt literal — exponent for the Fermat-based fr_pow_inv
  // bench variant. Plain (non-Montgomery) since fr_pow's `exp` is consumed
  // bit-by-bit as a raw integer.
  public p_minus_2_limbs: string;
  public p_inv_mod_2w: number;
  public mu_limbs: string;
  // 22-bit-limb f32 Montgomery params. Used by
  // `gen_montgomery_product_f32_22_sos3uv3_shader` for the sos3uv3
  // micro-benchmark. The 22-bit width buys a 4-way exact sum
  // (4·2^22 = 2^24 fits in f32 mantissa), enabling the per-slot
  // (tlo, thi) chain-break in sos3uv3.
  public num_limbs_f32_22: number;
  public n0_f32_22: bigint;
  public p_limbs_f32_22_str: string;
  // 9 × 29-bit BY limb representation of `p` for the BY safegcd inverse
  // path. The initializer string is comma-separated limbs suitable for
  // `BigIntBY(array<i32, 9>({{{ p_limbs_by }}}))`.
  public p_limbs_by_initializer: string;
  // P_INV = p^(-1) mod 2^58, split as (low 32, high <=26) bits. The WASM
  // convention is a single u64 (`p_inv` argument to Wasm9x29::apply_matrix);
  // WGSL has no u64 so we precompute the split here and inject as two
  // constants. Hensel-lifted from p mod 2 up to mod 2^58.
  public p_inv_by_lo: number;
  public p_inv_by_hi: number;
  // 26-bit p^(-1) mod 2^26 for the Option A BY safegcd inverse driver
  // (BATCH=26 / NUM_OUTER=29 on 20 x 13-bit BigInt). Single u32, since 26
  // bits fit comfortably.
  public p_inv_by_a_lo: number;
  // Pre-rendered u32 Montgomery product source used as the
  // `montgomery_product_funcs` mustache partial by every MSM shader that
  // needs a base-field multiply. Defaults to the Karatsuba + Yuval body
  // (see `renderKaratYuvalMont`), which benches ~27% faster than the
  // runtime-loop CIOS at n=2^20, k=100 on Apple GPU. Both bodies expose
  // the same `fn montgomery_product(x, y) -> BigInt` symbol and the same
  // `get_p` / `conditional_reduce` helpers, so swapping the partial is
  // a drop-in change at every callsite.
  public mont_product_src: string;
  // Workgroup-backed CIOS multiply (`montgomery_product_wg`): identical
  // arithmetic to mont_product_src but the 20 accumulators live in a workgroup
  // array instead of registers. Non-empty only for the cios_unrolled 13-bit
  // path; included by the walker-path kernels (regfile_lean) to cut GPRs.
  public mont_product_wg_src: string;
  // Packed-native register-lean f8 multiply source (montgomery_product_f8),
  // cios_unrolled 13-bit only; empty otherwise.
  public mont_f8_native_src: string;
  private montmul: MontMulVariant;
  public curveConfig: CurveConfig;
  public recompile = '';

  constructor(
    chunk_size: number,
    input_size: number,
    curveConfig: CurveConfig = BN254_CURVE_CONFIG,
    force_recompile = false,
    // Base-field multiply body shared by every MSM shader. 'karat' (default)
    // is the generic Karatsuba+Yuval body; 'cios_unrolled' is the
    // device-validated register-resident CIOS variant (BN254 @ 20×13 only,
    // −26% on Mali-G715). See `renderCiosUnrolledMont`. IGNORED when the limb
    // width is not 13 (see wordSizeOverride): only the native CIOS body works
    // at non-13 widths, so it is forced regardless of this value.
    montmul: MontMulVariant = 'karat',
    // Overrides curveConfig.wordSize so the WHOLE field representation — and
    // every derived Montgomery/Barrett R-parameter — switches limb width
    // per-run without mutating the shared curve config. undefined ⇒
    // curveConfig.wordSize (13 for BN254 → 20×13). 15 ⇒ 17×15 (R=2^255), which
    // forces the native CIOS-15 multiply and never compiles Karatsuba.
    wordSizeOverride?: number,
  ) {
    this.curveConfig = curveConfig;
    this.p = curveConfig.baseFieldModulus;
    const ws = wordSizeOverride ?? curveConfig.wordSize;
    const params = compute_misc_params(this.p, ws);
    this.word_size = ws;
    this.chunk_size = chunk_size;
    this.input_size = input_size;
    this.n0 = params.n0;
    this.num_words = params.num_words;
    this.r = params.r;
    this.rinv = params.rinv;
    this.mask = 2 ** this.word_size - 1;
    this.index_shift = 2 ** (chunk_size - 1);
    this.two_pow_word_size = 2 ** this.word_size;
    this.two_pow_chunk_size = 2 ** chunk_size;
    this.p_limbs = gen_p_limbs(this.p, this.num_words, this.word_size);
    this.r_limbs = gen_r_limbs(this.r, this.num_words, this.word_size);
    const r_cubed = (this.r * this.r * this.r) % this.p;
    this.r_cubed_limbs = gen_wgsl_limbs_code(r_cubed, 'r3', this.num_words, this.word_size);
    // Montgomery form of 3 = 3·R mod p (b parameter for BN254 y² = x³ + 3).
    const b3_mont = (3n * this.r) % this.p;
    this.b3_mont_limbs = gen_wgsl_limbs_code(b3_mont, 'b3', this.num_words, this.word_size);
    // (q + 1) / 4: closed-form sqrt exponent for q ≡ 3 (mod 4).
    const sqrt_exp = (this.p + 1n) / 4n;
    this.sqrt_exp_limbs = gen_wgsl_limbs_code(sqrt_exp, 'e', this.num_words, this.word_size);
    // (p - 2): exponent for Fermat-based inversion in fr_pow_inv.
    this.p_minus_2_limbs = gen_wgsl_limbs_code(this.p - 2n, 'e', this.num_words, this.word_size);
    this.p_inv_mod_2w = compute_mod_inverse_pow2(this.p, this.word_size);
    this.mu_limbs = gen_mu_limbs(this.p, this.num_words, this.word_size);
    this.p_bitlength = this.p.toString(2).length;
    this.slack = this.num_words * this.word_size - this.p_bitlength;
    this.w_mask = (1 << this.word_size) - 1;

    // 22-bit-limb f32 path (bench only). compute_misc_params(p, 22)
    // gives num_words = 12 for BN254 (12·22 = 264 ≥ 254).
    const params_f32_22 = compute_misc_params(this.p, 22);
    this.num_limbs_f32_22 = params_f32_22.num_words;
    this.n0_f32_22 = params_f32_22.n0;
    this.p_limbs_f32_22_str = gen_p_limbs_f32(this.p, this.num_limbs_f32_22, 22);

    // BY safegcd 9 × 29-bit representation of p and 58-bit p_inv split.
    // The split is the WASM `p_inv` u64 broken into low-32 + high-26
    // chunks; the Mustache substitution is a flat u32 constant on each
    // side.
    this.p_limbs_by_initializer = gen_p_limbs_by_initializer(this.p);
    const p_inv_split = compute_by_p_inv_split(this.p);
    this.p_inv_by_lo = p_inv_split.lo;
    this.p_inv_by_hi = p_inv_split.hi;
    // Option A 26-bit p_inv (single u32) for the BATCH=26 BY driver.
    this.p_inv_by_a_lo = compute_by_p_inv_a(this.p);

    // Render the Karatsuba+Yuval Mont body once. This is the default
    // u32 multiplier used by every MSM shader that includes the
    // `montgomery_product_funcs` mustache partial.
    // At non-13-bit limb widths neither the Karatsuba body (structurally
    // 20-limb) nor the 20×13-baked cios_unrolled drop-in applies:
    // the native CIOS body (B = word_size, no unpack/repack/correction) is the
    // only valid multiply, so force it and never render Karatsuba.
    this.mont_product_src =
      this.word_size !== 13
        ? this.renderCiosLimbMont(this.word_size)
        : montmul === 'cios_unrolled'
          ? this.renderCiosUnrolledMont()
          : this.renderKaratYuvalMont();

    // Workgroup-backed twin of the cios_unrolled body. Only the cios_unrolled
    // 13-bit path has a hand-written workgroup variant; every other path keeps
    // its register multiply (regfile_lean is never set for them).
    this.montmul = montmul;
    this.mont_product_wg_src =
      montmul === 'cios_unrolled' && this.word_size === 13 ? montgomery_product_cios_unrolled_wg_funcs.trim() : '';
    // Packed-native register-lean f8 multiply (montgomery_product_f8): packed
    // x/y in/out, per-iter working_x, s0..s19 packed + conditional-reduced in
    // place. cios_unrolled 13-bit only; other paths keep the unpack/montmul/pack
    // wrapper (the native body bakes BN254 20×13-bit limbs).
    this.mont_f8_native_src =
      montmul === 'cios_unrolled' && this.word_size === 13 ? montgomery_product_f8_native_funcs.trim() : '';

    if (force_recompile) {
      const rand = Math.round(Math.random() * 100000000000000000) % 2 ** 32;
      this.recompile = `
                var recompile = ${rand}u;
                recompile += 1u;
            `.trim();
    }
  }

  // DECOUPLED (full-ILP) pack/unpack WGSL for the packed 8×u32 storage
  // path. For limb i (WS bits) the source word and shift are compile-time
  // constants derived from WS / num_words / 256-bit / 8-word:
  //   w0 = (WS*i) div 32 ;  s0 = (WS*i) mod 32
  //   value = (packed[w0] >> s0) & LIMB_MASK
  //   if s0+WS > 32: value |= (packed[w0+1] << (32-s0)) & LIMB_MASK
  // Pack is symmetric: each output u32 word j is the OR of the constant
  // set of limbs whose bit window overlaps [32*j, 32*j+32). Produces the
  // bit-identical integer to a serial bit-cursor (sum limbs[i]*2^(WS*i)
  // == sum w[j]*2^(32*j)); same Montgomery domain, no R correction.
  private decoupledPackUnpackWgsl(): { unpack: string; pack: string } {
    const WS = this.word_size;
    const NW = this.num_words;
    const PACKED = 8;
    const LIMB_MASK = (1 << WS) - 1;

    const unpackLines: string[] = [];
    for (let i = 0; i < NW; i++) {
      const bitpos = WS * i;
      const w0 = Math.floor(bitpos / 32);
      const s0 = bitpos % 32;
      let expr = `(w[${w0}u] >> ${s0}u)`;
      if (s0 + WS > 32 && w0 + 1 < PACKED) {
        expr = `(${expr} | (w[${w0 + 1}u] << ${32 - s0}u))`;
      }
      unpackLines.push(`    b.limbs[${i}u] = ${expr} & ${LIMB_MASK}u;`);
    }
    const unpack = `fn unpack256_to_limbs(w: array<u32, 8>) -> BigInt {
    var b: BigInt;
${unpackLines.join('\n')}
    return b;
}`;

    const wordTerms: string[][] = Array.from({ length: PACKED }, () => []);
    for (let i = 0; i < NW; i++) {
      const bitpos = WS * i;
      const w0 = Math.floor(bitpos / 32);
      const s0 = bitpos % 32;
      const limbExpr = `(b.limbs[${i}u] & ${LIMB_MASK}u)`;
      if (w0 < PACKED) {
        wordTerms[w0].push(s0 === 0 ? limbExpr : `(${limbExpr} << ${s0}u)`);
      }
      if (s0 + WS > 32 && w0 + 1 < PACKED) {
        wordTerms[w0 + 1].push(`(${limbExpr} >> ${32 - s0}u)`);
      }
    }
    const packLines: string[] = [];
    for (let j = 0; j < PACKED; j++) {
      const terms = wordTerms[j];
      packLines.push(`    w[${j}u] = ${terms.length ? terms.join(' | ') : '0u'};`);
    }
    const pack = `fn pack_limbs_to_256(bp: ptr<function, BigInt>) -> array<u32, 8> {
    let b = *bp;
    var w: array<u32, 8>;
${packLines.join('\n')}
    return w;
}`;

    return { unpack, pack };
  }

  public gen_convert_points_only_shader(workgroup_size: number, num_y_workgroups: number, packed = false): string {
    const num_16_bit_words_per_coord = Math.ceil((this.num_words * this.word_size) / 16);
    const coord_u32_words = this.curveConfig.coordinateByteLength / 4;
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      convert_points_only_shader,
      {
        packed,
        dec_pack: dec.pack,
        workgroup_size,
        num_y_workgroups,
        num_words: this.num_words,
        word_size: this.word_size,
        n0: this.n0,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mu_limbs: this.mu_limbs,
        w_mask: this.w_mask,
        slack: this.slack,
        num_words_mul_two: this.num_words * 2,
        num_words_plus_one: this.num_words + 1,
        num_16_bit_words_per_coord,
        coord_u32_words,
        coord_u32_words_mul_two: coord_u32_words * 2,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        field_funcs,
        barrett_funcs,
        montgomery_product_funcs: this.mont_product_src,
        extract_word_from_bytes_le_funcs,
      },
    );
  }

  public gen_decompress_g1_bn254_shader(workgroup_size: number): string {
    return mustache.render(
      decompress_g1_bn254_shader,
      {
        workgroup_size,
        num_words: this.num_words,
        word_size: this.word_size,
        n0: this.n0,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mu_limbs: this.mu_limbs,
        b3_mont_limbs: this.b3_mont_limbs,
        sqrt_exp_limbs: this.sqrt_exp_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        w_mask: this.w_mask,
        slack: this.slack,
        num_words_mul_two: this.num_words * 2,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        field_funcs,
        barrett_funcs,
        montgomery_product_funcs: this.mont_product_src,
        fr_pow_funcs,
      },
    );
  }

  public gen_decompose_scalars_booth_shader(workgroup_size: number): string {
    return mustache.render(decompose_scalars_booth_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  public gen_transpose_scan_shader(workgroup_size: number): string {
    return mustache.render(transpose_parallel_scan_shader, {
      workgroup_size,
      recompile: this.recompile,
    });
  }

  /**
   * Tiled counting-sort transpose count: dispatch (numChunks, numWindows).
   * Each workgroup histograms its point-chunk into a workgroup-shared
   * histogram and writes the chunk's partial row. `tile` is the shared
   * histogram capacity in entries.
   */
  public gen_transpose_count_tiled_shader(workgroup_size: number, tile: number): string {
    if (tile <= 0 || !Number.isInteger(tile)) {
      throw new Error(`gen_transpose_count_tiled_shader: tile (${tile}) must be a positive integer`);
    }
    return mustache.render(transpose_count_tiled_shader, {
      workgroup_size,
      tile,
      recompile: this.recompile,
    });
  }

  /**
   * Tiled counting-sort transpose reduce: dispatch (ceil(BW/wg), numWindows).
   * Folds the per-chunk partials over the chunk axis into per-window column
   * counts and rewrites the partials in place with chunk-exclusive prefixes.
   */
  public gen_transpose_reduce_tiled_shader(workgroup_size: number): string {
    return mustache.render(transpose_reduce_tiled_shader, {
      workgroup_size,
      recompile: this.recompile,
    });
  }

  /**
   * Tiled counting-sort transpose scatter: dispatch (numChunks, numWindows).
   * Each workgroup scatters its point-chunk into the CSC slots using a
   * workgroup-shared within-chunk write cursor. `tile` is the shared cursor
   * capacity in entries.
   */
  public gen_transpose_scatter_tiled_shader(workgroup_size: number, tile: number): string {
    if (tile <= 0 || !Number.isInteger(tile)) {
      throw new Error(`gen_transpose_scatter_tiled_shader: tile (${tile}) must be a positive integer`);
    }
    return mustache.render(transpose_scatter_tiled_shader, {
      workgroup_size,
      tile,
      recompile: this.recompile,
    });
  }

  /**
   * Lever 2 mustache context for the 8x u32 live field form (field8_funcs
   * partial): p / R as eight 32-bit words for the native fr_add_f8 /
   * fr_sub_f8 and the get_r_f8 seed, plus the 0..7 unroll index list.
   */
  private f8Context() {
    const words8 = (v: bigint): number[] => {
      const out: number[] = [];
      let x = v;
      for (let i = 0; i < 8; i++) {
        out.push(Number(x & 0xffffffffn));
        x >>= 32n;
      }
      return out;
    };
    return {
      p8_consts: words8(this.p).map((val, idx) => ({ idx, val })),
      r8_csv: words8(this.r)
        .map(v => `${v >>> 0}u`)
        .join(', '),
      f8_words: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ i })),
    };
  }

  /**
   * Layout converter (active_sums materialization): copies packed
   * 8×u32 base coords from cached_bases into bucket-major active_sums
   * indexed by val_idx. One thread per (subtask, slot). Pure raw vec4
   * copy — no field-element math.
   */
  public gen_csr_to_v2_active_sums_shader(workgroup_size: number, with_sign = false, index_mode = false): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_csr_to_v2_active_sums_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    return mustache.render(
      csr_to_v2_active_sums_shader,
      { workgroup_size, recompile: this.recompile, with_sign, index_mode },
      {},
    );
  }

  /**
   * Layout converter (meta derivation): writes per-bucket count and
   * subtask-relative offset from cuZK row_ptr. One thread per
   * (subtask, bucket).
   */
  public gen_csr_to_v2_meta_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_csr_to_v2_meta_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    return mustache.render(
      csr_to_v2_meta_shader,
      { workgroup_size, recompile: this.recompile },
      {},
    );
  }

  /**
   * Reduction-stage level kernel. ONE kernel handles all three kinds
   * (0 = phase-A suffix add, 1 = phase-B/D tree-add, 2 = phase-C double)
   * via runtime branch on `lparams.w` — uniform across the workgroup, so
   * the compiler specialises per-dispatch with no SIMT divergence.
   */
  // Inversion wiring by limb width. The BY safegcd (fr_inv_by_loop / _pk) and
  // its Pk / BigIntBY helpers are structurally 20×13: pk_p_word packs
  // P_LIMB_0..19 with a 13-bit shift, and the packed forms assume 13-bit limbs.
  // So at any non-13 width they neither compile nor apply. There, fall back to
  // the representation-agnostic Fermat inverse fr_pow_inv (a^(p-2) via the
  // native montgomery_product) and drop the BY partials so the module compiles.
  // fr_pow_inv has the same signature and Montgomery convention (Mont in → Mont
  // a^-1 out) as fr_inv_by_loop, so it is a drop-in. NOTE: Fermat is ~5-8×
  // slower on the serial inversion than the safegcd; generalizing safegcd to
  // 17×15 is a separate follow-up.
  private invWiring(variant: 'loop' | 'pk'): { invFn: string; inverseFuncs: string; bigintByFuncs: string } {
    // 15-bit: the dedicated 15-bit safegcd (BATCH=30, 18-limb BY, 2-word
    // macc apply_matrix). NOT the BY 9×29 / Pk forms (those are 13-bit-structural)
    // and NOT Fermat. bigint_by partial dropped (unused at 15-bit).
    if (this.word_size === 15) {
      return { invFn: 'fr_inv_by_loop_pk15', inverseFuncs: by_inverse_loop_15_funcs, bigintByFuncs: '' };
    }
    // other non-13 widths (14, 16): no dedicated safegcd yet — representation-
    // agnostic Fermat (a^(p-2) via the native montmul). Drop the BY partials.
    if (this.word_size !== 13) {
      return { invFn: 'fr_pow_inv', inverseFuncs: '', bigintByFuncs: '' };
    }
    // pk path uses the fully-expanded, hand-editable packed inverse; the
    // (unused) 'loop' path keeps the templated by_inverse_loop source.
    return {
      invFn: variant === 'pk' ? 'fr_inv_by_loop_pk' : 'fr_inv_by_loop',
      inverseFuncs: variant === 'pk' ? by_inverse_loop_pk14_native_funcs : by_inverse_loop_funcs,
      bigintByFuncs: bigint_by_funcs,
    };
  }

  // Isolated montmul / inverse microbench. op='mul' chains montgomery_product;
  // op='inv' chains the selected field inverse (fr_inv_by_loop_pk at 13-bit,
  // fr_inv_by_loop_pk15 at 15-bit). Same view/partials as the reduce-level
  // kernel so it is the live 13-bit-vs-15-bit op comparison.
  public gen_microbench_shader(op: 'mul' | 'inv', chain_k: number, nthreads: number): string {
    const { invFn: inv_fn, inverseFuncs: inverse_funcs, bigintByFuncs } = this.invWiring('pk');
    return mustache.render(
      microbench_shader,
      {
        inv_fn, inv_f8: this.word_size === 13, is_mul: op === 'mul', is_inv: op === 'inv',
        chain_k, nthreads, in_stride: 2 * this.num_words,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo, recompile: this.recompile,
      },
      {
        structs, bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs, fr_pow_funcs, bigint_by_funcs: bigintByFuncs, inverse_funcs,
      },
    );
  }

  public gen_ba_reduce_level_bench_shader(
    workgroup_size: number,
    variant: 'loop' | 'pk' = 'pk',
  ): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_level_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { invFn: inv_fn, inverseFuncs: inverse_funcs, bigintByFuncs } = this.invWiring(variant);
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_level_bench_shader,
      {
        workgroup_size, inv_fn, inv_f8: this.word_size === 13 && variant === 'pk',
        p8_consts, r8_csv, f8_words,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      {
        structs, bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs, field8_funcs, fr_pow_funcs, bigint_by_funcs: bigintByFuncs, inverse_funcs,
      },
    );
  }

  // Renders mont_pro_product_karat_yuval.template.wgsl. The .wgsl file
  // owns the algorithm structure (chunks → sums → 9 schoolbook
  // sub-sub-products → inner combines → outer combine → Yuval reduce →
  // final canonicalize) via mustache `{{#each}}` sections. The TS here
  // just provides the index arrays + r_inv limb constants.
  private renderKaratYuvalMont(): string {
    const N = this.num_words; // 20
    const WS = this.word_size; // 13
    const W = 1n << BigInt(WS);

    const r_inv = modinv(W, this.p);
    const mask = W - 1n;
    const limbs: number[] = [];
    let v = r_inv;
    for (let i = 0; i < N; i++) {
      limbs.push(Number(v & mask));
      v >>= BigInt(WS);
    }
    const r_inv_consts = limbs.map((val, idx) => ({ idx, val }));

    // p limbs as individual constants — montgomery_product references them
    // at compile-time positions so the compiler emits immediates instead of
    // a 20-register live `p`. Same limb decomposition as `gen_p_limbs`.
    const p_limb_vals: number[] = [];
    let pv = this.p;
    for (let i = 0; i < N; i++) {
      p_limb_vals.push(Number(pv & mask));
      pv >>= BigInt(WS);
    }
    const p_limbs_consts = p_limb_vals.map((val, idx) => ({ idx, val }));

    // ── Register-light grouped Karatsuba body ──────────────────────────
    // Emit the 9 schoolbook 5×5 sub-products grouped by half-product
    // (lo / hi / cr). Each group's 3 schoolbooks + 19-entry Karatsuba
    // combine sit in one scoped { } block and fold straight into the
    // 40-limb accumulator t0..t39 — so only one group's 27 schoolbook
    // outputs are live at a time, not all 81. Identical arithmetic to a
    // flat emit (same 225 multiplies, same combine adds); the tighter
    // live-range schedule roughly halves the register peak.
    const xlimb = (i: number): string => `(*x_ptr).limbs[${i}u]`;
    const ylimb = (i: number): string => `(*y_ptr).limbs[${i}u]`;
    const chunkSum = (limb: (i: number) => string, bases: number[], k: number): string =>
      bases.map(b => limb(b + k)).join(' + ');
    // 5×5 schoolbook column expressions over operand prefixes xp / yp.
    const sbCol = (xp: string, yp: string): string[] => [
      `${xp}0 * ${yp}0`,
      `${xp}0 * ${yp}1 + ${xp}1 * ${yp}0`,
      `${xp}0 * ${yp}2 + ${xp}1 * ${yp}1 + ${xp}2 * ${yp}0`,
      `${xp}0 * ${yp}3 + ${xp}1 * ${yp}2 + ${xp}2 * ${yp}1 + ${xp}3 * ${yp}0`,
      `${xp}0 * ${yp}4 + ${xp}1 * ${yp}3 + ${xp}2 * ${yp}2 + ${xp}3 * ${yp}1 + ${xp}4 * ${yp}0`,
      `${xp}1 * ${yp}4 + ${xp}2 * ${yp}3 + ${xp}3 * ${yp}2 + ${xp}4 * ${yp}1`,
      `${xp}2 * ${yp}4 + ${xp}3 * ${yp}3 + ${xp}4 * ${yp}2`,
      `${xp}3 * ${yp}4 + ${xp}4 * ${yp}3`,
      `${xp}4 * ${yp}4`,
    ];
    // P_X[k] from this group's ll / hh / c schoolbook outputs — the inner
    // Karatsuba combine, unchanged from the flat emit.
    const pExpr = (k: number): string => {
      if (k <= 4) return `ll${k}`;
      if (k <= 8) return `ll${k} + c${k - 5} - ll${k - 5} - hh${k - 5}`;
      if (k === 9) return `c4 - ll4 - hh4`;
      if (k <= 13) return `c${k - 5} - ll${k - 5} - hh${k - 5} + hh${k - 10}`;
      return `hh${k - 10}`;
    };
    // Per half-product: the 3 schoolbook chunk bases (a-chunk limb k =
    // sum of x.limbs[base+k]) and the (t-offset, sign) the outer combine
    // folds P_X[k] into. lo: t[k]+, t[k+10]-. hi: t[k+20]+, t[k+10]-.
    // cr: t[k+10]+.
    const kgroups: Array<{
      tag: string;
      llB: number[];
      hhB: number[];
      cB: number[];
      folds: Array<{ off: number; sign: string }>;
    }> = [
      { tag: 'lo', llB: [0], hhB: [5], cB: [0, 5], folds: [{ off: 0, sign: '+' }, { off: 10, sign: '-' }] },
      { tag: 'hi', llB: [10], hhB: [15], cB: [10, 15], folds: [{ off: 20, sign: '+' }, { off: 10, sign: '-' }] },
      { tag: 'cr', llB: [0, 10], hhB: [5, 15], cB: [0, 5, 10, 15], folds: [{ off: 10, sign: '+' }] },
    ];
    const mb: string[] = [];
    for (let s = 0; s < 2 * N; s++) mb.push(`    var t${s}: u32 = 0u;`);
    for (const g of kgroups) {
      mb.push('');
      mb.push(`    {   // ===== half-product ${g.tag} =====`);
      const emitSb = (out: string, xp: string, yp: string, bases: number[]): void => {
        for (let k = 0; k < 5; k++) {
          mb.push(`        let ${xp}${k}: u32 = ${chunkSum(xlimb, bases, k)};`);
          mb.push(`        let ${yp}${k}: u32 = ${chunkSum(ylimb, bases, k)};`);
        }
        const cols = sbCol(xp, yp);
        for (let m = 0; m < 9; m++) mb.push(`        let ${out}${m}: u32 = ${cols[m]};`);
      };
      emitSb('ll', `x${g.tag}l`, `y${g.tag}l`, g.llB);
      emitSb('hh', `x${g.tag}h`, `y${g.tag}h`, g.hhB);
      emitSb('c', `x${g.tag}c`, `y${g.tag}c`, g.cB);
      for (let k = 0; k < 19; k++) {
        const folds = g.folds.map(f => `t${k + f.off} = t${k + f.off} ${f.sign} p;`).join(' ');
        mb.push(`        { let p: u32 = ${pExpr(k)}; ${folds} }`);
      }
      mb.push('    }');
    }
    const multiply_body = mb.join('\n');

    const yuval_iters: Array<{ i: number; writes: Array<{ slot: number; r_idx: number; first: boolean }> }> = [];
    for (let i = 0; i < N - 1; i++) {
      const writes = [];
      for (let j = 0; j < N; j++) {
        writes.push({ slot: i + 1 + j, r_idx: j, first: j === 0 });
      }
      yuval_iters.push({ i, writes });
    }

    const i_std = N - 1;
    const standard_writes: Array<{ slot: number; p_idx: number; first: boolean }> = [];
    for (let j = 0; j < N; j++) {
      standard_writes.push({ slot: i_std + j, p_idx: j, first: j === 1 });
    }

    const final_drain: Array<{ slot: number }> = [];
    for (let i = 0; i < N; i++) final_drain.push({ slot: N + i });

    const extract: Array<{ out_k: number; src_slot: number }> = [];
    for (let i = 0; i < N; i++) extract.push({ out_k: i, src_slot: N + i });

    return mustache.render(montgomery_product_karat_yuval_funcs, {
      num_words: N,
      word_size: WS,
      n0: this.n0,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
      p_limbs: this.p_limbs,
      r_inv_consts,
      p_limbs_consts,
      multiply_body,
      yuval_iters,
      i_std,
      standard_writes,
      final_drain,
      extract,
    });
  }

  // Device-validated CIOS variant of the base-field multiply. Reuses the
  // Karatsuba scaffold (get_p / conditional_reduce / NUM_WORDS / WORD_SIZE /
  // MASK / N0) and brace-match-replaces ONLY the `fn montgomery_product` body
  // with the fully-unrolled, register-resident CIOS form. This is the exact
  // splice that benched −26% on Pixel 9a / Mali-G715 (488.4 → 360.6 ms, logn=17
  // profile A, cross-check agree, bit-exact over 120000+16 cases). The CIOS
  // body bakes BN254 p-limb immediates, so it is only valid at 20×13-bit limbs.
  private renderCiosUnrolledMont(): string {
    if (this.num_words !== 20 || this.word_size !== 13) {
      throw new Error(
        `montmul='cios_unrolled' is only valid for BN254 (20×13-bit limbs); ` +
          `got num_words=${this.num_words}, word_size=${this.word_size}`,
      );
    }
    const scaffold = this.renderKaratYuvalMont();
    // Brace-match the Karatsuba `fn montgomery_product(...) { ... }` and swap
    // its body for the CIOS one (identical signature + helper dependencies).
    const start = scaffold.indexOf('fn montgomery_product(');
    if (start < 0) throw new Error('renderCiosUnrolledMont: fn montgomery_product not found in scaffold');
    let depth = 0;
    let end = -1;
    for (let i = scaffold.indexOf('{', start); i < scaffold.length; i++) {
      const ch = scaffold[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) throw new Error('renderCiosUnrolledMont: brace-match failed');
    return scaffold.slice(0, start) + montgomery_product_cios_unrolled_funcs.trim() + '\n' + scaffold.slice(end);
  }

  // Renders a limb-width-B CIOS body (B∈{13,14,15,16}) generated by
  // cios_limb_gen.ts and brace-match-splices it over the Karatsuba scaffold's
  // `fn montgomery_product` (reusing get_p / conditional_reduce / BigInt). Two
  // modes, by how this pipeline's limb width relates to B:
  //   • DROP-IN (pipeline 20×13, B≠13): unpacks 20×13 → n×B, runs carry-minimal
  //     CIOS, applies the Montgomery-domain correction (div32 for B=15: ×2^-5),
  //     repacks to 20×13 — signature + walker untouched.
  //   • NATIVE (word_size === B, e.g. 17×15 driving B=15): unpack/repack are
  //     identity and the domain matches (delta=0, no correction) — a clean
  //     register-resident CIOS reducing by 2^(B·n) directly. The wordSize=15
  //     config takes this path; Karatsuba's 20-limb body is spliced OUT and
  //     never compiled.
  // B-specific consts (WS_B/MASK_B/N0_B/TWO_B) are prepended at module scope.
  private renderCiosLimbMont(B: number, correction: Correction = 'halve5'): string {
    const isDropin = this.num_words === 20 && this.word_size === 13;
    const isNative = this.word_size === B;
    if (!isDropin && !isNative) {
      throw new Error(
        `renderCiosLimbMont(B=${B}): pipeline ${this.num_words}×${this.word_size} unsupported ` +
          `(need 20×13 drop-in, or word_size===B for native)`,
      );
    }
    if (![13, 14, 15, 16].includes(B)) throw new Error(`renderCiosLimbMont: unsupported B=${B}`);
    const { consts, body } = genCiosLimbBody(B, correction, { n: this.num_words, w: this.word_size });
    const scaffold = this.renderKaratYuvalMont();
    const start = scaffold.indexOf('fn montgomery_product(');
    if (start < 0) throw new Error('renderCiosLimbMont: fn montgomery_product not found in scaffold');
    let depth = 0;
    let end = -1;
    for (let i = scaffold.indexOf('{', start); i < scaffold.length; i++) {
      const ch = scaffold[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) throw new Error('renderCiosLimbMont: brace-match failed');
    // Prepend the B-specific module-scope consts immediately before the spliced
    // function (valid WGSL: module-scope const declarations are order-free).
    return scaffold.slice(0, start) + consts + '\n' + body.trim() + '\n' + scaffold.slice(end);
  }

  // Renders mont_pro_product_f32_22_sos3uv3.template.wgsl. The .wgsl owns
  // the algorithm — separate per-slot tlo/thi f32 accumulators, no
  // inter-j carry chain, drain at end of each outer iter via
  // bias_split_f32_le4w. This TS supplies index arrays for the mustache
  // slot-init / inner-pairs / drain-cols sections.
  public gen_montgomery_product_f32_22_sos3uv3_shader(): string {
    const N = this.num_limbs_f32_22;
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;

    // Slot init for iter 0: tlo[0] = init_slot0, everything else 0.
    // Slot init for i>=1: tlo[0] = init_slot0 + s1, tlo[k] = s[k+1] for
    // k=1..N-2, tlo[N-1] = 0; thi[*] = 0.
    const slotInitsI0: Array<{ name: string; init_expr: string }> = [];
    const slotInitsGeneral: Array<{ name: string; init_expr: string }> = [];
    for (let k = 0; k < N; k++) {
      slotInitsI0.push({ name: `tlo${k}`, init_expr: k === 0 ? 'init_slot0' : '0.0' });
      slotInitsI0.push({ name: `thi${k}`, init_expr: '0.0' });
      let genTlo: string;
      if (k === 0) genTlo = 'init_slot0 + s1';
      else if (k === N - 1) genTlo = '0.0';
      else genTlo = `s${k + 1}`;
      slotInitsGeneral.push({ name: `tlo${k}`, init_expr: genTlo });
      slotInitsGeneral.push({ name: `thi${k}`, init_expr: '0.0' });
    }

    // Inner-j pairs: for j=1..N-1, write tlo[j-1] += lo_sum, thi[j] += hi_sum.
    const innerPairs = [];
    for (let j = 1; j < N; j++) innerPairs.push({ j, km1: j - 1, k: j });

    // Drain cols: k=0..N-1.
    const drainCols = Array.from({ length: N }, (_, k) => ({ k }));

    const ctx = {
      num_limbs: N,
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      slot_inits_i0: slotInitsI0,
      slot_inits_general: slotInitsGeneral,
      inner_pairs: innerPairs,
      drain_cols: drainCols,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3uv3_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // --- Streaming planner + accumulator generators ---

  public gen_ba_planner_classify_shader(workgroup_size: number, b_total: number, bw: number, stride: number): string {
    return mustache.render(ba_planner_classify_shader, { workgroup_size, b_total, bw, stride, recompile: this.recompile });
  }

  public gen_ba_planner_meta_fixup_shader(): string {
    return mustache.render(ba_planner_meta_fixup_shader, { recompile: this.recompile });
  }

  public gen_ba_planner_radix_count_shader(tile_size: number): string {
    return mustache.render(ba_planner_radix_count_shader, { tile_size, recompile: this.recompile });
  }

  public gen_ba_planner_radix_scan_shader(): string {
    return mustache.render(ba_planner_radix_scan_shader, { recompile: this.recompile });
  }

  public gen_ba_planner_radix_scatter_shader(tile_size: number): string {
    return mustache.render(ba_planner_radix_scatter_shader, { tile_size, recompile: this.recompile });
  }

  public gen_ba_planner_cumsum_shader(
    num_threads: number,
    s: number,
    min_iters_per_wg: number,
    max_workgroups: number,
    planner_tpb: number,
  ): string {
    return mustache.render(ba_planner_cumsum_shader, {
      num_threads, s, min_iters_per_wg, max_workgroups, planner_tpb, recompile: this.recompile,
    });
  }

  public gen_ba_planner_partition_wg_shader(workgroup_size: number): string {
    return mustache.render(ba_planner_partition_wg_shader, { workgroup_size, recompile: this.recompile });
  }

  public gen_ba_planner_partition_thread_shader(workgroup_size: number): string {
    return mustache.render(ba_planner_partition_thread_shader, { workgroup_size, recompile: this.recompile });
  }

  public gen_ba_size1_shader(bw: number, stride: number, m_red: number): string {
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_size1_shader,
      {
        bw, stride, m_red,
        p8_consts, r8_csv, f8_words,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack, dec_pack: dec.pack,
        recompile: this.recompile,
      },
      { structs, bigint_funcs, montgomery_product_funcs: this.mont_product_src, field_funcs, field8_funcs },
    );
  }

  // KNOB 2 (stream-walker variant): hoists per-thread task partitioning into
  // a dedicated planner kernel. Pure u32 binary-search logic — same field-free
  // shape as partition_thread.
  public gen_ba_planner_partition_task_shader(walker_tpb: number, s: number, thread_tpb: number): string {
    return mustache.render(ba_planner_partition_task_shader, {
      walker_tpb, s, thread_tpb, recompile: this.recompile,
    });
  }

  // Stream-walker accumulator (Plan §6, design-knob variant C). TPB=64 with
  // workgroup pref_scratch (KNOB 1) and precomputed task_cuts (KNOB 2).
  public gen_ba_stream_walker_shader(
    workgroup_size: number,
    s: number,
    bw: number,
    stride: number,
    m_red: number,
    variant: 'loop' | 'pk' = 'pk',
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
    const { invFn: inv_fn, inverseFuncs: inverse_funcs, bigintByFuncs } = this.invWiring(variant);
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    // Register-lean walker. The montmul/inverse workgroup relocations (P1/P2)
    // are DISABLED: the montmul and inverse spill 0 bytes in isolation, so
    // moving their internals to workgroup didn't cut the walker's spill and only
    // added LDS pressure (occupancy 6%->4%). The walker's ~4.3 KB scratch is the
    // per-slot peel state, now streamed from global (acc_x/acc_y above). Left
    // gated so they can be re-enabled if a fissioned design makes them pay off.
    const regfile_lean = false;
    const regfile_lean_inv = regfile_lean && variant === 'pk';
    const eff_inv_fn = regfile_lean_inv ? `${inv_fn}_wg` : inv_fn;
    return mustache.render(
      ba_stream_walker_shader,
      {
        workgroup_size, s, inv_fn: eff_inv_fn, inv_f8: this.word_size === 13 && variant === 'pk',
        bw, stride, m_red,
        p8_consts, r8_csv, f8_words,
        // regfile_lean: route the f8 multiply through the workgroup-backed
        // montgomery_product_wg and declare its scratch. cios_unrolled only.
        regfile_lean,
        regfile_lean_inv,
        // f8_native: use the packed-native register-lean montgomery_product_f8
        // (no x20/r/s BigInt temps). cios_unrolled 13-bit only.
        f8_native: this.montmul === 'cios_unrolled' && this.word_size === 13,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      {
        structs, bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_wg_funcs: this.mont_product_wg_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        inverse_wg_funcs: by_inverse_loop_pk_wg_funcs,
        field_funcs, field8_funcs, fr_pow_funcs, bigint_by_funcs: bigintByFuncs, inverse_funcs,
      },
    );
  }

  // === Optimal walker_combine — cross-bucket batched-inversion pipeline. ===

  public gen_ba_walker_combine_count_shader(workgroup_size: number): string {
    return mustache.render(
      ba_walker_combine_count_shader,
      { workgroup_size, recompile: this.recompile },
    );
  }

  public gen_ba_walker_combine_scan_shader(tpb: number): string {
    return mustache.render(
      ba_walker_combine_scan_shader,
      { tpb, recompile: this.recompile },
    );
  }

  public gen_ba_walker_combine_scatter_shader(workgroup_size: number): string {
    return mustache.render(
      ba_walker_combine_scatter_shader,
      { workgroup_size, recompile: this.recompile },
    );
  }

  public gen_ba_walker_combine_filter_shader(workgroup_size: number, bw: number, stride: number, m_red: number): string {
    return mustache.render(
      ba_walker_combine_filter_shader,
      { workgroup_size, bw, stride, m_red, recompile: this.recompile },
    );
  }

  public gen_ba_walker_combine_sort_count_shader(workgroup_size: number): string {
    return mustache.render(
      ba_walker_combine_sort_count_shader,
      { workgroup_size, recompile: this.recompile },
    );
  }

  public gen_ba_walker_combine_sort_scan_shader(): string {
    return mustache.render(
      ba_walker_combine_sort_scan_shader,
      { recompile: this.recompile },
    );
  }

  public gen_ba_walker_combine_sort_scatter_shader(workgroup_size: number): string {
    return mustache.render(
      ba_walker_combine_sort_scatter_shader,
      { workgroup_size, recompile: this.recompile },
    );
  }

  public gen_ba_walker_pt_init_scan_shader(): string {
    return mustache.render(ba_walker_pt_init_scan_shader, { recompile: this.recompile });
  }

  public gen_ba_walker_pt_init_copy_shader(workgroup_size: number): string {
    return mustache.render(ba_walker_pt_init_copy_shader, { workgroup_size, recompile: this.recompile });
  }

  public gen_ba_walker_pt_build_shader(workgroup_size: number): string {
    return mustache.render(ba_walker_pt_build_shader, { workgroup_size, recompile: this.recompile });
  }

  public gen_ba_walker_pt_dispatch_chain_shader(): string {
    return mustache.render(ba_walker_pt_dispatch_chain_shader, { recompile: this.recompile });
  }

  public gen_ba_walker_pt_finalize_shader(workgroup_size: number, bw: number, stride: number, m_red: number): string {
    return mustache.render(ba_walker_pt_finalize_shader, { workgroup_size, bw, stride, m_red, recompile: this.recompile });
  }

  public gen_ba_unified_combine_shader(
    workgroup_size: number,
    s: number,
    variant: 'loop' | 'pk' = 'pk',
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
    const { invFn: inv_fn, inverseFuncs: inverse_funcs, bigintByFuncs } = this.invWiring(variant);
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_unified_combine_shader,
      {
        workgroup_size, s, inv_fn, inv_f8: this.word_size === 13 && variant === 'pk',
        p8_consts, r8_csv, f8_words,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      {
        structs, bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs, field8_funcs, fr_pow_funcs, bigint_by_funcs: bigintByFuncs, inverse_funcs,
      },
    );
  }

  public gen_ba_walker_combine_batched_shader(
    workgroup_size: number,
    s: number,
    bw: number,
    stride: number,
    m_red: number,
    variant: 'loop' | 'pk' = 'pk',
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
    const { invFn: inv_fn, inverseFuncs: inverse_funcs, bigintByFuncs } = this.invWiring(variant);
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_walker_combine_batched_shader,
      {
        workgroup_size, s, inv_fn, inv_f8: this.word_size === 13 && variant === 'pk',
        bw, stride, m_red,
        p8_consts, r8_csv, f8_words,
        // Use the packed-native register-lean montgomery_product_f8 (cios_unrolled 13-bit).
        f8_native: this.montmul === 'cios_unrolled' && this.word_size === 13,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      {
        structs, bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs, field8_funcs, fr_pow_funcs, bigint_by_funcs: bigintByFuncs, inverse_funcs,
      },
    );
  }
}
