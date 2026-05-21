import mustache from 'mustache';
import {
  apply_matrix_bench as apply_matrix_bench_shader,
  barrett as barrett_funcs,
  batch_affine_apply as batch_affine_apply_shader,
  batch_affine_apply_scatter as batch_affine_apply_scatter_shader,
  batch_affine_dispatch_args as batch_affine_dispatch_args_shader,
  ba_carry_copy_bench as ba_carry_copy_bench_shader,
  ba_finalize_copy_bench as ba_finalize_copy_bench_shader,
  ba_fused_super_bench as ba_fused_super_bench_shader,
  ba_reduce_fused_bench as ba_reduce_fused_bench_shader,
  ba_reduce_init_bench as ba_reduce_init_bench_shader,
  ba_marshal_chain_bench as ba_marshal_chain_bench_shader,
  ba_marshal_pairs_bench as ba_marshal_pairs_bench_shader,
  ba_marshal_tree_l0_bench as ba_marshal_tree_l0_bench_shader,
  ba_pair_disjoint_bench as ba_pair_disjoint_bench_shader,
  ba_pair_disjoint_tree_bench as ba_pair_disjoint_tree_bench_shader,
  ba_planner_bench as ba_planner_bench_shader,
  ba_planner_v2_bench as ba_planner_v2_bench_shader,
  ba_scatter_pairs_bench as ba_scatter_pairs_bench_shader,
  ba_tail_reduce_bench as ba_tail_reduce_bench_shader,
  ba_rev_packed_carry_bench as ba_rev_packed_carry_bench_shader,
  bench_batch_affine as bench_batch_affine_shader,
  bench_field_mul as bench_field_mul_shader,
  bench_field_inv as bench_field_inv_shader,
  batch_affine_finalize as batch_affine_finalize_shader,
  batch_affine_finalize_apply as batch_affine_finalize_apply_shader,
  batch_affine_finalize_collect as batch_affine_finalize_collect_shader,
  batch_affine_fused_revcarry as batch_affine_fused_revcarry_shader,
  batch_affine_fused_wg_scan as batch_affine_fused_wg_scan_shader,
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
  // Register-minimal BY safegcd inverse (BATCH=12 / NUM_OUTER=62, rolling
  // apply_matrix). Hosts BylMat, byl_divsteps, byl_apply_matrix, the
  // byl_reduce_to_canonical chain, and the fr_inv_by_loop driver.
  by_inverse_loop as by_inverse_loop_funcs,
  bpr_bn254 as bpr_bn254_shader,
  convert_point_coords_and_decompose_scalars,
  convert_points_only as convert_points_only_shader,
  csr_to_v2_active_sums as csr_to_v2_active_sums_shader,
  csr_to_v2_meta as csr_to_v2_meta_shader,
  decompose_scalars_booth as decompose_scalars_booth_shader,
  decompose_scalars_signed_only as decompose_scalars_signed_only_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  demont_scalars as demont_scalars_shader,
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
  packed_field as packed_field_funcs,
  smvp_bn254 as smvp_bn254_shader,
  smvp_tree_entry_bucket_id as smvp_tree_entry_bucket_id_shader,
  smvp_tree_phase1 as smvp_tree_phase1_shader,
  smvp_tree_phase2 as smvp_tree_phase2_shader,
  smvp_tree_scatter as smvp_tree_scatter_shader,
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

  public gen_convert_points_and_decomp_scalars_shader(
    workgroup_size: number,
    num_y_workgroups: number,
    num_subtasks: number,
    num_columns: number,
    scalar_bit_length_override?: number,
    scalar_byte_length_override?: number,
    packed = false,
  ): string {
    const num_16_bit_words_per_coord = Math.ceil((this.num_words * this.word_size) / 16);
    const coord_u32_words = this.curveConfig.coordinateByteLength / 4;
    const scalar_byte_length = scalar_byte_length_override ?? this.curveConfig.scalarByteLength;
    const scalar_bit_length = scalar_bit_length_override ?? this.curveConfig.scalarBitLength;
    const scalar_u32_words = scalar_byte_length / 4;
    const use_top_chunk_override = scalar_bit_length % this.chunk_size !== 0;
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      convert_point_coords_and_decompose_scalars,
      {
        workgroup_size,
        num_y_workgroups,
        num_subtasks,
        num_columns,
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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

  public gen_decompose_scalars_booth_shader(workgroup_size: number): string {
    return mustache.render(decompose_scalars_booth_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  public gen_demont_scalars_shader(workgroup_size: number): string {
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      demont_scalars_shader,
      {
        workgroup_size,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      { structs, bigint_funcs, montgomery_product_funcs: this.mont_product_src },
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
  public gen_batch_inverse_parallel_shader(num_sub_wgs: number, windows_per_batch: number): string {
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
  public gen_smvp_tree_phase1_shader(tpb: number, max_slice_entries: number): string {
    if (tpb <= 0 || max_slice_entries <= 0) {
      throw new Error(`gen_smvp_tree_phase1_shader: tpb and max_slice_entries must be positive`);
    }
    if (max_slice_entries % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase1_shader: max_slice_entries (${max_slice_entries}) must be a multiple of tpb (${tpb})`,
      );
    }
    const max_pairs = max_slice_entries; // each slot is either PAIR or UNPAIRED
    const per_thread_pairs = Math.ceil(max_pairs / tpb);
    const per_thread_entries = max_slice_entries / tpb;
    return mustache.render(
      smvp_tree_phase1_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        per_thread_pairs,
        per_thread_entries,
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
  public gen_smvp_tree_phase2_shader(tpb: number, max_slice_entries: number): string {
    if (tpb <= 0 || max_slice_entries <= 0) {
      throw new Error(`gen_smvp_tree_phase2_shader: tpb and max_slice_entries must be positive`);
    }
    if (max_slice_entries % tpb !== 0) {
      throw new Error(
        `gen_smvp_tree_phase2_shader: max_slice_entries (${max_slice_entries}) must be a multiple of tpb (${tpb})`,
      );
    }
    const max_pairs = max_slice_entries;
    const per_thread_pairs = Math.ceil(max_pairs / tpb);
    const per_thread_entries = max_slice_entries / tpb;
    return mustache.render(
      smvp_tree_phase2_shader,
      {
        tpb,
        max_slice_entries,
        max_pairs,
        per_thread_pairs,
        per_thread_entries,
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

  /**
   * Marshal kernel for the bench-msm-chain pipeline: transposes a
   * CSR-sorted point list into the strided SoA layout the
   * ba_rev_packed_carry chain kernel consumes. Pure memory shuffle.
   */
  public gen_ba_marshal_chain_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_marshal_chain_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    return mustache.render(
      ba_marshal_chain_bench_shader,
      { workgroup_size, s, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
  }

  /**
   * Fused super-kernel for the v3 pipeline: combines marshal + disjoint
   * + scatter into one kernel. Per chunk-thread: reads chunk_plan +
   * scatter_plan, gathers from active_sums_old, computes batched-
   * inverse pair sums in registers, writes directly to active_sums_new.
   * Carry is a separate kernel.
   */
  public gen_ba_fused_super_bench_shader(
    workgroup_size: number,
    s: number,
    variant: 'a' | 'loop' | 'pk' = 'pk',
    tiled = false,
    l0_index_mode = false,
  ): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_fused_super_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = variant === 'a' ? by_inverse_a_funcs : by_inverse_loop_funcs;
    const inv_fn = variant === 'pk' ? 'fr_inv_by_loop_pk' : variant === 'loop' ? 'fr_inv_by_loop' : 'fr_inv_by_a';
    return mustache.render(
      ba_fused_super_bench_shader,
      {
        workgroup_size, s, inv_fn, tiled, l0_index_mode,
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
        field_funcs, fr_pow_funcs, bigint_by_funcs, inverse_funcs,
      },
    );
  }

  /**
   * Standalone field-multiply throughput microbench. Each thread runs
   * `iters` mutually-independent `montgomery_product` calls on
   * per-iteration-perturbed operands; total ops = threads * iters.
   * Pulls in only structs / bigint / montgomery — the multiply needs
   * nothing else. Used by dev/msm-webgpu/bench-field-ops to measure
   * ns-per-multiply in isolation.
   */
  public gen_bench_field_mul_shader(workgroup_size: number, iters: number): string {
    if (workgroup_size <= 0 || iters <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(iters)) {
      throw new Error(`gen_bench_field_mul_shader: workgroup_size (${workgroup_size}) and iters (${iters}) must be positive integers`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      bench_field_mul_shader,
      {
        workgroup_size, iters,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      {
        structs, bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
      },
    );
  }

  /**
   * Standalone field-inversion throughput microbench. Each thread runs
   * `iters` mutually-independent inverse calls on per-iteration-perturbed
   * operands; total ops = threads * iters. `variant` picks the inverse:
   * 'a' = fr_inv_by_a (Option A, BATCH=26), 'loop' = fr_inv_by_loop
   * (register-minimal, BATCH=12). Pulls in the full inverse stack
   * (structs / bigint / montgomery / field / fr_pow / bigint_by) plus the
   * selected inverse partial. Used by dev/msm-webgpu/bench-field-ops to
   * measure ns-per-inversion in isolation.
   */
  public gen_bench_field_inv_shader(
    workgroup_size: number,
    iters: number,
    variant: 'a' | 'loop' = 'a',
  ): string {
    if (workgroup_size <= 0 || iters <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(iters)) {
      throw new Error(`gen_bench_field_inv_shader: workgroup_size (${workgroup_size}) and iters (${iters}) must be positive integers`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = variant === 'loop' ? by_inverse_loop_funcs : by_inverse_a_funcs;
    const inv_fn = variant === 'loop' ? 'fr_inv_by_loop' : 'fr_inv_by_a';
    return mustache.render(
      bench_field_inv_shader,
      {
        workgroup_size, iters, inv_fn,
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
        field_funcs, fr_pow_funcs, bigint_by_funcs, inverse_funcs,
      },
    );
  }

  /**
   * v2 GPU planner: single-kernel scan + scatter, one workgroup per
   * Pippenger window. The MSM splits each scalar into
   * ceil(num_bits / c) windows; each window is an independent
   * bucket-method sub-problem of 2^(c-1) buckets. This kernel
   * dispatches one workgroup per window — workgroup w plans window w
   * via per-thread local scan + workgroup-wide Hillis-Steele scan +
   * per-thread scatter, with no cross-workgroup communication. One
   * window's 2^(c-1) buckets must fit one workgroup, so 2^(c-1) must
   * be a positive multiple of workgroup_size
   * (per_thread = 2^(c-1) / workgroup_size).
   */
  public gen_ba_planner_v2_bench_shader(
    workgroup_size: number,
    c: number,
    num_bits: number,
    s: number,
    pair_cap: number = 64,
    buckets_per_window_override?: number,
    self_pad = false,
  ): string {
    if (workgroup_size <= 0 || c <= 0 || num_bits <= 0 || s <= 0 || pair_cap <= 0 ||
        !Number.isInteger(workgroup_size) || !Number.isInteger(c) || !Number.isInteger(num_bits) ||
        !Number.isInteger(s) || !Number.isInteger(pair_cap)) {
      throw new Error(`gen_ba_planner_v2_bench_shader: positive integer args required`);
    }
    const buckets_per_window = buckets_per_window_override ?? 2 ** (c - 1);
    const num_windows = Math.ceil(num_bits / c);
    if (buckets_per_window % workgroup_size !== 0) {
      throw new Error(
        `gen_ba_planner_v2_bench_shader: buckets_per_window (2^(c-1)=${buckets_per_window}) ` +
          `must be a positive multiple of workgroup_size (${workgroup_size})`,
      );
    }
    const per_thread = buckets_per_window / workgroup_size;
    return mustache.render(
      ba_planner_v2_bench_shader,
      {
        workgroup_size,
        buckets_per_window,
        per_thread,
        num_windows,
        pair_cap,
        s,
        self_pad,
        num_words: this.num_words,
        recompile: this.recompile,
      },
      { structs },
    );
  }

  /**
   * GPU-side bin-packing planner for the v3 pipeline. One thread per
   * bucket; atomicAdd reserves global per-pair / per-carry / per-new-
   * slot offsets; the thread writes chunk_plan + scatter_plan +
   * carry_plan + new_counts + new_offsets for its bucket. Pair-count
   * loop bounded by compile-time `pair_cap` (defaults to 64 — covers
   * Poisson(λ=32) max-count without issue).
   */
  public gen_ba_planner_bench_shader(workgroup_size: number, s: number, pair_cap: number = 64): string {
    if (workgroup_size <= 0 || s <= 0 || pair_cap <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s) || !Number.isInteger(pair_cap)) {
      throw new Error(`gen_ba_planner_bench_shader: workgroup_size (${workgroup_size}), s (${s}), and pair_cap (${pair_cap}) must be positive integers`);
    }
    return mustache.render(
      ba_planner_bench_shader,
      { workgroup_size, s, pair_cap, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
  }

  /**
   * Bin-packed pair-tree: marshal kernel that gathers operands from a
   * generic active_sums buffer per chunk_plan. Works at any level
   * (L0 active_sums = bucket-sorted point pool, L1+ = previous
   * level's pair-sums + carries).
   */
  public gen_ba_marshal_pairs_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_marshal_pairs_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    return mustache.render(
      ba_marshal_pairs_bench_shader,
      { workgroup_size, s, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
  }

  /**
   * Bin-packed pair-tree: scatter kernel that places the disjoint
   * kernel's strided outputs at per-bucket destinations in
   * active_sums_new per scatter_plan.
   */
  public gen_ba_scatter_pairs_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_scatter_pairs_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    return mustache.render(
      ba_scatter_pairs_bench_shader,
      { workgroup_size, s, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
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
        workgroup_size, l0_index_mode,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
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
      throw new Error(`gen_ba_finalize_copy_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    // l0_index_mode pulls in the field stack to negate y while
    // materializing a level-0 (point index | sign) element from the pool.
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_finalize_copy_bench_shader,
      {
        workgroup_size, l0_index_mode,
        word_size: this.word_size, num_words: this.num_words, n0: this.n0,
        p_limbs: this.p_limbs, r_limbs: this.r_limbs, mask: this.mask,
        two_pow_word_size: this.two_pow_word_size, p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack, dec_pack: dec.pack, recompile: this.recompile,
      },
      { structs, bigint_funcs, montgomery_product_funcs: this.mont_product_src, field_funcs },
    );
  }

  /**
   * Reduction-stage init: repacks the bucket-accumulate output into the
   * reduction's STRIDE-column working buffer and seeds the present-mask.
   * Pure vec4 copy — no field arithmetic.
   */
  public gen_ba_reduce_init_bench_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_init_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    return mustache.render(ba_reduce_init_bench_shader, { workgroup_size, recompile: this.recompile }, {});
  }

  /**
   * Fused recursive affine bucket reduction — the whole 4-phase reduction
   * in a single dispatch, one workgroup per window, storageBarrier between
   * levels. Mirrors gen_ba_fused_super_bench_shader's partials; no per-pass s.
   */
  public gen_ba_reduce_fused_bench_shader(workgroup_size: number, variant: 'a' | 'loop' | 'pk' = 'pk'): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_ba_reduce_fused_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = variant === 'a' ? by_inverse_a_funcs : by_inverse_loop_funcs;
    const inv_fn = variant === 'pk' ? 'fr_inv_by_loop_pk' : variant === 'loop' ? 'fr_inv_by_loop' : 'fr_inv_by_a';
    return mustache.render(
      ba_reduce_fused_bench_shader,
      {
        workgroup_size, inv_fn,
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
        field_funcs, fr_pow_funcs, bigint_by_funcs, inverse_funcs,
      },
    );
  }

  /**
   * Tree variant of the disjoint pair-sum kernel: writes outputs in the
   * layout the next pair-tree level expects as input, so multi-level
   * reductions can chain without an intervening marshal pass. Per
   * thread: 2*S inputs -> S disjoint pair sums. Final-level flag (via
   * params.z) switches to a simple strided write for the last pass.
   */
  public gen_ba_pair_disjoint_tree_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_pair_disjoint_tree_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_pair_disjoint_tree_bench_shader,
      {
        workgroup_size,
        s,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
   * Level-0 marshal kernel for the bench-msm-tree pipeline: transposes
   * CSR-sorted point indices into the 2-plane strided SoA layout the
   * tree-disjoint kernel reads. Pure memory shuffle.
   */
  public gen_ba_marshal_tree_l0_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_marshal_tree_l0_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    return mustache.render(
      ba_marshal_tree_l0_bench_shader,
      { workgroup_size, s, num_words: this.num_words, recompile: this.recompile },
      { structs },
    );
  }

  /**
   * Tail kernel for the bench-msm-tree pipeline: one thread per small
   * bucket (count < 2*S), serial per-thread chain with one fr_inv_by_a
   * per add (no batched inversion). Bounded loop up to compile-time
   * TAIL_CAP = 2*S - 1.
   */
  public gen_ba_tail_reduce_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_tail_reduce_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    const tail_cap = 2 * s - 1;
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_tail_reduce_bench_shader,
      {
        workgroup_size,
        tail_cap,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
   * Standalone microbench for the disjoint pair-sum kernel: each
   * thread reduces 2*S input points to S disjoint pair sums R_k =
   * P_{2k} + P_{2k+1}, using one batched fr_inv_by_a per chunk of S.
   * Reclaims the 50% kernel-efficiency loss inherent in
   * ba_rev_packed_carry (which produces S overlapping pair sums of
   * which only S/2 are usable for pair-tree reduction).
   */
  public gen_ba_pair_disjoint_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_pair_disjoint_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_pair_disjoint_bench_shader,
      {
        workgroup_size,
        s,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
   * Standalone microbench for the recovered ba_rev_packed_carry kernel:
   * SoA-packed 8x u32 storage across 4 input planes (A.x, A.y, P.x, P.y),
   * strided per-thread access (e = t + i*T), forward prefix-product +
   * single fr_inv_by_a + backward peel with resident-accumulator
   * load-carry (A_{i+1} := P_i). The canonical kernel that hit ~22
   * ns/pair on M2 / Chrome 148.
   */
  public gen_ba_rev_packed_carry_bench_shader(workgroup_size: number, s: number): string {
    if (workgroup_size <= 0 || s <= 0 || !Number.isInteger(workgroup_size) || !Number.isInteger(s)) {
      throw new Error(`gen_ba_rev_packed_carry_bench_shader: workgroup_size (${workgroup_size}) and s (${s}) must be positive integers`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      ba_rev_packed_carry_bench_shader,
      {
        workgroup_size,
        s,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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

  public gen_batch_affine_init_shader(workgroup_size: number, packed = false): string {
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      batch_affine_init_shader,
      {
        workgroup_size,
        num_words: this.num_words,
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        recompile: this.recompile,
      },
      { structs },
    );
  }

  // `windows_per_batch` (WPB) is baked into the shader at render time —
  // dispatch_args derives `num_batches = ceil(num_subtasks / WPB)` and
  // uses it as the inverse-pass Z dispatch dim. Must match the WPB used
  // by the corresponding gen_batch_inverse_parallel_shader call.
  public gen_batch_affine_dispatch_args_shader(windows_per_batch: number): string {
    return mustache.render(batch_affine_dispatch_args_shader, { windows_per_batch }, {});
  }

  public gen_batch_affine_schedule_shader(workgroup_size: number, packed = false): string {
    const dec = this.decoupledPackUnpackWgsl();
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
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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

  // Fused batch-affine round kernel: ba_rev_packed_carry's
  // suffix-product / single fr_inv_by_a / lean-apply scheme applied
  // in-place to the cuZK Pippenger round, replacing the separate
  // batch_inverse_parallel + apply_scatter dispatches. Packed 8x u32
  // storage + decoupled (full-ILP) pack/unpack + Karat+Yuval montmul.
  public gen_batch_affine_fused_revcarry_shader(workgroup_size: number, schunk: number): string {
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      batch_affine_fused_revcarry_shader,
      {
        workgroup_size,
        schunk,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
   * Workgroup-scan fused batch-affine round kernel (v2). Mirrors the
   * `bench_batch_affine` design (TPB threads cooperating over a
   * BATCH_SIZE=TPB*BS pair slice with one fr_inv_by_a per workgroup)
   * but with bucket-indirect loads via pair_target_meta. Every
   * field-element variable is `PackedField`; no per-load unpack at
   * the kernel level.
   */
  public gen_batch_affine_fused_wg_scan_shader(tpb: number, bs: number): string {
    if (tpb <= 0 || bs <= 0 || !Number.isInteger(tpb) || !Number.isInteger(bs)) {
      throw new Error(`gen_batch_affine_fused_wg_scan_shader: tpb (${tpb}) and bs (${bs}) must be positive integers`);
    }
    if ((tpb & (tpb - 1)) !== 0) {
      throw new Error(`gen_batch_affine_fused_wg_scan_shader: tpb (${tpb}) must be a power of two (Hillis-Steele scan)`);
    }
    const batch_size = tpb * bs;
    const dec = this.decoupledPackUnpackWgsl();
    return mustache.render(
      batch_affine_fused_wg_scan_shader,
      {
        tpb,
        bs,
        batch_size,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
        packed_field_funcs,
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

  public gen_batch_affine_finalize_collect_shader(
    workgroup_size: number,
    num_csr_cols: number,
    packed = false,
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
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
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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

  public gen_batch_affine_finalize_apply_shader(
    workgroup_size: number,
    num_csr_cols: number,
    packed = false,
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
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
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
    // Packed 8×u32 storage for the bucket_sum_* (SMVP output) and
    // g_points_* (BPR output → horner input) field buffers. Off keeps
    // the byte-identical BigInt-layout baseline.
    packed = false,
  ) {
    const dec = this.decoupledPackUnpackWgsl();
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
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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

  public gen_horner_reduce_shader(
    num_subtasks: number,
    b_workgroup_size: number,
    chunk_size: number,
    packed = false,
  ): string {
    const dec = this.decoupledPackUnpackWgsl();
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
        packed,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
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
