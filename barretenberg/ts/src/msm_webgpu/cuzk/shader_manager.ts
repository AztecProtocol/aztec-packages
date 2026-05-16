import mustache from 'mustache';
import {
  barrett as barrett_funcs,
  batch_affine_apply as batch_affine_apply_shader,
  batch_affine_apply_scatter as batch_affine_apply_scatter_shader,
  batch_affine_dispatch_args as batch_affine_dispatch_args_shader,
  batch_affine_finalize as batch_affine_finalize_shader,
  batch_affine_finalize_apply as batch_affine_finalize_apply_shader,
  batch_affine_finalize_collect as batch_affine_finalize_collect_shader,
  batch_affine_init as batch_affine_init_shader,
  batch_affine_schedule as batch_affine_schedule_shader,
  batch_inverse as batch_inverse_shader,
  batch_inverse_parallel as batch_inverse_parallel_shader,
  bigint as bigint_funcs,
  bigint_f32 as bigint_f32_funcs,
  bpr_bn254 as bpr_bn254_shader,
  convert_point_coords_and_decompose_scalars,
  convert_points_only as convert_points_only_shader,
  decompose_scalars_signed_only as decompose_scalars_signed_only_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  ec_bn254 as ec_bn254_funcs,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  field as field_funcs,
  field_mul_bench_f32 as field_mul_bench_f32_shader,
  field_mul_bench_u32 as field_mul_bench_u32_shader,
  fr_pow as fr_pow_funcs,
  horner_reduce_bn254 as horner_reduce_bn254_shader,
  mont_pro_product as montgomery_product_funcs,
  mont_pro_product_f32_22_sos3uv3 as montgomery_product_f32_22_sos3uv3_funcs,
  mont_pro_product_karat_yuval as montgomery_product_karat_yuval_funcs,
  mulhilo_22 as mulhilo_22_funcs,
  smvp_bn254 as smvp_bn254_shader,
  structs,
  transpose_parallel_count as transpose_parallel_count_shader,
  transpose_parallel_scan as transpose_parallel_scan_shader,
  transpose_parallel_scatter as transpose_parallel_scatter_shader,
  transpose_serial as transpose_serial_shader,
} from '../wgsl/_generated/shaders.js';
import {
  compute_misc_params,
  compute_mod_inverse_pow2,
  gen_p_limbs,
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
  public p_inv_mod_2w: number;
  public mu_limbs: string;
  // 22-bit-limb f32 Montgomery params. Used exclusively by
  // `gen_field_mul_bench_f32_shader` for the sos3uv3 micro-benchmark.
  // The 22-bit width buys a 4-way exact sum (4·2^22 = 2^24 fits in f32
  // mantissa), enabling the per-slot (tlo, thi) chain-break in sos3uv3.
  public num_limbs_f32_22: number;
  public n0_f32_22: bigint;
  public p_limbs_f32_22_str: string;
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
      },
    );
  }

  public gen_batch_inverse_parallel_shader(num_sub_wgs: number): string {
    return mustache.render(
      batch_inverse_parallel_shader,
      {
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        r_limbs: this.r_limbs,
        r_cubed_limbs: this.r_cubed_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        num_sub_wgs,
        recompile: this.recompile,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        fr_pow_funcs,
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

  public gen_batch_affine_dispatch_args_shader(): string {
    return mustache.render(batch_affine_dispatch_args_shader, {}, {});
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
