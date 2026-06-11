import mustache from 'mustache';
import {
  barrett as barrett_funcs,
  ba_reduce_level_bench as ba_reduce_level_bench_shader,
  ba_reduce_fold as ba_reduce_fold_shader,
  ba_reduce_fold_coop as ba_reduce_fold_coop_shader,
  ba_reduce_fold_jac as ba_reduce_fold_jac_shader,
  ba_reduce_fold_pair as ba_reduce_fold_pair_shader,
  ba_halve as ba_halve_shader,
  jac_halve as jac_halve_shader,
  halve_finish_arrays as halve_finish_arrays_shader,
  halve_finish_root as halve_finish_root_shader,
  ba_reduce_fold_tlocal as ba_reduce_fold_tlocal_shader,
  ba_reduce_fold_sum as ba_reduce_fold_sum_shader,
  ba_reduce_fold_weight as ba_reduce_fold_weight_shader,
  ba_reduce_sparse as ba_reduce_sparse_shader,
  ba_reduce_level_jacobian as ba_reduce_level_jacobian_shader,
  ba_reduce_z_init as ba_reduce_z_init_shader,
  ba_reduce_jac_finalize as ba_reduce_jac_finalize_shader,
  ba_reduce_jac_to_affine as ba_reduce_jac_to_affine_shader,
  ba_msb_histogram as ba_msb_histogram_shader,
  ba_decide_window_split as ba_decide_window_split_shader,
  ba_idx_large_compact as ba_idx_large_compact_shader,
  decompose_scalars_booth_upper as decompose_scalars_booth_upper_shader,
  transpose_scatter_tiled_upper as transpose_scatter_tiled_upper_shader,
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
  ba_planner_resolve_l0base as ba_planner_resolve_l0base_shader,
  ba_stream_walker as ba_stream_walker_shader,
  ba_walker_combine_batched as ba_walker_combine_batched_shader,
  ba_walker_idx_count as ba_walker_idx_count_shader,
  ba_walker_idx_alloc as ba_walker_idx_alloc_shader,
  ba_walker_idx_epilogue as ba_walker_idx_epilogue_shader,
  ba_walker_idx_scatter as ba_walker_idx_scatter_shader,
  ba_walker_idx_sort as ba_walker_idx_sort_shader,
  ba_walker_idx_p1 as ba_walker_idx_p1_shader,
  ba_walker_idx_p2 as ba_walker_idx_p2_shader,
  ba_walker_pt_init_scan as ba_walker_pt_init_scan_shader,
  ba_walker_pt_init_copy as ba_walker_pt_init_copy_shader,
  ba_walker_pt_build as ba_walker_pt_build_shader,
  ba_walker_pt_dispatch_chain as ba_walker_pt_dispatch_chain_shader,
  ba_unified_combine as ba_unified_combine_shader,
  ba_walker_pt_finalize as ba_walker_pt_finalize_shader,
  bigint as bigint_funcs,
  bigint_by as bigint_by_funcs,
  // The ONLY inverse: packed-14-bit native safegcd (f8 in/out), fr_inv_by_loop_pk.
  by_inverse_loop_pk14_native as by_inverse_loop_pk14_native_funcs,
  convert_points_only as convert_points_only_shader,
  csr_to_v2_active_sums as csr_to_v2_active_sums_shader,
  csr_to_v2_meta as csr_to_v2_meta_shader,
  decompose_scalars_booth as decompose_scalars_booth_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  field as field_funcs,
  field8 as field8_funcs,
  microbench as microbench_shader,
  mont_pro_product_f8_native as montgomery_product_f8_native_funcs,
  mont_pro_product_karat_yuval as montgomery_product_karat_yuval_funcs,
  structs,
  transpose_parallel_scan as transpose_parallel_scan_shader,
  transpose_count_tiled as transpose_count_tiled_shader,
  transpose_reduce_tiled as transpose_reduce_tiled_shader,
  transpose_scatter_tiled as transpose_scatter_tiled_shader,
  pp2_digit_count as pp2_digit_count_shader,
  pp2_bin_scan as pp2_bin_scan_shader,
  pp2_bin_scatter_direct as pp2_bin_scatter_direct_shader,
  pp2_bin_sort_emit as pp2_bin_sort_emit_shader,
  ba_fused_super_bench as ba_fused_super_bench_shader,
  ba_fused_tail_coop as ba_fused_tail_coop_shader,
  ba_carry_copy_bench as ba_carry_copy_bench_shader,
  ba_finalize_copy_bench as ba_finalize_copy_bench_shader,
  ba_finalize_accumulate_bench as ba_finalize_accumulate_bench_shader,
  ba_planner_v2_offsets as ba_planner_v2_offsets_shader,
  ba_planner_v2_emit as ba_planner_v2_emit_shader,
  ba_reduce_init_bench as ba_reduce_init_bench_shader,
} from '../wgsl/_generated/shaders.js';
import {
  compute_by_p_inv_a,
  compute_by_p_inv_split,
  compute_misc_params,
  compute_mod_inverse_pow2,
  gen_p_limbs,
  gen_p_limbs_by_initializer,
  gen_r_limbs,
  gen_mu_limbs,
} from './utils.js';
import { BN254_CURVE_CONFIG, CurveConfig } from './curve_config.js';

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

// Split a < 2^256 bigint into 8 little-endian u32 words — the packed
// field8 representation. Used both for the field8 constants and the
// decompress shader's packed curve constants.
function words8(v: bigint): number[] {
  const out: number[] = [];
  let x = v;
  for (let i = 0; i < 8; i++) {
    out.push(Number(x & 0xffffffffn));
    x >>= 32n;
  }
  return out;
}

// CSV of 8 little-endian u32 words with the `u` suffix, for inlining a
// 256-bit constant into a WGSL `array<u32, 8>(...)` initialiser.
function words8Csv(v: bigint): string {
  return words8(v)
    .map(w => `${w >>> 0}u`)
    .join(', ');
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
  public p_inv_mod_2w: number;
  public mu_limbs: string;
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
  // Packed-native f8 montgomery_product_f8 source. Empty unless
  // montmul='cios_unrolled'; field8's `f8_native` flag then selects this
  // packed CIOS multiply (no x20/r/s BigInt temps) over the unpack wrapper.
  public mont_f8_native_src: string;
  // The selected montmul variant (karat | cios_unrolled).
  private montmul: MontMulVariant;
  public curveConfig: CurveConfig;
  public recompile = '';

  constructor(
    chunk_size: number,
    input_size: number,
    curveConfig: CurveConfig = BN254_CURVE_CONFIG,
    force_recompile = false,
    // Base-field multiply selector. 'karat' (default) is the generic
    // 20×13-limb Karatsuba+Yuval body — the high-register path (e.g. Apple).
    // 'cios_unrolled' selects the packed-native 8×u32 CIOS multiply
    // (f8_native) on every kernel — the register-lean Adreno/Mali path
    // (−26% on Mali-G715, BN254 @ 20×13 only).
    montmul: MontMulVariant = 'karat',
  ) {
    this.curveConfig = curveConfig;
    this.p = curveConfig.baseFieldModulus;
    const params = compute_misc_params(this.p, curveConfig.wordSize);
    this.word_size = curveConfig.wordSize;
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
    this.p_inv_mod_2w = compute_mod_inverse_pow2(this.p, this.word_size);
    this.mu_limbs = gen_mu_limbs(this.p, this.num_words, this.word_size);
    this.p_bitlength = this.p.toString(2).length;
    this.slack = this.num_words * this.word_size - this.p_bitlength;
    this.w_mask = (1 << this.word_size) - 1;

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

    // The generic 20×13-limb Karatsuba+Yuval Mont body: the `montmul=karat`
    // multiply, and the BigInt body the field8 wrapper expands to in the karat
    // path. In the `montmul=cios_unrolled` (f8_native) path every kernel uses
    // the packed multiply below, so this body is dead-code-eliminated there.
    this.mont_product_src = this.renderKaratYuvalMont();
    // The packed-native 8×u32 CIOS multiply (`montmul=cios_unrolled` / f8_native):
    // the Adreno fast path (no x20/r/s BigInt spill). field8's `f8_native` branch
    // injects it on every kernel; empty in the karat path.
    this.mont_f8_native_src = montmul === 'cios_unrolled' ? montgomery_product_f8_native_funcs.trim() : '';
    this.montmul = montmul;

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
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    // Packed curve constants for the f8 path: R^2 (native -> Montgomery),
    // 3·R (Montgomery b), and the raw closed-form sqrt exponent (q+1)/4.
    const r_squared = (this.r * this.r) % this.p;
    const b3_mont = (3n * this.r) % this.p;
    const sqrt_exp = (this.p + 1n) / 4n;
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
        w_mask: this.w_mask,
        slack: this.slack,
        num_words_mul_two: this.num_words * 2,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        r_squared_csv: words8Csv(r_squared),
        b3_mont_csv: words8Csv(b3_mont),
        sqrt_exp_csv: words8Csv(sqrt_exp),
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        field_funcs,
        barrett_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field8_funcs,
      },
    );
  }

  public gen_decompose_scalars_booth_shader(workgroup_size: number): string {
    return mustache.render(decompose_scalars_booth_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  public gen_ba_msb_histogram_shader(): string {
    return mustache.render(ba_msb_histogram_shader, { recompile: this.recompile }, {});
  }

  public gen_ba_decide_window_split_shader(): string {
    return mustache.render(ba_decide_window_split_shader, { recompile: this.recompile }, {});
  }

  public gen_ba_idx_large_compact_shader(): string {
    return mustache.render(ba_idx_large_compact_shader, { recompile: this.recompile }, {});
  }

  public gen_decompose_scalars_booth_upper_shader(workgroup_size: number): string {
    return mustache.render(decompose_scalars_booth_upper_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  public gen_transpose_scatter_tiled_upper_shader(workgroup_size: number, tile: number): string {
    return mustache.render(
      transpose_scatter_tiled_upper_shader,
      { workgroup_size, tile, recompile: this.recompile },
      {},
    );
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
   * pp2 K1 — fused Booth decompose + coarse-bin count. The window schedule is
   * code-generated: per window, literal word indices / shift amounts / masks
   * (no dynamic register indexing, no runtime-variable shifts — Adreno-safe).
   * `windowCs` is the per-window bit-width schedule (uniform fill = c
   * repeated); bit bases are its prefix sums, i.e. a single-MSM scalar layout.
   */
  public gen_pp2_digit_count_shader(
    workgroup_size: number,
    windowCs: number[],
    binShift: number,
    binsP: number,
  ): string {
    const nw = windowCs.length;
    const histLen = nw * binsP;
    if (histLen > 4096) {
      throw new Error(`gen_pp2_digit_count_shader: hist ${nw}x${binsP} exceeds the 16KB shared budget`);
    }
    // Two register naming schemes: (sa, sb) for the thread's first point and
    // (sc, sd) for its pair partner in u16 mode.
    const mkRaw = (lo4: string, hi4: string): ((cw: number, bitBase: number) => string) => {
      const wname = (k: number): string => (k < 4 ? `${lo4}.${'xyzw'[k]}` : `${hi4}.${'xyzw'[k - 4]}`);
      return (cw: number, bitBase: number): string => {
        const maskC1 = (1 << (cw + 1)) - 1;
        if (bitBase === 0) {
          // Bottom window: synthetic 0 lookback — bits [0, cw) shifted up one.
          return `((${wname(0)} << 1u) & ${maskC1}u)`;
        }
        const lo = bitBase - 1; // lookback bit position
        const wordLo = lo >> 5;
        const off = lo & 31;
        let e = off === 0 ? wname(wordLo) : `(${wname(wordLo)} >> ${off}u)`;
        if (off + cw + 1 > 32 && wordLo + 1 < 8) {
          e = `(${e} | (${wname(wordLo + 1)} << ${32 - off}u))`;
        }
        return `(${e} & ${maskC1}u)`;
      };
    };
    const raw0 = mkRaw('sa', 'sb');
    const raw1 = mkRaw('sc', 'sd');
    let bitBase = 0;
    const windows = windowCs.map((cw, w) => {
      if (cw < 2 || cw > 15) throw new Error(`gen_pp2_digit_count_shader: window ${w} width ${cw} out of range`);
      const ctx = {
        w,
        c: cw,
        bit_lo: Math.max(0, bitBase - 1),
        bit_hi: bitBase + cw,
        mask_c: (1 << cw) - 1,
        raw_expr: raw0(cw, bitBase),
        raw_expr2: raw1(cw, bitBase),
      };
      bitBase += cw;
      return ctx;
    });
    return mustache.render(
      pp2_digit_count_shader,
      {
        workgroup_size,
        num_windows: nw,
        bins_p: binsP,
        bin_shift: binShift,
        hist_len: histLen,
        windows,
        recompile: this.recompile,
      },
      {},
    );
  }

  /**
   * pp2 K2 — direct bin-cursor scatter over the u16 digit array: one shared
   * atomic claim + one coalesced write per point, no reorder staging. The
   * device-independent composition (see the template header).
   */
  public gen_pp2_bin_scatter_direct_shader(workgroup_size: number, binsP: number, binShift: number): string {
    if (binsP > workgroup_size) {
      throw new Error(`gen_pp2_bin_scatter_direct_shader: bins_p ${binsP} exceeds workgroup_size ${workgroup_size}`);
    }
    return mustache.render(
      pp2_bin_scatter_direct_shader,
      { workgroup_size, bins_p: binsP, bin_shift: binShift, recompile: this.recompile },
      {},
    );
  }

  /** pp2 K1.5 — per-window exclusive scan of the bin-count matrix (one
   * workgroup per window; bases come from point_offsets). */
  public gen_pp2_bin_scan_shader(): string {
    return mustache.render(pp2_bin_scan_shader, { recompile: this.recompile }, {});
  }

  /** pp2 K3 — per-(window, bin) counting sort + final l0/meta emit. */
  public gen_pp2_bin_sort_emit_shader(workgroup_size: number, binShift: number): string {
    const lows = 1 << binShift;
    if (lows > workgroup_size) {
      throw new Error(`gen_pp2_bin_sort_emit_shader: 2^${binShift} low buckets exceed workgroup_size ${workgroup_size}`);
    }
    return mustache.render(
      pp2_bin_sort_emit_shader,
      { workgroup_size, bin_shift: binShift, lows, recompile: this.recompile },
      {},
    );
  }

  /**
   * Lever 2 mustache context for the 8x u32 live field form (field8_funcs
   * partial): p / R as eight 32-bit words for the native fr_add_f8 /
   * fr_sub_f8 and the get_r_f8 seed, plus the 0..7 unroll index list.
   */
  private f8Context() {
    return {
      p8_consts: words8(this.p).map((val, idx) => ({ idx, val })),
      r8_csv: words8Csv(this.r),
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
      throw new Error(
        `gen_csr_to_v2_active_sums_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
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
    return mustache.render(csr_to_v2_meta_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  /**
   * Isolated montmul / inverse microbench (profiling harness). op='mul' chains
   * the BigInt `montgomery_product` (the montmul body selected by `montmul`);
   * op='inv' chains a field inverse. `pk14` selects the packed-14-bit safegcd
   * inverse (f8 in/out, the walker's hot path) over the default BigInt loop
   * inverse — the same two paths the stream-walker offers, so the microbench can
   * attribute the inverse cost in isolation under a GPU-counter capture. Drives a
   * dependent + stored chain so the work can't be DCE'd. See `runMicrobench`.
   */
  public gen_microbench_shader(op: 'mul' | 'inv', chain_k: number, nthreads: number, pk14 = false): string {
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    return mustache.render(
      microbench_shader,
      {
        is_mul: op === 'mul',
        is_inv: op === 'inv',
        inv_f8: true,
        inv_fn,
        chain_k,
        nthreads,
        in_stride: 2 * this.num_words,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Reduction-stage level kernel. ONE kernel handles all three kinds
   * (0 = phase-A suffix add, 1 = phase-B/D tree-add, 2 = phase-C double)
   * via runtime branch on `lparams.w` — uniform across the workgroup, so
   * the compiler specialises per-dispatch with no SIMT divergence.
   */
  public gen_ba_reduce_level_bench_shader(
    workgroup_size: number,
    variant: 'loop' | 'pk' = 'pk',
    addsub: 'native' | 'unpack' = 'native',
  ): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_reduce_level_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_level_bench_shader,
      {
        workgroup_size,
        inv_fn,
        addsub_unpack: addsub === 'unpack',
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * One depth of the halving bucket reduction (Mitschabaude), batch-affine:
   * each thread takes `cpairs` independent pair-additions of the depth
   * (strided for coalescing) and shares ONE pk14 inversion across them.
   * Pairs are COMPLETE: equal x selects the doubling denominator 2y into
   * the chain (a zero denominator would poison the shared inversion) and a
   * rarely-taken branch in the apply uses the 3x² numerator; equal x with
   * negated y clears the presence bit (infinity). Straight-line; the only
   * loops in the module are the inverse's own.
   */
  public gen_ba_halve_shader(workgroup_size: number, cpairs: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_halve_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    if (![4, 8].includes(cpairs)) {
      throw new Error(`gen_ba_halve_shader: cpairs (${cpairs}) must be 4 or 8`);
    }
    // Rolled emission: every loop bound comes from lparams.y (== cpairs, but
    // the driver cannot prove it), so mobile compilers keep the small bodies
    // rolled instead of inlining cpairs copies of the montmul. The batch
    // inversion follows the stream walker exactly: forward chain in a
    // register with prefixes stored to the GLOBAL pref scratch (the last
    // prefix feeds the inverter in-register), then a fused backward
    // peel + apply that reloads the prefix and recomputes the denominator
    // from cache-hot coordinate loads. Per-pair state across the two loops
    // is a 4-bit flag nibble (ps/act/dbl/inf).
    const gather: string[] = [];
    gather.push(`    let cd = lparams.y;`);
    gather.push(`    let ft = w * T + t;`);
    gather.push(`    let kstr = 2u * T * cparams.w;`);
    gather.push(`    var fl: u32 = 0u;`);
    gather.push(`    var chain: array<u32, 8> = r1;`);
    gather.push(`    for (var k = 0u; k < cd; k = k + 1u) {`);
    gather.push(`        let q = t + k * T;`);
    gather.push(`        let on = q < pairs;`);
    gather.push(`        let dst = base + arena_off(B, q >> hshift) + (q & (half - 1u));`);
    gather.push(`        let src = dst + half;`);
    gather.push(`        let pd = on && (is_present[dst] != 0u);`);
    gather.push(`        let ps = on && (is_present[src] != 0u);`);
    gather.push(`        let act = pd && ps;`);
    gather.push(`        var den = r1;`);
    gather.push(`        var f = select(0u, 1u, ps) | select(0u, 2u, act);`);
    gather.push(`        if (act) {`);
    gather.push(`            let xd = load_x(dst, M_RED);`);
    gather.push(`            let xs = load_x(src, M_RED);`);
    gather.push(`            den = fr_sub_f8(xs, xd);`);
    gather.push(`            if (fr_eq_f8(xd, xs)) {`);
    gather.push(`                let yd = load_y(dst, M_RED);`);
    gather.push(`                let ys = load_y(src, M_RED);`);
    gather.push(`                if (fr_is_zero_f8(fr_add_f8(yd, ys))) {`);
    gather.push(`                    f = f | 8u;`);
    gather.push(`                    den = r1;`);
    gather.push(`                } else {`);
    gather.push(`                    f = f | 4u;`);
    gather.push(`                    den = fr_add_f8(yd, yd);`);
    gather.push(`                }`);
    gather.push(`            }`);
    gather.push(`        }`);
    gather.push(`        fl = fl | (f << (4u * k));`);
    gather.push(`        if ((f & 10u) == 2u) {`);
    gather.push(`            // act && !inf — every other case has den == Montgomery 1.`);
    gather.push(`            chain = montgomery_product_f8(chain, den);`);
    gather.push(`        }`);
    gather.push(`        if (k + 1u < cd) {`);
    gather.push(`            // pp[k] must be written even when the multiply was an`);
    gather.push(`            // identity skip — the peel loads it unconditionally.`);
    gather.push(`            store_pref(k, ft, kstr, chain);`);
    gather.push(`        }`);
    gather.push(`    }`);
    const invert: string[] = [];
    invert.push(`    var inv_acc: array<u32, 8> = fr_inv_by_loop_pk(chain);`);
    // Backward peel fused with the apply, with the walker's live-range
    // discipline: x_sum is formed immediately so xs dies before the y phase;
    // the denominator is consumed into inv_acc during the x phase (its only
    // other use); ys dies into num; xd/yd survive only to the final r_y.
    // Inactive/infinity/copy pairs contributed an IDENTITY denominator to
    // the chain, so their vi and inv_acc multiplies are skipped outright —
    // multiplying by Montgomery 1 is a no-op, not an approximation.
    const apply: string[] = [];
    apply.push(`    for (var kk = 0u; kk < cd; kk = kk + 1u) {`);
    apply.push(`        let k = cd - 1u - kk;`);
    apply.push(`        let f = (fl >> (4u * k)) & 15u;`);
    apply.push(`        let ps = (f & 1u) != 0u;`);
    apply.push(`        let act = (f & 2u) != 0u;`);
    apply.push(`        let dbl = (f & 4u) != 0u;`);
    apply.push(`        let inf = (f & 8u) != 0u;`);
    apply.push(`        let q = t + k * T;`);
    apply.push(`        let dst = base + arena_off(B, q >> hshift) + (q & (half - 1u));`);
    apply.push(`        let src = dst + half;`);
    apply.push(`        if (ps) {`);
    apply.push(`            if (act && !inf) {`);
    apply.push(`                var vi = inv_acc;`);
    apply.push(`                if (k > 0u) {`);
    apply.push(`                    vi = montgomery_product_f8(inv_acc, load_pref(k - 1u, ft, kstr));`);
    apply.push(`                }`);
    apply.push(`                let xd = load_x(dst, M_RED);`);
    apply.push(`                let xs = load_x(src, M_RED);`);
    apply.push(`                let yd = load_y(dst, M_RED);`);
    apply.push(`                let x_sum = fr_add_f8(xd, xs);`);
    apply.push(`                if (k > 0u) {`);
    apply.push(`                    var den = fr_sub_f8(xs, xd);`);
    apply.push(`                    if (dbl) {`);
    apply.push(`                        den = fr_add_f8(yd, yd);`);
    apply.push(`                    }`);
    apply.push(`                    inv_acc = montgomery_product_f8(inv_acc, den);`);
    apply.push(`                }`);
    apply.push(`                var num = fr_sub_f8(load_y(src, M_RED), yd);`);
    apply.push(`                if (dbl) {`);
    apply.push(`                    let xx = montgomery_product_f8(xd, xd);`);
    apply.push(`                    num = fr_add_f8(fr_add_f8(xx, xx), xx);`);
    apply.push(`                }`);
    apply.push(`                let lam = montgomery_product_f8(num, vi);`);
    apply.push(`                var rx = montgomery_product_f8(lam, lam);`);
    apply.push(`                rx = fr_sub_f8(rx, x_sum);`);
    apply.push(`                var ry = fr_sub_f8(xd, rx);`);
    apply.push(`                ry = fr_sub_f8(montgomery_product_f8(lam, ry), yd);`);
    apply.push(`                store_x(dst, M_RED, rx);`);
    apply.push(`                store_y(dst, M_RED, ry);`);
    apply.push(`            } else if (act) {`);
    apply.push(`                is_present[dst] = 0u;`);
    apply.push(`            } else {`);
    apply.push(`                store_x(dst, M_RED, load_x(src, M_RED));`);
    apply.push(`                store_y(dst, M_RED, load_y(src, M_RED));`);
    apply.push(`                is_present[dst] = 1u;`);
    apply.push(`            }`);
    apply.push(`        }`);
    apply.push(`    }`);
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_halve_shader,
      {
        workgroup_size,
        cpairs,
        pairs_gather: gather.join('\n'),
        chain_invert_peel: invert.join('\n'),
        pairs_apply: apply.join('\n'),
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * One depth of the halving reduction in the thread-starved regime: one
   * COMPLETE Jacobian pair-addition per thread at maximum width. Requires
   * the z-plane to be initialised for every present slot (r1 while affine).
   */
  public gen_jac_halve_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_jac_halve_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      jac_halve_shader,
      {
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
      },
    );
  }

  /**
   * Halving-reduction finisher, pass 1: one workgroup per (window, array),
   * ZERO workgroup memory — the trees fold IN PLACE in global memory (the
   * arena slots the values already occupy) with storageBarrier() between
   * steps, so occupancy is bounded only by thread slots. Carry workgroups
   * tree-reduce their array and apply its power-of-two constant (the
   * doubling chains run concurrently across workgroups); the total lands on
   * the array home slot, which IS the staging slot. The weighted-array
   * workgroup continues the halving recursion inside its own region.
   * Geometry baked; complete arithmetic; affine-entry variants synthesize z
   * from is_present exactly where slots are still untouched originals.
   */
  public gen_halve_finish_arrays_shader(stride: number, finisherDepth: number, _inputsJac: boolean): string {
    if (stride < 2 || (stride & (stride - 1)) !== 0) {
      throw new Error(`gen_halve_finish_arrays_shader: stride (${stride}) must be a power of two >= 2`);
    }
    const B = stride;
    const df = finisherDepth;
    const Lf = B >> df;
    const workgroup_size = Math.max(32, Lf >> 1);
    if (Lf * 96 > 24 * 1024) {
      throw new Error(`gen_halve_finish_arrays_shader: Lf (${Lf}) needs ${Lf * 96}B of workgroup memory`);
    }
    // Rolled emission, ONE jac_cadd and ONE jac_cdbl callsite in the whole
    // module: fully inlining a cadd per baked tree depth/branch produced
    // multi-hundred-montmul bodies that crash the Adreno/Mali shader
    // compilers. The tree lives in WORKGROUP memory with workgroupBarrier()
    // — the pattern every phone-proven cooperative kernel here uses; the
    // global-in-place variant synchronized with storageBarrier() returns
    // non-deterministic garbage on Adreno (storage writes are not made
    // visible across the workgroup). The region's Lf slots are loaded once
    // up front (z synthesized from is_present for affine-entry runs — at
    // entry every slot is still an original), reduced in shared, and only
    // the home slot is written back.
    //
    // Loop bounds derive from lparams (uniform) so driver unrollers cannot
    // expand the bodies. W workgroup (a == 0) iteration plan: lgLf tree
    // depths, then lgLf Horner steps over the internal carries using
    // carry_1's home slot (Lf/2) as the accumulator: steps j < lgLf-1
    // double the accumulator then add carry_{j+2}; the last step adds the
    // accumulator into the W root (slot 0). Carry workgroups: lgLf tree
    // depths, then (r - a) doubles of slot 0.
    const body: string[] = [];
    body.push(`    let df = lparams.x;`);
    body.push(`    let ij = lparams.y != 0u;`);
    body.push(`    let r = lparams.z;`);
    body.push(`    let lgLf = r - df;`);
    body.push(`    let Lf = 1u << lgLf;`);
    body.push(`    if (lparams.w != 0u) {`);
    body.push(`        // Dump mode (depth bisection): stage window w's RAW W-region`);
    body.push(`        // slot a — no reduction at all. Diffing these records across`);
    body.push(`        // devices after N wide depths localizes the first divergent pass.`);
    body.push(`        if (t == 0u) {`);
    body.push(`            let g = base + a;`);
    body.push(`            var dz: array<u32, 8>;`);
    body.push(`            if (ij) {`);
    body.push(`                dz = load_zp(g);`);
    body.push(`            } else {`);
    body.push(`                dz = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);`);
    body.push(`                if (is_present[g] != 0u) {`);
    body.push(`                    dz = get_r_f8();`);
    body.push(`                }`);
    body.push(`            }`);
    body.push(`            stage_set(w * (df + 1u) + a, Jac(load_x(g, M_RED), load_y(g, M_RED), dz));`);
    body.push(`        }`);
    body.push(`        return;`);
    body.push(`    }`);
    body.push(`    for (var i = t; i < Lf; i = i + WG) {`);
    body.push(`        let g = base + off + i;`);
    body.push(`        var z: array<u32, 8>;`);
    body.push(`        if (ij) {`);
    body.push(`            z = load_zp(g);`);
    body.push(`        } else {`);
    body.push(`            z = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);`);
    body.push(`            if (is_present[g] != 0u) {`);
    body.push(`                z = get_r_f8();`);
    body.push(`            }`);
    body.push(`        }`);
    body.push(`        sstore(i, Jac(load_x(g, M_RED), load_y(g, M_RED), z));`);
    body.push(`    }`);
    body.push(`    workgroupBarrier();`);
    body.push(`    let iters = lgLf + select(r - a, lgLf, a == 0u);`);
    body.push(`    let NOSLOT = 0xffffffffu;`);
    body.push(`    for (var it = 0u; it < iters; it = it + 1u) {`);
    body.push(`        var dslot = NOSLOT;`);
    body.push(`        if (it >= lgLf && t == 0u) {`);
    body.push(`            if (a == 0u) {`);
    body.push(`                if ((it - lgLf) + 1u < lgLf) {`);
    body.push(`                    dslot = Lf >> 1u;`);
    body.push(`                }`);
    body.push(`            } else {`);
    body.push(`                dslot = 0u;`);
    body.push(`            }`);
    body.push(`        }`);
    body.push(`        if (dslot != NOSLOT) {`);
    body.push(`            sstore(dslot, jac_cdbl(sload(dslot)));`);
    body.push(`        }`);
    body.push(`        workgroupBarrier();`);
    body.push(`        var di = 0u;`);
    body.push(`        var si = 0u;`);
    body.push(`        var valid = false;`);
    body.push(`        if (it < lgLf) {`);
    body.push(`            let k = it;`);
    body.push(`            let log2half = lgLf - k - 1u;`);
    body.push(`            let half = 1u << log2half;`);
    body.push(`            if (a == 0u) {`);
    body.push(`                // Sub-arrays this depth, in slot order: carries 1..k`);
    body.push(`                // (idx 0..k-1, carry idx+1 at offset Lf >> (idx+1)),`);
    body.push(`                // then W (idx == k, offset 0).`);
    body.push(`                if (t < (k + 1u) * half) {`);
    body.push(`                    let idx = t >> log2half;`);
    body.push(`                    let rem = t & (half - 1u);`);
    body.push(`                    di = select(Lf >> (idx + 1u), 0u, idx == k) + rem;`);
    body.push(`                    si = di + half;`);
    body.push(`                    valid = true;`);
    body.push(`                }`);
    body.push(`            } else if (t < half) {`);
    body.push(`                di = t;`);
    body.push(`                si = di + half;`);
    body.push(`                valid = true;`);
    body.push(`            }`);
    body.push(`        } else if (a == 0u && t == 0u && lgLf > 0u) {`);
    body.push(`            let j = it - lgLf;`);
    body.push(`            let aslot = Lf >> 1u;`);
    body.push(`            if (j + 1u < lgLf) {`);
    body.push(`                di = aslot;`);
    body.push(`                si = Lf >> (j + 2u);`);
    body.push(`            } else {`);
    body.push(`                di = 0u;`);
    body.push(`                si = aslot;`);
    body.push(`            }`);
    body.push(`            valid = true;`);
    body.push(`        }`);
    body.push(`        if (valid) {`);
    body.push(`            sstore(di, jac_cadd(sload(di), sload(si)));`);
    body.push(`        }`);
    body.push(`        workgroupBarrier();`);
    body.push(`    }`);
    body.push(`    if (t == 0u) {`);
    body.push(`        let S = sload(0u);`);
    body.push(`        gstore(base + off, S);`);
    body.push(`        stage_set(w * (df + 1u) + a, S);`);
    body.push(`    }`);
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      halve_finish_arrays_shader,
      {
        workgroup_size,
        sh_words: Lf * 24,
        f1_body: body.join('\n'),
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
      },
    );
  }

  /**
   * Halving-reduction finalize: one small workgroup per window tree-reduces
   * the (1 + d_f) staged points in ~log2 rounds of complete additions
   * (global in-place over the baked offset list, no workgroup memory), then
   * lane 0 normalises the root to affine in the same dispatch — one pass
   * where pass-2 + jac-finalize used to be two.
   */
  public gen_halve_finish_root_shader(stride: number, finisherDepth: number): string {
    if (stride < 2 || (stride & (stride - 1)) !== 0) {
      throw new Error(`gen_halve_finish_root_shader: stride (${stride}) must be a power of two >= 2`);
    }
    const n = finisherDepth + 1;
    const workgroup_size = Math.max(8, Math.ceil(n / 2));
    // Staged slot j sits at arena offset 0 (j == 0) or B >> j. The slots are
    // loaded into WORKGROUP memory and tree-paired there over ascending
    // steps (slot i consumes slot i+step only after everything below i+step
    // has merged in), synchronized with workgroupBarrier() — storage-buffer
    // writes are not reliably visible across a workgroup on mobile drivers.
    // ROLLED with the slot count from lparams.x (uniform bound, so driver
    // unrollers can't expand it) and ONE jac_cadd callsite — baking a cadd
    // per pair crashes the Adreno/Mali shader compilers. Lane 0 writes the
    // root back to the arena base; the normalize below reads it from there
    // in the same invocation.
    const body: string[] = [];
    body.push(`    let n = lparams.x + 1u;`);
    body.push(`    let B = 1u << lparams.z;`);
    body.push(`    for (var i = t; i < n; i = i + WG) {`);
    body.push(`        let g = base + select(B >> i, 0u, i == 0u);`);
    body.push(`        sstore(i, gload(g));`);
    body.push(`    }`);
    body.push(`    workgroupBarrier();`);
    body.push(`    var step = 1u;`);
    body.push(`    loop {`);
    body.push(`        if (step >= n) { break; }`);
    body.push(`        let i = 2u * step * t;`);
    body.push(`        if (i + step < n) {`);
    body.push(`            sstore(i, jac_cadd(sload(i), sload(i + step)));`);
    body.push(`        }`);
    body.push(`        workgroupBarrier();`);
    body.push(`        step = step << 1u;`);
    body.push(`    }`);
    body.push(`    if (t == 0u) {`);
    body.push(`        gstore(base, sload(0u));`);
    body.push(`        is_present[base] = u32(!fr_is_zero_f8(load_zp(base)));`);
    body.push(`    }`);
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      halve_finish_root_shader,
      {
        workgroup_size,
        sh_words: n * 24,
        inv_fn,
        f2_body: body.join('\n'),
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * One batch-affine fold level of the fold-tower reduction
   * (GROUPED_REDUCE_PLAN.md). `nstreams` (0..2) and `chunksPerThread`
   * (1/2/4) are compile-time specialised: each thread walks k chunks
   * simultaneously and ALL k·(2+nstreams) adds of a row share one inversion
   * (C = k·(2+ns)). The host picks k per level so threads stay at the
   * device's saturation width, and switches the level to the Jacobian fold
   * (gen_ba_reduce_fold_jac_shader) below it — batch-affine at C ≤ 2 is
   * never dispatched. Per-chunk register blocks and the prefix/invert/peel
   * chain are assembled as code strings so every accumulator stays a
   * statically-named register.
   */
  /**
   * Code blocks shared by the affine fold kernels (per-thread and coop):
   * accumulator decls, per-row denominator gather, post-inversion apply, and
   * final stores. `gate` (a boolean WGSL expression, or null) predicates the
   * whole row OFF without `continue`/`return` — required by the coop variant,
   * whose workgroup barriers must sit in uniform control flow, so ragged rows
   * and idle lanes participate with identity denominators instead of
   * branching away. With gate === null the emitted code is byte-identical to
   * the historical per-thread kernel.
   */
  private buildFoldBlocks(
    k: number,
    ns: number,
    gate: string | null,
  ): { decls: string[]; gather: string[]; apply: string[]; store: string[] } {
    const perChunk = 2 + ns;
    const decls: string[] = [];
    const gather: string[] = [];
    const apply: string[] = [];
    const store: string[] = [];
    // Candidate index for (chunk j, slot u): u = 0 → alg += run, 1 → run += V,
    // 2+s → stream s. Denominator d{idx}; recovered inverse vi{idx}.
    const cand = (j: number, u: number): number => j * perChunk + u;
    const g = gate === null ? '' : `${gate} && `;
    for (let j = 0; j < k; j++) {
      decls.push(`    let c${j} = q + ${j}u * span;`);
      decls.push(`    var run${j}_x = r1; var run${j}_y = r1; var run${j}_p = false;`);
      decls.push(`    var alg${j}_x = r1; var alg${j}_y = r1; var alg${j}_p = false;`);
      decls.push(`    var dup${j} = false;`);
      for (let st = 0; st < ns; st++) {
        decls.push(`    var st${j}_${st}_x = r1; var st${j}_${st}_y = r1; var st${j}_${st}_p = false;`);
      }
    }
    for (let j = 0; j < k; j++) {
      gather.push(`        let rs${j} = i * G + c${j};`);
      gather.push(`        let add${j} = ${g}run${j}_p && alg${j}_p && !dup${j};`);
      gather.push(`        let dbl${j} = ${g}run${j}_p && alg${j}_p && dup${j};`);
      gather.push(`        let cpy${j} = ${g}run${j}_p && !alg${j}_p;`);
      if (gate !== null) {
        gather.push(`        let live${j} = ${gate} && run${j}_p;`);
      }
      gather.push(`        var d${cand(j, 0)} = fr_select_f8(r1, fr_sub_f8(run${j}_x, alg${j}_x), add${j});`);
      gather.push(`        d${cand(j, 0)} = fr_select_f8(d${cand(j, 0)}, fr_add_f8(alg${j}_y, alg${j}_y), dbl${j});`);
      gather.push(`        let vslot${j} = base + rs${j};`);
      gather.push(
        gate === null
          ? `        let vp${j} = is_present[vslot${j}] != 0u;`
          : `        let vp${j} = ${gate} && (is_present[vslot${j}] != 0u);`,
      );
      gather.push(`        let vx${j} = load_x(vslot${j}, M_RED);`);
      gather.push(`        let vadd${j} = vp${j} && run${j}_p;`);
      gather.push(`        let d${cand(j, 1)} = fr_select_f8(r1, fr_sub_f8(vx${j}, run${j}_x), vadd${j});`);
      for (let st = 0; st < ns; st++) {
        gather.push(`        let tslot${j}_${st} = base + ${st + 1}u * B + rs${j};`);
        gather.push(
          gate === null
            ? `        let tp${j}_${st} = is_present[tslot${j}_${st}] != 0u;`
            : `        let tp${j}_${st} = ${gate} && (is_present[tslot${j}_${st}] != 0u);`,
        );
        gather.push(`        let tx${j}_${st} = load_x(tslot${j}_${st}, M_RED);`);
        gather.push(`        let tadd${j}_${st} = tp${j}_${st} && st${j}_${st}_p;`);
        gather.push(
          `        let d${cand(j, 2 + st)} = fr_select_f8(r1, fr_sub_f8(tx${j}_${st}, st${j}_${st}_x), tadd${j}_${st});`,
        );
      }
    }
    const liveExpr = (j: number): string => (gate === null ? `run${j}_p` : `live${j}`);
    for (let j = 0; j < k; j++) {
      apply.push(`        {`);
      apply.push(`            var num = fr_sub_f8(run${j}_y, alg${j}_y);`);
      apply.push(`            var x_other = run${j}_x;`);
      apply.push(`            if (dbl${j}) {`);
      apply.push(`                let x2 = montgomery_product_f8(alg${j}_x, alg${j}_x);`);
      apply.push(`                num = fr_add_f8(fr_add_f8(x2, x2), x2);`);
      apply.push(`                x_other = alg${j}_x;`);
      apply.push(`            }`);
      apply.push(`            let lambda = montgomery_product_f8(num, vi${cand(j, 0)});`);
      apply.push(`            var rx = montgomery_product_f8(lambda, lambda);`);
      apply.push(`            rx = fr_sub_f8(fr_sub_f8(rx, alg${j}_x), x_other);`);
      apply.push(`            var ry = fr_sub_f8(alg${j}_x, rx);`);
      apply.push(`            ry = fr_sub_f8(montgomery_product_f8(lambda, ry), alg${j}_y);`);
      apply.push(`            let mut${j} = add${j} || dbl${j};`);
      apply.push(`            alg${j}_x = fr_select_f8(alg${j}_x, rx, mut${j});`);
      apply.push(`            alg${j}_y = fr_select_f8(alg${j}_y, ry, mut${j});`);
      apply.push(`            alg${j}_x = fr_select_f8(alg${j}_x, run${j}_x, cpy${j});`);
      apply.push(`            alg${j}_y = fr_select_f8(alg${j}_y, run${j}_y, cpy${j});`);
      apply.push(`            alg${j}_p = alg${j}_p || ${liveExpr(j)};`);
      apply.push(`            dup${j} = select(dup${j}, cpy${j}, ${liveExpr(j)});`);
      apply.push(`        }`);
      apply.push(`        {`);
      apply.push(`            let vy${j} = load_y(vslot${j}, M_RED);`);
      apply.push(`            let lambda = montgomery_product_f8(fr_sub_f8(vy${j}, run${j}_y), vi${cand(j, 1)});`);
      apply.push(`            var rx = montgomery_product_f8(lambda, lambda);`);
      apply.push(`            rx = fr_sub_f8(fr_sub_f8(rx, run${j}_x), vx${j});`);
      apply.push(`            var ry = fr_sub_f8(run${j}_x, rx);`);
      apply.push(`            ry = fr_sub_f8(montgomery_product_f8(lambda, ry), run${j}_y);`);
      apply.push(`            run${j}_x = fr_select_f8(run${j}_x, rx, vadd${j});`);
      apply.push(`            run${j}_y = fr_select_f8(run${j}_y, ry, vadd${j});`);
      apply.push(`            let vcpy${j} = vp${j} && !run${j}_p;`);
      apply.push(`            run${j}_x = fr_select_f8(run${j}_x, vx${j}, vcpy${j});`);
      apply.push(`            run${j}_y = fr_select_f8(run${j}_y, vy${j}, vcpy${j});`);
      apply.push(`            run${j}_p = run${j}_p || vp${j};`);
      apply.push(`            dup${j} = dup${j} && !vp${j};`);
      apply.push(`        }`);
      for (let st = 0; st < ns; st++) {
        apply.push(`        {`);
        apply.push(`            let ty${j}_${st} = load_y(tslot${j}_${st}, M_RED);`);
        apply.push(
          `            let lambda = montgomery_product_f8(fr_sub_f8(ty${j}_${st}, st${j}_${st}_y), vi${cand(j, 2 + st)});`,
        );
        apply.push(`            var rx = montgomery_product_f8(lambda, lambda);`);
        apply.push(`            rx = fr_sub_f8(fr_sub_f8(rx, st${j}_${st}_x), tx${j}_${st});`);
        apply.push(`            var ry = fr_sub_f8(st${j}_${st}_x, rx);`);
        apply.push(`            ry = fr_sub_f8(montgomery_product_f8(lambda, ry), st${j}_${st}_y);`);
        apply.push(`            st${j}_${st}_x = fr_select_f8(st${j}_${st}_x, rx, tadd${j}_${st});`);
        apply.push(`            st${j}_${st}_y = fr_select_f8(st${j}_${st}_y, ry, tadd${j}_${st});`);
        apply.push(`            let tcpy${j}_${st} = tp${j}_${st} && !st${j}_${st}_p;`);
        apply.push(`            st${j}_${st}_x = fr_select_f8(st${j}_${st}_x, tx${j}_${st}, tcpy${j}_${st});`);
        apply.push(`            st${j}_${st}_y = fr_select_f8(st${j}_${st}_y, ty${j}_${st}, tcpy${j}_${st});`);
        apply.push(`            st${j}_${st}_p = st${j}_${st}_p || tp${j}_${st};`);
        apply.push(`        }`);
      }
    }
    for (let j = 0; j < k; j++) {
      store.push(`    store_x(base + c${j}, M_RED, run${j}_x);`);
      store.push(`    store_y(base + c${j}, M_RED, run${j}_y);`);
      store.push(`    is_present[base + c${j}] = u32(run${j}_p);`);
      for (let st = 0; st < ns; st++) {
        store.push(`    store_x(base + ${st + 1}u * G + c${j}, M_RED, st${j}_${st}_x);`);
        store.push(`    store_y(base + ${st + 1}u * G + c${j}, M_RED, st${j}_${st}_y);`);
        store.push(`    is_present[base + ${st + 1}u * G + c${j}] = u32(st${j}_${st}_p);`);
      }
      store.push(`    store_x(base + ${1 + ns}u * G + c${j}, M_RED, alg${j}_x);`);
      store.push(`    store_y(base + ${1 + ns}u * G + c${j}, M_RED, alg${j}_y);`);
      store.push(`    is_present[base + ${1 + ns}u * G + c${j}] = u32(alg${j}_p);`);
    }
    return { decls, gather, apply, store };
  }

  public gen_ba_reduce_fold_shader(workgroup_size: number, nstreams: number, chunksPerThread = 1): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fold_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    if (!Number.isInteger(nstreams) || nstreams < 0 || nstreams > 2) {
      throw new Error(`gen_ba_reduce_fold_shader: nstreams (${nstreams}) must be 0, 1, or 2`);
    }
    if (![1, 2, 4].includes(chunksPerThread)) {
      throw new Error(`gen_ba_reduce_fold_shader: chunksPerThread (${chunksPerThread}) must be 1, 2, or 4`);
    }
    const blocks = this.buildFoldBlocks(chunksPerThread, nstreams, null);
    const { decls, gather, apply, store } = blocks;
    const C = chunksPerThread * (2 + nstreams);
    const invert: string[] = [];
    invert.push(`        let pp0 = d0;`);
    for (let i = 1; i < C; i++) invert.push(`        let pp${i} = montgomery_product_f8(pp${i - 1}, d${i});`);
    invert.push(`        var inv_acc: array<u32, 8> = fr_inv_by_loop_pk(pp${C - 1});`);
    for (let i = C - 1; i >= 1; i--) {
      invert.push(`        let vi${i} = montgomery_product_f8(inv_acc, pp${i - 1});`);
      invert.push(`        inv_acc = montgomery_product_f8(inv_acc, d${i});`);
    }
    invert.push(`        let vi0 = inv_acc;`);
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_shader,
      {
        workgroup_size,
        nstreams,
        chunks_per_thread: chunksPerThread,
        chunk_decls: decls.join('\n'),
        chunk_gather: gather.join('\n'),
        chunk_invert: invert.join('\n'),
        chunk_apply: apply.join('\n'),
        chunk_store: store.join('\n'),
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Workgroup-cooperative affine fold level: same walk, accumulators, and
   * outputs as gen_ba_reduce_fold_shader at k = 1, but the per-row pk14
   * inversion is batched across the whole workgroup via a shared-memory
   * product tree (up-sweep, single root inversion, inverse-distributing
   * down-sweep). C_effective = WG·(2+nstreams) per inversion at full
   * dispatch width. workgroup_size must be a power of two (binary tree).
   */
  public gen_ba_reduce_fold_coop_shader(workgroup_size: number, nstreams: number): string {
    if (workgroup_size <= 0 || (workgroup_size & (workgroup_size - 1)) !== 0) {
      throw new Error(`gen_ba_reduce_fold_coop_shader: workgroup_size (${workgroup_size}) must be a power of two`);
    }
    if (!Number.isInteger(nstreams) || nstreams < 0 || nstreams > 2) {
      throw new Error(`gen_ba_reduce_fold_coop_shader: nstreams (${nstreams}) must be 0, 1, or 2`);
    }
    const { decls, gather, apply, store } = this.buildFoldBlocks(1, nstreams, 'row_on');
    const C = 2 + nstreams;
    const chain: string[] = [];
    chain.push(`        let pp0 = d0;`);
    for (let i = 1; i < C; i++) chain.push(`        let pp${i} = montgomery_product_f8(pp${i - 1}, d${i});`);
    chain.push(`        let lp = pp${C - 1};`);
    const peel: string[] = [];
    for (let i = C - 1; i >= 1; i--) {
      peel.push(`        let vi${i} = montgomery_product_f8(inv_acc, pp${i - 1});`);
      peel.push(`        inv_acc = montgomery_product_f8(inv_acc, d${i});`);
    }
    peel.push(`        let vi0 = inv_acc;`);
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_coop_shader,
      {
        workgroup_size,
        nstreams,
        tree_vec4s: 4 * workgroup_size,
        chunk_decls: decls.join('\n'),
        chunk_gather: gather.join('\n'),
        coop_chain: chain.join('\n'),
        coop_peel: peel.join('\n'),
        chunk_apply: apply.join('\n'),
        chunk_store: store.join('\n'),
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Jacobian fold level: the thread-starved-level variant of the affine
   * fold — same walk and outputs (x/y planes + red_z), zero inversions, no
   * barriers. Used when a level's chunk count is below the device's
   * saturation width.
   */
  public gen_ba_reduce_fold_jac_shader(workgroup_size: number, nstreams: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fold_jac_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    if (!Number.isInteger(nstreams) || nstreams < 0 || nstreams > 2) {
      throw new Error(`gen_ba_reduce_fold_jac_shader: nstreams (${nstreams}) must be 0, 1, or 2`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_jac_shader,
      {
        workgroup_size,
        nstreams,
        s0: nstreams >= 1,
        s1: nstreams >= 2,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
      },
    );
  }

  /**
   * Fold-tower value weighting: one thread per value multiplies it by its
   * scalar weight (dynamic-trip double-and-add). Barrier-less, inverse-less,
   * division-less — the everywhere-compiling kernel family.
   */
  public gen_ba_reduce_fold_weight_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fold_weight_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_weight_shader,
      {
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
      },
    );
  }

  /**
   * Thread-local tower fold level (M = 8, ns = 0): each thread folds its
   * column's 8 points as an in-register binary tower — R = ΣP_i and
   * Λ = 4H + 2Pr + O over the bit-index subsets — in 5 rounds of
   * independent batch-affine ops (C = 6/4/3/2/1, 16 ops, 5 inversions).
   * Straight-line (no row loop), barrier-free, full width. The host must
   * only dispatch this for levels where EVERY window's schedule has M == 8
   * (no split-c).
   */
  public gen_ba_reduce_fold_tlocal_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fold_tlocal_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    type TOp = { out: string; kind: 'add' | 'dbl'; a: string; b?: string };
    const rounds: TOp[][] = [
      [
        { out: 'tA', kind: 'add', a: 'p0', b: 'p1' },
        { out: 'tB', kind: 'add', a: 'p2', b: 'p3' },
        { out: 'tC', kind: 'add', a: 'p4', b: 'p5' },
        { out: 'tD', kind: 'add', a: 'p6', b: 'p7' },
        { out: 'tO1', kind: 'add', a: 'p1', b: 'p3' },
        { out: 'tO2', kind: 'add', a: 'p5', b: 'p7' },
      ],
      [
        { out: 'tE', kind: 'add', a: 'tA', b: 'tB' },
        { out: 'tF', kind: 'add', a: 'tC', b: 'tD' },
        { out: 'tPr', kind: 'add', a: 'tB', b: 'tD' },
        { out: 'tO', kind: 'add', a: 'tO1', b: 'tO2' },
      ],
      [
        { out: 'tR', kind: 'add', a: 'tE', b: 'tF' },
        { out: 'tT1', kind: 'dbl', a: 'tF' },
        { out: 'tV1', kind: 'dbl', a: 'tPr' },
      ],
      [
        { out: 'tU2', kind: 'dbl', a: 'tT1' },
        { out: 'tW1', kind: 'add', a: 'tV1', b: 'tO' },
      ],
      [{ out: 'tLam', kind: 'add', a: 'tU2', b: 'tW1' }],
    ];
    const body: string[] = [];
    // Gather: the column's 8 points (x and y up front — every point is an
    // operand of two round-1 ops, so nothing can be deferred past the first
    // inversion); ragged rows enter absent.
    for (let i = 0; i < 8; i++) {
      body.push(`    let rs${i} = ${i}u * G + q;`);
      body.push(`    let sl${i} = base + rs${i};`);
      body.push(`    let p${i}_p = (rs${i} < B) && (is_present[sl${i}] != 0u);`);
      body.push(`    let p${i}_x = load_x(sl${i}, M_RED);`);
      body.push(`    let p${i}_y = load_y(sl${i}, M_RED);`);
    }
    for (const r of rounds) {
      for (const op of r) body.push(`    var ${op.out}_x = r1; var ${op.out}_y = r1; var ${op.out}_p = false;`);
    }
    for (let rn = 0; rn < rounds.length; rn++) {
      const ops = rounds[rn];
      const C = ops.length;
      body.push(`    {`);
      for (let j = 0; j < C; j++) {
        const op = ops[j];
        if (op.kind === 'add') {
          body.push(`        let on${j} = ${op.a}_p && ${op.b}_p;`);
          body.push(`        let d${j} = fr_select_f8(r1, fr_sub_f8(${op.b!}_x, ${op.a}_x), on${j});`);
        } else {
          body.push(`        let on${j} = ${op.a}_p;`);
          body.push(`        let d${j} = fr_select_f8(r1, fr_add_f8(${op.a}_y, ${op.a}_y), on${j});`);
        }
      }
      body.push(`        let pp0 = d0;`);
      for (let j = 1; j < C; j++) body.push(`        let pp${j} = montgomery_product_f8(pp${j - 1}, d${j});`);
      body.push(`        var inv_acc: array<u32, 8> = fr_inv_by_loop_pk(pp${C - 1});`);
      for (let j = C - 1; j >= 1; j--) {
        body.push(`        let vi${j} = montgomery_product_f8(inv_acc, pp${j - 1});`);
        body.push(`        inv_acc = montgomery_product_f8(inv_acc, d${j});`);
      }
      body.push(`        let vi0 = inv_acc;`);
      for (let j = 0; j < C; j++) {
        const op = ops[j];
        body.push(`        {`);
        if (op.kind === 'add') {
          body.push(`            let lam = montgomery_product_f8(fr_sub_f8(${op.b!}_y, ${op.a}_y), vi${j});`);
          body.push(`            var rx = montgomery_product_f8(lam, lam);`);
          body.push(`            rx = fr_sub_f8(fr_sub_f8(rx, ${op.a}_x), ${op.b!}_x);`);
          body.push(`            var ry = fr_sub_f8(${op.a}_x, rx);`);
          body.push(`            ry = fr_sub_f8(montgomery_product_f8(lam, ry), ${op.a}_y);`);
          body.push(`            ${op.out}_x = fr_select_f8(${op.a}_x, rx, on${j});`);
          body.push(`            ${op.out}_y = fr_select_f8(${op.a}_y, ry, on${j});`);
          body.push(`            let bonly${j} = ${op.b!}_p && !${op.a}_p;`);
          body.push(`            ${op.out}_x = fr_select_f8(${op.out}_x, ${op.b!}_x, bonly${j});`);
          body.push(`            ${op.out}_y = fr_select_f8(${op.out}_y, ${op.b!}_y, bonly${j});`);
          body.push(`            ${op.out}_p = ${op.a}_p || ${op.b!}_p;`);
        } else {
          body.push(`            let xx = montgomery_product_f8(${op.a}_x, ${op.a}_x);`);
          body.push(`            let num = fr_add_f8(fr_add_f8(xx, xx), xx);`);
          body.push(`            let lam = montgomery_product_f8(num, vi${j});`);
          body.push(`            var rx = montgomery_product_f8(lam, lam);`);
          body.push(`            rx = fr_sub_f8(rx, fr_add_f8(${op.a}_x, ${op.a}_x));`);
          body.push(`            var ry = fr_sub_f8(${op.a}_x, rx);`);
          body.push(`            ry = fr_sub_f8(montgomery_product_f8(lam, ry), ${op.a}_y);`);
          body.push(`            ${op.out}_x = fr_select_f8(${op.a}_x, rx, on${j});`);
          body.push(`            ${op.out}_y = fr_select_f8(${op.a}_y, ry, on${j});`);
          body.push(`            ${op.out}_p = ${op.a}_p;`);
        }
        body.push(`        }`);
      }
      body.push(`    }`);
    }
    body.push(`    store_x(base + q, M_RED, tR_x);`);
    body.push(`    store_y(base + q, M_RED, tR_y);`);
    body.push(`    is_present[base + q] = u32(tR_p);`);
    body.push(`    store_x(base + G + q, M_RED, tLam_x);`);
    body.push(`    store_y(base + G + q, M_RED, tLam_y);`);
    body.push(`    is_present[base + G + q] = u32(tLam_p);`);
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_tlocal_shader,
      {
        workgroup_size,
        tlocal_body: body.join('\n'),
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Lean M = 2 fold level: one Jacobian add per thread at maximum width (the
   * shape width-adaptive towers produce at small N), Λ contribution is a
   * copy. `inputsJac` is compile-time: level-0 inputs are affine (both z = 1
   * → 6-montmul add), chained levels read z from red_z (full add). The host
   * must only dispatch this for levels where EVERY window's schedule has
   * M == 2 (no split-c).
   */
  public gen_ba_reduce_fold_pair_shader(workgroup_size: number, nstreams: number, inputsJac: boolean): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fold_pair_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    if (!Number.isInteger(nstreams) || nstreams < 0 || nstreams > 2) {
      throw new Error(`gen_ba_reduce_fold_pair_shader: nstreams (${nstreams}) must be 0, 1, or 2`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_pair_shader,
      {
        workgroup_size,
        s0: nstreams >= 1,
        s1: nstreams >= 2,
        inputs_jac: inputsJac,
        alg_off: 1 + nstreams,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
      },
    );
  }

  /**
   * Fold-tower window sum, barrier-less: each thread plainly sums a strided
   * subset of a window's pre-weighted values; dispatched twice (fan-8 then
   * root). No workgroup memory anywhere — the Mali driver cannot newly
   * compile barrier+shared+big-field kernels.
   */
  public gen_ba_reduce_fold_sum_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fold_sum_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_fold_sum_shader,
      {
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
      },
    );
  }

  // Sparse bucket reduction (SPARSE_REDUCE_PLAN.md). Same field/inverse context
  // as the dense reduce; the kernel skips empty buckets via a gap-aware suffix
  // sum so structured wires don't pay for empty high-window buckets.
  public gen_ba_reduce_sparse_shader(workgroup_size: number, variant: 'loop' | 'pk' = 'pk'): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_sparse_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_sparse_shader,
      {
        workgroup_size,
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  public gen_ba_fused_super_bench_shader(
    workgroup_size: number,
    s: number,
    variant: 'loop' | 'pk' = 'pk',
    tiled = false,
    l0_index_mode = false,
    addsub: 'native' | 'unpack' = 'native',
  ): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(
        `gen_ba_fused_super_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`,
      );
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_fused_super_bench_shader,
      {
        workgroup_size,
        s,
        inv_fn,
        tiled,
        l0_index_mode,
        addsub_unpack: addsub === 'unpack',
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Planner pass A: per-window scan + per-bucket offsets. One workgroup per
   * window — O(BW), flat in n. Writes new_counts / new_offsets / carry_off
   * and the plan_meta totals; the emit pass writes the O(pairs) plans.
   */
  // One-program: BW / num_windows ride the `geom` uniform (per_thread = BW/TPB
  // derived in-shader), so only the workgroup_size is baked. Geometry no longer
  // keys the WGSL string ⇒ one compile per pool across every (n, c).
  public gen_ba_planner_v2_offsets_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_planner_v2_offsets_shader: workgroup_size must be a positive integer`);
    }
    return mustache.render(ba_planner_v2_offsets_shader, { workgroup_size, recompile: this.recompile });
  }

  /**
   * Planner pass B: parallel plan emit. Dispatch (ceil(BW/wg), numWindows) —
   * one workgroup per (bucket-group, window). Emits the chunk / scatter /
   * carry plans from pass A's offsets, then cooperatively self-pads. BW /
   * num_windows ride the `geom` uniform; PAIR_CAP (pool-invariant, break-bounded)
   * and S (fixed HIGH_MEM_S) stay baked so the inner loops stay bounded/unrolled.
   */
  public gen_ba_planner_v2_emit_shader(workgroup_size: number, s: number, pair_cap: number): string {
    if (
      workgroup_size <= 0 ||
      s <= 0 ||
      pair_cap <= 0 ||
      !Number.isInteger(workgroup_size) ||
      !Number.isInteger(s) ||
      !Number.isInteger(pair_cap)
    ) {
      throw new Error(`gen_ba_planner_v2_emit_shader: positive integer args required`);
    }
    return mustache.render(ba_planner_v2_emit_shader, {
      workgroup_size,
      pair_cap,
      s,
      recompile: this.recompile,
    });
  }

  /**
   * Bin-packed pair-tree: carry-copy kernel. Propagates the odd-count
   * carry element forward to the next level without modification.
   * Pure memory shuffle.
   */
  public gen_ba_carry_copy_bench_shader(workgroup_size: number, l0_index_mode = false): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_carry_copy_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    // l0_index_mode pulls in the field stack to negate y while
    // materializing a level-0 (point index | sign) carry from the pool.
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_carry_copy_bench_shader,
      {
        workgroup_size,
        l0_index_mode,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      { structs, bigint_funcs, montgomery_product_funcs: this.mont_product_src, field_funcs },
    );
  }

  /**
   * Bin-packed pair-tree: finalize-copy kernel. Harvests a bucket's
   * accumulated sum into bucket_result[b] at the level it reaches
   * count 1 (the planner's finalize-and-drop). Pure memory shuffle.
   */
  public gen_ba_finalize_copy_bench_shader(workgroup_size: number, l0_index_mode = false): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_finalize_copy_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    // l0_index_mode pulls in the field stack to negate y while
    // materializing a level-0 (point index | sign) element from the pool.
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_finalize_copy_bench_shader,
      {
        workgroup_size,
        l0_index_mode,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      { structs, bigint_funcs, montgomery_product_funcs: this.mont_product_src, field_funcs },
    );
  }

  /**
   * Finalize-ACCUMULATE for the point-chunked pair-tree: like
   * gen_ba_finalize_copy_bench_shader but a bucket finalized by more than one
   * chunk affine-adds its partials into the single running bucket_result
   * (gated by a per-bucket `touched` flag). Pulls in the full field + safegcd
   * stack for the one inversion the affine add needs.
   */
  public gen_ba_finalize_accumulate_bench_shader(
    workgroup_size: number,
    l0_index_mode = false,
    variant: 'loop' | 'pk' = 'pk',
  ): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_finalize_accumulate_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_finalize_accumulate_bench_shader,
      {
        workgroup_size,
        l0_index_mode,
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Cooperative fused-TAIL reducer: one workgroup per bucket reduces its <= cap
   * remaining points to a single sum in workgroup memory (all-Jacobian tree,
   * barriers between levels), then finalizes into bucket_result. Collapses the
   * starved deep-tail levels of the bin-packed pair-tree into one dispatch.
   * `cap` is the max points a bucket may carry at the trigger level (= the
   * shared array length); workgroup_size must be >= cap.
   */
  public gen_ba_fused_tail_coop_shader(workgroup_size: number, cap: number, variant: 'loop' | 'pk' = 'pk'): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size) || cap <= 0 || !Number.isInteger(cap)) {
      throw new Error(
        `gen_ba_fused_tail_coop_shader: workgroup_size (${workgroup_size}) and cap (${cap}) must be positive integers`,
      );
    }
    if (cap > workgroup_size) {
      throw new Error(`gen_ba_fused_tail_coop_shader: cap (${cap}) must be <= workgroup_size (${workgroup_size})`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_fused_tail_coop_shader,
      {
        workgroup_size,
        cap,
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  /**
   * Reduction-stage init for the high-mem ping-pong path: repack the bucket-
   * accumulate output (bucket_result, BW columns/window) into the reduction's
   * STRIDE-column red_buf and seed is_present. Pure vec4 copy — no field
   * arithmetic. Bridges the ping-pong bucket sums onto the shared reduce, which
   * otherwise gets red_buf directly from the walker's pt_finalize.
   */
  public gen_ba_reduce_init_bench_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_init_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    return mustache.render(ba_reduce_init_bench_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  // Inversion-free Jacobian variant of one bucket-reduction level (Thread 1 of
  // the wt/structure port). Same field/montmul context as the affine bench
  // kernel — no inversion is used inside the level, but the partials are shared
  // so the field8/montgomery helpers resolve. Re-plumbed onto reduce_sched.
  public gen_ba_reduce_level_jacobian_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_reduce_level_jacobian_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_level_jacobian_shader,
      {
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  // Seed the red_z plane from is_present (present => Montgomery R, absent => 0).
  public gen_ba_reduce_z_init_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_z_init_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const { r8_csv } = this.f8Context();
    return mustache.render(ba_reduce_z_init_shader, { workgroup_size, r8_csv });
  }

  // Per-window Jacobian -> affine (Montgomery) at the window root slot; one
  // inversion per window. Same partial/param set as the bench kernel.
  public gen_ba_reduce_jac_finalize_shader(workgroup_size: number, variant: 'loop' | 'pk' = 'pk'): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_reduce_jac_finalize_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_jac_finalize_shader,
      {
        workgroup_size,
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  // Batched Jacobian -> affine convert of all live slots (step-4 per-level cut).
  // Bridges a mid-schedule jac->affine flip: prefix-product of Z over a chunk ->
  // one safegcd -> backward peel -> x=X/Z^2, y=Y/Z^3, restore is_present.
  public gen_ba_reduce_jac_to_affine_shader(workgroup_size: number, variant: 'loop' | 'pk' = 'pk'): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_reduce_jac_to_affine_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_jac_to_affine_shader,
      {
        workgroup_size,
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
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
      {
        tag: 'lo',
        llB: [0],
        hhB: [5],
        cB: [0, 5],
        folds: [
          { off: 0, sign: '+' },
          { off: 10, sign: '-' },
        ],
      },
      {
        tag: 'hi',
        llB: [10],
        hhB: [15],
        cB: [10, 15],
        folds: [
          { off: 20, sign: '+' },
          { off: 10, sign: '-' },
        ],
      },
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

  // --- Streaming planner + accumulator generators ---

  public gen_ba_planner_classify_shader(workgroup_size: number): string {
    return mustache.render(ba_planner_classify_shader, { workgroup_size, recompile: this.recompile });
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
      num_threads,
      s,
      min_iters_per_wg,
      max_workgroups,
      planner_tpb,
      recompile: this.recompile,
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
        bw,
        stride,
        m_red,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      { structs, bigint_funcs, montgomery_product_funcs: this.mont_product_src, field_funcs, field8_funcs },
    );
  }

  // KNOB 2 (stream-walker variant): hoists per-thread task partitioning into
  // a dedicated planner kernel. Pure u32 binary-search logic — same field-free
  // shape as partition_thread.
  public gen_ba_planner_partition_task_shader(
    walker_tpb: number,
    s: number,
    thread_tpb: number,
    idx_tpb: number,
  ): string {
    return mustache.render(ba_planner_partition_task_shader, {
      walker_tpb,
      s,
      thread_tpb,
      idx_tpb,
      recompile: this.recompile,
    });
  }

  // === walker_index v2 — fully-parallel index pipeline (WALKER_INDEX_PLAN.md). ===

  public gen_ba_walker_idx_count_shader(workgroup_size: number, s: number, thread_tpb: number): string {
    return mustache.render(ba_walker_idx_count_shader, { workgroup_size, s, thread_tpb, recompile: this.recompile });
  }

  public gen_ba_walker_idx_alloc_shader(workgroup_size: number): string {
    return mustache.render(ba_walker_idx_alloc_shader, {
      workgroup_size,
      double_tpb: 2 * workgroup_size,
      block: 4 * workgroup_size,
      recompile: this.recompile,
    });
  }

  public gen_ba_walker_idx_epilogue_shader(sort_tpb: number): string {
    return mustache.render(ba_walker_idx_epilogue_shader, { sort_tpb, recompile: this.recompile });
  }

  public gen_ba_walker_idx_scatter_shader(workgroup_size: number, s: number, thread_tpb: number): string {
    return mustache.render(ba_walker_idx_scatter_shader, { workgroup_size, s, thread_tpb, recompile: this.recompile });
  }

  public gen_ba_walker_idx_sort_shader(workgroup_size: number): string {
    return mustache.render(ba_walker_idx_sort_shader, { workgroup_size, recompile: this.recompile });
  }




  // wi4 Phase-1 probes (WALKER_INDEX_PLAN.md): price the sweep/build
  // primitives on-device before the real kernels are built.

  public gen_ba_walker_idx_p1_shader(workgroup_size: number, s: number, thread_tpb: number): string {
    return mustache.render(ba_walker_idx_p1_shader, {
      workgroup_size,
      double_tpb: 2 * workgroup_size,
      s,
      thread_tpb,
      recompile: this.recompile,
    });
  }

  public gen_ba_walker_idx_p2_shader(workgroup_size: number, s: number, thread_tpb: number): string {
    return mustache.render(ba_walker_idx_p2_shader, {
      workgroup_size,
      double_tpb: 2 * workgroup_size,
      s,
      thread_tpb,
      recompile: this.recompile,
    });
  }

  // Per-sorted-bucket l0-base precompute: resolves the walker's unprefetchable
  // sorted_bucket_list -> flat_bid -> offsets chain once, so the walker reads a
  // coalesced l0_base[i] at init and at every bucket transition (kills the
  // cold-gather ALU ramp + small-bucket drain). No template knobs.
  public gen_ba_planner_resolve_l0base_shader(): string {
    return mustache.render(ba_planner_resolve_l0base_shader, {
      recompile: this.recompile,
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
    pk14 = false,
    l0Precompute = true,
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
    // pk14: the packed-native 14-bit safegcd inverse (Montgomery-form output via
    // an e0=R^2 seed), consuming/producing the f8 packed form directly (inv_f8) —
    // no BigInt round-trip. Adreno register-pressure win; byte-identical output.
    // Otherwise the existing BigInt-roundtrip inverse (loop/pk).
    const inverse_funcs = pk14 ? by_inverse_loop_pk14_native_funcs : by_inverse_loop_pk14_native_funcs;
    const inv_fn = pk14 || 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_stream_walker_shader,
      {
        workgroup_size,
        s,
        inv_fn,
        inv_f8: true,
        l0prec: l0Precompute,
        bw,
        stride,
        m_red,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }

  // === Optimal walker_combine — cross-bucket batched-inversion pipeline. ===








  public gen_ba_walker_pt_init_scan_shader(bw: number): string {
    return mustache.render(ba_walker_pt_init_scan_shader, { bw, recompile: this.recompile });
  }

  public gen_ba_walker_pt_init_copy_shader(workgroup_size: number, bw: number): string {
    return mustache.render(ba_walker_pt_init_copy_shader, { workgroup_size, bw, recompile: this.recompile });
  }

  public gen_ba_walker_pt_build_shader(workgroup_size: number): string {
    return mustache.render(ba_walker_pt_build_shader, { workgroup_size, recompile: this.recompile });
  }

  public gen_ba_walker_pt_dispatch_chain_shader(): string {
    return mustache.render(ba_walker_pt_dispatch_chain_shader, { recompile: this.recompile });
  }

  public gen_ba_walker_pt_finalize_shader(workgroup_size: number, bw: number, stride: number, m_red: number): string {
    return mustache.render(ba_walker_pt_finalize_shader, {
      workgroup_size,
      bw,
      stride,
      m_red,
      recompile: this.recompile,
    });
  }

  public gen_ba_unified_combine_shader(workgroup_size: number, s: number, variant: 'loop' | 'pk' = 'pk'): string {
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_unified_combine_shader,
      {
        workgroup_size,
        s,
        inv_fn,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
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
    const inverse_funcs = by_inverse_loop_pk14_native_funcs;
    const inv_fn = 'fr_inv_by_loop_pk';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_walker_combine_batched_shader,
      {
        workgroup_size,
        s,
        inv_fn,
        bw,
        stride,
        m_red,
        p8_consts,
        r8_csv,
        f8_words,
        f8_native: this.montmul === 'cios_unrolled',
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        montgomery_product_f8_native: this.mont_f8_native_src,
        field_funcs,
        field8_funcs,
        bigint_by_funcs,
        inverse_funcs,
      },
    );
  }
}
