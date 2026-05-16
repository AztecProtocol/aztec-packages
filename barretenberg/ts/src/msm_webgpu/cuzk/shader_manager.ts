import mustache from 'mustache';
import {
  barrett as barrett_funcs,
  batch_affine_apply as batch_affine_apply_shader,
  batch_affine_apply_f32 as batch_affine_apply_f32_shader,
  batch_affine_apply_scatter as batch_affine_apply_scatter_shader,
  batch_affine_apply_scatter_f32 as batch_affine_apply_scatter_f32_shader,
  batch_affine_dispatch_args as batch_affine_dispatch_args_shader,
  batch_affine_dispatch_args_f32 as batch_affine_dispatch_args_f32_shader,
  batch_affine_finalize as batch_affine_finalize_shader,
  batch_affine_finalize_f32 as batch_affine_finalize_f32_shader,
  batch_affine_finalize_apply as batch_affine_finalize_apply_shader,
  batch_affine_finalize_apply_f32 as batch_affine_finalize_apply_f32_shader,
  batch_affine_finalize_collect as batch_affine_finalize_collect_shader,
  batch_affine_finalize_collect_f32 as batch_affine_finalize_collect_f32_shader,
  batch_affine_init as batch_affine_init_shader,
  batch_affine_init_f32 as batch_affine_init_f32_shader,
  batch_affine_schedule as batch_affine_schedule_shader,
  batch_affine_schedule_f32 as batch_affine_schedule_f32_shader,
  batch_inverse as batch_inverse_shader,
  batch_inverse_f32 as batch_inverse_f32_shader,
  batch_inverse_parallel as batch_inverse_parallel_shader,
  batch_inverse_parallel_f32 as batch_inverse_parallel_f32_shader,
  bigint as bigint_funcs,
  bigint_f32 as bigint_f32_funcs,
  bpr_bn254 as bpr_bn254_shader,
  bpr_bn254_f32 as bpr_bn254_f32_shader,
  convert_point_coords_and_decompose_scalars,
  convert_points_only as convert_points_only_shader,
  decompose_scalars_signed_only as decompose_scalars_signed_only_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  decompress_g1_bn254_f32 as decompress_g1_bn254_f32_shader,
  ec_bn254 as ec_bn254_funcs,
  ec_bn254_f32 as ec_bn254_f32_funcs,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  field as field_funcs,
  field_f32 as field_f32_funcs,
  field_mul_bench_f32 as field_mul_bench_f32_shader,
  field_mul_bench_u32 as field_mul_bench_u32_shader,
  fr_pow as fr_pow_funcs,
  fr_pow_f32 as fr_pow_f32_funcs,
  horner_reduce_bn254 as horner_reduce_bn254_shader,
  horner_reduce_bn254_f32 as horner_reduce_bn254_f32_shader,
  mont_pro_product as montgomery_product_funcs,
  mont_pro_product_karat_yuval as montgomery_product_karat_yuval_funcs,
  mont_pro_product_f32 as montgomery_product_f32_funcs,
  mont_pro_product_f32_22 as montgomery_product_f32_22_funcs,
  mont_pro_product_f32_22_sos3 as montgomery_product_f32_22_sos3_funcs,
  mont_pro_product_f32_22_sos3u as montgomery_product_f32_22_sos3u_funcs,
  mont_pro_product_f32_22_sos3u32 as montgomery_product_f32_22_sos3u32_funcs,
  mont_pro_product_f32_22_sos3uv2 as montgomery_product_f32_22_sos3uv2_funcs,
  mont_pro_product_f32_22_sos3uv3 as montgomery_product_f32_22_sos3uv3_funcs,
  mont_pro_product_f32_22_sos3wasm as montgomery_product_f32_22_sos3wasm_funcs,
  mont_pro_product_f32_19_sos3cf as montgomery_product_f32_19_sos3cf_funcs,
  mont_pro_product_f32_19_sos3uv3cf as montgomery_product_f32_19_sos3uv3cf_funcs,
  mont_pro_product_f32_22_unrolled as montgomery_product_f32_22_unrolled_funcs,
  mont_pro_product_f32_22_v2 as montgomery_product_f32_22_v2_funcs,
  mont_pro_product_f32_sos as montgomery_product_f32_sos_funcs,
  mulhilo as mulhilo_funcs,
  mulhilo_22 as mulhilo_22_funcs,
  smvp_bn254 as smvp_bn254_shader,
  smvp_bn254_f32 as smvp_bn254_f32_shader,
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
  gen_wgsl_limbs_code_f32,
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
  // f32 / 23-bit-limb Montgomery path (step 2 of the FMA overhaul).
  // Lives in parallel with the 13-bit u32 fields above; no shared
  // state, so the existing pipeline is unaffected.
  public num_limbs_f32: number;
  public n0_f32: bigint;
  public r_f32: bigint;
  public p_limbs_f32_str: string;
  public r_limbs_f32_str: string;
  public r_squared_limbs_f32_str: string;
  public sqrt_exp_limbs_f32_str: string;
  public inv_exp_limbs_f32_str: string;
  public b3_mont_limbs_f32_str: string;
  // 22-bit-limb f32 Montgomery path (parallel sibling of the 23-bit fields
  // above). Used exclusively by `gen_field_mul_bench_f32_shader` for the
  // micro-benchmark; the MSM-side 23-bit stack is unaffected. The 22-bit
  // width buys a 4-way exact sum (4*2^22 = 2^24 fits in f32 mantissa)
  // which collapses the per-iter bias-split cascade.
  public num_limbs_f32_22: number;
  public n0_f32_22: bigint;
  public p_limbs_f32_22_str: string;
  // 19-bit-limb f32 path. With N=14 limbs, per-slot peak accumulation in a
  // fully carry-free SOS variant is 2*N*W = 14.7M < 2^24 — fits f32 mantissa
  // exactly. Each accumulator drained to i32 at the very end (sum tlo+thi
  // would overflow 2^24, so we go via i32 to combine them precisely).
  public num_limbs_f32_19: number;
  public n0_f32_19: bigint;
  public p_limbs_f32_19_str: string;
  public curveConfig: CurveConfig;
  public recompile = '';
  // Pre-rendered u32 Montgomery product source. The template is unrolled
  // (all loop indices compile-time constant) so naga can SROA the
  // accumulator slots into registers. Rendered once in the constructor
  // and used everywhere the function is needed: by the bench (string
  // concat) and by 15 other shaders (as the `montgomery_product_funcs`
  // mustache partial).
  public mont_product_src: string;

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

    // f32 / 23-bit-limb Montgomery params. Independent of curveConfig.wordSize.
    const params_f32 = compute_misc_params(this.p, 23);
    this.num_limbs_f32 = params_f32.num_words;
    this.n0_f32 = params_f32.n0;
    this.r_f32 = params_f32.r;
    this.p_limbs_f32_str = gen_p_limbs_f32(this.p, this.num_limbs_f32, 23);
    this.r_limbs_f32_str = gen_wgsl_limbs_code_f32(this.r_f32, 'r', this.num_limbs_f32, 23);
    // R^2 mod p in the 23-bit ring — used by to_mont_f32. Different
    // numeric value than the u32 R^2 because the radix differs.
    const r_squared_f32 = (this.r_f32 * this.r_f32) % this.p;
    this.r_squared_limbs_f32_str = gen_wgsl_limbs_code_f32(
      r_squared_f32,
      'r2',
      this.num_limbs_f32,
      23,
    );
    this.sqrt_exp_limbs_f32_str = gen_wgsl_limbs_code_f32(
      sqrt_exp,
      'e',
      this.num_limbs_f32,
      23,
    );
    // Fermat exponent for fr_inv_f32. a^(p-2) = a^-1 mod p.
    this.inv_exp_limbs_f32_str = gen_wgsl_limbs_code_f32(
      this.p - 2n,
      'e',
      this.num_limbs_f32,
      23,
    );
    // BN254 curve b = 3, in Mont-f32 form: 3·R_f mod p. Used by the f32
    // SRS decompression shader.
    const b3_mont_f32 = (3n * this.r_f32) % this.p;
    this.b3_mont_limbs_f32_str = gen_wgsl_limbs_code_f32(
      b3_mont_f32,
      'b3',
      this.num_limbs_f32,
      23,
    );

    // 22-bit-limb f32 path (bench only). compute_misc_params(p, 22)
    // gives num_words = 12 for BN254 (12*22 = 264 ≥ 254). Note that
    // p.limbs[11] at 22-bit width is 3097 (NOT 1), so the 22-bit
    // Mont template runs a fully general final-position loop iter.
    const params_f32_22 = compute_misc_params(this.p, 22);
    this.num_limbs_f32_22 = params_f32_22.num_words;
    this.n0_f32_22 = params_f32_22.n0;
    this.p_limbs_f32_22_str = gen_p_limbs_f32(this.p, this.num_limbs_f32_22, 22);

    // 19-bit-limb f32 path (bench only). 14 limbs × 19 bits = 266 ≥ 254.
    const params_f32_19 = compute_misc_params(this.p, 19);
    this.num_limbs_f32_19 = params_f32_19.num_words;
    this.n0_f32_19 = params_f32_19.n0;
    this.p_limbs_f32_19_str = gen_p_limbs_f32(this.p, this.num_limbs_f32_19, 19);

    if (force_recompile) {
      const rand = Math.floor(Math.random() * 0x100000000);
      this.recompile = `
                var recompile = ${rand}u;
                recompile += 1u;
            `.trim();
    }

    this.mont_product_src = this.renderMontProduct();
  }

  // Renders mont_pro_product.template.wgsl once with curve constants
  // baked in. Hoisted out of the 15+ caller sites that previously each
  // ran the same mustache.render with the same context.
  private renderMontProduct(): string {
    return mustache.render(montgomery_product_funcs, {
      num_words: this.num_words,
      word_size: this.word_size,
      n0: this.n0,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
      p_limbs: this.p_limbs,
    });
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

  // Returns the WGSL source for the f32 Montgomery product helpers
  // (`BigIntF32`, `bigint_f32_*`, `mulhilo`, `montgomery_product_f32`,
  // `conditional_reduce_f32`, `get_p_f32`). Callers append their own
  // entry point and binding declarations. Mustache-rendered with no
  // partials — everything inlines via {{ ... }} substitutions on the
  // three source templates (bigint_f32, mulhilo, mont_pro_product_f32).
  public gen_montgomery_product_f32_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32,
      w: '8388608.0',
      w_inv: '1.1920928955078125e-7',
      bias: '70368744177664.0',
      n0: `${this.n0_f32.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_funcs, ctx);
    // mulhilo first: defines W / W_INV / BIAS used by bigint_f32 and the
    // Montgomery body. bigint_f32 next: defines BigIntF32 + sub/eq/gt used
    // by conditional_reduce_f32. Then the Montgomery body itself.
    return `${mulhilo_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // Returns the WGSL source for the full f32 field op stack: mulhilo +
  // bigint_f32 + montgomery_product_f32 + field_f32 + fr_pow_f32.
  // Callers append their own entry point and binding declarations.
  // Used by the per-op f32 unit tests in `wgsl_unit_tests.ts` and by
  // the future curve/cuzk f32 shaders (steps 4b/4c).
  public gen_field_f32_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32,
      w: '8388608.0',
      w_inv: '1.1920928955078125e-7',
      bias: '70368744177664.0',
      n0: `${this.n0_f32.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_str,
      r_limbs_f32: this.r_limbs_f32_str,
      r_squared_limbs_f32: this.r_squared_limbs_f32_str,
      sqrt_exp_limbs_f32: this.sqrt_exp_limbs_f32_str,
      inv_exp_limbs_f32: this.inv_exp_limbs_f32_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_funcs, ctx);
    const field_src = mustache.render(field_f32_funcs, ctx);
    const fr_pow_src = mustache.render(fr_pow_f32_funcs, ctx);
    return `${mulhilo_funcs}
${bigint_f32_src}
${mont_src}
${field_src}
${fr_pow_src}`;
  }

  // Returns the WGSL source for the full f32 curve op stack: field_f32
  // helpers + ec_bn254_f32 (`PointF32` + Jacobian add / double / mixed
  // add). Callers append their own entry point and binding declarations.
  // Used by the per-op f32 curve unit tests in `wgsl_unit_tests.ts` and
  // by the future cuzk f32 shaders (step 4c).
  public gen_curve_f32_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32,
      w: '8388608.0',
      w_inv: '1.1920928955078125e-7',
      bias: '70368744177664.0',
      n0: `${this.n0_f32.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_str,
      r_limbs_f32: this.r_limbs_f32_str,
      r_squared_limbs_f32: this.r_squared_limbs_f32_str,
      sqrt_exp_limbs_f32: this.sqrt_exp_limbs_f32_str,
      inv_exp_limbs_f32: this.inv_exp_limbs_f32_str,
    };
    const field_bundle = this.gen_field_f32_shader();
    const curve_src = mustache.render(ec_bn254_f32_funcs, ctx);
    return `${field_bundle}
${curve_src}`;
  }

  // Self-contained parity-check shader: runs `montgomery_product` (the
  // 13-bit u32 path) AND `montgomery_product_f32` (the 23-bit f32 path)
  // on the same dispatch over paired inputs. Used by the Sanity Check
  // button to catch regressions in the f32 path before MSM-level
  // mismatches surface. Both paths produce canonical [0, p) outputs.
  //
  // Both Montgomery templates declare a module-scope `N0` constant; the
  // u32 version is `u32`, the f32 version is `f32`. The f32 source's
  // `N0` / `n0` identifiers are rewritten to `N0_F32` / `n0_f32` here
  // so the two declarations coexist in one WGSL module without touching
  // the upstream templates.
  public gen_montgomery_parity_shader(workgroup_size: number = 64): string {
    const mont_u32_src = this.mont_product_src;
    const structs_src = mustache.render(structs, { num_words: this.num_words });
    const bigint_src = mustache.render(bigint_funcs, {});
    // Rename N0 → N0_F32 inside the f32 bundle to dodge the const-
    // collision with mont_pro_product (which keeps N0 as u32). `\bN0\b`
    // matches only the WGSL identifier — mulhilo, bigint_f32 and
    // mont_pro_product_f32 don't share any other `N0`-prefixed name.
    const f32_src = this.gen_montgomery_product_f32_shader().replace(/\bN0\b/g, 'N0_F32');

    return `${structs_src}
${bigint_src}
${mont_u32_src}
${f32_src}

struct Pair13 { x: BigInt, y: BigInt }
struct Pair23 { x: BigIntF32, y: BigIntF32 }

@group(0) @binding(0) var<storage, read>       in_u32:  array<Pair13>;
@group(0) @binding(1) var<storage, read>       in_f32:  array<Pair23>;
@group(0) @binding(2) var<storage, read_write> out_u32: array<BigInt>;
@group(0) @binding(3) var<storage, read_write> out_f32: array<BigIntF32>;

@compute @workgroup_size(${workgroup_size})
fn parity_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= arrayLength(&in_u32)) { return; }
    var xu = in_u32[i].x;
    var yu = in_u32[i].y;
    var xf = in_f32[i].x;
    var yf = in_f32[i].y;
    out_u32[i] = montgomery_product(&xu, &yu);
    out_f32[i] = montgomery_product_f32(&xf, &yf);
}
`;
  }

  // Field-mul micro-benchmark, u32 / 20×13-bit limbs path. Concatenates
  // the struct definition, bigint helpers (for `bigint_gt`/`bigint_eq`/
  // `bigint_sub` used by `conditional_reduce`), `montgomery_product`,
  // and the entry-point template. The only loop in the entry point is
  // bounded by the host-supplied uniform `k` (capped at 100 host-side);
  // inner Montgomery loops are bounded by the compile-time NUM_WORDS.
  public gen_field_mul_bench_u32_shader(
    workgroup_size: number,
    variant: 'cios' | 'karat' = 'cios',
  ): string {
    const structs_src = mustache.render(structs, { num_words: this.num_words });
    const bigint_src = mustache.render(bigint_funcs, {});
    const mont_src = variant === 'karat'
      ? this.renderKaratYuvalMont()
      : this.mont_product_src;
    const entry_src = mustache.render(field_mul_bench_u32_shader, {
      workgroup_size,
    });
    return `${structs_src}
${bigint_src}
${mont_src}
${entry_src}`;
  }

  // Renders mont_pro_product_karat_yuval.template.wgsl. The .wgsl file owns
  // the algorithm structure (chunks → sums → 9 schoolbook sub-sub-products
  // → inner combines → outer combine → Yuval reduce → final canonicalize)
  // via mustache `{{#each}}` sections. The TS here just provides the index
  // arrays + r_inv limb constants.
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
    const r_inv_consts = limbs.map((val, idx) => ({idx, val}));

    const input_loads: Array<{name: string; ptr: string; k: number}> = [];
    const chunks = [
      ['x_lo_lo', 'x_ptr', 0], ['x_lo_hi', 'x_ptr', 5],
      ['x_hi_lo', 'x_ptr', 10], ['x_hi_hi', 'x_ptr', 15],
      ['y_lo_lo', 'y_ptr', 0], ['y_lo_hi', 'y_ptr', 5],
      ['y_hi_lo', 'y_ptr', 10], ['y_hi_hi', 'y_ptr', 15],
    ] as const;
    for (const [prefix, ptr, base] of chunks) {
      for (let k = 0; k < 5; k++) {
        input_loads.push({name: `${prefix}_${k}`, ptr, k: (base as number) + k});
      }
    }

    const sum_lets: Array<{name: string; lhs: string; rhs: string}> = [];
    const sumDefs = [
      ['a_lo_sum',  'x_lo_lo', 'x_lo_hi'],
      ['b_lo_sum',  'y_lo_lo', 'y_lo_hi'],
      ['a_hi_sum',  'x_hi_lo', 'x_hi_hi'],
      ['b_hi_sum',  'y_hi_lo', 'y_hi_hi'],
      ['a_cr_lo',   'x_lo_lo', 'x_hi_lo'],
      ['a_cr_hi',   'x_lo_hi', 'x_hi_hi'],
      ['b_cr_lo',   'y_lo_lo', 'y_hi_lo'],
      ['b_cr_hi',   'y_lo_hi', 'y_hi_hi'],
      ['a_cr_sum',  'a_cr_lo', 'a_cr_hi'],
      ['b_cr_sum',  'b_cr_lo', 'b_cr_hi'],
    ] as const;
    for (const [name, lhs, rhs] of sumDefs) {
      for (let k = 0; k < 5; k++) {
        sum_lets.push({name: `${name}_${k}`, lhs: `${lhs}_${k}`, rhs: `${rhs}_${k}`});
      }
    }

    const schoolbooks = [
      {label: 'PP_lo_LL = x_lo_lo · y_lo_lo', out_prefix: 'pp_lo_ll', a_prefix: 'x_lo_lo', b_prefix: 'y_lo_lo'},
      {label: 'PP_lo_HH = x_lo_hi · y_lo_hi', out_prefix: 'pp_lo_hh', a_prefix: 'x_lo_hi', b_prefix: 'y_lo_hi'},
      {label: 'PP_lo_C  = a_lo_sum · b_lo_sum', out_prefix: 'pp_lo_c',  a_prefix: 'a_lo_sum', b_prefix: 'b_lo_sum'},
      {label: 'PP_hi_LL = x_hi_lo · y_hi_lo', out_prefix: 'pp_hi_ll', a_prefix: 'x_hi_lo', b_prefix: 'y_hi_lo'},
      {label: 'PP_hi_HH = x_hi_hi · y_hi_hi', out_prefix: 'pp_hi_hh', a_prefix: 'x_hi_hi', b_prefix: 'y_hi_hi'},
      {label: 'PP_hi_C  = a_hi_sum · b_hi_sum', out_prefix: 'pp_hi_c',  a_prefix: 'a_hi_sum', b_prefix: 'b_hi_sum'},
      {label: 'PP_cr_LL = a_cr_lo  · b_cr_lo',  out_prefix: 'pp_cr_ll', a_prefix: 'a_cr_lo',  b_prefix: 'b_cr_lo'},
      {label: 'PP_cr_HH = a_cr_hi  · b_cr_hi',  out_prefix: 'pp_cr_hh', a_prefix: 'a_cr_hi',  b_prefix: 'b_cr_hi'},
      {label: 'PP_cr_C  = a_cr_sum · b_cr_sum', out_prefix: 'pp_cr_c',  a_prefix: 'a_cr_sum', b_prefix: 'b_cr_sum'},
    ];

    const inner_combines = [
      {label: 'P_lo from pp_lo_*', out_prefix: 'p_lo', ll_prefix: 'pp_lo_ll', hh_prefix: 'pp_lo_hh', c_prefix: 'pp_lo_c'},
      {label: 'P_hi from pp_hi_*', out_prefix: 'p_hi', ll_prefix: 'pp_hi_ll', hh_prefix: 'pp_hi_hh', c_prefix: 'pp_hi_c'},
      {label: 'P_cr from pp_cr_*', out_prefix: 'p_cr', ll_prefix: 'pp_cr_ll', hh_prefix: 'pp_cr_hh', c_prefix: 'pp_cr_c'},
    ];

    const outer_init: Array<{slot: number; init_expr: string}> = [];
    for (let k = 0; k < 19; k++) outer_init.push({slot: k, init_expr: `p_lo_${k}`});
    outer_init.push({slot: 19, init_expr: '0u'});
    for (let k = 0; k < 19; k++) outer_init.push({slot: 20 + k, init_expr: `p_hi_${k}`});
    outer_init.push({slot: 39, init_expr: '0u'});

    const outer_cross: Array<{slot: number; k: number}> = [];
    for (let k = 0; k < 19; k++) outer_cross.push({slot: 10 + k, k});

    const yuval_iters: Array<{i: number; writes: Array<{slot: number; r_idx: number; first: boolean}>}> = [];
    for (let i = 0; i < N - 1; i++) {
      const writes = [];
      for (let j = 0; j < N; j++) {
        writes.push({slot: i + 1 + j, r_idx: j, first: j === 0});
      }
      yuval_iters.push({i, writes});
    }

    const i_std = N - 1;
    const standard_writes: Array<{slot: number; p_idx: number; first: boolean}> = [];
    for (let j = 0; j < N; j++) {
      standard_writes.push({slot: i_std + j, p_idx: j, first: j === 1});
    }

    const final_drain: Array<{slot: number}> = [];
    for (let i = 0; i < N; i++) final_drain.push({slot: N + i});

    const extract: Array<{out_k: number; src_slot: number}> = [];
    for (let i = 0; i < N; i++) extract.push({out_k: i, src_slot: N + i});

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

  // Returns the WGSL source for the 22-bit-limb f32 Montgomery product
  // helpers (`BigIntF32` + 12 limbs, `bigint_f32_*`, `mulhilo` over
  // W=2^22, `montgomery_product_f32`, `conditional_reduce_f32`).
  // Bench-only — the 23-bit MSM stack stays on
  // `gen_montgomery_product_f32_shader`. The 22-bit width buys an exact
  // 4-way sum (4*W=2^24 fits in f32 mantissa), collapsing the per-iter
  // bias-split cascade.
  public gen_montgomery_product_f32_22_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // SOS variant of the 22-bit-limb f32 Montgomery product. Two-phase
  // separated operand scanning: full multiply T = x*y into a wide column
  // accumulator, then per-limb Montgomery reduce. Designed to shrink the
  // per-step carry chain of CIOS and exploit GPU parallelism. Bench-only,
  // selected by `gen_field_mul_bench_f32_shader` when `variant=='sos'`.
  public gen_montgomery_product_f32_sos_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_sos_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // SOS3 variant of the 22-bit-limb f32 Montgomery product. Same SOS skeleton
  // as `gen_montgomery_product_f32_sos_shader`, but with a 4-op mulhilo
  // (3 FMA + 1 floor barrier) that consumes a precomputed `a_scaled = a*W_INV`
  // shared across the 12 inner-j calls per row. Drops the per-mulhilo
  // step()-based underflow correction — the floor-based `acc_drain` absorbs
  // signed `lo` values directly. Bench-only, selected by
  // `gen_field_mul_bench_f32_shader` when `variant=='sos3'`.
  public gen_montgomery_product_f32_22_sos3_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // Manually-unrolled variant of the 22-bit V1 CIOS. Same algorithm
  // (3-stage cascade, c_hi/c_lo carry pair, mulhilo2-fused xy/qp); the
  // inner-j loops are emitted as straight-line code over 12 named locals
  // `s0..s11` so Apple Metal's WGSL backend can keep the accumulator in
  // registers instead of spilling `s.limbs[j]` to thread-private memory
  // under dynamic indexing. Bench-only, selected by
  // `gen_field_mul_bench_f32_shader` when `variant == 'unrolled'`.
  public gen_montgomery_product_f32_22_unrolled_shader(): string {
    const N = this.num_limbs_f32_22; // 12 for BN254
    // Emit straight-line WGSL for the inner-j body of outer iter i=0.
    // s[j] is implicit zero, so the low-side sum is 3-way (no s[j-1] read).
    // For each j in 1..N-1:
    //   read s(j) (only matters in the general loop; here unused), write s(j-1).
    // The write target s(j-1) cycles through s0, s1, ..., s10.
    const emitInnerI0 = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i=0, j=${j} ---\n` +
            `        {\n` +
            `            let mh = mulhilo2(vec2<f32>(x_i, qi), vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let xy_hi = mh.x;\n` +
            `            let xy_lo = mh.y;\n` +
            `            let qp_hi = mh.z;\n` +
            `            let qp_lo = mh.w;\n` +
            `            let low_sum = xy_lo + qp_lo + c_lo;\n` +
            `            let low_s = bias_split_f32_le3w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `            let carry_total = xy_hi + qp_hi + low_s.x + c_hi;\n` +
            `            let carry_s2 = bias_split_f32_le3w(carry_total);\n` +
            `            c_hi = carry_s2.x;\n` +
            `            c_lo = carry_s2.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };
    // Emit straight-line WGSL for the inner-j body of outer iter i=1..N-1.
    // The 4-way sum reads s(j) (the OLD value at position j) and writes
    // s(j-1) (the NEW value at position j-1). Read happens before write,
    // so within one outer iter, s(j+1) is still the old value when read.
    const emitInnerGeneral = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const readFrom = `s${j}`;
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i>=1, j=${j} ---\n` +
            `        {\n` +
            `            let mh = mulhilo2(vec2<f32>(x_i, qi), vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let xy_hi = mh.x;\n` +
            `            let xy_lo = mh.y;\n` +
            `            let qp_hi = mh.z;\n` +
            `            let qp_lo = mh.w;\n` +
            `            let low_sum = ${readFrom} + xy_lo + qp_lo + c_lo;\n` +
            `            let low_s = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `            let carry_total = xy_hi + qp_hi + low_s.x + c_hi;\n` +
            `            let carry_s2 = bias_split_f32_le3w(carry_total);\n` +
            `            c_hi = carry_s2.x;\n` +
            `            c_lo = carry_s2.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
      inner_body_i0: emitInnerI0(),
      inner_body_general: emitInnerGeneral(),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_unrolled_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3-unrolled variant: same CIOS skeleton as `_unrolled` (so the outer
  // loop mirrors the u32 mitschabaude algorithm), but the inner-j calls
  // `mulhilo_sos3_2` — a 5-op vec2 mulhilo built on the 3-FMA + floor-barrier
  // pattern with a precomputed `a_scaled = a * W_INV` shared across j.
  // Bias splits in the inner body are uniformly floor-based (le4w) so that
  // sos3's signed `lo` doesn't break the carry chain. Bench-only, selected
  // by `gen_field_mul_bench_f32_shader` when `variant == 'sos3u'`.
  public gen_montgomery_product_f32_22_sos3u_shader(): string {
    const N = this.num_limbs_f32_22; // 12 for BN254
    // Inner-j body for outer iter i=0. s[j] is implicit zero; low-side sum
    // is 3-way (no s[j-1] read). `xq` and `xq_scaled` are vec2 locals set
    // up by the template once per outer iter.
    const emitInnerI0 = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i=0, j=${j} ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let xy_hi = mh.x;\n` +
            `            let xy_lo = mh.y;\n` +
            `            let qp_hi = mh.z;\n` +
            `            let qp_lo = mh.w;\n` +
            `            let low_sum = xy_lo + qp_lo + c_lo;\n` +
            `            let low_s = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `            let carry_total = xy_hi + qp_hi + low_s.x + c_hi;\n` +
            `            let carry_s2 = bias_split_f32_le4w(carry_total);\n` +
            `            c_hi = carry_s2.x;\n` +
            `            c_lo = carry_s2.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };
    // Inner-j body for outer iter i=1..N-1. Reads s${j}, writes s${j-1}.
    const emitInnerGeneral = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const readFrom = `s${j}`;
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i>=1, j=${j} ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let xy_hi = mh.x;\n` +
            `            let xy_lo = mh.y;\n` +
            `            let qp_hi = mh.z;\n` +
            `            let qp_lo = mh.w;\n` +
            `            let low_sum = ${readFrom} + xy_lo + qp_lo + c_lo;\n` +
            `            let low_s = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `            let carry_total = xy_hi + qp_hi + low_s.x + c_hi;\n` +
            `            let carry_s2 = bias_split_f32_le4w(carry_total);\n` +
            `            c_hi = carry_s2.x;\n` +
            `            c_lo = carry_s2.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
      inner_body_i0: emitInnerI0(),
      inner_body_general: emitInnerGeneral(),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3u_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3u v2 variant. See `mont_pro_product_f32_22_sos3uv2.template.wgsl`
  // header for the three micro-wins. Bench-only, selected by
  // `gen_field_mul_bench_f32_shader` when `variant == 'sos3uv2'`.
  public gen_montgomery_product_f32_22_sos3uv2_shader(): string {
    const N = this.num_limbs_f32_22; // 12
    // Inner-j body for outer iter i=0. Uses `mulhilo_sos3_2_v2` (returns
    // hi_off, not hi) and `bias_split_f32_le4w_m2` (compensates the +2W bias
    // on the hi sum). Balanced add tree for carry_total.
    const emitInnerI0 = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i=0, j=${j} ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let xy_hi_off = mh.x;\n` +
            `            let xy_lo     = mh.y;\n` +
            `            let qp_hi_off = mh.z;\n` +
            `            let qp_lo     = mh.w;\n` +
            `            let low_sum   = xy_lo + qp_lo + c_lo;\n` +
            `            let low_s     = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `            // Balanced tree: two parallel pairs, then merge.\n` +
            `            let hi_sum    = xy_hi_off + qp_hi_off;\n` +
            `            let aux       = low_s.x + c_hi;\n` +
            `            let carry_total = hi_sum + aux;\n` +
            `            let carry_s2  = bias_split_f32_le4w_m2(carry_total);\n` +
            `            c_hi = carry_s2.x;\n` +
            `            c_lo = carry_s2.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };
    const emitInnerGeneral = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const readFrom = `s${j}`;
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i>=1, j=${j} ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let xy_hi_off = mh.x;\n` +
            `            let xy_lo     = mh.y;\n` +
            `            let qp_hi_off = mh.z;\n` +
            `            let qp_lo     = mh.w;\n` +
            `            let low_sum   = ${readFrom} + xy_lo + qp_lo + c_lo;\n` +
            `            let low_s     = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `            let hi_sum    = xy_hi_off + qp_hi_off;\n` +
            `            let aux       = low_s.x + c_hi;\n` +
            `            let carry_total = hi_sum + aux;\n` +
            `            let carry_s2  = bias_split_f32_le4w_m2(carry_total);\n` +
            `            c_hi = carry_s2.x;\n` +
            `            c_lo = carry_s2.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };

    // Compile-time N0 * W_INV. N0 is the bigint stored in this.n0_f32_22;
    // we render it with the f32 W_INV multiplication done host-side so the
    // shader sees a single constant.
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;
    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      inner_body_i0: emitInnerI0(),
      inner_body_general: emitInnerGeneral(),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3uv2_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3u32: like sos3uv2 but the per-j carry chain is replaced by i32
  // accumulators (12 named locals t0..t11). All inner-j contributions add
  // independently into i32 slots — no c_hi/c_lo flowing forward. Single
  // serial drain at end of each outer iter (12 col steps) instead of 11
  // serial drains per outer × 12 outers. See template header for math.
  public gen_montgomery_product_f32_22_sos3u32_shader(): string {
    // Same shape as sos3uv3 but with i32 slot accumulators (see template
    // for the rationale). The TS just provides the mustache index arrays.
    const N = this.num_limbs_f32_22;
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;

    // Slot init expressions differ between iter 0 and iter 1+. tlo[k]
    // pulls in i32(s[k+1]) for the shift-in; thi[k] always 0.
    const slotInitsI0: Array<{name: string; init_expr: string}> = [];
    const slotInitsGeneral: Array<{name: string; init_expr: string}> = [];
    for (let k = 0; k < N; k++) {
      slotInitsI0.push({name: `tlo${k}`, init_expr: k === 0 ? 'i32(init_slot0)' : '0'});
      slotInitsI0.push({name: `thi${k}`, init_expr: '0'});
      let genTlo: string;
      if (k === 0) genTlo = 'i32(init_slot0) + i32(s1)';
      else if (k === N - 1) genTlo = '0';
      else genTlo = `i32(s${k + 1})`;
      slotInitsGeneral.push({name: `tlo${k}`, init_expr: genTlo});
      slotInitsGeneral.push({name: `thi${k}`, init_expr: '0'});
    }

    const innerPairs = [];
    for (let j = 1; j < N; j++) innerPairs.push({j, km1: j - 1, k: j});
    const drainCols = Array.from({length: N}, (_, k) => ({k}));

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
    const mont_src = mustache.render(montgomery_product_f32_22_sos3u32_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3uv3_mixed: sos3uv3 structure but with mixed accumulators —
  // tlo as i32 (signed via conversion), thi as u32 (via free bitcast on
  // hi_off which is in single binade [W, 2W) where bit pattern matches
  // 0x4A800000 + hi). Same register count as sos3uv3. Halves the
  // conversion count vs sos3u32 (only lo needs converting; hi uses free
  // bitcast).
  public gen_montgomery_product_f32_22_sos3uv3_mixed_shader(): string {
    const N = this.num_limbs_f32_22;
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;
    // Bit pattern of f32 W (= 2^22) is exp=149, mantissa=0 → 0x4A800000.
    // Each hi_off in [W, 2W) has bit pattern 0x4A800000 + (hi_off - W).
    // Accumulating N hi_off bit patterns: u32 acc = N * 0x4A800000 + Σ hi.

    const tloName = (k: number) => `tlo${k}`;
    const thiName = (k: number) => `thi${k}`;

    const emitSlotInitI0 = (): string => {
      const lines: string[] = [];
      // Slot 0 takes the j=0 init contribution as i32.
      lines.push(`        var ${tloName(0)}: i32 = i32(init_slot0);`);
      lines.push(`        var ${thiName(0)}: u32 = 0u;`);
      for (let k = 1; k < N; k++) {
        lines.push(`        var ${tloName(k)}: i32 = 0;`);
        lines.push(`        var ${thiName(k)}: u32 = 0u;`);
      }
      return lines.join('\n');
    };

    const emitSlotInitGeneral = (): string => {
      const lines: string[] = [];
      lines.push(`        var ${tloName(0)}: i32 = i32(init_slot0) + i32(s1);`);
      lines.push(`        var ${thiName(0)}: u32 = 0u;`);
      for (let k = 1; k < N - 1; k++) {
        lines.push(`        var ${tloName(k)}: i32 = i32(s${k + 1});`);
        lines.push(`        var ${thiName(k)}: u32 = 0u;`);
      }
      lines.push(`        var ${tloName(N - 1)}: i32 = 0;`);
      lines.push(`        var ${thiName(N - 1)}: u32 = 0u;`);
      return lines.join('\n');
    };

    // Inner body: bitcast hi (free), convert lo (1 conversion per pair).
    // Hi accumulator includes W bias per contribution — corrected at drain.
    const emitInner = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        lines.push(
          `        // --- j=${j} (mixed: bitcast hi, convert lo) ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let lo_sum = mh.y + mh.w;\n` +
            `            // Bitcast hi_off values (free, no conversion).\n` +
            `            let hi_bits = bitcast<u32>(mh.x) + bitcast<u32>(mh.z);\n` +
            `            // Convert lo_sum to i32 (signed, 1 conversion per pair).\n` +
            `            let lo_int = i32(lo_sum);\n` +
            `            ${tloName(j - 1)} = ${tloName(j - 1)} + lo_int;\n` +
            `            ${thiName(j)} = ${thiName(j)} + hi_bits;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };

    // Drain: combine tlo[k] + (i32(thi[k]) - 2*HI_BIAS_U32 worth of bias)
    // plus carry. Floor-based split.
    // HI_BIAS_U32 = 0x4A800000. Each pair contributes 2 hi_off bit patterns
    // to thi[k], so bias = (num pairs contributing to k) * 2 * 0x4A800000.
    // For sos3uv3 structure, each thi[k] receives exactly 1 hi from j=k
    // (which is 2 hi_off contributions since pair packs xy and qp). Hmm
    // actually each inner-j j writes thi[j] with the SINGLE hi_bits value
    // which = bitcast(mh.x) + bitcast(mh.z) = 2*0x4A800000 + xy_hi + qp_hi.
    // So thi[k] has 1 contribution per outer iter, each contributing 2*HI_BIAS.
    // Across 12 outer iters: thi[k] has 12 * 2*HI_BIAS = 24*HI_BIAS of bias.
    // But only iters where j=k is hit. For inner-j j=1..N-1, slot k=j
    // receives from outer iters i where j=k is in inner-j range — always
    // since inner-j is fixed range 1..N-1. So each thi[k] for k=1..N-1
    // gets exactly 12 contributions across all outer iters.
    // thi[0] gets 0 contributions (no inner-j writes thi[0]).
    const emitDrain = (): string => {
      const lines: string[] = [];
      lines.push(`        var carry: i32 = 0;`);
      for (let k = 0; k < N; k++) {
        // thi[k] = 12 * 2 * HI_BIAS_U32 + true_hi_sum (across 12 outer iters).
        // For k=0: thi[0] is never written. bias = 0.
        // For k>=1: bias = 12 * 2 * 0x4A800000 = 24 * 0x4A800000 (mod 2^32).
        // But within ONE outer iter, thi[k] receives 1 contribution. Across
        // all 12 outer iters of this run, contribution count = 12. But wait,
        // thi[k] is RESET at start of each outer iter. So drain inside one
        // outer iter sees only THAT iter's contributions. Each inner-j writes
        // thi[j] once → thi[k] has 1 contribution (from j=k iter of THIS
        // outer iter) → bias = 1 * 2*HI_BIAS_U32 = 2 * 0x4A800000.
        // For k=0: 0 contributions, bias = 0.
        if (k === 0) {
          lines.push(`        {`);
          lines.push(`            let hi_int = i32(${thiName(k)});`);
          lines.push(`            let sum = ${tloName(k)} + hi_int + carry;`);
          lines.push(`            let new_carry = sum >> 22u;`);
          lines.push(`            s${k} = f32(sum - (new_carry << 22u));`);
          lines.push(`            carry = new_carry;`);
          lines.push(`        }`);
        } else {
          // Subtract 2*HI_BIAS_U32 (= 0x95000000) from thi[k] to recover Σ hi.
          // Use bitcast<i32>(u32_value) for signed interpretation if needed.
          lines.push(`        {`);
          lines.push(
            `            let hi_int = bitcast<i32>(${thiName(k)} - 0x95000000u);`,
          );
          lines.push(`            let sum = ${tloName(k)} + hi_int + carry;`);
          lines.push(`            let new_carry = sum >> 22u;`);
          lines.push(`            s${k} = f32(sum - (new_carry << 22u));`);
          lines.push(`            carry = new_carry;`);
          lines.push(`        }`);
        }
      }
      return lines.join('\n');
    };

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      slot_init_i0: emitSlotInitI0(),
      slot_init_general: emitSlotInitGeneral(),
      inner_body: emitInner(),
      drain_body: emitDrain(),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3uv3_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3uv3: f32-only chain break. Same outer skeleton as sos3uv2 but
  // inside the inner-j loop, contributions go to SEPARATE per-slot lo/hi
  // f32 accumulators (tlo[k], thi[k]). Each j writes UNIQUE tlo[j-1] and
  // thi[j] — no inter-j carry, no slot conflict. Drain at end of outer
  // iter combines tlo+thi+carry, floor-based split, serial across cols.
  public gen_montgomery_product_f32_22_sos3uv3_shader(): string {
    // The .wgsl template owns the algorithm; this TS just provides the
    // mustache index arrays for the unrolled slot-init / inner-pairs /
    // drain-cols sections.
    const N = this.num_limbs_f32_22;
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;

    // Slot init for iter 0: tlo[0] = init_slot0, everything else 0.
    // Slot init for i>=1: tlo[0] = init_slot0 + s1, tlo[k] = s[k+1] for
    // k=1..N-2, tlo[N-1] = 0; thi[*] = 0.
    const slotInitsI0: Array<{name: string; init_expr: string}> = [];
    const slotInitsGeneral: Array<{name: string; init_expr: string}> = [];
    for (let k = 0; k < N; k++) {
      slotInitsI0.push({name: `tlo${k}`, init_expr: k === 0 ? 'init_slot0' : '0.0'});
      slotInitsI0.push({name: `thi${k}`, init_expr: '0.0'});
      let genTlo: string;
      if (k === 0) genTlo = 'init_slot0 + s1';
      else if (k === N - 1) genTlo = '0.0';
      else genTlo = `s${k + 1}`;
      slotInitsGeneral.push({name: `tlo${k}`, init_expr: genTlo});
      slotInitsGeneral.push({name: `thi${k}`, init_expr: '0.0'});
    }

    // Inner-j pairs: for j=1..N-1, write tlo[j-1] += lo_sum, thi[j] += hi_sum.
    const innerPairs = [];
    for (let j = 1; j < N; j++) innerPairs.push({j, km1: j - 1, k: j});

    // Drain cols: k=0..N-1.
    const drainCols = Array.from({length: N}, (_, k) => ({k}));

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

  // sos3cf_19: 19-bit limbs, pure f32, FULLY CARRY-FREE in the multiply
  // phase. Single drain at the very end (via i32 since combined sums of
  // tlo[k]+thi[k] can exceed 2^24).
  //
  // Per outer iter i (interleaved CIOS):
  //  1. Compute T[i] mod W in pure f32 from tlo[i], thi[i] and an
  //     accumulated carry_in_f32 (the carry forwarded from iter i-1).
  //  2. Compute xy0 = mulhilo(x[i], y[0]) and qi = qi_lo(T[i]_mod + xy0.y).
  //  3. Compute qp0 = mulhilo(qi, p[0]).
  //  4. j=0 contributions: add xy0+qp0 to tlo[i]/thi[i+1].
  //  5. Carry compute: carry_out = floor(T[i] / W) + cross_term. This is
  //     the carry forwarded to iter i+1 (not stored in tlo/thi at all).
  //  6. Inner j=1..N-1 loop: vec2 mulhilo (x_i, qi) × (y[j], p[j]), add to
  //     tlo[i+j] and thi[i+j+1].
  //
  // The carry from each iter goes into the f32 scalar carry_in (used by
  // next iter's mod-W compute), NOT into tlo[i+1] directly. That keeps
  // tlo bounds at exactly 2NW < 2^24.
  public gen_montgomery_product_f32_19_sos3cf_shader(): string {
    // Same shape as sos3wasm but parametrized for 19-bit limbs (N=14).
    // See the .wgsl template for the algorithm; this TS just builds the
    // index arrays mustache iterates over.
    const N = this.num_limbs_f32_19;
    const W_INV_VAL = 1.9073486328125e-6;
    const n0Num = Number(this.n0_f32_19);
    const n0Scaled = n0Num * W_INV_VAL;
    const buildIters = () => {
      const iters = [];
      for (let i = 0; i < N; i++) {
        const pairs = [];
        for (let j = 0; j < N; j += 2) {
          // For N=14 (even), pairs are (0,1)..(12,13). For odd N a trailing
          // single mulhilo would be needed — not required for BN254.
          pairs.push({
            j,
            jp: j + 1,
            slot_lo: i + j,
            slot_mid: i + j + 1,
            slot_hi: i + j + 2,
          });
        }
        iters.push({i, i_plus_1: i + 1, pairs});
      }
      return iters;
    };
    const ctx = {
      num_limbs: N,
      n0: `${this.n0_f32_19.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      n0_int: this.n0_f32_19.toString(),
      p_limbs_f32: this.p_limbs_f32_19_str,
      slots: Array.from({length: 2 * N}, (_, k) => ({k})),
      phase1_iters: buildIters(),
      phase2_iters: buildIters(),
      drain_cols: Array.from({length: N}, (_, k) => ({k: N + k, out_idx: k})),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_19_sos3cf_funcs, ctx);
    return `${bigint_f32_src}\n${mont_src}`;
  }

  // sos3uv3cf_19: sos3uv3 SHAPE at 19-bit limbs, no per-iter drain. Pure
  // f32 multiply slots (28 named locals, sos3uv3 layout), single i32 carry
  // scalar between iters, final drain via i32. See the .wgsl template.
  public gen_montgomery_product_f32_19_sos3uv3cf_shader(): string {
    const N = this.num_limbs_f32_19;
    const W_INV_VAL = 1.9073486328125e-6;
    const n0Num = Number(this.n0_f32_19);
    const n0Scaled = n0Num * W_INV_VAL;
    const slots = Array.from({length: N}, (_, k) => ({k}));
    const innerPairs = [];
    for (let j = 1; j < N; j++) innerPairs.push({j, km1: j - 1, k: j});
    // Shift: dst k ← src k+1, for k = 0..N-2.
    const shiftPairs = Array.from({length: N - 1}, (_, k) => ({dst: k, src: k + 1}));
    // Drain: result.limbs[k+1] ← tlo_k + thi_k (k=0..N-2) (after shifts,
    // physical slot k holds abs slot N+1+k). result.limbs[0] is just carry_in
    // (= abs slot N), handled separately in the template.
    const drainSlots = Array.from({length: N - 1}, (_, k) => ({src_k: k, dst_k: k + 1}));
    const ctx = {
      num_limbs: N,
      n0: `${this.n0_f32_19.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      n0_int: this.n0_f32_19.toString(),
      p_limbs_f32: this.p_limbs_f32_19_str,
      slots,
      inner_pairs: innerPairs,
      shift_pairs: shiftPairs,
      last_slot: N - 1,
      drain_slots: drainSlots,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_19_sos3uv3cf_funcs, ctx);
    return `${bigint_f32_src}\n${mont_src}`;
  }

  // sos3wasm_v2: like sos3wasm but with SEPARATE T_lo[k] and T_hi[k]
  // accumulators per slot. Eliminates the inter-pair RAW chain through
  // shared middle slots (T[i+2] in sos3wasm was read+written by both
  // pair (j=0,1) and pair (j=2,3)). With separate slots, each pair writes
  // to 4 unique destinations (T_lo[i+j], T_hi[i+j+1], T_lo[i+j+1],
  // T_hi[i+j+2]) and consecutive pairs have NO slot overlap.
  public gen_montgomery_product_f32_22_sos3wasm_v2_shader(): string {
    const N = this.num_limbs_f32_22;
    const NUM_T_SLOTS = 2 * N + 1;
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;

    const tloName = (k: number) => `TL${k}`;
    const thiName = (k: number) => `TH${k}`;

    const slotInit = (): string => {
      const lines: string[] = [];
      for (let k = 0; k < NUM_T_SLOTS; k++) {
        lines.push(`    var ${tloName(k)}: i32 = 0;`);
        lines.push(`    var ${thiName(k)}: i32 = 0;`);
      }
      return lines.join('\n');
    };

    const emitPhase1 = (): string => {
      const lines: string[] = [];
      lines.push(`    // === Phase 1: T = x*y (separate T_lo/T_hi) ===`);
      for (let i = 0; i < N; i++) {
        lines.push(`    {`);
        lines.push(`        let x_i = (*x).limbs[${i}u];`);
        lines.push(`        let x_i_scaled = x_i * W_INV;`);
        lines.push(`        let xv = vec2<f32>(x_i, x_i);`);
        lines.push(`        let xvs = vec2<f32>(x_i_scaled, x_i_scaled);`);
        for (let j = 0; j < N; j += 2) {
          const jp = j + 1;
          lines.push(`        {`);
          lines.push(
            `            let mh = mulhilo_sos3_2_v2(xv, xvs, vec2<f32>((*y).limbs[${j}u], (*y).limbs[${jp}u]));`,
          );
          lines.push(`            let mh_unbiased = mh - vec4<f32>(W, 0.0, W, 0.0);`);
          lines.push(`            let mh_int = vec4<i32>(mh_unbiased);`);
          // 4 unique slots: T_lo[i+j], T_hi[i+j+1], T_lo[i+j+1], T_hi[i+j+2]
          lines.push(`            ${tloName(i + j)} = ${tloName(i + j)} + mh_int.y;`);
          lines.push(`            ${thiName(i + j + 1)} = ${thiName(i + j + 1)} + mh_int.x;`);
          lines.push(`            ${tloName(i + j + 1)} = ${tloName(i + j + 1)} + mh_int.w;`);
          lines.push(`            ${thiName(i + j + 2)} = ${thiName(i + j + 2)} + mh_int.z;`);
          lines.push(`        }`);
        }
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    const emitPhase2 = (): string => {
      const lines: string[] = [];
      lines.push(`    // === Phase 2: Mont reduce (separate T_lo/T_hi) ===`);
      for (let i = 0; i < N; i++) {
        lines.push(`    {`);
        // qi extraction: combine T_lo[i] + T_hi[i] mod W
        lines.push(
          `        let t_sum_i: u32 = bitcast<u32>(${tloName(i)} + ${thiName(i)});`,
        );
        lines.push(`        let t_mask: u32 = t_sum_i & MASK_22;`);
        lines.push(`        let qi_int: u32 = (t_mask * N0_INT) & MASK_22;`);
        lines.push(`        let qi = f32(qi_int);`);
        lines.push(`        let qi_scaled = qi * W_INV;`);
        lines.push(`        let qv = vec2<f32>(qi, qi);`);
        lines.push(`        let qvs = vec2<f32>(qi_scaled, qi_scaled);`);
        for (let j = 0; j < N; j += 2) {
          const jp = j + 1;
          lines.push(`        {`);
          lines.push(
            `            let mh = mulhilo_sos3_2_v2(qv, qvs, vec2<f32>(p.limbs[${j}u], p.limbs[${jp}u]));`,
          );
          lines.push(`            let mh_unbiased = mh - vec4<f32>(W, 0.0, W, 0.0);`);
          lines.push(`            let mh_int = vec4<i32>(mh_unbiased);`);
          lines.push(`            ${tloName(i + j)} = ${tloName(i + j)} + mh_int.y;`);
          lines.push(`            ${thiName(i + j + 1)} = ${thiName(i + j + 1)} + mh_int.x;`);
          lines.push(`            ${tloName(i + j + 1)} = ${tloName(i + j + 1)} + mh_int.w;`);
          lines.push(`            ${thiName(i + j + 2)} = ${thiName(i + j + 2)} + mh_int.z;`);
          lines.push(`        }`);
        }
        // Carry propagation: combined T[i] >> 22 → T_lo[i+1].
        lines.push(
          `        ${tloName(i + 1)} = ${tloName(i + 1)} + ((${tloName(i)} + ${thiName(i)}) >> 22u);`,
        );
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    const emitFinalDrain = (): string => {
      const lines: string[] = [];
      lines.push(`    // === Final drain ===`);
      lines.push(`    var s: BigIntF32;`);
      lines.push(`    var carry: i32 = 0;`);
      for (let k = N; k < 2 * N; k++) {
        lines.push(`    {`);
        lines.push(`        let sum = ${tloName(k)} + ${thiName(k)} + carry;`);
        lines.push(`        let new_carry = sum >> 22u;`);
        lines.push(`        s.limbs[${k - N}u] = f32(sum - (new_carry << 22u));`);
        lines.push(`        carry = new_carry;`);
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    const body = [
      slotInit(),
      '',
      emitPhase1(),
      '',
      emitPhase2(),
      '',
      emitFinalDrain(),
    ].join('\n');

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      n0_int: this.n0_f32_22.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      body,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3wasm_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3wasm_v3: sos3wasm with chain-broken batching. The original sos3wasm
  // has a serial chain through shared T slots between consecutive pairs
  // (pair 0's last write to T[i+2] is followed by pair 1's first read of
  // T[i+2]). This serializes the i32 add stream across pairs.
  //
  // Fix: within each outer iter, compute ALL pair mulhilos (mulhilo + conv
  // → i32 vec4) into named locals first. THEN do the slot accumulations
  // on already-computed values. This lets the compiler pipeline the
  // mulhilos freely, and the accumulation phase has shorter dependency
  // chains because the pair contributions are already in registers.
  //
  // We use 3-pair batches per phase iter to keep register pressure
  // manageable (3 vec4 i32 = 12 temps + ~25 T slots ≈ 37 i32 regs).
  public gen_montgomery_product_f32_22_sos3wasm_v3_shader(): string {
    const N = this.num_limbs_f32_22;
    const NUM_T_SLOTS = 2 * N + 1;
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;

    const tName = (k: number) => `T${k}`;

    const slotInit = (): string => {
      const lines: string[] = [];
      for (let k = 0; k < NUM_T_SLOTS; k++) {
        lines.push(`    var ${tName(k)}: i32 = 0;`);
      }
      return lines.join('\n');
    };

    // Emit one batch: compute B pair mulhilos+conversions into vec4 i32
    // temps `mh0..mh(B-1)`, then accumulate into T slots.
    // pairs is an array of {j, jp, baseSlot} = (j-index, jp-index, target base slot = i+j).
    // For phase 1: vec b = vec2(y[j], y[jp]); for phase 2: vec b = vec2(p[j], p[jp]).
    const emitBatch = (
      bVar: string,
      bvsVar: string,
      bArrayName: string,
      i: number,
      jStart: number,
      jStop: number,
    ): string => {
      const lines: string[] = [];
      // Wrap each batch in its own scope so temp names don't collide across
      // calls.
      lines.push(`        {`);
      // Compute mulhilos first (independent across pairs)
      const numPairs = (jStop - jStart) / 2;
      for (let p = 0; p < numPairs; p++) {
        const j = jStart + 2 * p;
        const jp = j + 1;
        lines.push(
          `            let mh${p} = vec4<i32>(mulhilo_sos3_2_v2(${bVar}, ${bvsVar}, vec2<f32>(${bArrayName}[${j}u], ${bArrayName}[${jp}u])) - vec4<f32>(W, 0.0, W, 0.0));`,
        );
      }
      // Pre-sum mid contributions (hi_j + lo_jp) for the middle slot — gives
      // the compiler an independent value, not chained through T.
      for (let p = 0; p < numPairs; p++) {
        lines.push(`            let mid${p} = mh${p}.x + mh${p}.w;`);
      }
      // Now accumulate.
      const j0 = jStart;
      const j0Slot = i + j0;
      lines.push(`            ${tName(j0Slot)} = ${tName(j0Slot)} + mh0.y;`);
      lines.push(`            ${tName(j0Slot + 1)} = ${tName(j0Slot + 1)} + mid0;`);
      for (let p = 1; p < numPairs; p++) {
        const slot = j0Slot + 2 * p;
        lines.push(`            let boundary${p} = mh${p - 1}.z + mh${p}.y;`);
        lines.push(`            ${tName(slot)} = ${tName(slot)} + boundary${p};`);
        lines.push(`            ${tName(slot + 1)} = ${tName(slot + 1)} + mid${p};`);
      }
      const lastSlot = j0Slot + 2 * numPairs;
      lines.push(`            ${tName(lastSlot)} = ${tName(lastSlot)} + mh${numPairs - 1}.z;`);
      lines.push(`        }`);
      return lines.join('\n');
    };

    const emitPhase1 = (): string => {
      const lines: string[] = [];
      lines.push(`    // === Phase 1: T = x*y, chain-broken batched ===`);
      for (let i = 0; i < N; i++) {
        lines.push(`    {`);
        lines.push(`        let x_i = (*x).limbs[${i}u];`);
        lines.push(`        let x_i_scaled = x_i * W_INV;`);
        lines.push(`        let xv = vec2<f32>(x_i, x_i);`);
        lines.push(`        let xvs = vec2<f32>(x_i_scaled, x_i_scaled);`);
        // Build a local y array name reference. Inline (*y).limbs[Xu] directly.
        // 6 pairs total. Split into 2 batches of 3 for register pressure.
        lines.push(emitBatch('xv', 'xvs', '(*y).limbs', i, 0, 6));
        lines.push(emitBatch('xv', 'xvs', '(*y).limbs', i, 6, 12));
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    const emitPhase2 = (): string => {
      const lines: string[] = [];
      lines.push(`    // === Phase 2: Mont reduce, chain-broken batched ===`);
      for (let i = 0; i < N; i++) {
        lines.push(`    {`);
        lines.push(
          `        let t_mask: u32 = bitcast<u32>(${tName(i)}) & MASK_22;`,
        );
        lines.push(`        let qi_int: u32 = (t_mask * N0_INT) & MASK_22;`);
        lines.push(`        let qi = f32(qi_int);`);
        lines.push(`        let qi_scaled = qi * W_INV;`);
        lines.push(`        let qv = vec2<f32>(qi, qi);`);
        lines.push(`        let qvs = vec2<f32>(qi_scaled, qi_scaled);`);
        lines.push(emitBatch('qv', 'qvs', 'p.limbs', i, 0, 6));
        lines.push(emitBatch('qv', 'qvs', 'p.limbs', i, 6, 12));
        // Carry propagation: T[i+1] += T[i] >> 22.
        lines.push(`        ${tName(i + 1)} = ${tName(i + 1)} + (${tName(i)} >> 22u);`);
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    const emitFinalDrain = (): string => {
      const lines: string[] = [];
      lines.push(`    // === Final drain ===`);
      lines.push(`    var s: BigIntF32;`);
      lines.push(`    var carry: i32 = 0;`);
      for (let k = N; k < 2 * N; k++) {
        lines.push(`    {`);
        lines.push(`        let sum = ${tName(k)} + carry;`);
        lines.push(`        let new_carry = sum >> 22u;`);
        lines.push(`        s.limbs[${k - N}u] = f32(sum - (new_carry << 22u));`);
        lines.push(`        carry = new_carry;`);
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    const body = [
      slotInit(),
      '',
      emitPhase1(),
      '',
      emitPhase2(),
      '',
      emitFinalDrain(),
    ].join('\n');

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      n0_int: this.n0_f32_22.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      body,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3wasm_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // sos3wasm: WASM-style i32 deferred-drain SOS Montgomery product.
  // See template header for full architecture. Key points:
  //   - 25 i32 named locals T0..T24 as wide accumulator.
  //   - Phase 1 multiply: 144 mulhilos, vec2-paired, vec4 conversion,
  //     ZERO drains. All independent.
  //   - Phase 2 reduce: 12 iters. Per iter: qi extracted via u32 mask,
  //     12 mulhilos (paired), then SINGLE carry propagation T[i+1] += T[i] >> 22.
  //   - Final drain across 12 result slots.
  // Total chain: 24 serial steps vs sos3uv3's 144.
  public gen_montgomery_product_f32_22_sos3wasm_shader(): string {
    // The .wgsl template owns the algorithm structure (phase 1 / phase 2 /
    // final drain) and uses mustache `{{#each}}` sections to unroll. The TS
    // here just builds the index arrays — no body-string generation.
    const N = this.num_limbs_f32_22; // 12 for BN254
    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;

    // Phase 1 / Phase 2 share the same outer-i × inner-pair structure.
    // Inner pairs step j by 2 with paired mulhilo. Per pair: writes to
    // T[i+j] (mh.y), T[i+j+1] (mh.x + mh.w), T[i+j+2] (mh.z).
    //
    // Write order in the template is: slot_mid first, slot_hi next, slot_lo
    // last. That ordering is load-bearing: it breaks the inter-pair RAW
    // chain through the shared boundary slot (pair p+1's lo-target equals
    // pair p's hi-target), letting Metal pipeline pair p+1's mulhilo
    // against pair p's last write.
    const buildIters = () => {
      const iters: Array<{i: number; i_plus_1: number; pairs: Array<{j: number; jp: number; slot_lo: number; slot_mid: number; slot_hi: number}>}> = [];
      for (let i = 0; i < N; i++) {
        const pairs = [];
        for (let j = 0; j < N; j += 2) {
          pairs.push({
            j,
            jp: j + 1,
            slot_lo: i + j,
            slot_mid: i + j + 1,
            slot_hi: i + j + 2,
          });
        }
        iters.push({i, i_plus_1: i + 1, pairs});
      }
      return iters;
    };

    const ctx = {
      num_limbs: N,
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      n0_int: this.n0_f32_22.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      slots: Array.from({length: 2 * N}, (_, k) => ({k})),
      phase1_iters: buildIters(),
      phase2_iters: buildIters(),
      drain_cols: Array.from({length: N}, (_, k) => ({k: N + k, out_idx: k})),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3wasm_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // DIAGNOSTIC ONLY — produces wrong results. Same as sos3uv2 but breaks
  // the c_hi/c_lo serial chain by force: inner-j doesn't read or write
  // c_hi/c_lo. Validation WILL fail. Use only to measure how much the
  // carry chain is costing us in wallclock time.
  public gen_montgomery_product_f32_22_sos3uv2nc_shader(): string {
    const N = this.num_limbs_f32_22; // 12
    const emitInnerI0 = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i=0, j=${j} (NO CHAIN) ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let low_sum = mh.y + mh.w;\n` +
            `            let low_s   = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };
    const emitInnerGeneral = (): string => {
      const lines: string[] = [];
      for (let j = 1; j < N; j++) {
        const readFrom = `s${j}`;
        const writeTo = `s${j - 1}`;
        lines.push(
          `        // --- i>=1, j=${j} (NO CHAIN) ---\n` +
            `        {\n` +
            `            let mh = mulhilo_sos3_2_v2(xq, xq_scaled, vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));\n` +
            `            let low_sum = ${readFrom} + mh.y + mh.w;\n` +
            `            let low_s   = bias_split_f32_le4w(low_sum);\n` +
            `            ${writeTo} = low_s.y;\n` +
            `        }`,
        );
      }
      return lines.join('\n');
    };

    const W_INV_VAL = 2.384185791015625e-7;
    const n0Num = Number(this.n0_f32_22);
    const n0Scaled = n0Num * W_INV_VAL;
    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      n0_scaled: n0Scaled.toString(),
      p_limbs_f32: this.p_limbs_f32_22_str,
      inner_body_i0: emitInnerI0(),
      inner_body_general: emitInnerGeneral(),
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_sos3uv2_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // Fully-unrolled variant: same as `gen_montgomery_product_f32_22_unrolled_shader`
  // but the outer-i loop is also unrolled. Bench-only, selected by
  // `gen_field_mul_bench_f32_shader` when `variant == 'unrolled2'`.
  // Emits the entire `montgomery_product_f32_unreduced` body as straight-line
  // code with no loops. Use only as a measurement experiment — shader size
  // grows ~12× compared to the inner-only unroll.
  public gen_montgomery_product_f32_22_fully_unrolled_shader(): string {
    const N = this.num_limbs_f32_22; // 12 for BN254

    const emitOuterIter = (i: number): string => {
      const isI0 = i === 0;
      const lines: string[] = [];
      lines.push(`    // ============ outer iter i=${i} ============`);
      lines.push(`    {`);
      lines.push(`        let x_i = (*x).limbs[${i}u];`);
      if (isI0) {
        lines.push(`        let xy0 = mulhilo(x_i, (*y).limbs[0u]);`);
        lines.push(`        let qi = mulhilo(xy0.y, N0).y;`);
        lines.push(`        let c_cancel = step(0.5, xy0.y);`);
        lines.push(`        let qp0_lo = c_cancel * (W - xy0.y);`);
        lines.push(`        let qp0_hi = fma(qi, p.limbs[0u], -qp0_lo) * W_INV;`);
        lines.push(`        let hi_pair = xy0.x + qp0_hi;`);
        lines.push(`        let carry_full = hi_pair + c_cancel;`);
        lines.push(`        let carry_s = bias_split_f32_le2w(carry_full);`);
        lines.push(`        var c_hi = carry_s.x;`);
        lines.push(`        var c_lo = carry_s.y;`);
      } else {
        lines.push(`        let xy0 = mulhilo(x_i, (*y).limbs[0u]);`);
        lines.push(`        let sum0 = s0 + xy0.y;`);
        lines.push(`        let sum0_s = bias_split_f32_le2w(sum0);`);
        lines.push(`        let qi = mulhilo(sum0_s.y, N0).y;`);
        lines.push(`        let c_cancel = step(0.5, sum0_s.y);`);
        lines.push(`        let qp0_lo = c_cancel * (W - sum0_s.y);`);
        lines.push(`        let qp0_hi = fma(qi, p.limbs[0u], -qp0_lo) * W_INV;`);
        lines.push(`        let c_small = c_cancel + sum0_s.x;`);
        lines.push(`        let hi_pair = xy0.x + qp0_hi;`);
        lines.push(`        let carry_full = hi_pair + c_small;`);
        lines.push(`        let carry_s = bias_split_f32_le3w(carry_full);`);
        lines.push(`        var c_hi = carry_s.x;`);
        lines.push(`        var c_lo = carry_s.y;`);
      }
      for (let j = 1; j < N; j++) {
        const writeTo = `s${j - 1}`;
        lines.push(`        {`);
        lines.push(
          `            let mh = mulhilo2(vec2<f32>(x_i, qi), vec2<f32>((*y).limbs[${j}u], p.limbs[${j}u]));`,
        );
        if (isI0) {
          lines.push(`            let low_sum = mh.y + mh.w + c_lo;`);
          lines.push(`            let low_s = bias_split_f32_le3w(low_sum);`);
        } else {
          lines.push(`            let low_sum = s${j} + mh.y + mh.w + c_lo;`);
          lines.push(`            let low_s = bias_split_f32_le4w(low_sum);`);
        }
        lines.push(`            ${writeTo} = low_s.y;`);
        lines.push(`            let carry_total = mh.x + mh.z + low_s.x + c_hi;`);
        lines.push(`            let carry_s2 = bias_split_f32_le3w(carry_total);`);
        lines.push(`            c_hi = carry_s2.x;`);
        lines.push(`            c_lo = carry_s2.y;`);
        lines.push(`        }`);
      }
      lines.push(`        s11 = fma(c_hi, W, c_lo);`);
      lines.push(`    }`);
      return lines.join('\n');
    };

    const outerIters: string[] = [];
    for (let i = 0; i < N; i++) outerIters.push(emitOuterIter(i));

    const sInit: string[] = [];
    for (let j = 0; j < N; j++) sInit.push(`    var s${j}: f32 = 0.0;`);

    const sCommit: string[] = [];
    sCommit.push(`    var s: BigIntF32;`);
    for (let j = 0; j < N; j++) sCommit.push(`    s.limbs[${j}] = s${j};`);
    sCommit.push(`    return s;`);

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);

    // Hand-assembled body — no template needed.
    const body = `const NUM_LIMBS: u32 = ${N}u;
const N0: f32 = ${this.n0_f32_22.toString()}.0;

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
${this.p_limbs_f32_22_str}
    return p;
}

fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn bias_split_f32_le3w(x: f32) -> vec2<f32> {
    let hi = step(W, x) + step(2.0 * W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
${sInit.join('\n')}
    var p = get_p_f32();

${outerIters.join('\n\n')}

${sCommit.join('\n')}
}

fn montgomery_product_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s = montgomery_product_f32_unreduced(x, y);
    var p = get_p_f32();
    return conditional_reduce_f32(&s, &p);
}

fn conditional_reduce_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    if (bigint_f32_gt(x, y) || bigint_f32_eq(x, y)) {
        var res: BigIntF32;
        let _borrow = bigint_f32_sub(x, y, &res);
        return res;
    }
    return *x;
}
`;
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${body}`;
  }

  // V2 variant of the 22-bit-limb f32 Montgomery product. Wide column
  // accumulator with two-bucket (acc_lo, acc_hi) storage and on-the-fly
  // per-column draining; the per-inner-j carry chain of V1 (c_lo / c_hi)
  // is gone, so inner-j adds across columns can issue in parallel.
  // Bench-only, selected by `gen_field_mul_bench_f32_shader` when
  // `variant == 'v2'`.
  public gen_montgomery_product_f32_22_v2_shader(): string {
    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);
    const mont_src = mustache.render(montgomery_product_f32_22_v2_funcs, ctx);
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${mont_src}`;
  }

  // Layer 3 — Karatsuba 6+6 split in the multiply phase. Hybrid
  // "SOS multiply + CIOS reduce":
  //
  //   Phase A (multiply): three 6×6 schoolbook mulhilos
  //     lo_lo  = x_lo · y_lo
  //     hi_hi  = x_hi · y_hi
  //     ss     = x_sum_short · y_sum_short   (with x_sum_top, y_sum_top ∈ {0,1})
  //   Mid = (x_sum)(y_sum) - lo_lo - hi_hi accumulated into a 24-limb
  //   wide product T at offset β^6.
  //
  //   Phase B (reduce): standard CIOS Mont reduce over T. Outer i in
  //   0..11; per outer iter, qi = (T[i] · N0) mod W, then add qi·p[*]
  //   into T[i..i+12] with V1's 3-stage 3W-split carry chain.
  //
  // Everything is fully unrolled to keep T entirely in named locals.
  // 12-limb arrays (lo_lo, hi_hi, ss, mid, T positions) all collapse
  // into ~24 named f32 locals, so Apple Metal's WGSL backend can keep
  // the wide product in registers instead of spilling to thread-private
  // memory under dynamic indexing.
  //
  // Bench-only — bound by `gen_field_mul_bench_f32_shader` when
  // `variant == 'kara'`.
  public gen_montgomery_product_f32_22_kara_shader(): string {
    const N = this.num_limbs_f32_22; // 12 for BN254
    const H = N / 2; // 6

    // Emit a 6×6 schoolbook mulhilo product. Inputs: arrays
    // `xName[0..5]`, `yName[0..5]`. Output: `outName[0..11]` (all
    // canonical < W after row-by-row 3W-split carry-drain).
    //
    // Row-by-row accumulation: for each i in 0..5, accumulate
    // x[i] * y[j] for j=0..5 into columns [i..i+6]; lo to column i+j,
    // hi to column i+j+1. After the row, carry-propagate columns
    // [i..i+6+1] to restore < W. Per-column transient bound: prior
    // row leaves slot in [0, W). Within a row, slot k receives up to
    // 2 new contributions (one lo, one hi from neighboring (i,j)
    // pairs), each < W, so slot < 3W during accumulation — fits in
    // f32 mantissa (3W = 3·2^22 < 2^24). The drain restores < W.
    //
    // mulhilo2 fusion: each row issues j=0,2,4 as paired mulhilo2 calls
    // (j and j+1 share x[i]; pair via vec2 multiply), halving the
    // multiply-issue count vs naïve scalar mulhilo.
    const emit6x6 = (xName: string, yName: string, outName: string): string => {
      const lines: string[] = [];
      // Declare 12 named locals for the wide accumulator (initialized 0).
      for (let k = 0; k < 2 * H; k++) {
        lines.push(`    var ${outName}${k}: f32 = 0.0;`);
      }
      for (let i = 0; i < H; i++) {
        // Accumulate x[i] · y[j] for j=0..H-1, paired in 2s via mulhilo2.
        // H is 6 (even), so 3 pairs per row.
        for (let j = 0; j < H; j += 2) {
          lines.push(`    {`);
          lines.push(
            `        let mh = mulhilo2(vec2<f32>(${xName}${i}, ${xName}${i}), vec2<f32>(${yName}${j}, ${yName}${j + 1}));`,
          );
          // mh.x = hi_for_j,   mh.y = lo_for_j
          // mh.z = hi_for_j+1, mh.w = lo_for_j+1
          lines.push(`        ${outName}${i + j} = ${outName}${i + j} + mh.y;`);
          lines.push(`        ${outName}${i + j + 1} = ${outName}${i + j + 1} + mh.x;`);
          lines.push(`        ${outName}${i + j + 1} = ${outName}${i + j + 1} + mh.w;`);
          lines.push(`        ${outName}${i + j + 2} = ${outName}${i + j + 2} + mh.z;`);
          lines.push(`    }`);
        }
        // Drain columns [i, i+H] (carry can extend one slot beyond row width).
        // Per-row contribution to slot k can be up to: one (lo from j_a)
        // plus one (hi from j_b) where j_a + i = k and j_b + i + 1 = k.
        // So slot has < W (pre-row) + 2W (per-row) = 3W. Plus the paired
        // mulhilo2 above accumulates two adjacent slots — slot k+1 gets
        // both hi_for_j and lo_for_j+1, so two contribs in a single pair.
        // Across 3 pairs in a row: at slot i+1, contribs are hi(j=0) +
        // lo(j=2)? No — j only increments by 2 per pair. Let me re-derive:
        // pair (j, j+1) adds to slots i+j (lo_j), i+j+1 (hi_j + lo_j+1),
        // i+j+2 (hi_j+1). Across 3 pairs (j=0, 2, 4) for row i:
        //   slot i:   lo_j=0                  (1 contrib < W)
        //   slot i+1: hi_j=0 + lo_j=1         (2 contribs)
        //   slot i+2: hi_j=1 + lo_j=2         (2 contribs)
        //   slot i+3: hi_j=2 + lo_j=3         (2 contribs)
        //   slot i+4: hi_j=3 + lo_j=4         (2 contribs)
        //   slot i+5: hi_j=4 + lo_j=5         (2 contribs)
        //   slot i+6: hi_j=5                  (1 contrib)
        // So each slot < 3W after row (with pre-row < W, +2W new). The
        // drain uses bias_split_f32_le4w (floor-based, accepts [0, 4W])
        // with incoming carry up to 3 → total < 4W. f32 mantissa exact.
        lines.push(`    {`);
        lines.push(`        var carry: f32 = 0.0;`);
        for (let k = i; k <= i + H; k++) {
          lines.push(`        {`);
          lines.push(`            let sum = ${outName}${k} + carry;`);
          lines.push(`            let d = bias_split_f32_le4w(sum);`);
          lines.push(`            ${outName}${k} = d.y;`);
          lines.push(`            carry = d.x;`);
          lines.push(`        }`);
        }
        if (i + H + 1 < 2 * H) {
          lines.push(`        ${outName}${i + H + 1} = ${outName}${i + H + 1} + carry;`);
        }
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    // Emit Phase A: produce T0..T23, all canonical < W.
    //
    // The Karatsuba decomposition lays out as:
    //   T[0..11]  = lo_lo[0..11]
    //   T[12..23] = hi_hi[0..11]
    //   Add at offset 6: ss[0..11], plus the boundary corrections
    //     (xs_top·y_sum_short[0..5] at offset 12)
    //     (ys_top·x_sum_short[0..5] at offset 12)
    //     (xs_top·ys_top at offset 18)
    //   Subtract at offset 6: lo_lo[0..11] and hi_hi[0..11]
    //
    // Each T[k] receives up to 4 positive limbs (each < W) and up to 2
    // negative limbs (each ≥ -W), so the raw value lies in [-2W, 4W].
    // 4W = 2^24 is exactly representable in f32, and floor(x*W_INV)
    // operates correctly across negatives. One sweep carry-propagates
    // to canonical [0, W).
    const emitPhaseA = (): string => {
      const lines: string[] = [];

      // Split x and y into 6-limb halves.
      lines.push(`    // === Phase A — Karatsuba 6+6 multiply ===`);
      for (let k = 0; k < H; k++) {
        lines.push(`    let x_lo${k} = (*x).limbs[${k}u];`);
      }
      for (let k = 0; k < H; k++) {
        lines.push(`    let x_hi${k} = (*x).limbs[${k + H}u];`);
      }
      for (let k = 0; k < H; k++) {
        lines.push(`    let y_lo${k} = (*y).limbs[${k}u];`);
      }
      for (let k = 0; k < H; k++) {
        lines.push(`    let y_hi${k} = (*y).limbs[${k + H}u];`);
      }

      // x_sum_short[k] = x_lo[k] + x_hi[k]; carry-propagate to canonical
      // 6 limbs + 1-bit top spillover x_sum_top ∈ {0, 1}.
      //   limb[0] = x_lo[0] + x_hi[0] ∈ [0, 2W), use 2W split.
      //   limb[k] = x_lo[k] + x_hi[k] + carry_in ∈ [0, 2W+1) for k≥1,
      //     since carry_in ∈ {0,1}; use 2W split safely (the +1 only
      //     occurs when limb < 2W-1, so hi stays in {0,1}).
      // Actually limb[k] + carry_in can be up to 2W, which is exactly on
      // the 2W boundary — use 3W split for safety; that allows hi ∈ {0,1,2}
      // and produces canonical lo. The carry value transferred is always
      // ∈ {0,1} though (rigorous proof: at limb k, val ∈ [0, 2W+1), floor
      // gives ∈ {0,1,2}, but since limb[k] + 1 ≤ 2W + 0, hi ≤ 1 — except
      // if limb[k] = 2W + 0 which can't happen with strict < 2W on each
      // x_lo, x_hi limb). Use 2W split.
      lines.push(`    // x_sum = x_lo + x_hi (6 limbs + 1-bit spillover)`);
      for (let k = 0; k < H; k++) {
        if (k === 0) {
          lines.push(`    let xs_raw${k} = x_lo${k} + x_hi${k};`);
        } else {
          lines.push(`    let xs_raw${k} = x_lo${k} + x_hi${k} + xs_carry${k - 1};`);
        }
        lines.push(`    let xs_split${k} = bias_split_f32_le2w(xs_raw${k});`);
        lines.push(`    let xs_sum${k} = xs_split${k}.y;`);
        lines.push(`    let xs_carry${k} = xs_split${k}.x;`);
      }
      lines.push(`    let xs_top = xs_carry${H - 1};`);

      lines.push(`    // y_sum = y_lo + y_hi (6 limbs + 1-bit spillover)`);
      for (let k = 0; k < H; k++) {
        if (k === 0) {
          lines.push(`    let ys_raw${k} = y_lo${k} + y_hi${k};`);
        } else {
          lines.push(`    let ys_raw${k} = y_lo${k} + y_hi${k} + ys_carry${k - 1};`);
        }
        lines.push(`    let ys_split${k} = bias_split_f32_le2w(ys_raw${k});`);
        lines.push(`    let ys_sum${k} = ys_split${k}.y;`);
        lines.push(`    let ys_carry${k} = ys_split${k}.x;`);
      }
      lines.push(`    let ys_top = ys_carry${H - 1};`);

      // Three 6×6 mulhilo products.
      lines.push(``);
      lines.push(`    // 6x6 schoolbook: lo_lo = x_lo * y_lo`);
      lines.push(emit6x6('x_lo', 'y_lo', 'L'));
      lines.push(`    // 6x6 schoolbook: hi_hi = x_hi * y_hi`);
      lines.push(emit6x6('x_hi', 'y_hi', 'H_'));
      lines.push(`    // 6x6 schoolbook: ss = x_sum * y_sum (canonical 6-limb operands)`);
      lines.push(emit6x6('xs_sum', 'ys_sum', 'S'));

      // Now construct T[0..23] from the three partials.
      //   T[k] = L[k]                                     for k in 0..5
      //   T[k] = L[k] + S[k-6] - L[k-6] - H_[k-6]         for k in 6..11
      //   T[k] = H_[k-12] + S[k-6] - L[k-6] - H_[k-6]
      //          + (xs_top * y_sum_short[k-12]) [k∈12..17]
      //          + (ys_top * x_sum_short[k-12]) [k∈12..17]
      //   T[18] = H_[6] + xs_top * ys_top
      //   T[k] = H_[k-12]                                  for k in 19..23
      lines.push(``);
      lines.push(`    // Assemble signed T[0..23] from lo_lo, hi_hi, ss, plus boundary corrections.`);
      for (let k = 0; k < 24; k++) {
        const parts: string[] = [];
        // lo_lo positive at T[0..11]
        if (k < 12) parts.push(`L${k}`);
        // hi_hi positive at T[12..23]
        if (k >= 12 && k < 24) parts.push(`H_${k - 12}`);
        // ss positive at T[6..17]
        if (k >= 6 && k < 18) parts.push(`S${k - 6}`);
        // xs_top * y_sum_short[k-12] at T[12..17]
        if (k >= 12 && k < 18) parts.push(`xs_top * ys_sum${k - 12}`);
        // ys_top * x_sum_short[k-12] at T[12..17]
        if (k >= 12 && k < 18) parts.push(`ys_top * xs_sum${k - 12}`);
        // xs_top * ys_top at T[18]
        if (k === 18) parts.push(`xs_top * ys_top`);
        // -lo_lo at T[6..17]
        if (k >= 6 && k < 18) parts.push(`-L${k - 6}`);
        // -hi_hi at T[6..17]
        if (k >= 6 && k < 18) parts.push(`-H_${k - 6}`);

        if (parts.length === 0) {
          lines.push(`    var T_raw${k}: f32 = 0.0;`);
        } else {
          lines.push(`    var T_raw${k}: f32 = ${parts.join(' + ')};`);
        }
      }

      // Carry-propagate T_raw[0..23] to canonical T[0..23] (each < W).
      // Each T_raw[k] is integer-valued, in [-2W, 4W]. `signed_drain`
      // uses floor(x*W_INV) which correctly handles negatives. Note the
      // incoming carry can be negative as well.
      lines.push(``);
      lines.push(`    // Signed carry-propagate over 24 limbs.`);
      lines.push(`    var t_carry: f32 = 0.0;`);
      for (let k = 0; k < 24; k++) {
        lines.push(`    let T_sum${k} = T_raw${k} + t_carry;`);
        lines.push(`    let T_split${k} = signed_drain_f32(T_sum${k});`);
        lines.push(`    var T${k} = T_split${k}.y;`);
        lines.push(`    t_carry = T_split${k}.x;`);
      }
      // After 24-limb propagation, t_carry should be 0 (product fits exactly).

      return lines.join('\n');
    };

    // Emit Phase B: CIOS Mont reduce over the 24-limb T.
    //
    // For i = 0..N-1:
    //   qi = (T[i] · N0) mod W
    //   T[i..i+N] += qi · p[*] with V1's 3-stage 3W-split carry chain
    //
    // The output Mont product is T[N..2N-1], canonical < W after the
    // final outer iter (Mont invariant: result < 2p ≪ W^N → no top carry).
    //
    // Per-position structure mirrors V1's `montgomery_product_f32_unreduced`
    // outer i≥1 branch (since T[i] is the running low limb, analogous to
    // s.limbs[0] in V1):
    //   Position 0: sum0 = T[i] + 0 (no xy here since multiply done),
    //               qi = mulhilo(sum0, N0).y. Since T[i] is already
    //               canonical < W, no split needed for sum0.
    //   Position j≥1: low = T[i+j] + qp_lo + c_lo; 3W split.
    //                 hi  = qp_hi + low_hi + c_hi; 3W split.
    //
    // Loop bound: 12 outer iters; per outer, 12 inner adds.
    const emitPhaseB = (): string => {
      const lines: string[] = [];
      lines.push(``);
      lines.push(`    // === Phase B — CIOS Mont reduce ===`);
      lines.push(`    var p = get_p_f32();`);
      for (let i = 0; i < N; i++) {
        lines.push(`    // --- outer i=${i} ---`);
        lines.push(`    {`);
        // Position 0: qi = (T[i] * N0) mod W. T[i] is canonical < W.
        // V1's i=0 special case applies (since the prior multiply has
        // already constructed T; we just consume T[i]).
        lines.push(`        let t_i = T${i};`);
        lines.push(`        let qi = mulhilo(t_i, N0).y;`);
        // qi * p[0] cancels T[i] mod W: qp0_lo = (W - t_i) if t_i > 0 else 0.
        lines.push(`        let c_cancel = step(0.5, t_i);`);
        lines.push(`        let qp0_lo = c_cancel * (W - t_i);`);
        lines.push(`        let qp0_hi = fma(qi, p.limbs[0u], -qp0_lo) * W_INV;`);
        // Initial carry = c_cancel + qp0_hi. c_cancel ∈ {0,1}, qp0_hi < W,
        // so sum < W + 1 < 2W. Use 2W split.
        lines.push(`        let carry_full = qp0_hi + c_cancel;`);
        lines.push(`        let carry_s = bias_split_f32_le2w(carry_full);`);
        lines.push(`        var c_hi = carry_s.x;`);
        lines.push(`        var c_lo = carry_s.y;`);

        // Positions j = 1..N-1: T[i+j] += qi * p[j] with V1's 3W-split chain.
        // Pair (j, j+1) via mulhilo2 to halve the multiply-issue count.
        // N is 12 → j in 1..11 covers 11 positions, fuse as (1,2),(3,4),
        // (5,6),(7,8),(9,10), then handle j=11 alone (scalar mulhilo).
        for (let j = 1; j < N - 1; j += 2) {
          lines.push(`        {`);
          lines.push(
            `            let mh = mulhilo2(vec2<f32>(qi, qi), vec2<f32>(p.limbs[${j}u], p.limbs[${j + 1}u]));`,
          );
          // mh.x = hi_for_j,   mh.y = lo_for_j
          // mh.z = hi_for_j+1, mh.w = lo_for_j+1
          // First step (position j):
          lines.push(`            let low_sum_a = T${i + j} + mh.y + c_lo;`);
          lines.push(`            let low_s_a = bias_split_f32_le3w(low_sum_a);`);
          lines.push(`            T${i + j} = low_s_a.y;`);
          lines.push(`            let carry_total_a = mh.x + low_s_a.x + c_hi;`);
          lines.push(`            let carry_s2_a = bias_split_f32_le3w(carry_total_a);`);
          lines.push(`            let c_hi_a = carry_s2_a.x;`);
          lines.push(`            let c_lo_a = carry_s2_a.y;`);
          // Second step (position j+1):
          lines.push(`            let low_sum_b = T${i + j + 1} + mh.w + c_lo_a;`);
          lines.push(`            let low_s_b = bias_split_f32_le3w(low_sum_b);`);
          lines.push(`            T${i + j + 1} = low_s_b.y;`);
          lines.push(`            let carry_total_b = mh.z + low_s_b.x + c_hi_a;`);
          lines.push(`            let carry_s2_b = bias_split_f32_le3w(carry_total_b);`);
          lines.push(`            c_hi = carry_s2_b.x;`);
          lines.push(`            c_lo = carry_s2_b.y;`);
          lines.push(`        }`);
        }
        // Final scalar step for j = N - 1 (if N is even, otherwise no leftover).
        if ((N - 1) % 2 === 1) {
          const j = N - 1;
          lines.push(`        {`);
          lines.push(`            let mh = mulhilo(qi, p.limbs[${j}u]);`);
          lines.push(`            let qp_hi = mh.x;`);
          lines.push(`            let qp_lo = mh.y;`);
          lines.push(`            let low_sum = T${i + j} + qp_lo + c_lo;`);
          lines.push(`            let low_s = bias_split_f32_le3w(low_sum);`);
          lines.push(`            T${i + j} = low_s.y;`);
          lines.push(`            let carry_total = qp_hi + low_s.x + c_hi;`);
          lines.push(`            let carry_s2 = bias_split_f32_le3w(carry_total);`);
          lines.push(`            c_hi = carry_s2.x;`);
          lines.push(`            c_lo = carry_s2.y;`);
          lines.push(`        }`);
        }
        // After inner loop, propagate final carry into T[i+N].
        lines.push(`        let final_low = T${i + N} + c_lo;`);
        lines.push(`        let final_s = bias_split_f32_le2w(final_low);`);
        lines.push(`        T${i + N} = final_s.y;`);
        lines.push(`        let final_hi = c_hi + final_s.x;`);
        // Propagate one more carry if applicable. Bound: c_hi < 3, final_s.x ∈ {0,1},
        // so final_hi < 4 ≪ W. We need to add into T[i+N+1] if it exists.
        if (i + N + 1 < 24) {
          lines.push(`        T${i + N + 1} = T${i + N + 1} + final_hi;`);
        }
        // Otherwise final_hi must be 0 by Mont invariant.
        lines.push(`    }`);
      }
      return lines.join('\n');
    };

    // Output limbs are T[N..2N-1]. After the last outer iter, T[N..2N-1]
    // should be canonical < W (Mont invariant guarantees result < 2p ≪ W^N).
    // After Phase B, T[12..23] may have absorbed propagated carry into
    // T[24] in V1 logic, but here T is bounded — we propagate into T[i+N+1]
    // which is always within the 24-limb T (max i is N-1=11, so i+N+1=24 which
    // is the boundary — handled by the conditional above).
    const emitCommit = (): string => {
      const lines: string[] = [];
      lines.push(``);
      lines.push(`    // Commit output: result = T[N..2N-1] (canonical).`);
      lines.push(`    var result: BigIntF32;`);
      for (let k = 0; k < N; k++) {
        lines.push(`    result.limbs[${k}u] = T${k + N};`);
      }
      lines.push(`    return result;`);
      return lines.join('\n');
    };

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);

    const body = `const NUM_LIMBS: u32 = ${N}u;
const N0: f32 = ${this.n0_f32_22.toString()}.0;

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
${this.p_limbs_f32_22_str}
    return p;
}

fn bias_split_f32_le2w(x: f32) -> vec2<f32> {
    let hi = step(W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn bias_split_f32_le3w(x: f32) -> vec2<f32> {
    let hi = step(W, x) + step(2.0 * W, x);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn bias_split_f32_le4w(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

// Signed drain: x ∈ [-cW, dW] for small c, d. floor(x*W_INV) returns
// an integer (possibly negative) such that lo = x - hi*W ∈ [0, W).
// Works because x*W_INV is exact (multiplication by power of two) and
// f32 represents all integers ≤ 2^24 exactly; in our use, |x| < 2^25
// where integers are even-only but our hi values are also even-multiples
// (hi*W with hi ∈ {-2..4} stays exact). Result lo is integer in [0, W).
fn signed_drain_f32(x: f32) -> vec2<f32> {
    let hi = floor(x * W_INV);
    let lo = fma(-hi, W, x);
    return vec2<f32>(hi, lo);
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
${emitPhaseA()}
${emitPhaseB()}
${emitCommit()}
}

fn montgomery_product_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s = montgomery_product_f32_unreduced(x, y);
    var p = get_p_f32();
    return conditional_reduce_f32(&s, &p);
}

fn conditional_reduce_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    if (bigint_f32_gt(x, y) || bigint_f32_eq(x, y)) {
        var res: BigIntF32;
        let _borrow = bigint_f32_sub(x, y, &res);
        return res;
    }
    return *x;
}
`;
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${body}`;
  }

  // Niall Emmart's c4-dance Montgomery multiply, ported line-by-line
  // from script.mjs:emitEmmartKernel (f64x2 51-bit) to f32 22-bit.
  //
  // Per-product:
  //   lh = fma(term, b_j, c3)        // hi-FMA: bit pattern = HI_BIAS + hi_int
  //   diff = c4 - lh
  //   lo = fma(term, b_j, diff)      // lo-FMA: bit pattern = LO_BIAS + signed_residue
  // 3 ops per product. Accumulators are u32 (analog to Emmart's i64x2)
  // with bit-pattern adds. Total bias per column is statically known;
  // subtract at end of algorithm, then sweep carries to extract limbs.
  //
  // Constants (f32 22-bit analog of Emmart's 51-bit f64):
  //   W      = 2^22
  //   c3     = 2^45              (bit pattern 0x56000000) — puts a*b+c3 in
  //                              binade [2^45, 2^46) where ULP = 2^22 = W.
  //   c4     = c3 + 3W           (bit pattern 0x56000003) — biases lo-FMA
  //                              result into binade [2^23, 2^24) where
  //                              ULP = 1 (integer-exact).
  //   HI_BIAS_U32 = 0x56000000   = u32 of c3
  //   LO_BIAS_U32 = 0x4B400000   = u32 bit pattern of 3W in [2^23, 2^24) binade
  //                              (= (150<<23) | (1<<22) = 0x4B400000)
  //
  // Structure: pure SOS (no rotation). 12×12 multiply phase fills cols
  // 0..23 with 144 products; 12-iter reduce phase processes cols 0..11
  // with qi extracted from sum[i] (bias-subtracted, low 22 bits).
  //
  // Bench-only — bound by `gen_field_mul_bench_f32_shader` when
  // `variant == 'emmart'`.
  public gen_montgomery_product_f32_22_emmart_shader(): string {
    const N = this.num_limbs_f32_22; // 12
    const NUM_COLS = 2 * N + 1; // 25
    const W = 1 << 22;

    // u32 bit patterns
    const HI_BIAS_U32 = 0x56000000;
    const LO_BIAS_U32 = 0x4b400000;

    // n0 = -p^-1 mod 2^22 as a u32 integer
    const n0BigInt = this.n0_f32_22;
    const n0Int = Number(n0BigInt & ((1n << 22n) - 1n));

    // f32 literals for c3 and c4 (both exact integers in f32).
    const c3Literal = (2 ** 45).toFixed(1); // "35184372088832.0"
    const c4Literal = (2 ** 45 + 3 * W).toFixed(1); // "35184384671744.0"

    // Bias counts per column. lo_count_mul[k] = # (i,j) products with i+j=k.
    // hi_count_mul[k] = # (i,j) with i+j+1=k. Reduce iters i' contribute
    // 1 lo to col i'+j and 1 hi to col i'+j+1 for j in 0..N-1.
    const lo_count_total: number[] = new Array(NUM_COLS).fill(0);
    const hi_count_total: number[] = new Array(NUM_COLS).fill(0);
    // Multiply phase
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        lo_count_total[i + j]++;
        hi_count_total[i + j + 1]++;
      }
    }
    // Reduce phase (all N iters)
    for (let ip = 0; ip < N; ip++) {
      for (let j = 0; j < N; j++) {
        lo_count_total[ip + j]++;
        hi_count_total[ip + j + 1]++;
      }
    }

    // Bias at col i BEFORE reduce iter i (for qi extraction).
    // = multiply bias at col i + prior reduce iters' contributions to col i.
    // For i in [0, N-1]:
    //   multiply lo_count_mul[i] = i+1
    //   multiply hi_count_mul[i] = i
    //   prior reduce lo: # i' in [max(0,i-N+1), min(N-1,i)] ∩ [0,i-1].
    //     For i ≤ N-1: max(0,i-N+1)=0, min(N-1,i)=i, ∩ [0,i-1] gives [0,i-1] — count = i.
    //   prior reduce hi: # i' in [max(0,i-N), min(N-1,i-1)] ∩ [0,i-1].
    //     For i ≤ N-1: max(0,i-N)=0, min(N-1,i-1)=i-1, ∩ [0,i-1] gives [0,i-1] — count = i.
    const biasBeforeIter: number[] = [];
    for (let i = 0; i < N; i++) {
      const loCount = i + 1 + i; // multiply + prior reduce
      const hiCount = i + i;
      const b = ((loCount * LO_BIAS_U32) >>> 0) + ((hiCount * HI_BIAS_U32) >>> 0);
      biasBeforeIter.push((b >>> 0) >>> 0);
    }

    // Emit a single Emmart c4-dance product.
    //
    // Fast-math barrier: WGSL/MSL fast-math algebraically rewrites
    // `fma(x, y, c4 - fma(x, y, c3))` to `c4 - c3` (cancelling x*y across
    // the two FMAs). A simple `bitcast<f32>(bitcast<u32>(x))` round-trip
    // is insufficient — the compiler sees through it. We route the bias
    // for the second FMA through INTEGER arithmetic on the bit pattern,
    // which the compiler cannot algebraically reduce: `hi_int` is u32 of
    // (lh_bits - HI_BIAS), and `bias_lo_f32 = THREE_W - f32(hi_int)*W`.
    // The f32 conversion is opaque to f32 algebra.
    const emitProduct = (x: string, y: string, hiCol: number, loCol: number): string =>
      `    {\n` +
      `        let _lh_bits: u32 = bitcast<u32>(fma(${x}, ${y}, c3));\n` +
      `        s${hiCol} = s${hiCol} + _lh_bits;\n` +
      `        let _hi_int: u32 = _lh_bits - HI_BIAS_U32;\n` +
      `        let _hi_x_W: f32 = f32(_hi_int) * W;\n` +
      `        let _diff: f32 = THREE_W - _hi_x_W;\n` +
      `        let _lo_bits: u32 = bitcast<u32>(fma(${x}, ${y}, _diff));\n` +
      `        s${loCol} = s${loCol} + _lo_bits;\n` +
      `    }`;

    const lines: string[] = [];

    // Header: load x, y, p limbs into named locals; init sum slots.
    for (let i = 0; i < N; i++) {
      lines.push(`    let x${i}: f32 = (*x).limbs[${i}u];`);
    }
    for (let j = 0; j < N; j++) {
      lines.push(`    let y${j}: f32 = (*y).limbs[${j}u];`);
    }
    lines.push(`    var _p_struct: BigIntF32 = get_p_f32();`);
    for (let j = 0; j < N; j++) {
      lines.push(`    let p${j}: f32 = _p_struct.limbs[${j}u];`);
    }
    for (let k = 0; k < NUM_COLS; k++) {
      lines.push(`    var s${k}: u32 = 0u;`);
    }

    // === Multiply phase: 12×12 schoolbook ===
    lines.push(`    // === Multiply phase: 144 Emmart c4-dance products ===`);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        lines.push(emitProduct(`x${i}`, `y${j}`, i + j + 1, i + j));
      }
    }

    // === Reduce phase: 12 iters ===
    //
    // SOS Mont reduce: at iter i, qi is chosen so that adding qi*p to T
    // makes the low W bits of col i zero. The HIGH BITS of col i (i.e.,
    // (col_i_value - low_W_bits) / W) represent a carry that must be added
    // to col i+1 before iter (i+1)'s qi extraction — otherwise canon_{i+1}
    // sees stale data.
    //
    // Carry propagation: after extracting canon_i (= col_i mod W, low 22
    // bits), compute the signed shift-right of (col_i_value) >> 22 (i.e.,
    // bias-subtracted value, arithmetic shift). This i32 is added to sum[i+1]
    // as a u32 bit-reinterpretation (modular u32 add absorbs negative carry).
    lines.push(`    // === Reduce phase: 12 Mont reduction iters with carry propagation ===`);
    for (let i = 0; i < N; i++) {
      const bias = biasBeforeIter[i];
      lines.push(`    // --- Reduce iter i=${i} ---`);
      lines.push(`    let s${i}_unbiased: u32 = s${i} - ${bias >>> 0}u;`);
      lines.push(`    let canon_${i}: u32 = s${i}_unbiased & 0x3FFFFFu;`);
      lines.push(`    let carry_to_${i + 1}: i32 = i32(s${i}_unbiased) >> 22u;`);
      lines.push(`    s${i + 1} = s${i + 1} + bitcast<u32>(carry_to_${i + 1});`);
      // Subtract W * carry from sum[i] so the final carry sweep doesn't double-count.
      // After this, sum[i] - bias[i] = canon_i (just the low W bits, no high carry).
      lines.push(`    s${i} = s${i} - bitcast<u32>(carry_to_${i + 1} * ${W}i);`);
      lines.push(`    let qi_int_${i}: u32 = (canon_${i} * ${n0Int}u) & 0x3FFFFFu;`);
      lines.push(`    let qi_${i}: f32 = f32(qi_int_${i});`);
      for (let j = 0; j < N; j++) {
        lines.push(emitProduct(`qi_${i}`, `p${j}`, i + j + 1, i + j));
      }
    }

    // === Final bias subtract + carry sweep ===
    // Output limbs are in cols N..2N-1. Carries from cols 0..N-1 (which
    // should canonicalize to zero by Mont invariant) propagate up via
    // signed i32 arithmetic.
    lines.push(`    // === Final bias-subtract + carry sweep ===`);
    lines.push(`    var _carry: i32 = 0;`);
    lines.push(`    var _result: BigIntF32;`);
    for (let k = 0; k < NUM_COLS; k++) {
      const bias = (((lo_count_total[k] * LO_BIAS_U32) >>> 0) + ((hi_count_total[k] * HI_BIAS_U32) >>> 0)) >>> 0;
      const outIdx = k - N;
      const isOutput = outIdx >= 0 && outIdx < N;
      lines.push(`    {`);
      lines.push(`        let raw: u32 = s${k} - ${bias >>> 0}u;`);
      lines.push(`        let val: i32 = i32(raw) + _carry;`);
      lines.push(`        let lo: i32 = val & 0x3FFFFF;`);
      lines.push(`        let hi: i32 = val >> 22u;`);
      if (isOutput) {
        lines.push(`        _result.limbs[${outIdx}u] = f32(lo);`);
      }
      lines.push(`        _carry = hi;`);
      lines.push(`    }`);
    }
    lines.push(`    return _result;`);

    const ctx = {
      num_limbs: this.num_limbs_f32_22,
      w: '4194304.0',
      w_inv: '2.384185791015625e-7',
      bias: '17592186044416.0',
      n0: `${this.n0_f32_22.toString()}.0`,
      p_limbs_f32: this.p_limbs_f32_22_str,
    };
    const bigint_f32_src = mustache.render(bigint_f32_funcs, ctx);

    const body = `const NUM_LIMBS: u32 = ${N}u;
const c3: f32 = ${c3Literal};
const c4: f32 = ${c4Literal};
// W comes from mulhilo_22 bundle (already declared as 2^22 there).
const THREE_W: f32 = ${3 * W}.0;
const HI_BIAS_U32: u32 = ${HI_BIAS_U32}u;

fn get_p_f32() -> BigIntF32 {
    var p: BigIntF32;
${this.p_limbs_f32_22_str}
    return p;
}

fn montgomery_product_f32_unreduced(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
${lines.join('\n')}
}

fn montgomery_product_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    var s = montgomery_product_f32_unreduced(x, y);
    var p = get_p_f32();
    return conditional_reduce_f32(&s, &p);
}

fn conditional_reduce_f32(x: ptr<function, BigIntF32>, y: ptr<function, BigIntF32>) -> BigIntF32 {
    if (bigint_f32_gt(x, y) || bigint_f32_eq(x, y)) {
        var res: BigIntF32;
        let _borrow = bigint_f32_sub(x, y, &res);
        return res;
    }
    return *x;
}
`;
    return `${mulhilo_22_funcs}\n${bigint_f32_src}\n${body}`;
  }

  // Field-mul micro-benchmark, f32 / 12×22-bit limbs path. Uses the
  // 22-bit-limb helper bundle (see `gen_montgomery_product_f32_22_shader`).
  // Loop-bound analysis is the same as the u32 variant: `k` capped at
  // 100 host-side, `n` capped at 2^23, inner Montgomery loop bounded by
  // the compile-time NUM_LIMBS.
  public gen_field_mul_bench_f32_shader(
    workgroup_size: number,
    variant:
      | 'cios'
      | 'sos'
      | 'sos3'
      | 'sos3u'
      | 'sos3uv2'
      | 'sos3uv2nc'
      | 'sos3uv3'
      | 'sos3u32'
      | 'sos3wasm'
      | 'sos3wasm_v2'
      | 'sos3uv3_mixed'
      | 'sos3wasm_v3'
      | 'sos3cf_19'
      | 'sos3uv3cf_19'
      | 'v2'
      | 'unrolled'
      | 'unrolled2'
      | 'kara'
      | 'emmart' = 'unrolled',
  ): string {
    let helpers: string;
    if (variant === 'sos') {
      helpers = this.gen_montgomery_product_f32_sos_shader();
    } else if (variant === 'sos3') {
      // 'sos3': SOS skeleton + 4-op mulhilo (3 FMA + floor barrier + a_scaled
      // precompute per row). Drops the per-mulhilo underflow correction; the
      // floor-based drain handles signed lo. ~30% fewer ops than baseline SOS.
      helpers = this.gen_montgomery_product_f32_22_sos3_shader();
    } else if (variant === 'sos3u') {
      // 'sos3u': sos3's 4-op vec2 mulhilo dropped into the `unrolled` CIOS
      // skeleton (named locals s0..s11, mitschabaude-style outer structure).
      // Inner body uses bias_split_f32_le4w throughout to absorb signed lo.
      helpers = this.gen_montgomery_product_f32_22_sos3u_shader();
    } else if (variant === 'sos3uv2') {
      // 'sos3uv2': sos3u + three micro-wins (drop hi-W in vec2 mulhilo,
      // lo-only qi extraction, balanced add tree for carry_total).
      helpers = this.gen_montgomery_product_f32_22_sos3uv2_shader();
    } else if (variant === 'sos3uv2nc') {
      // DIAGNOSTIC. Produces wrong results. Measures cost of the carry chain.
      helpers = this.gen_montgomery_product_f32_22_sos3uv2nc_shader();
    } else if (variant === 'sos3u32') {
      // 'sos3u32': sos3uv2 with i32 accumulators. No per-j carry chain;
      // single drain at end of each outer iter.
      helpers = this.gen_montgomery_product_f32_22_sos3u32_shader();
    } else if (variant === 'sos3uv3') {
      // 'sos3uv3': f32 chain-break — separate per-slot tlo[k]/thi[k]
      // accumulators, no inter-j carry, drain at end of each outer iter.
      helpers = this.gen_montgomery_product_f32_22_sos3uv3_shader();
    } else if (variant === 'sos3wasm') {
      // 'sos3wasm': WASM-style i32 deferred-drain SOS. 25 i32 slots,
      // ZERO drain in multiply phase, single carry propagation per reduce
      // iter, final drain at end. Vec4 batched f32→i32 conversion.
      helpers = this.gen_montgomery_product_f32_22_sos3wasm_shader();
    } else if (variant === 'sos3wasm_v2') {
      // 'sos3wasm_v2': sos3wasm with SEPARATE T_lo/T_hi slots to eliminate
      // the inter-pair RAW chain.
      helpers = this.gen_montgomery_product_f32_22_sos3wasm_v2_shader();
    } else if (variant === 'sos3uv3_mixed') {
      // 'sos3uv3_mixed': sos3uv3 structure with mixed acc — i32 tlo (signed
      // via conversion) + u32 thi (bit-pattern via free bitcast).
      helpers = this.gen_montgomery_product_f32_22_sos3uv3_mixed_shader();
    } else if (variant === 'sos3wasm_v3') {
      // 'sos3wasm_v3': sos3wasm with chain-broken batching. Compute all
      // pair mulhilos+conversions in a batch first, then accumulate.
      helpers = this.gen_montgomery_product_f32_22_sos3wasm_v3_shader();
    } else if (variant === 'sos3cf_19') {
      // 'sos3cf_19': 19-bit limbs, pure f32, fully carry-free.
      helpers = this.gen_montgomery_product_f32_19_sos3cf_shader();
    } else if (variant === 'sos3uv3cf_19') {
      // 'sos3uv3cf_19': sos3uv3-shape at 19-bit, no per-iter drain.
      helpers = this.gen_montgomery_product_f32_19_sos3uv3cf_shader();
    } else if (variant === 'cios') {
      helpers = this.gen_montgomery_product_f32_22_shader();
    } else if (variant === 'v2') {
      // 'v2': wide-column / two-bucket CIOS (Layer 1 — reverted, regressed).
      helpers = this.gen_montgomery_product_f32_22_v2_shader();
    } else if (variant === 'unrolled2') {
      // 'unrolled2': inner-j AND outer-i both fully unrolled.
      helpers = this.gen_montgomery_product_f32_22_fully_unrolled_shader();
    } else if (variant === 'kara') {
      // 'kara': Layer 3 — Karatsuba 6+6 split in the multiply phase
      // only, CIOS-style Mont reduce on the wide product.
      helpers = this.gen_montgomery_product_f32_22_kara_shader();
    } else if (variant === 'emmart') {
      // 'emmart': Niall Emmart's c4-dance Mont mul, line-by-line port of
      // script.mjs:emitEmmartKernel. Pure SOS (no rotation). 3 ops/mulhilo
      // (fma + sub + fma). u32 bit-pattern column accumulators, named
      // locals, bias-subtract at end, single carry sweep.
      helpers = this.gen_montgomery_product_f32_22_emmart_shader();
    } else {
      // 'unrolled': V1 CIOS with inner-j loops manually unrolled (Layer 2).
      helpers = this.gen_montgomery_product_f32_22_unrolled_shader();
    }
    const entry_src = mustache.render(field_mul_bench_f32_shader, {
      workgroup_size,
    });
    return `${helpers}
${entry_src}`;
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

  // SMVP f32 — emits the full f32 curve stack (field + curve helpers)
  // followed by the cuzk SMVP body rewritten to use PointF32 / BigIntF32.
  public gen_smvp_f32_shader(workgroup_size: number, num_csr_cols: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const smvp_src = mustache.render(smvp_bn254_f32_shader, {
      workgroup_size,
      num_columns: num_csr_cols,
      half_num_columns: num_csr_cols / 2,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${smvp_src}`;
  }

  // BPR f32 — f32 curve stack + bucket points reduction. Flag matrix
  // mirrors the u32 path's `gen_bpr_shader` (assume_affine_buckets,
  // mixed_safe_buckets, safe_first_add_no_collision). Microbench flags
  // and capture_debug aren't ported to the f32 path; the production
  // batch-affine f32 pipeline only exercises the four mutually
  // exclusive code paths above.
  public gen_bpr_f32_shader(
    workgroup_size: number,
    assume_affine_buckets = false,
    mixed_safe_buckets = false,
    safe_first_add_no_collision = false,
  ): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const bpr_src = mustache.render(bpr_bn254_f32_shader, {
      workgroup_size,
      r_limbs_f32: this.r_limbs_f32_str,
      assume_affine_buckets,
      mixed_safe_buckets,
      safe_first_add_no_collision,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${bpr_src}`;
  }

  // Horner-reduce f32 — f32 curve stack + per-subtask reduce (subtask_reduce
  // and horner_chain entry points; the f32 entry only dispatches the former).
  public gen_horner_reduce_f32_shader(
    num_subtasks: number,
    b_workgroup_size: number,
    chunk_size: number,
  ): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const horner_src = mustache.render(horner_reduce_bn254_f32_shader, {
      num_subtasks,
      b_workgroup_size,
      chunk_size,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${horner_src}`;
  }

  // f32 SRS decompression — emits Mont-form `PointF32` directly into the
  // output buffer (12 × f32 limbs per coordinate). Same flow as the u32
  // `gen_decompress_g1_bn254_shader`: assemble x from compressed LE
  // bytes, push to Mont via R², compute y² = x³ + b3_mont, sqrt via
  // fr_sqrt_f32, parity-flip in Mont.
  public gen_decompress_g1_bn254_f32_shader(workgroup_size: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const decomp_src = mustache.render(decompress_g1_bn254_f32_shader, {
      workgroup_size,
      num_limbs_f32: this.num_limbs_f32,
      r_limbs_f32: this.r_limbs_f32_str,
      b3_mont_limbs_f32: this.b3_mont_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${decomp_src}`;
  }

  // Batch-affine init f32 — only needs the BigIntF32 struct definition.
  // Prepending the full curve bundle keeps the binding declarations
  // visible to the same set of helpers the rest of the f32 pipeline
  // uses and avoids a separate "struct-only" emit path.
  public gen_batch_affine_init_f32_shader(workgroup_size: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const init_src = mustache.render(batch_affine_init_f32_shader, {
      workgroup_size,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${init_src}`;
  }

  // Batch-affine dispatch_args is encoding-agnostic — the f32 template
  // is a textual sibling of the u32 one. No partials needed.
  public gen_batch_affine_dispatch_args_f32_shader(): string {
    return mustache.render(batch_affine_dispatch_args_f32_shader, {}, {});
  }

  public gen_batch_affine_schedule_f32_shader(workgroup_size: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const sched_src = mustache.render(batch_affine_schedule_f32_shader, {
      workgroup_size,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${sched_src}`;
  }

  public gen_batch_affine_apply_f32_shader(workgroup_size: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const apply_src = mustache.render(batch_affine_apply_f32_shader, {
      workgroup_size,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${apply_src}`;
  }

  public gen_batch_affine_apply_scatter_f32_shader(workgroup_size: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const apply_src = mustache.render(batch_affine_apply_scatter_f32_shader, {
      workgroup_size,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${apply_src}`;
  }

  public gen_batch_affine_finalize_f32_shader(workgroup_size: number, num_csr_cols: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const fin_src = mustache.render(batch_affine_finalize_f32_shader, {
      workgroup_size,
      num_columns: num_csr_cols,
      half_num_columns: num_csr_cols / 2,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${fin_src}`;
  }

  public gen_batch_affine_finalize_collect_f32_shader(workgroup_size: number, num_csr_cols: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const fin_src = mustache.render(batch_affine_finalize_collect_f32_shader, {
      workgroup_size,
      num_columns: num_csr_cols,
      half_num_columns: num_csr_cols / 2,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${fin_src}`;
  }

  public gen_batch_affine_finalize_apply_f32_shader(workgroup_size: number, num_csr_cols: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const fin_src = mustache.render(batch_affine_finalize_apply_f32_shader, {
      workgroup_size,
      num_columns: num_csr_cols,
      half_num_columns: num_csr_cols / 2,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${fin_src}`;
  }

  public gen_batch_inverse_f32_shader(): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const inv_src = mustache.render(batch_inverse_f32_shader, {
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${inv_src}`;
  }

  public gen_batch_inverse_parallel_f32_shader(num_sub_wgs: number): string {
    const curve_bundle = this.gen_curve_f32_shader();
    const inv_src = mustache.render(batch_inverse_parallel_f32_shader, {
      num_sub_wgs,
      r_limbs_f32: this.r_limbs_f32_str,
      recompile: this.recompile,
    });
    return `${curve_bundle}\n${inv_src}`;
  }
}
