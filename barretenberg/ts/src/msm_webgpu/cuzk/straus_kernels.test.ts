import { BN254_CURVE_CONFIG } from "./curve_config.js";
import { ShaderManager } from "./shader_manager.js";
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
