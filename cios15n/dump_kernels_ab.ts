// Dump the integrated stream_walker + reduce kernels at ws=15 (native CIOS) and
// ws=13 (cios_unrolled) so malioc can report the REAL per-thread work-register /
// spill / cycle bound of each — the occupancy-bound MSM's true arbiter (vs the
// misleading isolated-montmul microbench). Same kernel args for both; only the
// limb width + montmul body differ.
import { ShaderManager } from '../barretenberg/ts/src/msm_webgpu/cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from '../barretenberg/ts/src/msm_webgpu/cuzk/curve_config.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = '/Users/zac/localclaudebox/phonetests/walkerkern_wgsl_ab';
mkdirSync(OUT, { recursive: true });

const configs: [string, number, 'karat' | 'cios_unrolled'][] = [
  ['ws15native', 15, 'karat'],       // ws=15 forces native CIOS-15 regardless of mm
  ['ws13cios', 13, 'cios_unrolled'],
];
for (const [tag, ws, mm] of configs) {
  const sm = new ShaderManager(4, 1 << 17, BN254_CURVE_CONFIG, false, mm, ws);
  writeFileSync(`${OUT}/stream_walker_${tag}.wgsl`, sm.gen_ba_stream_walker_shader(64, 8, 256, 128, 1024, 'pk'));
  writeFileSync(`${OUT}/reduce_${tag}.wgsl`, sm.gen_ba_reduce_level_bench_shader(64, 'pk', 'native'));
  console.log(`dumped ${tag}: ws=${ws} mm=${mm}`);
}
// isolated montmul kernel (register footprint of the montmul alone)
for (const [tag, ws, mm] of configs) {
  const sm = new ShaderManager(4, 1 << 17, BN254_CURVE_CONFIG, false, mm, ws);
  writeFileSync(`${OUT}/mulonly_${tag}.wgsl`, sm.gen_microbench_shader('mul', 8, 65536));
}
// isolated inverse kernel (register footprint of the safegcd inverse alone)
{
  const sm = new ShaderManager(4, 1 << 17, BN254_CURVE_CONFIG, false, 'karat', 15);
  writeFileSync(`${OUT}/invonly_ws15.wgsl`, sm.gen_microbench_shader('inv', 1, 65536));
}
// 13-bit inverse microbench (looped) for unroll+malioc comparison
{
  const sm = new ShaderManager(4, 1 << 17, BN254_CURVE_CONFIG, false, 'cios_unrolled', 13);
  writeFileSync(`${OUT}/invonly_ws13.wgsl`, sm.gen_microbench_shader('inv', 1, 65536));
}
// Walker S-sweep (ws=15) to test the accumulator-spill hypothesis.
for (const S of [1, 2, 4, 8]) {
  const sm = new ShaderManager(4, 1 << 17, BN254_CURVE_CONFIG, false, 'karat', 15);
  writeFileSync(`${OUT}/walker_s${S}_ws15.wgsl`, sm.gen_ba_stream_walker_shader(64, S, 256, 128, 1024, 'pk'));
}
