import mustache from 'mustache';
import {
  apply_matrix_bench as apply_matrix_bench_shader,
  barrett as barrett_funcs,
  batch_affine_apply as batch_affine_apply_shader,
  batch_affine_apply_scatter as batch_affine_apply_scatter_shader,
  batch_affine_dispatch_args as batch_affine_dispatch_args_shader,
  bench_batch_affine as bench_batch_affine_shader,
  batch_affine_finalize as batch_affine_finalize_shader,
  batch_affine_finalize_apply as batch_affine_finalize_apply_shader,
  batch_affine_finalize_collect as batch_affine_finalize_collect_shader,
  batch_affine_init as batch_affine_init_shader,
  batch_affine_schedule as batch_affine_schedule_shader,
  batch_inverse as batch_inverse_shader,
  batch_inverse_parallel as batch_inverse_parallel_shader,
  bigint as bigint_funcs,
  bigint_by as bigint_by_funcs,
  bigint_f32 as bigint_f32_funcs,
  // by_inverse hosts the Mat struct + by_divsteps (and grows to host
  // by_apply_matrix / fr_inv_by in subsequent sub-steps of the BY rewrite).
  by_inverse as by_inverse_funcs,
  // Option A BY safegcd inverse on 20 x 13-bit BigInt with BATCH=26 /
  // NUM_OUTER=29. Hosts MatA, bya_divsteps, bya_apply_matrix_{fg,de}, the
  // bya_reduce_to_canonical helper chain, and the fr_inv_by_a driver.
  by_inverse_a as by_inverse_a_funcs,
  bpr_bn254 as bpr_bn254_shader,
  convert_point_coords_and_decompose_scalars,
  convert_points_only as convert_points_only_shader,
  decompose_scalars_signed_only as decompose_scalars_signed_only_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  divsteps_bench as divsteps_bench_shader,
  ec_bn254 as ec_bn254_funcs,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  field as field_funcs,
  field_mul_bench_f32 as field_mul_bench_f32_shader,
  field_mul_bench_u32 as field_mul_bench_u32_shader,
  fr_inv_bench as fr_inv_bench_shader,
  fr_pow as fr_pow_funcs,
  horner_reduce_bn254 as horner_reduce_bn254_shader,
  mont_pro_product as montgomery_product_funcs,
  mont_pro_product_f32_22_sos3uv3 as montgomery_product_f32_22_sos3uv3_funcs,
  mont_pro_product_karat_yuval as montgomery_product_karat_yuval_funcs,
  mulhilo_22 as mulhilo_22_funcs,
  smvp_bn254 as smvp_bn254_shader,
  smvp_tree_count_active as smvp_tree_count_active_shader,
  smvp_tree_entry_bucket_id as smvp_tree_entry_bucket_id_shader,
  smvp_tree_layer_prelude as smvp_tree_layer_prelude_shader,
  smvp_tree_layer_scan as smvp_tree_layer_scan_shader,
  smvp_tree_layer_batch_inverse as smvp_tree_layer_batch_inverse_shader,
  smvp_tree_phase1 as smvp_tree_phase1_shader,
  smvp_tree_phase1_a as smvp_tree_phase1_a_shader,
  smvp_tree_phase1_d as smvp_tree_phase1_d_shader,
  smvp_tree_phase2 as smvp_tree_phase2_shader,
  smvp_tree_phase2_a as smvp_tree_phase2_a_shader,
  smvp_tree_phase2_d as smvp_tree_phase2_d_shader,
  smvp_tree_scatter as smvp_tree_scatter_shader,
  smvp_tree_scatter_args as smvp_tree_scatter_args_shader,
  smvp_tree_scatter_init as smvp_tree_scatter_init_shader,
  structs,
  transpose_parallel_count as transpose_parallel_count_shader,
  transpose_parallel_scan as transpose_parallel_scan_shader,
  transpose_parallel_scatter as transpose_parallel_scatter_shader,
  transpose_serial as transpose_serial_shader,
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
  // 22-bit-limb f32 Montgomery params. Used exclusively by
  // `gen_field_mul_bench_f32_shader` for the sos3uv3 micro-benchmark.
  // The 22-bit width buys a 4-way exact sum (4·2^22 = 2^24 fits in f32
  // mantissa), enabling the per-slot (tlo, thi) chain-break in sos3uv3.
  public num_limbs_f32_22: number;
  public n0_f32_22: bigint;
  public p_limbs_f32_22_str: string;
  // 9 × 29-bit BY limb representation of `p` for the BY safegcd inverse
  // path. Used by gen_apply_matrix_bench_shader (and in future sub-steps,
  // by the fr_inv_by wiring). The initializer string is comma-separated
  // limbs suitable for `BigIntBY(array<i32, 9>({{{ p_limbs_by }}}))`.
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
  public curveConfig: CurveConfig;
  public recompile = '';

  constructor(
    chunk_size: number,
    input_size: number,
    curveConfig: CurveConfig = BN254_CURVE_CONFIG,
    force_recompile = false,
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
    // Both feed `gen_apply_matrix_bench_shader` (and downstream by_inverse
    // production wiring). The split is the WASM `p_inv` u64 broken into
    // low-32 + high-26 chunks; the Mustache substitution is a flat u32
    // constant on each side.
    this.p_limbs_by_initializer = gen_p_limbs_by_initializer(this.p);
    const p_inv_split = compute_by_p_inv_split(this.p);
    this.p_inv_by_lo = p_inv_split.lo;
    this.p_inv_by_hi = p_inv_split.hi;
    // Option A 26-bit p_inv (single u32) for the BATCH=26 BY driver.
    this.p_inv_by_a_lo = compute_by_p_inv_a(this.p);

    // Render the Karatsuba+Yuval Mont body once. This is the default
    // u32 multiplier used by every MSM shader that includes the
    // `montgomery_product_funcs` mustache partial.
    this.mont_product_src = this.renderKaratYuvalMont();

    if (force_recompile) {
      const rand = Math.round(Math.random() * 100000000000000000) % 2 ** 32;
      this.recompile = `
                var recompile = ${rand}u;
                recompile += 1u;
            `.trim();
    }
  }

  public gen_convert_points_and_decomp_scalars_shader(
    workgroup_size: number,
    num_y_workgroups: number,
    num_subtasks: number,
    num_columns: number,
    scalar_bit_length_override?: number,
    scalar_byte_length_override?: number,
  ): string {
    const num_16_bit_words_per_coord = Math.ceil((this.num_words * this.word_size) / 16);
    const coord_u32_words = this.curveConfig.coordinateByteLength / 4;
    const scalar_byte_length = scalar_byte_length_override ?? this.curveConfig.scalarByteLength;
    const scalar_bit_length = scalar_bit_length_override ?? this.curveConfig.scalarBitLength;
    const scalar_u32_words = scalar_byte_length / 4;
    const use_top_chunk_override = scalar_bit_length % this.chunk_size !== 0;
    return mustache.render(
      convert_point_coords_and_decompose_scalars,
      {
        workgroup_size,
        num_y_workgroups,
        num_subtasks,
        num_columns,
        num_words: this.num_words,
        word_size: this.word_size,
        n0: this.n0,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        two_pow_chunk_size: this.two_pow_chunk_size,
        index_shift: this.index_shift,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mu_limbs: this.mu_limbs,
        w_mask: this.w_mask,
        slack: this.slack,
        num_words_mul_two: this.num_words * 2,
        num_words_plus_one: this.num_words + 1,
        chunk_size: this.chunk_size,
        input_size: this.input_size,
        num_16_bit_words_per_coord,
        coord_u32_words,
        coord_u32_words_mul_two: coord_u32_words * 2,
        scalar_u32_words,
        scalar_bitlength: scalar_bit_length,
        use_top_chunk_override,
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

  public gen_convert_points_only_shader(workgroup_size: number, num_y_workgroups: number): string {
    const num_16_bit_words_per_coord = Math.ceil((this.num_words * this.word_size) / 16);
    const coord_u32_words = this.curveConfig.coordinateByteLength / 4;
    return mustache.render(
      convert_points_only_shader,
      {
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

  public gen_decompose_scalars_signed_only_shader(
    workgroup_size: number,
    num_y_workgroups: number,
    num_subtasks: number,
    num_columns: number,
    scalar_bit_length_override?: number,
    scalar_byte_length_override?: number,
    count_into_col_ptr = false,
  ): string {
    const scalar_byte_length = scalar_byte_length_override ?? this.curveConfig.scalarByteLength;
    const scalar_bit_length = scalar_bit_length_override ?? this.curveConfig.scalarBitLength;
    const scalar_u32_words = scalar_byte_length / 4;
    const use_top_chunk_override = scalar_bit_length % this.chunk_size !== 0;
    const num_16_bit_words_per_coord = Math.ceil((this.num_words * this.word_size) / 16);
    return mustache.render(
      decompose_scalars_signed_only_shader,
      {
        workgroup_size,
        num_y_workgroups,
        num_subtasks,
        num_columns,
        chunk_size: this.chunk_size,
        input_size: this.input_size,
        scalar_u32_words,
        scalar_bitlength: scalar_bit_length,
        use_top_chunk_override,
        num_16_bit_words_per_coord,
        count_into_col_ptr,
        recompile: this.recompile,
      },
      { extract_word_from_bytes_le_funcs },
    );
  }

  public gen_transpose_shader(workgroup_size: number) {
    return mustache.render(transpose_serial_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  public gen_transpose_count_shader(workgroup_size: number): string {
    return mustache.render(transpose_parallel_count_shader, {
      workgroup_size,
      recompile: this.recompile,
    });
  }

  public gen_transpose_scan_shader(workgroup_size: number): string {
    return mustache.render(transpose_parallel_scan_shader, {
      workgroup_size,
      recompile: this.recompile,
    });
  }

  public gen_transpose_scatter_shader(workgroup_size: number): string {
    return mustache.render(transpose_parallel_scatter_shader, {
      workgroup_size,
      recompile: this.recompile,
    });
  }

  public gen_smvp_shader(workgroup_size: number, num_csr_cols: number) {
    return mustache.render(
      smvp_bn254_shader,
      {
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        index_shift: this.index_shift,
        workgroup_size,
        num_columns: num_csr_cols,
        half_num_columns: num_csr_cols / 2,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        ec_funcs: ec_bn254_funcs,
      },
    );
  }

  public gen_batch_inverse_shader(): string {
    return mustache.render(
      batch_inverse_shader,
      {
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  // `windows_per_batch` (WPB) sets how many consecutive subtask pair pools
  // get merged into ONE fr_inv_by_a call per (batch, sub_wg). Z dispatch
  // dim must be ceil(num_subtasks / WPB). Pass WPB=1 to recover the
  // pre-pooling behaviour byte-for-byte.
  public gen_batch_inverse_parallel_shader(num_sub_wgs: number, windows_per_batch: number = 1): string {
    return mustache.render(
      batch_inverse_parallel_shader,
      {
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        num_sub_wgs,
        windows_per_batch,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  // Standalone bench-only entry shader for batch-affine EC addition. One
  // workgroup processes BATCH_SIZE pairs via the two-phase Montgomery
  // batch-inverse trick (per-thread serial chunk + workgroup Hillis-Steele
  // scan + single fr_inv_by_a + back-walk). Used by bench-batch-affine.ts
  // to find the sweet spot where amortising the single inverse stops
  // beating thread under-utilisation.
  //
  // `batch_size` must be an exact multiple of `tpb`; the caller picks both
  // from a hand-built table (see bench-batch-affine.ts). BS = batch_size /
  // tpb is baked into the shader as a compile-time constant so the inner
  // forward-and-backward walks have static loop bounds.
  /**
   * Phase 1 of the tree-reduce SMVP. One workgroup per slice; pair
   * detection in workgroup memory + cooperative batch-affine over the
   * PAIR sub-stream + per-bucket-tagged writes to global output.
   *
   * `max_slice_entries` upper-bounds slice size; pair_list shared
   * memory and loop bounds scale with it. Keep small for v0 (128)
   * until correctness gates; production target is 1024 with the
   * pair_list hoisted to global if mobile workgroup memory caps bind.
   */
  public gen_smvp_tree_phase1_shader(tpb: number, max_slice_entries: number, max_pairs: number): string {
    if (tpb <= 0 || max_slice_entries <= 0 || max_pairs <= 0) {
      throw new Error(`gen_smvp_tree_phase1_shader: tpb, max_slice_entries, and max_pairs must be positive`);
    }
    if (max_slice_entries % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase1_shader: max_slice_entries (${max_slice_entries}) must be a multiple of tpb (${tpb})`,
      );
    }
    if (max_pairs % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase1_shader: max_pairs (${max_pairs}) must be a multiple of tpb (${tpb})`,
      );
    }
    if (max_pairs > max_slice_entries) {
      throw new Error(
        `gen_smvp_tree_phase1_shader: max_pairs (${max_pairs}) must not exceed max_slice_entries (${max_slice_entries})`,
      );
    }
    const per_thread_pairs = max_pairs / tpb;
    const per_thread_entries = max_slice_entries / tpb;
    // Layout of the per-WG meta_pool slice (u32 indices):
    //   [0 .. MSE)               = pair_idx_a
    //   [MSE .. 2*MSE)           = pair_idx_b
    //   [2*MSE .. 2*MSE + MP)    = rank_to_raw
    //   [2*MSE + MP .. + MSE)    = prev_raw_for_pair (indexed by raw_slot)
    const meta_off_rank_to_raw = 2 * max_slice_entries;
    const meta_off_prev_raw = 2 * max_slice_entries + max_pairs;
    const meta_per_wg_stride = 3 * max_slice_entries + max_pairs;
    return mustache.render(
      smvp_tree_phase1_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        per_thread_pairs,
        per_thread_entries,
        meta_off_rank_to_raw,
        meta_off_prev_raw,
        meta_per_wg_stride,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /**
   * Phase 2 of the tree-reduce SMVP. Same Phase A/B/C/D batch-affine
   * structure as Phase 1, but takes `(bucket_id, AffinePoint)` tuples
   * directly (no schedule decode + sign-flip) and is meant to be
   * invoked recursively until each bucket has one partial.
   *
   * Same `max_slice_entries` and `tpb` knobs as Phase 1; the two
   * kernels share the shape of pair_list / prefix_scratch so the
   * orchestrator can reuse buffers across phases.
   */
  public gen_smvp_tree_phase2_shader(tpb: number, max_slice_entries: number, max_pairs: number): string {
    if (tpb <= 0 || max_slice_entries <= 0 || max_pairs <= 0) {
      throw new Error(`gen_smvp_tree_phase2_shader: tpb, max_slice_entries, and max_pairs must be positive`);
    }
    if (max_slice_entries % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase2_shader: max_slice_entries (${max_slice_entries}) must be a multiple of tpb (${tpb})`,
      );
    }
    if (max_pairs % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase2_shader: max_pairs (${max_pairs}) must be a multiple of tpb (${tpb})`,
      );
    }
    if (max_pairs > max_slice_entries) {
      throw new Error(
        `gen_smvp_tree_phase2_shader: max_pairs (${max_pairs}) must not exceed max_slice_entries (${max_slice_entries})`,
      );
    }
    const per_thread_pairs = max_pairs / tpb;
    const per_thread_entries = max_slice_entries / tpb;
    const meta_off_rank_to_raw = 2 * max_slice_entries;
    const meta_off_prev_raw = 2 * max_slice_entries + max_pairs;
    const meta_per_wg_stride = 3 * max_slice_entries + max_pairs;
    return mustache.render(
      smvp_tree_phase2_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        per_thread_pairs,
        per_thread_entries,
        meta_off_rank_to_raw,
        meta_off_prev_raw,
        meta_per_wg_stride,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /**
   * Phase 1-A of the tree-reduce SMVP (iter 4 split). Runs the preamble
   * + Phase A prefix-product + Phase B scan, then spills the per-WG
   * block_total + per-thread block_total + per-WG counts to global
   * storage so the layer-wide batch inverse + Phase 1-D can consume them.
   * No fr_inv_by_a; that moves to `smvp_tree_layer_batch_inverse`.
   */
  public gen_smvp_tree_phase1_a_shader(
    tpb: number,
    max_slice_entries: number,
    max_pairs: number,
    max_wgs: number,
  ): string {
    if (tpb <= 0 || max_slice_entries <= 0 || max_pairs <= 0 || max_wgs <= 0) {
      throw new Error(`gen_smvp_tree_phase1_a_shader: all sizes must be positive`);
    }
    if (max_slice_entries % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase1_a_shader: max_slice_entries (${max_slice_entries}) must be a multiple of tpb (${tpb})`,
      );
    }
    if (max_pairs % tpb !== 0 || max_pairs > max_slice_entries) {
      throw new Error(`gen_smvp_tree_phase1_a_shader: max_pairs invalid`);
    }
    const per_thread_pairs = max_pairs / tpb;
    const per_thread_entries = max_slice_entries / tpb;
    const meta_off_rank_to_raw = 2 * max_slice_entries;
    const meta_off_prev_raw = 2 * max_slice_entries + max_pairs;
    const meta_per_wg_stride = 3 * max_slice_entries + max_pairs;
    return mustache.render(
      smvp_tree_phase1_a_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        max_wgs,
        per_thread_pairs,
        per_thread_entries,
        meta_off_rank_to_raw,
        meta_off_prev_raw,
        meta_per_wg_stride,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /**
   * Phase 1-D companion to `smvp_tree_phase1_a`. Reloads the per-thread
   * block_total spilled by Phase 1-A and the per-WG inverse produced by
   * `smvp_tree_layer_batch_inverse`, re-runs Phase B locally to derive
   * the exclusive prefix/suffix, runs Phase D + UNPAIRED write-out.
   */
  public gen_smvp_tree_phase1_d_shader(
    tpb: number,
    max_slice_entries: number,
    max_pairs: number,
    max_wgs: number,
  ): string {
    if (tpb <= 0 || max_slice_entries <= 0 || max_pairs <= 0 || max_wgs <= 0) {
      throw new Error(`gen_smvp_tree_phase1_d_shader: all sizes must be positive`);
    }
    const per_thread_pairs = max_pairs / tpb;
    const per_thread_entries = max_slice_entries / tpb;
    const meta_off_rank_to_raw = 2 * max_slice_entries;
    const meta_off_prev_raw = 2 * max_slice_entries + max_pairs;
    const meta_per_wg_stride = 3 * max_slice_entries + max_pairs;
    return mustache.render(
      smvp_tree_phase1_d_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        max_wgs,
        per_thread_pairs,
        per_thread_entries,
        meta_off_rank_to_raw,
        meta_off_prev_raw,
        meta_per_wg_stride,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /** Phase 2-A of the tree-reduce SMVP. Sister of Phase 1-A for L >= 1. */
  public gen_smvp_tree_phase2_a_shader(
    tpb: number,
    max_slice_entries: number,
    max_pairs: number,
    max_wgs: number,
  ): string {
    if (tpb <= 0 || max_slice_entries <= 0 || max_pairs <= 0 || max_wgs <= 0) {
      throw new Error(`gen_smvp_tree_phase2_a_shader: all sizes must be positive`);
    }
    const per_thread_pairs = max_pairs / tpb;
    const per_thread_entries = max_slice_entries / tpb;
    const meta_off_rank_to_raw = 2 * max_slice_entries;
    const meta_off_prev_raw = 2 * max_slice_entries + max_pairs;
    const meta_per_wg_stride = 3 * max_slice_entries + max_pairs;
    return mustache.render(
      smvp_tree_phase2_a_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        max_wgs,
        per_thread_pairs,
        per_thread_entries,
        meta_off_rank_to_raw,
        meta_off_prev_raw,
        meta_per_wg_stride,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /** Phase 2-D companion to `smvp_tree_phase2_a`. */
  public gen_smvp_tree_phase2_d_shader(
    tpb: number,
    max_slice_entries: number,
    max_pairs: number,
    max_wgs: number,
  ): string {
    if (tpb <= 0 || max_slice_entries <= 0 || max_pairs <= 0 || max_wgs <= 0) {
      throw new Error(`gen_smvp_tree_phase2_d_shader: all sizes must be positive`);
    }
    const per_thread_pairs = max_pairs / tpb;
    const per_thread_entries = max_slice_entries / tpb;
    const meta_off_rank_to_raw = 2 * max_slice_entries;
    const meta_off_prev_raw = 2 * max_slice_entries + max_pairs;
    const meta_per_wg_stride = 3 * max_slice_entries + max_pairs;
    return mustache.render(
      smvp_tree_phase2_d_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        max_wgs,
        per_thread_pairs,
        per_thread_entries,
        meta_off_rank_to_raw,
        meta_off_prev_raw,
        meta_per_wg_stride,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /**
   * Layer-wide Montgomery batch inverse. Replaces the per-WG
   * `fr_inv_by_a` with one `fr_inv_by_a` per layer plus a serial
   * forward/backward pass over the per-WG products. Single workgroup,
   * single thread.
   */
  public gen_smvp_tree_layer_batch_inverse_shader(max_wgs: number): string {
    if (max_wgs <= 0) {
      throw new Error(`gen_smvp_tree_layer_batch_inverse_shader: max_wgs (${max_wgs}) must be positive`);
    }
    return mustache.render(
      smvp_tree_layer_batch_inverse_shader,
      {
        max_wgs,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  /**
   * Scatters tree-reduce orchestrator output `(bucket_id[], x[], y[])`
   * into the dense `(running_x, running_y, bucket_active)` arrays the
   * existing finalize_collect pipeline expects. One thread per output.
   */
  public gen_smvp_tree_scatter_shader(tpb: number): string {
    return mustache.render(
      smvp_tree_scatter_shader,
      { tpb, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
  }

  /**
   * Companion to `smvp_tree_scatter`: zeros running_x/y + bucket_active
   * across the dense T*num_columns layout before the scatter pass.
   */
  public gen_smvp_tree_scatter_init_shader(tpb: number): string {
    return mustache.render(
      smvp_tree_scatter_init_shader,
      { tpb, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
  }

  /**
   * Derive `entry_bucket_id[i] = bucketIdx(i)` for every schedule
   * entry, in a single dispatch. Binary search on bucket_start[]; the
   * production CSR row-pointer buffer (`all_csc_col_ptr_sb`) is the
   * input. Used by the tree-reduce production path so the host
   * doesn't need a `COPY_SRC`-tagged copy of the CSR.
   */
  public gen_smvp_tree_entry_bucket_id_shader(tpb: number): string {
    return mustache.render(
      smvp_tree_entry_bucket_id_shader,
      { tpb, recompile: this.recompile },
      {},
    );
  }

  /**
   * Counts the number of distinct contiguous bucket runs in
   * `entry_bucket_id`. Single dispatch over ceil(total/wg_size)
   * workgroups; each WG does a shared-memory reduction and atomic-adds
   * the partial into slot 0 of the output buffer. Replaces the
   * `countActiveBuckets` JS readback in `runTreeReduce`.
   */
  public gen_smvp_tree_count_active_shader(wg_size: number): string {
    if (wg_size <= 0 || (wg_size & (wg_size - 1)) !== 0) {
      throw new Error(`gen_smvp_tree_count_active_shader: wg_size (${wg_size}) must be a positive power of two`);
    }
    return mustache.render(
      smvp_tree_count_active_shader,
      { wg_size, recompile: this.recompile },
      {},
    );
  }

  /**
   * Per-layer GPU prelude. Replaces host pickNumWgs / evenSliceBounds /
   * cpuPairCountPerSlice. Writes layer-strided slice bounds + per-WG
   * pair counts + the layer's chosen num_wgs into a small metadata pool
   * shared across all tree-reduce layers.
   *
   * Dispatched indirectly from `dispatch_args_prelude[layer_idx*3]`,
   * which the previous layer's `layer_scan` kernel wrote based on the
   * actual output count of this layer.
   */
  public gen_smvp_tree_layer_prelude_shader(
    prelude_wg_size: number,
    max_slice_entries: number,
    max_wgs: number,
  ): string {
    if (prelude_wg_size <= 0 || max_slice_entries <= 0 || max_wgs <= 0) {
      throw new Error(
        `gen_smvp_tree_layer_prelude_shader: prelude_wg_size=${prelude_wg_size}, max_slice_entries=${max_slice_entries}, max_wgs=${max_wgs} must all be positive`,
      );
    }
    return mustache.render(
      smvp_tree_layer_prelude_shader,
      { prelude_wg_size, max_slice_entries, max_wgs, recompile: this.recompile },
      {},
    );
  }

  /**
   * Per-layer GPU scan + dispatch-args writer. Single workgroup of
   * `scan_wg_size` threads; runs after `layer_prelude` finishes. Writes
   * the exclusive prefix-sum over per-WG pair counts into
   * `wg_output_offset_out`, propagates the total into
   * `layer_counts[layer_idx+1]`, and emits the indirect dispatch geometry
   * for both the next layer's prelude pass and this layer's
   * phase1/phase2 pass. Also writes the terminal flags
   * (`layer_counts[max_layers_slot]`, `final_slot_index[0]`) when the
   * tree reduce has converged.
   */
  public gen_smvp_tree_layer_scan_shader(scan_wg_size: number, max_wgs: number): string {
    if (scan_wg_size <= 0 || max_wgs <= 0) {
      throw new Error(
        `gen_smvp_tree_layer_scan_shader: scan_wg_size=${scan_wg_size}, max_wgs=${max_wgs} must be positive`,
      );
    }
    const elems_per_thread = Math.ceil(max_wgs / scan_wg_size);
    return mustache.render(
      smvp_tree_layer_scan_shader,
      { scan_wg_size, max_wgs, elems_per_thread, recompile: this.recompile },
      {},
    );
  }

  /**
   * Single-thread writer that converts the final tree-reduce total
   * (`layer_counts[max_layers_slot]`) into the indirect dispatch
   * geometry for the host-side scatter pass:
   *   dispatch_args_scatter = (ceil(total / scatter_tpb), 1, 1).
   */
  public gen_smvp_tree_scatter_args_shader(): string {
    return mustache.render(smvp_tree_scatter_args_shader, {}, {});
  }

  public gen_bench_batch_affine_shader(batch_size: number, tpb: number): string {
    if (batch_size <= 0 || tpb <= 0 || batch_size % tpb !== 0) {
      throw new Error(
        `gen_bench_batch_affine_shader: batch_size (${batch_size}) must be a positive multiple of tpb (${tpb})`,
      );
    }
    const per_thread_count = batch_size / tpb;
    return mustache.render(
      bench_batch_affine_shader,
      {
        batch_size,
        tpb,
        per_thread_count,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        p_inv_by_a_lo: this.p_inv_by_a_lo,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        bigint_by_funcs,
        by_inverse_a_funcs,
      },
    );
  }

  public gen_batch_affine_init_shader(workgroup_size: number): string {
    return mustache.render(
      batch_affine_init_shader,
      {
        workgroup_size,
        num_words: this.num_words,
        recompile: this.recompile,
      },
      { structs },
    );
  }

  // `windows_per_batch` (WPB) is baked into the shader at render time —
  // dispatch_args derives `num_batches = ceil(num_subtasks / WPB)` and
  // uses it as the inverse-pass Z dispatch dim. Must match the WPB used
  // by the corresponding gen_batch_inverse_parallel_shader call.
  public gen_batch_affine_dispatch_args_shader(windows_per_batch: number = 1): string {
    return mustache.render(batch_affine_dispatch_args_shader, { windows_per_batch }, {});
  }

  public gen_batch_affine_schedule_shader(workgroup_size: number): string {
    return mustache.render(
      batch_affine_schedule_shader,
      {
        workgroup_size,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
      },
    );
  }

  public gen_batch_affine_apply_scatter_shader(workgroup_size: number): string {
    return mustache.render(
      batch_affine_apply_scatter_shader,
      {
        workgroup_size,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
      },
    );
  }

  public gen_batch_affine_finalize_shader(workgroup_size: number, num_csr_cols: number): string {
    return mustache.render(
      batch_affine_finalize_shader,
      {
        workgroup_size,
        num_columns: num_csr_cols,
        half_num_columns: num_csr_cols / 2,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        p_minus_2_limbs: this.p_minus_2_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
        ec_funcs: ec_bn254_funcs,
      },
    );
  }

  public gen_batch_affine_finalize_collect_shader(workgroup_size: number, num_csr_cols: number): string {
    return mustache.render(
      batch_affine_finalize_collect_shader,
      {
        workgroup_size,
        num_columns: num_csr_cols,
        half_num_columns: num_csr_cols / 2,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
      },
    );
  }

  public gen_batch_affine_finalize_apply_shader(workgroup_size: number, num_csr_cols: number): string {
    return mustache.render(
      batch_affine_finalize_apply_shader,
      {
        workgroup_size,
        num_columns: num_csr_cols,
        half_num_columns: num_csr_cols / 2,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
      },
    );
  }

  public gen_batch_affine_apply_shader(workgroup_size: number): string {
    return mustache.render(
      batch_affine_apply_shader,
      {
        workgroup_size,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
      },
    );
  }

  public gen_bpr_shader(
    workgroup_size: number,
    capture_debug = false,
    assume_affine_buckets = false,
    mixed_safe_buckets = false,
    bench_flags: {
      bench_null?: boolean;
      bench_compute_only?: boolean;
      bench_memory_only?: boolean;
      bench_no_store?: boolean;
    } = {},
    safe_first_add_no_collision = false,
    // Multi-window BPR: each thread loops over WPB consecutive subtasks,
    // sharing kernel-launch and header overhead. WPB=1 keeps the legacy
    // one-subtask-per-workgroup behaviour. Const-bounded inside the
    // shader so Tint can fully unroll when WPB is small.
    windows_per_batch = 1,
  ) {
    const bench_null = !!bench_flags.bench_null;
    const bench_compute_only = !!bench_flags.bench_compute_only;
    const bench_memory_only = !!bench_flags.bench_memory_only;
    const bench_no_store = !!bench_flags.bench_no_store;
    const exclusive_count = Number(bench_null) + Number(bench_compute_only) + Number(bench_memory_only);
    if (exclusive_count > 1) {
      throw new Error('gen_bpr_shader: bench_null, bench_compute_only, bench_memory_only are mutually exclusive');
    }
    const bench_skip_writes = bench_null || bench_no_store;

    return mustache.render(
      bpr_bn254_shader,
      {
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        index_shift: this.index_shift,
        workgroup_size,
        windows_per_batch,
        recompile: this.recompile,
        capture_debug,
        assume_affine_buckets,
        mixed_safe_buckets,
        safe_first_add_no_collision,
        bench_null,
        bench_compute_only,
        bench_memory_only,
        bench_skip_writes,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        ec_funcs: ec_bn254_funcs,
      },
    );
  }

  public gen_horner_reduce_shader(num_subtasks: number, b_workgroup_size: number, chunk_size: number): string {
    return mustache.render(
      horner_reduce_bn254_shader,
      {
        num_subtasks,
        b_workgroup_size,
        chunk_size,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        ec_funcs: ec_bn254_funcs,
      },
    );
  }

  // Bench-only entry shader for the u32 Montgomery product. Each thread
  // chains `k` Mont mults over an (a, b) pair. `variant='cios'` selects
  // the runtime-loop CIOS in `mont_pro_product.template.wgsl`; 'karat'
  // selects the recursive Karatsuba + Yuval body below.
  public gen_field_mul_bench_u32_shader(
    workgroup_size: number,
    variant: 'cios' | 'karat' = 'cios',
  ): string {
    const structs_src = mustache.render(structs, { num_words: this.num_words });
    const bigint_src = mustache.render(bigint_funcs, {});
    // 'karat' reuses the pre-rendered class-level default; 'cios' renders
    // the original mitschabaude template inline so the bench can compare
    // both bodies even though karat is the production default.
    const mont_src =
      variant === 'karat'
        ? this.mont_product_src
        : mustache.render(montgomery_product_funcs, {
            num_words: this.num_words,
            word_size: this.word_size,
            n0: this.n0,
            mask: this.mask,
            two_pow_word_size: this.two_pow_word_size,
            p_inv_mod_2w: this.p_inv_mod_2w,
            p_limbs: this.p_limbs,
          });
    const entry_src = mustache.render(field_mul_bench_u32_shader, {
      workgroup_size,
    });
    return `${structs_src}
${bigint_src}
${mont_src}
${entry_src}`;
  }

  // Bench-only entry shader for the BY `by_divsteps` primitive. Assembles
  // the BY helpers (bigint_by) + the by_inverse partial (which hosts the
  // `Mat` struct and `by_divsteps`) + the per-thread bench entry.
  //
  // Each thread reads one (f_lo, g_lo, delta) tuple, calls `by_divsteps`,
  // and writes the resulting 8-field Mat + updated delta. Used by the
  // bench-divsteps.html page to compare against the TS Wasm9x29 port.
  //
  // Note: bigint_funcs / structs are NOT included here because divsteps
  // only needs the BY-specific helpers (signed_mul_split, u64_*_pair,
  // i64_*_pair). The BigInt-related portions of bigint_by (by_from_bigint
  // et al.) are still rendered for completeness; they're dead code in this
  // bench but will be needed in step 1.5 when fr_inv_by is wired up.
  // We also strip BigInt-conversion helpers from the bigint_by render here
  // by skipping the `{{ num_words }}` substitution — instead we set
  // num_words to the standard MSM value so the by_from/to_bigint helpers
  // remain syntactically valid even though unused.
  public gen_divsteps_bench_shader(workgroup_size: number): string {
    // Minimal BigInt struct declaration: by_from_bigint/by_to_bigint in
    // bigint_by reference the BigInt type for completeness. This bench
    // shader never calls them so the struct is dead but must compile.
    const structs_src = mustache.render(structs, { num_words: this.num_words });
    const bigint_src = mustache.render(bigint_funcs, {});
    // by_inverse hosts `fr_inv_by`, which references `montgomery_product`,
    // `get_r_cubed`, and the {{ p_limbs_by }} / {{ p_inv_by_* }} Mustache
    // substitutions. divsteps_bench itself never calls fr_inv_by, but the
    // partial must compile cleanly — so we pull in the same Mont + field +
    // fr_pow surface that gen_fr_inv_bench_shader uses.
    const mont_src = this.mont_product_src;
    const field_src = mustache.render(field_funcs, {
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      r_limbs: this.r_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
    });
    const fr_pow_src = mustache.render(fr_pow_funcs, {
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      r_limbs: this.r_limbs,
      r_cubed_limbs: this.r_cubed_limbs,
      p_minus_2_limbs: this.p_minus_2_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
    });
    const bigint_by_src = mustache.render(bigint_by_funcs, {
      num_words: this.num_words,
    });
    const by_inverse_src = this.renderByInverseFuncs();
    const entry_src = mustache.render(divsteps_bench_shader, { workgroup_size });
    const get_r_src = this.renderGetRFn();
    return `${structs_src}
${bigint_src}
${mont_src}
${field_src}
${get_r_src}
${fr_pow_src}
${bigint_by_src}
${by_inverse_src}
${entry_src}`;
  }

  // Bench-only entry shader for `by_apply_matrix_fg` + `by_apply_matrix_de`.
  // Each thread reads one (Mat, f, g, d, e) record, runs both passes, and
  // writes the updated (f', g', d', e') as 36 i32 values. Validates against
  // the TS `Wasm9x29.applyMatrix` reference (used by the bench-apply-matrix
  // Playwright driver).
  //
  // Renders:
  //   - structs (with num_words for BigInt declaration — dead-coded in this
  //     bench, kept so the bigint_by partial compiles cleanly).
  //   - bigint_by partial (signed_mul_split, u64/i64 helpers, by_normalise).
  //   - by_inverse partial (Mat, by_divsteps, by_apply_matrix_*).
  //   - apply_matrix_bench entry (decode → apply → encode).
  // Mustache substitutions on the entry shader:
  //   - workgroup_size
  //   - p_limbs_by:    BigIntBY initializer for p
  //   - p_inv_by_lo:   low 32 bits of P_INV = p^(-1) mod 2^58
  //   - p_inv_by_hi:   high (up to 26) bits of P_INV
  public gen_apply_matrix_bench_shader(workgroup_size: number): string {
    const structs_src = mustache.render(structs, { num_words: this.num_words });
    const bigint_src = mustache.render(bigint_funcs, {});
    // See gen_divsteps_bench_shader for why the Mont + field + fr_pow surface
    // is included — `fr_inv_by` lives inside the by_inverse partial and
    // references those symbols, even though apply_matrix_bench never calls it.
    const mont_src = this.mont_product_src;
    const field_src = mustache.render(field_funcs, {
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      r_limbs: this.r_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
    });
    const fr_pow_src = mustache.render(fr_pow_funcs, {
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      r_limbs: this.r_limbs,
      r_cubed_limbs: this.r_cubed_limbs,
      p_minus_2_limbs: this.p_minus_2_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
    });
    const bigint_by_src = mustache.render(bigint_by_funcs, {
      num_words: this.num_words,
    });
    const by_inverse_src = this.renderByInverseFuncs();
    const entry_src = mustache.render(apply_matrix_bench_shader, {
      workgroup_size,
      p_limbs_by: this.p_limbs_by_initializer,
      p_inv_by_lo: this.p_inv_by_lo,
      p_inv_by_hi: this.p_inv_by_hi,
    });
    const get_r_src = this.renderGetRFn();
    return `${structs_src}
${bigint_src}
${mont_src}
${field_src}
${get_r_src}
${fr_pow_src}
${bigint_by_src}
${by_inverse_src}
${entry_src}`;
  }

  // Bench-only entry shader for the BY top-level `fr_inv_by` driver. Each
  // thread reads one BN254 base-field value `a` (in Montgomery form), runs
  // `k` chained `fr_inv_by` calls, and writes the final value back. Used by
  // the bench-fr-inv Playwright driver to validate against the host
  // `Wasm9x29.invert` + Mont-correction reference.
  //
  // The render bundles:
  //   - structs                       (BigInt declaration, NUM_WORDS limbs)
  //   - bigint_funcs                  (basic BigInt utilities)
  //   - karat+yuval Mont product      (provides `montgomery_product`, `get_p`)
  //   - fr_pow_funcs                  (provides `get_r_cubed` + `fr_inv`)
  //   - bigint_by (variant=fr_inv_by) (signed_mul_split, u64/i64 helpers,
  //                                    by_normalise, by_from/to_bigint)
  //   - by_inverse (variant=fr_inv_by) (Mat, by_divsteps, by_apply_matrix_*,
  //                                    by_reduce_to_canonical, fr_inv_by)
  //   - fr_inv_bench entry            (per-thread chained inversion)
  //
  // The `variant` arg picks the symbol the entry shader calls. For
  // 'fr_inv_by' we include the by_inverse + bigint_by partials; for the
  // legacy 'fr_inv' (Pornin jumpy K=12 safegcd in fr_pow) we omit them so
  // the rendered bundle stays small and dead-code-free.
  //
  // Mustache substitutions consumed by `by_inverse` (via renderByInverseFuncs):
  //   - p_limbs_by:   BigIntBY initializer for the BN254 base-field modulus
  //   - p_inv_by_lo:  low 32 bits of P_INV = p^(-1) mod 2^58
  //   - p_inv_by_hi:  high (up to 26) bits of P_INV
  public gen_fr_inv_bench_shader(
    workgroup_size: number,
    variant: 'fr_inv_by' | 'fr_inv' | 'fr_inv_by_a' | 'fr_pow_inv' = 'fr_inv_by',
  ): string {
    const structs_src = mustache.render(structs, { num_words: this.num_words });
    const bigint_src = mustache.render(bigint_funcs, {});
    const mont_src = this.mont_product_src;
    // field_funcs provides `fr_sub` / `fr_add` / `bigint_halve_k_mod_p` and
    // other helpers that fr_pow's alternate variants reference. `fr_inv_by`
    // itself does not call them but the partial must resolve every symbol
    // or shader compilation fails.
    const field_src = mustache.render(field_funcs, {
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      r_limbs: this.r_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
    });
    // fr_pow exports `fr_pow`, `fr_inv`, `fr_inv_plain`, `fr_inv_bgcd`, and
    // the `get_r_cubed` helper that `fr_inv_by` uses for the Mont
    // correction. We include it in BOTH variants so `get_r_cubed` is in
    // scope for fr_inv_by and `fr_inv` is in scope for the legacy variant.
    const fr_pow_src = mustache.render(fr_pow_funcs, {
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      r_limbs: this.r_limbs,
      r_cubed_limbs: this.r_cubed_limbs,
      p_minus_2_limbs: this.p_minus_2_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
    });
    // bigint_by + by_inverse are gated on variant: they are large partials
    // (≈700 lines of BY plumbing) and only needed when fr_inv_by is called.
    // For the legacy fr_inv variant we omit them entirely so the bundle
    // stays small and we don't pay compile time for dead code.
    let by_blocks = '';
    if (variant === 'fr_inv_by') {
      by_blocks = `${mustache.render(bigint_by_funcs, { num_words: this.num_words })}
${this.renderByInverseFuncs()}`;
    } else if (variant === 'fr_inv_by_a') {
      // Option A reuses the u64 helpers from bigint_by (u64_add, u64_sub,
      // u64_shr1, u64_low_bit) but does NOT need the 9 x 29-bit BigIntBY
      // struct or its conversion helpers. We still pull in bigint_by for
      // the u64 helpers and signed_mul_split (unused here but cheap).
      by_blocks = `${mustache.render(bigint_by_funcs, { num_words: this.num_words })}
${this.renderByInverseAFuncs()}`;
    }
    const entry_src = mustache.render(fr_inv_bench_shader, {
      workgroup_size,
      r_limbs: this.r_limbs,
      inv_fn: variant,
    });
    return `${structs_src}
${bigint_src}
${mont_src}
${field_src}
${fr_pow_src}
${by_blocks}
${entry_src}`;
  }

  // Render the by_inverse partial with the BY-specific Mustache constants
  // (BigIntBY initializer for p, and the p_inv 58-bit split). Shared by the
  // divsteps / apply_matrix / fr_inv bench renders so the partial's
  // `{{{ p_limbs_by }}}` and `{{ p_inv_by_* }}` substitutions resolve to
  // valid WGSL in every assembly.
  private renderByInverseFuncs(): string {
    return mustache.render(by_inverse_funcs, {
      p_limbs_by: this.p_limbs_by_initializer,
      p_inv_by_lo: this.p_inv_by_lo,
      p_inv_by_hi: this.p_inv_by_hi,
    });
  }

  // Render the by_inverse_a partial (Option A: BATCH=26 / NUM_OUTER=29 BY
  // safegcd on 20 x 13-bit BigInt). Mustache substitutions: the 26-bit
  // p_inv constant and {{ num_words }} for the streaming-loop bound.
  private renderByInverseAFuncs(): string {
    return mustache.render(by_inverse_a_funcs, {
      num_words: this.num_words,
      p_inv_by_a_lo: this.p_inv_by_a_lo,
    });
  }

  // Inlined `get_r` definition with the curve-specific R limbs. Every
  // production MSM shader defines its own; the bench harnesses pull this
  // from a single helper so the divsteps / apply_matrix benches can hoist
  // it before fr_pow_funcs (which calls `get_r()` from inside fr_pow).
  private renderGetRFn(): string {
    return `fn get_r() -> BigInt {\n    var r: BigInt;\n${this.r_limbs}\n    return r;\n}`;
  }

  // Bench-only entry shader for the f32 Montgomery product. Only the
  // sos3uv3 variant (22-bit limbs, per-slot tlo/thi chain-break) is wired
  // up here — it is the fastest f32 Mont mul found in the wider variant
  // sweep and is kept as a reference point alongside the u32 paths.
  public gen_field_mul_bench_f32_shader(
    workgroup_size: number,
    variant: 'sos3uv3' = 'sos3uv3',
  ): string {
    if (variant !== 'sos3uv3') {
      throw new Error(`f32 bench variant must be 'sos3uv3', got '${variant}'`);
    }
    const helpers = this.gen_montgomery_product_f32_22_sos3uv3_shader();
    const entry_src = mustache.render(field_mul_bench_f32_shader, {
      workgroup_size,
    });
    return `${helpers}
${entry_src}`;
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

    const input_loads: Array<{ name: string; ptr: string; k: number }> = [];
    const chunks = [
      ['x_lo_lo', 'x_ptr', 0],
      ['x_lo_hi', 'x_ptr', 5],
      ['x_hi_lo', 'x_ptr', 10],
      ['x_hi_hi', 'x_ptr', 15],
      ['y_lo_lo', 'y_ptr', 0],
      ['y_lo_hi', 'y_ptr', 5],
      ['y_hi_lo', 'y_ptr', 10],
      ['y_hi_hi', 'y_ptr', 15],
    ] as const;
    for (const [prefix, ptr, base] of chunks) {
      for (let k = 0; k < 5; k++) {
        input_loads.push({ name: `${prefix}_${k}`, ptr, k: (base as number) + k });
      }
    }

    const sum_lets: Array<{ name: string; lhs: string; rhs: string }> = [];
    const sumDefs = [
      ['a_lo_sum', 'x_lo_lo', 'x_lo_hi'],
      ['b_lo_sum', 'y_lo_lo', 'y_lo_hi'],
      ['a_hi_sum', 'x_hi_lo', 'x_hi_hi'],
      ['b_hi_sum', 'y_hi_lo', 'y_hi_hi'],
      ['a_cr_lo', 'x_lo_lo', 'x_hi_lo'],
      ['a_cr_hi', 'x_lo_hi', 'x_hi_hi'],
      ['b_cr_lo', 'y_lo_lo', 'y_hi_lo'],
      ['b_cr_hi', 'y_lo_hi', 'y_hi_hi'],
      ['a_cr_sum', 'a_cr_lo', 'a_cr_hi'],
      ['b_cr_sum', 'b_cr_lo', 'b_cr_hi'],
    ] as const;
    for (const [name, lhs, rhs] of sumDefs) {
      for (let k = 0; k < 5; k++) {
        sum_lets.push({ name: `${name}_${k}`, lhs: `${lhs}_${k}`, rhs: `${rhs}_${k}` });
      }
    }

    const schoolbooks = [
      { label: 'PP_lo_LL = x_lo_lo · y_lo_lo', out_prefix: 'pp_lo_ll', a_prefix: 'x_lo_lo', b_prefix: 'y_lo_lo' },
      { label: 'PP_lo_HH = x_lo_hi · y_lo_hi', out_prefix: 'pp_lo_hh', a_prefix: 'x_lo_hi', b_prefix: 'y_lo_hi' },
      { label: 'PP_lo_C  = a_lo_sum · b_lo_sum', out_prefix: 'pp_lo_c', a_prefix: 'a_lo_sum', b_prefix: 'b_lo_sum' },
      { label: 'PP_hi_LL = x_hi_lo · y_hi_lo', out_prefix: 'pp_hi_ll', a_prefix: 'x_hi_lo', b_prefix: 'y_hi_lo' },
      { label: 'PP_hi_HH = x_hi_hi · y_hi_hi', out_prefix: 'pp_hi_hh', a_prefix: 'x_hi_hi', b_prefix: 'y_hi_hi' },
      { label: 'PP_hi_C  = a_hi_sum · b_hi_sum', out_prefix: 'pp_hi_c', a_prefix: 'a_hi_sum', b_prefix: 'b_hi_sum' },
      { label: 'PP_cr_LL = a_cr_lo  · b_cr_lo', out_prefix: 'pp_cr_ll', a_prefix: 'a_cr_lo', b_prefix: 'b_cr_lo' },
      { label: 'PP_cr_HH = a_cr_hi  · b_cr_hi', out_prefix: 'pp_cr_hh', a_prefix: 'a_cr_hi', b_prefix: 'b_cr_hi' },
      { label: 'PP_cr_C  = a_cr_sum · b_cr_sum', out_prefix: 'pp_cr_c', a_prefix: 'a_cr_sum', b_prefix: 'b_cr_sum' },
    ];

    const inner_combines = [
      { label: 'P_lo from pp_lo_*', out_prefix: 'p_lo', ll_prefix: 'pp_lo_ll', hh_prefix: 'pp_lo_hh', c_prefix: 'pp_lo_c' },
      { label: 'P_hi from pp_hi_*', out_prefix: 'p_hi', ll_prefix: 'pp_hi_ll', hh_prefix: 'pp_hi_hh', c_prefix: 'pp_hi_c' },
      { label: 'P_cr from pp_cr_*', out_prefix: 'p_cr', ll_prefix: 'pp_cr_ll', hh_prefix: 'pp_cr_hh', c_prefix: 'pp_cr_c' },
    ];

    const outer_init: Array<{ slot: number; init_expr: string }> = [];
    for (let k = 0; k < 19; k++) outer_init.push({ slot: k, init_expr: `p_lo_${k}` });
    outer_init.push({ slot: 19, init_expr: '0u' });
    for (let k = 0; k < 19; k++) outer_init.push({ slot: 20 + k, init_expr: `p_hi_${k}` });
    outer_init.push({ slot: 39, init_expr: '0u' });

    const outer_cross: Array<{ slot: number; k: number }> = [];
    for (let k = 0; k < 19; k++) outer_cross.push({ slot: 10 + k, k });

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
      input_loads,
      sum_lets,
      schoolbooks,
      inner_combines,
      outer_init,
      outer_cross,
      yuval_iters,
      i_std,
      standard_writes,
      final_drain,
      extract,
    });
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
}
