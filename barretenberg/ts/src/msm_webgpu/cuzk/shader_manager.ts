import mustache from 'mustache';
import {
  barrett as barrett_funcs,
  ba_carry_copy_bench as ba_carry_copy_bench_shader,
  ba_finalize_copy_bench as ba_finalize_copy_bench_shader,
  ba_fused_super_bench as ba_fused_super_bench_shader,
  ba_reduce_init_bench as ba_reduce_init_bench_shader,
  ba_reduce_level_bench as ba_reduce_level_bench_shader,
  ba_planner_v2_offsets as ba_planner_v2_offsets_shader,
  ba_planner_v2_emit as ba_planner_v2_emit_shader,
  bigint as bigint_funcs,
  bigint_by as bigint_by_funcs,
  bigint_f32 as bigint_f32_funcs,
  bucket_histogram as bucket_histogram_shader,
  // Register-minimal BY safegcd inverse (BATCH=12 / NUM_OUTER=62, rolling
  // apply_matrix). Hosts BylMat, byl_divsteps, byl_apply_matrix, the
  // byl_reduce_to_canonical chain, and the fr_inv_by_loop driver.
  by_inverse_loop as by_inverse_loop_funcs,
  convert_points_only as convert_points_only_shader,
  csr_to_v2_active_sums as csr_to_v2_active_sums_shader,
  csr_to_v2_meta as csr_to_v2_meta_shader,
  decompose_scalars_booth as decompose_scalars_booth_shader,
  decompress_g1_bn254 as decompress_g1_bn254_shader,
  extract_word_from_bytes_le as extract_word_from_bytes_le_funcs,
  arithmetic_relation_test as arithmetic_relation_test_shader,
  delta_range_relation_test as delta_range_relation_test_shader,
  ecc_op_queue_relation_test as ecc_op_queue_relation_test_shader,
  poseidon2_initial_relation_test as poseidon2_initial_relation_test_shader,
  non_native_field_relation_test as non_native_field_relation_test_shader,
  elliptic_relation_test as elliptic_relation_test_shader,
  permutation_relation_test as permutation_relation_test_shader,
  logderiv_lookup_relation_test as logderiv_lookup_relation_test_shader,
  memory_relation_test as memory_relation_test_shader,
  poseidon2_external_relation_test as poseidon2_external_relation_test_shader,
  poseidon2_transition_entry_relation_test as poseidon2_transition_entry_relation_test_shader,
  poseidon2_quad_internal_terminal_relation_test as poseidon2_quad_internal_terminal_relation_test_shader,
  poseidon2_quad_internal_relation_test as poseidon2_quad_internal_relation_test_shader,
  databus_lookup_relation_test as databus_lookup_relation_test_shader,
  field as field_funcs,
  field8 as field8_funcs,
  fold_test as fold_test_shader,
  gate_separator_scan_test as gate_separator_scan_test_shader,
  gate_separator_gather_test as gate_separator_gather_test_shader,
  reduce_test as reduce_test_shader,
  batch_test as batch_test_shader,
  poseidon2_transcript_test as poseidon2_transcript_test_shader,
  poseidon2_transcript_par_test as poseidon2_transcript_par_test_shader,
  fr_ops_test as fr_ops_test_shader,
  fr_pow as fr_pow_funcs,
  lag as lag_funcs,
  mono as mono_funcs,
  mono_ops_test as mono_ops_test_shader,
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
import { poseidon2QuadConsts } from './poseidon2_quad_consts.js';

// Which of the curve's two prime fields the rendered shaders operate in.
// 'base' (default) is the coordinate field F_q used by all EC point math in
// the MSM pipeline. 'scalar' is F_r, used by the sumcheck Fr kernels — the
// only change is the modulus; every Montgomery/Barrett constant derives
// from it, so the same templates emit a correct, identically-structured Fr
// suite.
export type FieldChoice = 'base' | 'scalar';

/**
 * One gate relation fused into the `gen_gate_uber_shader` kernel. `standalone` is the
 * relation's rendered accumulate shader (its body is lifted verbatim); `entry` is its
 * `@compute` entry fn name (e.g. `arithmetic_main`). `numEdgesPrefix` is the gate's
 * column-offset (in entity columns) inside the concatenated `fused_col` buffer, and
 * `paramBase` is its Fr offset inside the concatenated `uber_param` buffer (ignored
 * unless `hasParam`). The gate's slot is its index in the array passed to the generator.
 */
export interface GateUberGate {
  id: string;
  entry: string;
  hasParam: boolean;
  numEdgesPrefix: number;
  paramBase: number;
  standalone: string;
}

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
  public curveConfig: CurveConfig;
  public field: FieldChoice;
  public recompile = '';

  constructor(
    chunk_size: number,
    input_size: number,
    curveConfig: CurveConfig = BN254_CURVE_CONFIG,
    force_recompile = false,
    field: FieldChoice = 'base',
  ) {
    this.curveConfig = curveConfig;
    this.field = field;
    this.p = field === 'scalar' ? curveConfig.scalarFieldModulus : curveConfig.baseFieldModulus;
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

  /**
   * Phase-0 standalone Fr (scalar-field) primitives test kernel. Assembles
   * the memory-aware field stack — 8x u32 packed live form, native add/sub,
   * grouped-Karatsuba Montgomery multiply, safegcd inverse — into one module
   * with five compute entry points (fr_add_main / fr_sub_main / fr_mul_main /
   * fr_neg_main / fr_inv_main), all sharing the (a_in, b_in, out_buf, params)
   * binding layout. Field elements are held in Montgomery form as 8 LE u32
   * each. Construct the manager with field='scalar' so the baked constants
   * are F_r; the host validates the GPU output against a CPU F_r reference.
   */
  public gen_fr_ops_test_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_fr_ops_test_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      fr_ops_test_shader,
      {
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
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
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field_funcs,
        field8_funcs,
        fr_pow_funcs,
      },
    );
  }

  /**
   * Phase-2 step-1 standalone test kernel for the short-monomial (Mono)
   * arithmetic the sumcheck relations are built from — the WGSL mirror of
   * UnivariateCoefficientBasis. Assembles structs/bigint/montgomery/field8/mono
   * into one module with one entry point per primitive (mul/sqr/add/sub/scalar/
   * neg/promote), each writing 7 Lagrange evaluations the host diffs against a
   * CPU polynomial reference. Construct with field='scalar' for F_r.
   */
  public gen_mono_ops_test_shader(workgroup_size: number): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_mono_ops_test_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      mono_ops_test_shader,
      {
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field8_funcs,
        mono_funcs,
      },
    );
  }

  /**
   * Phase-2 step-2 test kernel for the MegaFlavor ArithmeticRelation accumulate
   * (relations/ultra_arithmetic_relation.hpp). Assembles the Mono + Lagrange
   * stack and bakes the Montgomery-form constants the relation uses (FF(1/2/3)
   * and -1/2). One entry point `arithmetic_main`; one thread per edge writes the
   * 11-Fr per-edge contribution. Construct with field='scalar' for F_r.
   */
  public gen_arithmetic_relation_test_shader(workgroup_size: number, shared = false): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_arithmetic_relation_test_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    const words8 = (v: bigint): string => {
      const out: string[] = [];
      let x = v;
      for (let i = 0; i < 8; i++) {
        out.push(`${(Number(x & 0xffffffffn) >>> 0).toString()}u`);
        x >>= 32n;
      }
      return out.join(', ');
    };
    const toMont = (x: bigint): bigint => ((((x % this.p) + this.p) % this.p) * this.r) % this.p;
    return mustache.render(
      arithmetic_relation_test_shader,
      {
        shared,
        workgroup_size,
        p8_consts,
        r8_csv,
        f8_words,
        word_size: this.word_size,
        num_words: this.num_words,
        n0: this.n0,
        p_limbs: this.p_limbs,
        mask: this.mask,
        two_pow_word_size: this.two_pow_word_size,
        p_inv_mod_2w: this.p_inv_mod_2w,
        dec_unpack: dec.unpack,
        dec_pack: dec.pack,
        c1_csv: words8(toMont(1n)),
        c2_csv: words8(toMont(2n)),
        c3_csv: words8(toMont(3n)),
        neg_half_csv: words8(toMont((this.p - 1n) / 2n)),
      },
      {
        structs,
        bigint_funcs,
        montgomery_product_funcs: this.mont_product_src,
        field8_funcs,
        mono_funcs,
        lag_funcs,
      },
    );
  }

  /**
   * Sumcheck fold (partially_evaluate) test kernel (sumcheck/sumcheck.hpp:670).
   * Halves every polynomial column by dest[k] = src[2k] + u*(src[2k+1]-src[2k]).
   * One thread per output element.
   */
  public gen_fold_test_shader(workgroup_size: number): string {
    return mustache.render(fold_test_shader, this.relationView(workgroup_size), this.relationPartials);
  }

  /**
   * Gate-separator beta_products scan: builds the length-2^d Montgomery
   * beta_products table on the GPU via d doubling passes (one Montgomery multiply
   * per new entry), replacing the host's O(n log n) computeBetaProducts. One thread
   * per upper-half entry; the host runs the d passes as ordered dispatches.
   */
  public gen_gate_separator_scan_test_shader(workgroup_size: number): string {
    return mustache.render(gate_separator_scan_test_shader, this.relationView(workgroup_size), this.relationPartials);
  }

  /**
   * Gate-separator per-round edge-scaling gather: copies the strided slice
   * beta_products[p * periodicity] out of the resident Montgomery table into the
   * contiguous per-pair scaling buffer the relation accumulate kernels read. One
   * thread per pair; a plain 8x u32 copy (no field arithmetic, no partials).
   */
  public gen_gate_separator_gather_test_shader(workgroup_size: number): string {
    return mustache.render(gate_separator_gather_test_shader, this.relationView(workgroup_size), {});
  }

  /**
   * Edge-reduction kernel for the sumcheck accumulate: sums a relation's per-edge
   * output (num_edges x out_len Fr) over edges into G workgroup partials on the
   * GPU, so only the partials are read back. workgroup_size must be >= the largest
   * relation out_len (90).
   */
  public gen_reduce_test_shader(workgroup_size: number): string {
    return mustache.render(reduce_test_shader, this.relationView(workgroup_size), this.relationPartials);
  }

  /**
   * GPU batch_over_relations: reduces the flat 345-Fr accumulator to the length-8
   * round univariate via two precomputed matrices (li/ld) + the pow univariate, so
   * the round univariate is formed on-GPU (one thread per eval point). Mirrors
   * batch_tail.ts; see batch_test.template.wgsl.
   */
  public gen_batch_test_shader(workgroup_size: number): string {
    return mustache.render(batch_test_shader, this.relationView(workgroup_size), this.relationPartials);
  }

  /**
   * GPU Fiat-Shamir transcript: Poseidon2 hash of [running, round univariate] -> the
   * round challenge u_i, plus the gate-separator c_i update. Mirrors crypto/poseidon2;
   * see poseidon2_transcript_test.template.wgsl. workgroup_size is ignored (1 thread).
   */
  public gen_poseidon2_transcript_test_shader(workgroup_size: number): string {
    return mustache.render(poseidon2_transcript_test_shader, this.relationView(workgroup_size), this.relationPartials);
  }

  /**
   * Lane-parallel GPU Fiat-Shamir transcript: same Poseidon2 hash + gate-separator
   * c_i update as gen_poseidon2_transcript_test_shader, but the t=4 state is spread
   * one lane per thread (@workgroup_size(4), fixed). Cuts the formerly serial
   * (@workgroup_size(1)) transcript, the largest single-submission GPU cost. The
   * workgroup_size argument is ignored (the kernel hardcodes 4 = state size).
   * See poseidon2_transcript_par_test.template.wgsl.
   */
  public gen_poseidon2_transcript_par_test_shader(workgroup_size: number): string {
    return mustache.render(poseidon2_transcript_par_test_shader, this.relationView(workgroup_size), this.relationPartials);
  }

  /**
   * Common Mustache view shared by every relation-accumulate test shader. `shared`
   * (default false) toggles the shared resident-column path: when true the accumulate
   * kernel gathers each entity through an `entity_map` binding into one set of
   * NUM_GLOBAL_ENTITIES columns instead of its own contiguous per-relation columns
   * (descriptors.ts globalEntityIndices). false renders byte-identically to the
   * per-relation kernel the standalone suites use.
   */
  private relationView(workgroup_size: number, shared = false): Record<string, unknown> {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`relation shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return {
      shared,
      workgroup_size,
      p8_consts,
      r8_csv,
      f8_words,
      word_size: this.word_size,
      num_words: this.num_words,
      n0: this.n0,
      p_limbs: this.p_limbs,
      mask: this.mask,
      two_pow_word_size: this.two_pow_word_size,
      p_inv_mod_2w: this.p_inv_mod_2w,
      dec_unpack: dec.unpack,
      dec_pack: dec.pack,
    };
  }

  /** Mono + Lagrange partial set shared by every relation-accumulate shader. */
  private get relationPartials(): Record<string, string> {
    return {
      structs,
      bigint_funcs,
      montgomery_product_funcs: this.mont_product_src,
      field8_funcs,
      mono_funcs,
      lag_funcs,
    };
  }

  /** A field constant in Montgomery form, as a CSV of 8 little-endian u32 words. */
  private montWords8(x: bigint): string {
    let v = (((x % this.p) + this.p) % this.p) * this.r % this.p;
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      out.push(`${(Number(v & 0xffffffffn) >>> 0).toString()}u`);
      v >>= 32n;
    }
    return out.join(', ');
  }

  /**
   * DeltaRangeConstraintRelation accumulate test kernel
   * (relations/delta_range_constraint_relation.hpp). Four length-6 subrelations;
   * bakes FF(2)/FF(3). One thread per edge writes the 24-Fr contribution.
   */
  public gen_delta_range_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      delta_range_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), c2_csv: this.montWords8(2n), c3_csv: this.montWords8(3n) },
      this.relationPartials,
    );
  }

  /**
   * EccOpQueueRelation accumulate test kernel
   * (relations/ecc_op_queue_relation.hpp). Eight length-3 subrelations; no field
   * constants. One thread per edge writes the 24-Fr contribution.
   */
  public gen_ecc_op_queue_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(ecc_op_queue_relation_test_shader, this.relationView(workgroup_size, shared), this.relationPartials);
  }

  /**
   * Poseidon2InitialExternalRelation accumulate test kernel
   * (relations/poseidon2_initial_external_relation.hpp). Four length-3
   * subrelations; the external matrix is applied by repeated addition (no field
   * constants). One thread per edge writes the 12-Fr contribution.
   */
  public gen_poseidon2_initial_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      poseidon2_initial_relation_test_shader,
      this.relationView(workgroup_size, shared),
      this.relationPartials,
    );
  }

  /**
   * NonNativeFieldRelation accumulate test kernel
   * (relations/non_native_field_relation.hpp). One length-6 subrelation; bakes
   * 2^68 and 2^14. One thread per edge writes the 6-Fr contribution.
   */
  public gen_non_native_field_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      non_native_field_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), limb_size_csv: this.montWords8(1n << 68n), sublimb_csv: this.montWords8(1n << 14n) },
      this.relationPartials,
    );
  }

  /**
   * EllipticRelation accumulate test kernel (relations/elliptic_relation.hpp).
   * Two length-6 subrelations (x/y coordinate, add + double branches); bakes the
   * Grumpkin curve constant b = -17. One thread per edge writes the 12-Fr
   * contribution.
   */
  public gen_elliptic_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      elliptic_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), curve_b_csv: this.montWords8(-17n) },
      this.relationPartials,
    );
  }

  /**
   * UltraPermutationRelation accumulate test kernel
   * (relations/permutation_relation.hpp). Subrelations 6/3/3; no baked constants
   * (beta/gamma/public_input_delta arrive at runtime via the binding(3) params
   * buffer). One thread per edge writes the 12-Fr contribution.
   */
  public gen_permutation_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(permutation_relation_test_shader, this.relationView(workgroup_size, shared), this.relationPartials);
  }

  /**
   * LogDerivLookupRelation accumulate test kernel
   * (relations/logderiv_lookup_relation.hpp). Subrelations 5/5/3; subrelation 1
   * is linearly dependent (no scaling factor). Params [gamma, beta, beta_sqr,
   * beta_cube] at binding(3). One thread per edge writes the 13-Fr contribution.
   */
  public gen_logderiv_lookup_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(logderiv_lookup_relation_test_shader, this.relationView(workgroup_size, shared), this.relationPartials);
  }

  /**
   * MemoryRelation accumulate test kernel (relations/memory_relation.hpp). Six
   * length-6 subrelations (RAM/ROM memory identity + ROM/RAM consistency checks);
   * bakes FF(1). Params [eta, eta_two, eta_three] at binding(3). One thread per
   * edge writes the 36-Fr contribution.
   */
  public gen_memory_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      memory_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), one_csv: this.montWords8(1n) },
      this.relationPartials,
    );
  }

  /**
   * Poseidon2ExternalRelation accumulate test kernel
   * (relations/poseidon2_external_relation.hpp). Four length-7 subrelations;
   * round constants are columns (no baked constants, no params buffer). One
   * thread per edge writes the 28-Fr contribution.
   */
  public gen_poseidon2_external_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      poseidon2_external_relation_test_shader,
      this.relationView(workgroup_size, shared),
      this.relationPartials,
    );
  }

  /** WGSL `const NAME: array<u32,8> = array<u32,8>(...);` block for baked Fr constants. */
  private quadConstsBlock(consts: Record<string, bigint>): string {
    return Object.entries(consts)
      .map(([name, val]) => `const ${name}: array<u32, 8> = array<u32, 8>(${this.montWords8(val)});`)
      .join('\n');
  }

  /**
   * Poseidon2TransitionEntryRelation accumulate test kernel
   * (relations/poseidon2_transition_entry_relation.hpp). Three length-7
   * subrelations; bakes the derived D1/A_one/A2_one/(Σ+6) quad constants. One
   * thread per edge writes the 21-Fr contribution.
   */
  public gen_poseidon2_transition_entry_relation_test_shader(workgroup_size: number, shared = false): string {
    const c = poseidon2QuadConsts(this.p);
    const consts = {
      TE_D1: c.D1,
      TE_THREE: 3n,
      TE_A1_0: c.A_one[0], TE_A1_1: c.A_one[1], TE_A1_2: c.A_one[2],
      TE_A2_0: c.A2_one[0], TE_A2_1: c.A2_one[1], TE_A2_2: c.A2_one[2],
      TE_SUMA: c.sum_A_one,
    };
    return mustache.render(
      poseidon2_transition_entry_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), quad_consts: this.quadConstsBlock(consts) },
      this.relationPartials,
    );
  }

  /**
   * Poseidon2QuadInternalTerminalRelation accumulate test kernel. Four length-7
   * subrelations; bakes the full 4x7 closed_form table (CF_{j}_{i}). One thread
   * per edge writes the 28-Fr contribution.
   */
  public gen_poseidon2_quad_internal_terminal_relation_test_shader(workgroup_size: number, shared = false): string {
    const c = poseidon2QuadConsts(this.p);
    const consts: Record<string, bigint> = {};
    for (let j = 0; j < 4; j++) for (let i = 0; i < 7; i++) consts[`CF_${j}_${i}`] = c.closed_form[j][i];
    return mustache.render(
      poseidon2_quad_internal_terminal_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), quad_consts: this.quadConstsBlock(consts) },
      this.relationPartials,
    );
  }

  /**
   * Poseidon2QuadInternalRelation accumulate test kernel. Four length-7
   * subrelations; bakes closed_form[0] (CF_0_*), forward_vandermonde_lhs
   * (FV_{k}_*) and the scalar quad constants. One thread per edge writes the
   * 28-Fr contribution.
   */
  public gen_poseidon2_quad_internal_relation_test_shader(workgroup_size: number, shared = false): string {
    const c = poseidon2QuadConsts(this.p);
    const consts: Record<string, bigint> = {
      QI_D1: c.D1,
      QI_SIGMA_PLUS_2: c.SIGMA_PLUS_2,
      QI_B3_U0: c.B3_U0_COEF,
      QI_D1M3: c.D1_MINUS_3,
      QI_THREE: 3n,
    };
    for (let i = 0; i < 7; i++) consts[`CF_0_${i}`] = c.closed_form[0][i];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 7; i++) consts[`FV_${k}_${i}`] = c.forward_vandermonde_lhs[k][i];
    return mustache.render(
      poseidon2_quad_internal_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), quad_consts: this.quadConstsBlock(consts) },
      this.relationPartials,
    );
  }

  /**
   * Fused multi-relation "gate uber" accumulate kernel: evaluate N gate relations
   * (each active on its own contiguous edge-pair band) in ONE dispatch, restoring
   * GPU occupancy that the tiny per-relation band dispatches waste on a sparse
   * (realistic) trace. The 6 shared partials are emitted ONCE; each gate's body is
   * lifted verbatim from its standalone accumulate shader (so the per-edge arithmetic
   * is byte-identical to the standalone golden), with every symbol it declares
   * namespaced `${id}_…` and only its I/O retargeted: reads gather from a single
   * concatenated column buffer at the gate's `numEdgesPrefix`, writes land COMPACTED
   * in the gate's perEdge sub-region (so the existing reduce is reused unchanged), and
   * params read a concatenated param buffer at the gate's `paramBase`. One thread per
   * active pair across all gates; a per-thread prefix-sum search over the round's
   * `cum_bound` picks the gate slot and the pair index `g = band_start[s] + offset`.
   *
   * Bit-identity: each thread runs exactly the standalone body for pair `g` of its
   * gate, so summing each gate's compacted output over its band yields the same
   * finalParts as the per-relation path (validated by suite_rounds skip-on==skip-off
   * on REALISTIC_BAND, plus a structural body-equivalence check in the dev harness).
   */
  public gen_gate_uber_shader(workgroup_size: number, gates: GateUberGate[], direct = false): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(`gen_gate_uber_shader: workgroup_size (${workgroup_size}) must be a positive integer`);
    }
    if (gates.length === 0) throw new Error('gen_gate_uber_shader: no gates');
    const PSTART = 'struct Point {';
    const fromPartials = (code: string): string => code.slice(code.indexOf(PSTART));
    const lcp = (a: string, b: string): string => {
      let i = 0; const n = Math.min(a.length, b.length);
      while (i < n && a[i] === b[i]) i++;
      return a.slice(0, i);
    };
    // The shared partials are the longest common prefix (from `struct Point {`) of two
    // maximally-divergent relation shaders: arithmetic bakes consts immediately after
    // the partials, ecc_op_queue goes straight to `struct Params` — so their first
    // post-partials byte differs and the LCP is exactly the partials.
    let partials = lcp(
      fromPartials(this.gen_arithmetic_relation_test_shader(workgroup_size)),
      fromPartials(this.gen_ecc_op_queue_relation_test_shader(workgroup_size)),
    );
    partials = partials.slice(0, partials.lastIndexOf('\n') + 1);
    if (partials.includes('struct Params {')) {
      throw new Error('gen_gate_uber_shader: partials boundary over-ran into relation code');
    }

    const declaredSymbols = (rel: string): string[] => {
      const names = new Set<string>();
      for (const re of [/^const\s+([A-Za-z_][A-Za-z0-9_]*)/gm, /^fn\s+([A-Za-z_][A-Za-z0-9_]*)/gm, /^struct\s+([A-Za-z_][A-Za-z0-9_]*)/gm]) {
        for (const m of rel.matchAll(re)) names.add(m[1]);
      }
      return [...names].filter(s => s !== 'Params').sort((a, b) => b.length - a.length);
    };

    const fragments = gates.map((gate, slot) => {
      const body = fromPartials(gate.standalone);
      let rel = body.slice(partials.length);
      // Drop the per-relation Params struct + binding declarations (the uber owns its own).
      rel = rel.replace(/struct Params \{\n  n: u32,\n\}\n/, '');
      rel = rel.replace(/@group\(0\) @binding\(\d+\) var<[^;]+;[^\n]*\n/g, '');
      // Namespace every symbol this relation declares (whole-word; longest-first so a
      // name that prefixes another can't partial-match). Renames declarations AND call
      // sites uniformly; shared-partial names (Mono/Lag/mono_*/fr_*) are never declared
      // here so they are untouched.
      for (const s of declaredSymbols(rel)) rel = rel.replace(new RegExp(`\\b${s}\\b`, 'g'), `${gate.id}_${s}`);
      // Retarget reads. 'direct' binds each gate's own resident col_buf (no concat, no
      // per-round copy) — the gate reads gcol_${id} at the unchanged stride. 'concat'
      // gathers from one shared buffer at this gate's numEdges prefix (needs a copy but
      // only one storage binding). Both keep the column-major stride-2 access verbatim.
      if (direct) {
        rel = rel.replace(/col_buf\[base/g, `gcol_${gate.id}[base`);
      } else {
        rel = rel.replace(
          'let base = ((j >> 1u) * col_len + 2u * row + (j & 1u)) * 8u;',
          `let base = ((${gate.numEdgesPrefix}u + (j >> 1u)) * col_len + 2u * row + (j & 1u)) * 8u;`,
        );
        rel = rel.replace(/col_buf\[base/g, 'fused_col[base');
      }
      // Retarget writes to a COMPACTED perEdge slot at the gate's band base. The body
      // calls write_eval with the pair index `g` (row := g below); localRow = g - band_start.
      const weRe = new RegExp(`fn ${gate.id}_write_eval\\(row: u32, k: u32, v: array<u32, 8>\\) \\{[\\s\\S]*?\\n\\}`);
      rel = rel.replace(weRe,
        `fn ${gate.id}_write_eval(row: u32, k: u32, v: array<u32, 8>) {\n` +
        `  let lr = row - band_start[${slot}u];\n` +
        `  let base = (pe_base[${slot}u] + lr * ${gate.id}_OUT_LEN + k) * 8u;\n` +
        `  for (var uw: u32 = 0u; uw < 8u; uw = uw + 1u) { perEdge[base + uw] = v[uw]; }\n}`);
      // Retarget params (param-bearing gates) to the concatenated uber param buffer.
      if (gate.hasParam) {
        rel = rel.replace('let base = j * 8u;', `let base = (${gate.paramBase}u + j) * 8u;`);
        rel = rel.replace(/param_buf\[base/g, 'uber_param[base');
      }
      // Convert the @compute entry into fn ${id}_body(g): row := g so reads use g,
      // write_eval recovers the compacted localRow from g internally.
      const entryRe = new RegExp(
        `@compute @workgroup_size\\(${workgroup_size}\\)\\nfn ${gate.id}_${gate.entry}\\(@builtin\\(global_invocation_id\\) gid: vec3<u32>\\) \\{\\n  let row = gid\\.x;\\n  if \\(row >= params\\.n\\) \\{ return; \\}`);
      rel = rel.replace(entryRe, `fn ${gate.id}_body(g: u32) {\n  let row = g;`);
      return rel;
    });

    const n = gates.length;
    const switchArms = gates.map((g, s) => `    case ${s}u: { ${g.id}_body(g); }`).join('\n');
    // Binding layout. 'direct': one resident col_buf per gate at bindings 0..N-1, then
    // the shared bindings shifted after. 'concat': a single fused_col at binding 0.
    let b = 0;
    const bindings = direct
      ? gates.map(g => `@group(0) @binding(${b++}) var<storage, read> gcol_${g.id}: array<u32>;`).join('\n') + '\n' +
        `@group(0) @binding(${b++}) var<storage, read_write> perEdge: array<u32>;\n` +
        `@group(0) @binding(${b++}) var<uniform> params: Params;\n` +
        `@group(0) @binding(${b++}) var<storage, read> scaling: array<u32>;\n` +
        `@group(0) @binding(${b++}) var<storage, read> uber_param: array<u32>;\n` +
        `@group(0) @binding(${b++}) var<storage, read> cum_bound: array<u32>;\n` +
        `@group(0) @binding(${b++}) var<storage, read> band_start: array<u32>;\n` +
        `@group(0) @binding(${b++}) var<storage, read> pe_base: array<u32>;`
      : '@group(0) @binding(0) var<storage, read> fused_col: array<u32>;\n' +
        '@group(0) @binding(1) var<storage, read_write> perEdge: array<u32>;\n' +
        '@group(0) @binding(2) var<uniform> params: Params;\n' +
        '@group(0) @binding(3) var<storage, read> scaling: array<u32>;\n' +
        '@group(0) @binding(4) var<storage, read> uber_param: array<u32>;\n' +
        '@group(0) @binding(5) var<storage, read> cum_bound: array<u32>;\n' +
        '@group(0) @binding(6) var<storage, read> band_start: array<u32>;\n' +
        '@group(0) @binding(7) var<storage, read> pe_base: array<u32>;';
    return (
      `${partials}\n` +
      'struct Params {\n  n: u32,\n  gate_total: u32,\n}\n\n' +
      `${bindings}\n\n` +
      `${fragments.join('\n\n')}\n\n` +
      `@compute @workgroup_size(${workgroup_size})\n` +
      'fn gate_uber_main(@builtin(global_invocation_id) gid: vec3<u32>) {\n' +
      '  let t = gid.x;\n' +
      '  if (t >= params.gate_total) { return; }\n' +
      '  var s: u32 = 0u;\n' +
      '  loop {\n' +
      `    if (s + 1u >= ${n}u) { break; }\n` +
      '    if (t < cum_bound[s + 1u]) { break; }\n' +
      '    s = s + 1u;\n' +
      '  }\n' +
      '  let g = band_start[s] + (t - cum_bound[s]);\n' +
      '  switch (s) {\n' +
      `${switchArms}\n` +
      '    default: {}\n' +
      '  }\n' +
      '}\n'
    );
  }

  /**
   * DatabusLookupRelation accumulate test kernel
   * (relations/databus_lookup_relation.hpp). Five bus columns x three length-6
   * subrelations (90 Fr); the per-bus lookup subrelation (2) is linearly
   * dependent (no scaling). Bakes FF(1); params [beta, gamma] at binding(3). One
   * thread per edge writes the 90-Fr contribution.
   */
  public gen_databus_lookup_relation_test_shader(workgroup_size: number, shared = false): string {
    return mustache.render(
      databus_lookup_relation_test_shader,
      { ...this.relationView(workgroup_size, shared), one_csv: this.montWords8(1n) },
      this.relationPartials,
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

  /**
   * `windows_per_msm` is the per-MSM W = ceil(NUMBITS / c). For single-MSM
   * runs (B=1) the host passes `numWindows` here; the shader's virtual-
   * window split (`gid.y → (b, w)`) then has `b == 0` always and the math
   * is byte-identical to the pre-Tier-2 single-MSM path. For batch runs
   * (B>1) the host passes the per-MSM W and dispatches with grid
   * `(n, B*W)`; each gid.y splits into `(b, w)` and the thread reads
   * scalar `b * input_size + p`.
   */
  public gen_decompose_scalars_booth_shader(workgroup_size: number, windows_per_msm: number): string {
    if (!Number.isInteger(windows_per_msm) || windows_per_msm <= 0) {
      throw new Error(
        `gen_decompose_scalars_booth_shader: windows_per_msm (${windows_per_msm}) must be a positive integer`,
      );
    }
    return mustache.render(
      decompose_scalars_booth_shader,
      { workgroup_size, windows_per_msm, recompile: this.recompile },
      {},
    );
  }

  /**
   * Per-bucket histogram of Booth-recoded scalars. Used at MsmV2.prepare
   * time to obtain the level-0 counts without paying the 250 ms host
   * Booth-decode walk at n=2^20. `buckets_per_window` is the host-side
   * `m.BW` so the shader can index `counts[y_eff * BW + bucket]` without
   * an extra uniform slot. `windows_per_msm` is the per-MSM W — see the
   * `gen_decompose_scalars_booth_shader` note for the virtual-window
   * split semantics.
   */
  public gen_bucket_histogram_shader(
    workgroup_size: number,
    buckets_per_window: number,
    windows_per_msm: number,
  ): string {
    if (!Number.isInteger(buckets_per_window) || buckets_per_window <= 0) {
      throw new Error(
        `gen_bucket_histogram_shader: buckets_per_window (${buckets_per_window}) must be a positive integer`,
      );
    }
    if (!Number.isInteger(windows_per_msm) || windows_per_msm <= 0) {
      throw new Error(`gen_bucket_histogram_shader: windows_per_msm (${windows_per_msm}) must be a positive integer`);
    }
    return mustache.render(
      bucket_histogram_shader,
      { workgroup_size, buckets_per_window, windows_per_msm, recompile: this.recompile },
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
   * Fused super-kernel for the v3 pipeline: combines marshal + disjoint
   * + scatter into one kernel. Per chunk-thread: reads chunk_plan +
   * scatter_plan, gathers from active_sums_old, computes batched-
   * inverse pair sums in registers, writes directly to active_sums_new.
   * Carry is a separate kernel.
   */
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
    const inverse_funcs = by_inverse_loop_funcs;
    const inv_fn = variant === 'pk' ? 'fr_inv_by_loop_pk' : 'fr_inv_by_loop';
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
        field8_funcs,
        fr_pow_funcs,
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
  /**
   * `num_windows` is the TOTAL dispatch-grid window count baked into the
   * planner's `NUM_WINDOWS` compile-time constant and consumed both as the
   * workgroup-id bound (`if (w >= NUM_WINDOWS) return;`) and as the
   * plan_meta stride (`d = 3 * NUM_WINDOWS`). For single-MSM (B=1) this
   * equals `ceil(NUMBITS / c)`; for Tier 2 batch mode it equals
   * `B * ceil(NUMBITS / c)` — the virtual-window total the dispatch is
   * sized for. Pre-Tier-2 callers passed `num_bits` instead and the gen
   * function derived num_windows; that overloaded the parameter and made
   * batch mode silently cap at the per-MSM W. Take num_windows directly
   * now.
   */
  public gen_ba_planner_v2_offsets_shader(
    workgroup_size: number,
    c: number,
    num_windows: number,
    buckets_per_window_override?: number,
  ): string {
    if (
      workgroup_size <= 0 ||
      c <= 0 ||
      num_windows <= 0 ||
      !Number.isInteger(workgroup_size) ||
      !Number.isInteger(c) ||
      !Number.isInteger(num_windows)
    ) {
      throw new Error(`gen_ba_planner_v2_offsets_shader: positive integer args required`);
    }
    const buckets_per_window = buckets_per_window_override ?? 2 ** (c - 1);
    if (buckets_per_window % workgroup_size !== 0) {
      throw new Error(
        `gen_ba_planner_v2_offsets_shader: buckets_per_window (${buckets_per_window}) ` +
          `must be a positive multiple of workgroup_size (${workgroup_size})`,
      );
    }
    const per_thread = buckets_per_window / workgroup_size;
    return mustache.render(ba_planner_v2_offsets_shader, {
      workgroup_size,
      buckets_per_window,
      per_thread,
      num_windows,
      recompile: this.recompile,
    });
  }

  /**
   * Planner pass B: parallel plan emit. Dispatch (ceil(BW/wg), numWindows) —
   * one workgroup per (bucket-group, window). Emits the chunk / scatter /
   * carry plans from pass A's offsets, then cooperatively self-pads.
   */
  /** `num_windows` is the TOTAL dispatch-grid window count — see the doc
   *  on `gen_ba_planner_v2_offsets_shader` for the single-MSM vs Tier 2
   *  batch interpretation. */
  public gen_ba_planner_v2_emit_shader(
    workgroup_size: number,
    c: number,
    num_windows: number,
    s: number,
    pair_cap: number,
    buckets_per_window_override?: number,
  ): string {
    if (
      workgroup_size <= 0 ||
      c <= 0 ||
      num_windows <= 0 ||
      s <= 0 ||
      pair_cap <= 0 ||
      !Number.isInteger(workgroup_size) ||
      !Number.isInteger(c) ||
      !Number.isInteger(num_windows) ||
      !Number.isInteger(s) ||
      !Number.isInteger(pair_cap)
    ) {
      throw new Error(`gen_ba_planner_v2_emit_shader: positive integer args required`);
    }
    const buckets_per_window = buckets_per_window_override ?? 2 ** (c - 1);
    if (buckets_per_window % workgroup_size !== 0) {
      throw new Error(
        `gen_ba_planner_v2_emit_shader: buckets_per_window (${buckets_per_window}) ` +
          `must be a positive multiple of workgroup_size (${workgroup_size})`,
      );
    }
    const num_groups = buckets_per_window / workgroup_size;
    return mustache.render(ba_planner_v2_emit_shader, {
      workgroup_size,
      buckets_per_window,
      num_windows,
      num_groups,
      pair_cap,
      s,
      recompile: this.recompile,
    });
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
   * One level of the recursive affine bucket reduction. `kind` (0 = phase-A
   * suffix add, 1 = phase-B/D tree-add, 2 = phase-C double) is baked in as
   * a compile-time constant so each variant const-folds away the other
   * kinds' branches. The host dispatches the kind-matching variant once
   * per schedule level — branchless, watchdog-bounded, register-light.
   */
  public gen_ba_reduce_level_bench_shader(
    workgroup_size: number,
    kind: number,
    variant: 'loop' | 'pk' = 'pk',
    addsub: 'native' | 'unpack' = 'native',
  ): string {
    if (workgroup_size <= 0 || !Number.isInteger(workgroup_size)) {
      throw new Error(
        `gen_ba_reduce_level_bench_shader: workgroup_size (${workgroup_size}) must be a positive integer`,
      );
    }
    if (kind !== 0 && kind !== 1 && kind !== 2) {
      throw new Error(`gen_ba_reduce_level_bench_shader: kind (${kind}) must be 0, 1 or 2`);
    }
    const dec = this.decoupledPackUnpackWgsl();
    const inverse_funcs = by_inverse_loop_funcs;
    const inv_fn = variant === 'pk' ? 'fr_inv_by_loop_pk' : 'fr_inv_by_loop';
    const { p8_consts, r8_csv, f8_words } = this.f8Context();
    return mustache.render(
      ba_reduce_level_bench_shader,
      {
        workgroup_size,
        kind,
        inv_fn,
        kind0: kind === 0,
        kind1: kind === 1,
        kind2: kind === 2,
        addsub_unpack: addsub === 'unpack',
        p8_consts,
        r8_csv,
        f8_words,
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
        field8_funcs,
        fr_pow_funcs,
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

    // ── Square multiply body (montgomery_square) ───────────────────────
    // Same Karatsuba split / inner combine (pExpr) / outer combine (folds)
    // as the product above, but every 5×5 schoolbook is a SQUARE: a 5-limb
    // square is 5 diagonal a_i² + 10 off-diagonal a_i·a_j-once-doubled = 15
    // unique products (vs 25), cutting the multiply phase ~225→135 limb-muls.
    // The Yuval reduce / final drain / extract / conditional_reduce are reused
    // verbatim (they act on the 40-limb t regardless of how it was formed).
    //
    // Carry-safe doubling: each column sums its off-diagonal products FIRST,
    // then `<< 1u`, then adds the diagonal term — never a per-term 2u·a_i·a_j.
    // The off-diagonal sum stays < 2^32 (worst slot ≈ 2.15e9, its double
    // ≈ 4.29e9 < 2^32 by ~1e6), every directly-used column fits u32, and the
    // only wrap is the cr half-product's C-square slot 4 (80·W²), unwound by
    // the `c - ll - hh` subtraction exactly as in the product — so the square
    // needs the SAME zero drains. Proven equal to montgomery_product(a,a)
    // (byte-identical limbs) in scripts/montgomery_square_check.mjs.
    const sqCol = (ap: string): string[] => [
      `${ap}0 * ${ap}0`,
      `(${ap}0 * ${ap}1) << 1u`,
      `((${ap}0 * ${ap}2) << 1u) + ${ap}1 * ${ap}1`,
      `(${ap}0 * ${ap}3 + ${ap}1 * ${ap}2) << 1u`,
      `((${ap}0 * ${ap}4 + ${ap}1 * ${ap}3) << 1u) + ${ap}2 * ${ap}2`,
      `(${ap}1 * ${ap}4 + ${ap}2 * ${ap}3) << 1u`,
      `((${ap}2 * ${ap}4) << 1u) + ${ap}3 * ${ap}3`,
      `(${ap}3 * ${ap}4) << 1u`,
      `${ap}4 * ${ap}4`,
    ];
    const sb: string[] = [];
    for (let s = 0; s < 2 * N; s++) sb.push(`    var t${s}: u32 = 0u;`);
    for (const g of kgroups) {
      sb.push('');
      sb.push(`    {   // ===== half-product ${g.tag} (square) =====`);
      const emitSq = (out: string, ap: string, bases: number[]): void => {
        for (let k = 0; k < 5; k++) {
          sb.push(`        let ${ap}${k}: u32 = ${chunkSum(xlimb, bases, k)};`);
        }
        const cols = sqCol(ap);
        for (let m = 0; m < 9; m++) sb.push(`        let ${out}${m}: u32 = ${cols[m]};`);
      };
      emitSq('ll', `a${g.tag}l`, g.llB);
      emitSq('hh', `a${g.tag}h`, g.hhB);
      emitSq('c', `a${g.tag}c`, g.cB);
      for (let k = 0; k < 19; k++) {
        const folds = g.folds.map(f => `t${k + f.off} = t${k + f.off} ${f.sign} p;`).join(' ');
        sb.push(`        { let p: u32 = ${pExpr(k)}; ${folds} }`);
      }
      sb.push('    }');
    }
    const square_multiply_body = sb.join('\n');

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
      square_multiply_body,
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
