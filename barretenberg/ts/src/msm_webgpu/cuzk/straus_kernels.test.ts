import { BN254_BASE_FIELD } from "./bn254.js";
import { BN254_CURVE_CONFIG } from "./curve_config.js";
import { ShaderManager } from "./shader_manager.js";
import { fqCubeRootOfUnityMont } from "./straus_constants.js";
import { StrausKernels } from "./straus_kernels.js";

describe("StrausKernels: lookup-precompute renderer", () => {
  function makeSm(): ShaderManager {
    return new ShaderManager(15, 256, BN254_CURVE_CONFIG, false);
  }

  it("emits a non-empty WGSL source", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 64, 64);
    expect(src.length).toBeGreaterThan(500);
  });

  it("interpolates the compile-time N constant", () => {
    const sm = makeSm();
    for (const n of [1, 64, 256, 4096]) {
      const src = StrausKernels.renderLookupPrecompute(sm, n, 64);
      expect(src).toMatch(new RegExp(`const N: u32 = ${n}u;`));
    }
  });

  it("interpolates the requested workgroup_size", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 64, 32);
    expect(src).toMatch(/@workgroup_size\(32\)/);
  });

  it("includes the BN254 Mont-form r_limbs (MONT_ONE) initializer", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 64, 64);
    // The Mont-1 helper assigns 20 limbs from `r_limbs`.
    for (let i = 0; i < 20; i++) {
      expect(src).toMatch(new RegExp(`r\\.limbs\\[${i}\\] = `));
    }
  });

  it("bundles the EC partials (add_points_mixed + double_point)", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 64, 64);
    expect(src).toContain("fn add_points_mixed");
    expect(src).toContain("fn double_point");
    expect(src).toContain("fn montgomery_product");
  });

  it("declares the 5 storage bindings in (base_x, base_y, lut_x, lut_y, lut_z) order", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 64, 64);
    expect(src).toMatch(/@binding\(0\) var<storage, read>\s+base_x: array<BigInt>/);
    expect(src).toMatch(/@binding\(1\) var<storage, read>\s+base_y: array<BigInt>/);
    expect(src).toMatch(/@binding\(2\) var<storage, read_write> lut_x:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(3\) var<storage, read_write> lut_y:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(4\) var<storage, read_write> lut_z:\s+array<BigInt>/);
  });

  it("builds 8 lookup entries per point (the LOOKUP_SIZE loop bound)", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 64, 64);
    expect(src).toMatch(/const LOOKUP_SIZE: u32 = 8u;/);
    expect(src).toMatch(/kk < LOOKUP_SIZE/);
  });
});

describe("StrausKernels: straus_main renderer", () => {
  function makeSm(): ShaderManager {
    return new ShaderManager(15, 256, BN254_CURVE_CONFIG, false);
  }

  it("interpolates NUM_THREAD_MULS and N", () => {
    const sm = makeSm();
    for (const k of [1, 2, 3, 4, 6, 8, 12, 16, 24, 32]) {
      const src = StrausKernels.renderStrausMain(sm, 256, k, 64);
      expect(src).toMatch(new RegExp(`const NUM_THREAD_MULS: u32 = ${k}u;`));
      expect(src).toMatch(/const N:\s+u32 = 256u;/);
    }
  });

  it("keeps the inner ii loop counted (does not unroll on k)", () => {
    const sm = makeSm();
    for (const k of [1, 4, 16, 32]) {
      const src = StrausKernels.renderStrausMain(sm, 256, k, 64);
      expect(src).toContain(
        "for (var ii: u32 = start; ii < end; ii = ii + 1u)",
      );
      const accAddOccurrences = (src.match(/acc = add_points\(acc, to_add\)/g) ?? []).length;
      expect(accAddOccurrences).toBe(1);
    }
  });

  it("declares the 8 storage bindings in (lut_x/y/z, k1_lims, k2_lims, part_x/y/z) order", () => {
    const sm = makeSm();
    const src = StrausKernels.renderStrausMain(sm, 256, 4, 64);
    expect(src).toMatch(/@binding\(0\) var<storage, read>\s+lut_x:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(1\) var<storage, read>\s+lut_y:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(2\) var<storage, read>\s+lut_z:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(3\) var<storage, read>\s+k1_lims: array<u32>/);
    expect(src).toMatch(/@binding\(4\) var<storage, read>\s+k2_lims: array<u32>/);
    expect(src).toMatch(/@binding\(5\) var<storage, read_write> part_x:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(6\) var<storage, read_write> part_y:\s+array<BigInt>/);
    expect(src).toMatch(/@binding\(7\) var<storage, read_write> part_z:\s+array<BigInt>/);
  });

  it("walks 32 windows from high to low (the w_p1 driver)", () => {
    const sm = makeSm();
    const src = StrausKernels.renderStrausMain(sm, 256, 4, 64);
    expect(src).toMatch(/for \(var w_p1: u32 = 32u;\s*w_p1 > 0u/);
    expect(src).toMatch(/for \(var d: u32 = 0u;\s*d < 4u/);
  });

  it("lookup_precompute emits the 20-limb β-Mont initializer", () => {
    const sm = makeSm();
    const src = StrausKernels.renderLookupPrecompute(sm, 256, 64);
    for (let i = 0; i < 20; i++) {
      expect(src).toMatch(new RegExp(`b\\.limbs\\[${i}\\] = `));
    }
  });

  it("straus_main no longer contains a runtime β-mul branch", () => {
    const sm = makeSm();
    const src = StrausKernels.renderStrausMain(sm, 256, 4, 64);
    expect(src).not.toContain("get_beta_mont");
    expect(src.match(/montgomery_product\(&bx,/g) ?? []).toEqual([]);
  });

  it("renders the combine-fold kernel with the correct T_IN", () => {
    const sm = makeSm();
    for (const tIn of [2, 7, 16, 256, 1024]) {
      const src = StrausKernels.renderStrausCombineFold(sm, tIn, 64);
      expect(src).toMatch(new RegExp(`const T_IN: u32 = ${tIn}u;`));
      expect(src).toContain("sum = add_points(sum, other)");
      expect(src).toContain("@binding(0) var<storage, read>       in_x");
      expect(src).toContain("@binding(3) var<storage, read_write> out_x");
    }
  });

  it("renders the to-affine kernel with single-thread dispatch and the BY inverse", () => {
    const sm = makeSm();
    const src = StrausKernels.renderStrausToAffine(sm);
    expect(src).toMatch(/@workgroup_size\(1\)/);
    expect(src).toContain("fr_inv_by_a");
    expect(src).toContain("montgomery_product");
    expect(src).toMatch(/@binding\(0\) var<storage, read>\s+part_x/);
    expect(src).toMatch(/@binding\(3\) var<storage, read_write> result_xy/);
  });

  it("β-Mont in the new representation is a primitive cube root of unity mod q", () => {
    const betaMont = fqCubeRootOfUnityMont(20, 13);
    const q = BN254_BASE_FIELD;
    const R = (1n << BigInt(20 * 13)) % q;
    const RInv = (() => {
      const a = R;
      const m = q;
      let oldR = ((a % m) + m) % m;
      let rCur = m;
      let oldS = 1n;
      let sCur = 0n;
      while (rCur !== 0n) {
        const qq = oldR / rCur;
        [oldR, rCur] = [rCur, oldR - qq * rCur];
        [oldS, sCur] = [sCur, oldS - qq * sCur];
      }
      return ((oldS % m) + m) % m;
    })();
    const betaNonMont = (betaMont * RInv) % q;
    expect((betaNonMont * betaNonMont * betaNonMont) % q).toBe(1n);
    expect(betaNonMont).not.toBe(1n);
  });
});
