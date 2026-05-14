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
  bpr_bn254 as bpr_bn254_shader,
  convert_point_coords_and_decompose_scalars,
  convert_points_only as convert_points_only_shader,
  decompose_scalars_signed_only as decompose_scalars_signed_only_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  ec_bn254 as ec_bn254_funcs,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  field as field_funcs,
  fr_pow as fr_pow_funcs,
  horner_reduce_bn254 as horner_reduce_bn254_shader,
  mont_pro_product as montgomery_product_funcs,
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
  gen_r_limbs,
  gen_mu_limbs,
  gen_wgsl_limbs_code,
} from './utils.js';
import { BN254_CURVE_CONFIG, CurveConfig } from './curve_config.js';

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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
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
        montgomery_product_funcs,
        field_funcs,
        ec_funcs: ec_bn254_funcs,
      },
    );
  }
}
