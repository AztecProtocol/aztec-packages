// Request a high-performance GPU device. Enables the optional "timestamp-query"
// feature when the adapter supports it, so per-pass timings can be collected.
//
// Explicitly requests the adapter's MAX for `maxComputeWorkgroupStorageSize`
// so workgroup-shared scratch can scale with hardware support.
// WebGPU's default limit is 16 KiB; Apple M1/M2 Metal exposes ~32 KiB, M3+
// ~64 KiB. Requesting the max keeps room for larger per-WG scratch buffers
// without falling back to the default cap.
export const get_device = async (): Promise<GPUDevice> => {
  const gpuErrMsg = 'Please use a browser that has WebGPU enabled.';
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    console.log(gpuErrMsg);
    throw Error("Couldn't request WebGPU adapter.");
  }

  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) {
    requiredFeatures.push('timestamp-query');
  }

  const requiredLimits: Record<string, number> = {};
  const adapterLimits = adapter.limits as unknown as Record<string, number>;
  const wgStorageMax = adapterLimits['maxComputeWorkgroupStorageSize'];
  if (typeof wgStorageMax === 'number') {
    requiredLimits['maxComputeWorkgroupStorageSize'] = wgStorageMax;
  }
  // Request the adapter MAX for storage buffers per stage. WebGPU's
  // default cap is 8, but most modern GPUs expose 10 or more — and the
  // smvp_tree_phase1 kernel needs 10. Bounded by the adapter ceiling
  // so this never over-requests.
  const storageBuffersMax = adapterLimits['maxStorageBuffersPerShaderStage'];
  if (typeof storageBuffersMax === 'number') {
    requiredLimits['maxStorageBuffersPerShaderStage'] = storageBuffersMax;
  }
  // Request the adapter MAX for buffer / storage-binding size. WebGPU's
  // defaults (256 MiB buffer, 128 MiB storage binding) are well below the
  // multi-hundred-MB working set a large MSM needs; modern GPUs expose
  // far more. Bounded by the adapter ceiling so this never over-requests.
  for (const key of ['maxBufferSize', 'maxStorageBufferBindingSize']) {
    const v = adapterLimits[key];
    if (typeof v === 'number') {
      requiredLimits[key] = v;
    }
  }

  const device = await adapter.requestDevice({ requiredFeatures, requiredLimits });
  const grantedLimits = device.limits as unknown as Record<string, number>;
  console.log(
    `[gpu] requested maxComputeWorkgroupStorageSize=${wgStorageMax}B,` +
      ` granted=${grantedLimits['maxComputeWorkgroupStorageSize']}B`,
  );
  return device;
};

// Pick the largest SLAB that fits NUM_BUCKETS u32 atomics in the device's
// workgroup-shared memory limit AND leaves headroom for compiler-allocated
// temporaries. Returns `{ slab, slabs, bytes }` where
//   slab * 4 + HEADROOM <= workgroup_storage_limit
//   slabs = ceil(num_columns / slab)
//
// Selection:
//   - If `num_columns * 4 + HEADROOM <= limit`, use `slab = num_columns`
//     (single slab, zero tiling — every scalar is Booth-recoded exactly
//     once per window).
//   - Otherwise pick the largest power-of-2 SLAB that fits. Power-of-2 is
//     a convenience: it keeps `slot = k * WG_SIZE + tid` integer divisions
//     cheap and the per-slab digit range a clean [s, s+SLAB) interval.
//
// Headroom rationale: kernels also use small amounts of compiler-allocated
// workgroup memory (loop counters, barrier state). Leaving a 1 KiB margin
// keeps us inside the granted limit on drivers that over-allocate slightly.
export const pick_shared_digit_slab = (
  num_columns: number,
  workgroup_storage_limit: number,
): { slab: number; slabs: number; bytes: number } => {
  const HEADROOM_BYTES = 1024;
  const usable_bytes = Math.max(0, workgroup_storage_limit - HEADROOM_BYTES);
  const max_cells = Math.floor(usable_bytes / 4);
  if (max_cells <= 0) {
    throw new Error(
      `pick_shared_digit_slab: workgroup_storage_limit=${workgroup_storage_limit}B is too small even for the 1 KiB headroom`,
    );
  }
  if (max_cells >= num_columns) {
    return { slab: num_columns, slabs: 1, bytes: num_columns * 4 };
  }
  let slab = 1;
  while (slab * 2 <= max_cells) slab *= 2;
  if (slab < 1024) {
    throw new Error(
      `pick_shared_digit_slab: device workgroup storage ${workgroup_storage_limit}B can only fit ${slab} cells; below the 1024-cell floor`,
    );
  }
  const slabs = Math.ceil(num_columns / slab);
  return { slab, slabs, bytes: slab * 4 };
};

export const read_write_buffer_usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;

// Create and write a storage buffer
export const create_and_write_sb = (device: GPUDevice, buffer: Uint8Array): GPUBuffer => {
  const sb = device.createBuffer({
    size: buffer.length,
    usage: read_write_buffer_usage,
  });
  device.queue.writeBuffer(sb, 0, buffer as BufferSource);
  return sb;
};

// Create and write a uniform buffer
export const create_and_write_ub = (device: GPUDevice, buffer: Uint8Array): GPUBuffer => {
  const ub = device.createBuffer({
    size: buffer.length,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ub, 0, buffer as BufferSource);
  return ub;
};

// Allocate memory via a storage buffer, but do not write to it
export const create_sb = (device: GPUDevice, size: number) => {
  return device.createBuffer({
    size,
    usage: read_write_buffer_usage,
  });
};

// Read from all the specified storage buffers and return the data as bytes.
//
// When a `cpu_timer` is provided, the readback is decomposed into two
// independent sub-phases for diagnostic clarity:
//   - `gpu_compute_wall`: time from `submit` returning until
//      `onSubmittedWorkDone()` resolves. This is the GROUND TRUTH total
//      GPU compute wall, including every encoded pass — sampled or not,
//      timestamped or not — plus inter-pass barriers, clearBuffers, and
//      copyBufferToBuffer ops in this same encoder. It is NOT under-
//      counted by the profiler's first-8-rounds sampling.
//   - `mapasync_overhead`: time from `onSubmittedWorkDone` resolving
//      until `Promise.all(mapAsync)` resolves. This is DMA + Chrome's
//      event-loop polling latency for staging-buffer map-readiness;
//      no GPU compute happens during this window.
//
// Adding `onSubmittedWorkDone` does NOT add wall time in steady state:
// `mapAsync` already waits for the same fence the GPU uses to signal
// queue completion, so we're inserting a checkpoint into a wait we
// would do anyway.
// A MAP_READ | COPY_DST buffer for reading results back to the host. Callers that
// read the same-sized result every iteration (e.g. a per-round sumcheck readback)
// can create one of these once and reuse it, avoiding a per-iteration allocation
// and the redundant onSubmittedWorkDone fence in read_from_gpu (a bare mapAsync
// already waits for the copy that fills the buffer).
export const create_readback_buffer = (device: GPUDevice, size: number): GPUBuffer =>
  device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

export const read_from_gpu = async (
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  storage_buffers: GPUBuffer[],
  custom_size = 0,
  source_offset = 0,
  dest_offset = 0,
  cpu_timer?: CpuTimer,
) => {
  const staging_buffers: GPUBuffer[] = [];
  for (const storage_buffer of storage_buffers) {
    const size = custom_size === 0 ? storage_buffer.size : custom_size;
    const staging_buffer = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    commandEncoder.copyBufferToBuffer(storage_buffer, source_offset, staging_buffer, dest_offset, size);
    staging_buffers.push(staging_buffer);
  }

  // Finish encoding commands and submit to GPU device command queue
  cpu_timer?.mark('gpu_compute_wall_begin');
  device.queue.submit([commandEncoder.finish()]);

  // Wait for all queued GPU work to complete. This includes everything
  // in the encoder we just submitted: every compute pass (timestamped
  // or not), every clearBuffer, every copyBufferToBuffer. The duration
  // we measure here is therefore the ACTUAL total GPU wall time for
  // the MSM, not the under-counted sampled-stage sum.
  await device.queue.onSubmittedWorkDone();
  cpu_timer?.phaseFrom('gpu_compute_wall', 'gpu_compute_wall_begin');

  // Kick off all mapAsync calls IN PARALLEL, then await in a Promise.all.
  // Sequential awaits would serialize the latency: each mapAsync call has
  // to round-trip through the WebGPU implementation's internal scheduler
  // even though the GPU work has all completed by the time the second
  // and third resolve. Browsers (Chrome's Dawn in particular) batch
  // map-readiness notifications, so issuing them all at once and awaiting
  // a single Promise.all collapses three round-trips into one wait.
  cpu_timer?.mark('mapasync_overhead_begin');
  const map_promises = staging_buffers.map(b => b.mapAsync(GPUMapMode.READ, 0, b.size));
  await Promise.all(map_promises);
  cpu_timer?.phaseFrom('mapasync_overhead', 'mapasync_overhead_begin');

  const data: Uint8Array[] = [];
  for (let i = 0; i < staging_buffers.length; i++) {
    const result_data = staging_buffers[i].getMappedRange(0, staging_buffers[i].size).slice(0);
    staging_buffers[i].unmap();
    data.push(new Uint8Array(result_data));
  }
  return data;
};

// Create a GPUBindGroupLayout, which defines the order and type of buffers
// which the shader expects. Acceptable types are "storage",
// "read-only-storage", and "uniform".
export const create_bind_group_layout = (device: GPUDevice, types: string[]) => {
  const entries: any[] = [];
  for (let i = 0; i < types.length; i++) {
    entries.push({
      binding: i,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: types[i] },
    });
  }
  return device.createBindGroupLayout({ entries });
};

// Create a GPUBindGroup, which specifies the storage and uniform buffers to be
// read by a shader. The buffers must follow the order set in the layout.
export const create_bind_group = (device: GPUDevice, layout: GPUBindGroupLayout, buffers: GPUBuffer[]) => {
  const entries: any[] = [];
  for (let i = 0; i < buffers.length; i++) {
    entries.push({
      binding: i,
      resource: { buffer: buffers[i] },
    });
  }
  return device.createBindGroup({ layout, entries });
};

// Asynchronously create a compute pipeline.
//
// Surfaces WGSL compile errors via getCompilationInfo() before pipeline
// creation. The default WebGPU error path collapses all compile failures
// into a generic GPUPipelineError ("Invalid ShaderModule (unlabeled) is
// invalid due to a previous error") with no line number — useless for
// debugging. By awaiting compilationInfo first we can console.log the
// real error message + line/col, then throw a descriptive error so
// callers can react.
//
// On Dawn/Metal in particular, certain compile failures have been
// observed to put the device into a wedged state where subsequent
// dispatches silently no-op (or, in pathological cases, hang the GPU
// driver hard enough to take the browser tab — and on integrated
// laptops, the OS — down with it). Catching the error early and
// throwing keeps the failure observable in DevTools instead of being
// hidden behind a hard crash.
export const create_compute_pipeline = async (
  device: GPUDevice,
  bindGroupLayouts: GPUBindGroupLayout[],
  code: string,
  entryPoint: string,
  cacheKey?: string,
) => {
  const m = device.createShaderModule({ code });

  // Best-effort: not all browsers / drivers populate getCompilationInfo()
  // before pipeline creation, but where they do (Chrome stable on Dawn)
  // this gives us a clean error surface.
  try {
    const info = await m.getCompilationInfo();
    let hasError = false;
    for (const msg of info.messages) {
      const tag = `[shader ${cacheKey ?? entryPoint}]`;
      const where = `line ${msg.lineNum}, col ${msg.linePos}`;
      const line = `${tag} ${msg.type}: ${msg.message} (${where})`;
      if (msg.type === 'error') {
        console.error(line);
        hasError = true;
      } else {
        console.warn(line);
      }
    }
    if (hasError) {
      throw new Error(`WGSL compile failed for ${cacheKey ?? entryPoint} — see DevTools console for line numbers`);
    }
  } catch (e) {
    // Re-throw our own descriptive error; let other errors fall through
    // to the original pipeline-creation path so we don't break browsers
    // where getCompilationInfo() isn't implemented.
    if (e instanceof Error && e.message.startsWith('WGSL compile failed')) {
      throw e;
    }
  }

  // It's recommended to use createComputePipelineAsync instead of
  // createComputePipeline to prevent stalls:
  // https://www.khronos.org/assets/uploads/developers/presentations/WebGPU_Best_Practices_Google.pdf
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts }),
    compute: { module: m, entryPoint },
  });
};

// Encode pipeline commands. When `timestampWrites` is provided, the compute
// pass is instrumented with begin/end GPU timestamps for profiling.
export const execute_pipeline = async (
  commandEncoder: GPUCommandEncoder,
  computePipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  num_x_workgroups: number,
  num_y_workgroups = 1,
  num_z_workgroups = 1,
  timestampWrites?: GPUComputePassTimestampWrites,
) => {
  // Hard guard: dispatching with a zero workgroup dimension is undefined
  // behaviour in WebGPU and on Apple Silicon Metal has been observed to wedge
  // the entire GPU context (machine-level freeze requiring reboot). Fail loud
  // instead of silently crashing the user's computer.
  if (num_x_workgroups === 0 || num_y_workgroups === 0 || num_z_workgroups === 0) {
    throw new Error(
      `execute_pipeline: refusing zero-dim dispatch (${num_x_workgroups}, ${num_y_workgroups}, ${num_z_workgroups}). This MSM pipeline is not calibrated for the current input size.`,
    );
  }
  const descriptor: GPUComputePassDescriptor = timestampWrites ? { timestampWrites } : {};
  const passEncoder = commandEncoder.beginComputePass(descriptor);
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(num_x_workgroups, num_y_workgroups, num_z_workgroups);
  passEncoder.end();
};

// Indirect-dispatch variant of execute_pipeline. Reads the (x, y, z)
// workgroup counts from `indirectBuffer` at byte `indirectOffset` (must
// be 4-byte aligned and point to three consecutive u32s). The buffer
// must have been allocated with GPUBufferUsage.INDIRECT in addition to
// the usual storage flags.
//
// No zero-dim guard: indirect dispatch with x/y/z = 0 is well-defined
// in WebGPU (it launches no workgroups, a no-op). The whole point of
// using indirect here is to let GPU-computed counts naturally elide
// rounds where no pairs were scheduled.
export const execute_pipeline_indirect = (
  commandEncoder: GPUCommandEncoder,
  computePipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  indirectBuffer: GPUBuffer,
  indirectOffset: number,
  timestampWrites?: GPUComputePassTimestampWrites,
) => {
  const descriptor: GPUComputePassDescriptor = timestampWrites ? { timestampWrites } : {};
  const passEncoder = commandEncoder.beginComputePass(descriptor);
  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroupsIndirect(indirectBuffer, indirectOffset);
  passEncoder.end();
};

/**
 * Per-command-encoder GPU timestamp profiler.
 *
 * Pre-allocates a query set with `2 * capacity` slots. Each `stage(label)` call
 * reserves one pair (begin/end) and returns a `timestampWrites` object to hand
 * to `execute_pipeline`. Call `resolve(commandEncoder)` once, inside the same
 * encoder as the passes being measured and before the encoder is finished.
 * Then await `report()` to read back per-pass durations in milliseconds.
 *
 * If the device does not have the "timestamp-query" feature (e.g. Firefox
 * today), the profiler silently no-ops: `stage()` returns undefined and
 * `report()` returns null, so call sites remain safe.
 */
export type ProfileEntryKind = 'stage' | 'region';

export class Profiler {
  private enabled: boolean;
  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private readBuffer: GPUBuffer | null = null;
  private readonly capacity: number;
  private used = 0;
  private labels: string[] = [];
  private kinds: ProfileEntryKind[] = [];

  constructor(device: GPUDevice, capacity = 64) {
    this.capacity = capacity;
    this.enabled = device.features.has('timestamp-query');
    if (this.enabled) {
      this.querySet = device.createQuerySet({
        type: 'timestamp',
        count: capacity * 2,
      });
      this.resolveBuffer = device.createBuffer({
        size: capacity * 2 * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.readBuffer = device.createBuffer({
        size: capacity * 2 * 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  stage(label: string): GPUComputePassTimestampWrites | undefined {
    if (!this.enabled || this.querySet === null) return undefined;
    if (this.used >= this.capacity) {
      console.warn(`Profiler capacity ${this.capacity} exceeded; skipping "${label}"`);
      return undefined;
    }
    const beginIndex = this.used * 2;
    const endIndex = beginIndex + 1;
    this.labels.push(label);
    this.kinds.push('stage');
    this.used += 1;
    return {
      querySet: this.querySet,
      beginningOfPassWriteIndex: beginIndex,
      endOfPassWriteIndex: endIndex,
    };
  }

  // Must be called on the same command encoder as the profiled passes, before
  // that encoder is finished/submitted.
  resolve(commandEncoder: GPUCommandEncoder): void {
    if (
      !this.enabled ||
      this.querySet === null ||
      this.resolveBuffer === null ||
      this.readBuffer === null ||
      this.used === 0
    ) {
      return;
    }
    commandEncoder.resolveQuerySet(this.querySet, 0, this.used * 2, this.resolveBuffer, 0);
    commandEncoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, this.used * 2 * 8);
  }

  async report(): Promise<{ label: string; ms: number; kind: ProfileEntryKind }[] | null> {
    if (!this.enabled || this.readBuffer === null || this.used === 0) {
      return null;
    }
    const byteCount = this.used * 2 * 8;
    await this.readBuffer.mapAsync(GPUMapMode.READ, 0, byteCount);
    const raw = this.readBuffer.getMappedRange(0, byteCount).slice(0);
    this.readBuffer.unmap();
    const data = new BigUint64Array(raw);
    const out: { label: string; ms: number; kind: ProfileEntryKind }[] = [];
    // Derive the encoder-wide span from the raw timestamps as we go:
    // min(begin_ts) over all stages = GPU time the first stage started;
    // max(end_ts) = GPU time the last stage ended. Their difference is
    // the wall span of GPU-encoded work from first profiled pass to
    // last, including every inter-pass barrier in between. This is
    // computed from the SAME timestamp pairs we already use for
    // per-stage durations — no synthetic empty-pass markers (the
    // empty-pass-with-only-one-timestamp pattern gets elided by Dawn
    // and returns zero, so this derived span is the trustworthy path).
    let minBegin: bigint | null = null;
    let maxEnd: bigint | null = null;
    for (let i = 0; i < this.used; i++) {
      const b = data[i * 2];
      const e = data[i * 2 + 1];
      if (minBegin === null || b < minBegin) minBegin = b;
      if (maxEnd === null || e > maxEnd) maxEnd = e;
      const ns = Number(e - b);
      out.push({ label: this.labels[i], ms: ns / 1e6, kind: this.kinds[i] });
    }
    if (minBegin !== null && maxEnd !== null) {
      const spanNs = Number(maxEnd - minBegin);
      out.push({ label: 'encoder_all', ms: spanNs / 1e6, kind: 'region' });
    }
    return out;
  }

  // Release the GPU resources backing this Profiler. Must be called
  // exactly once after `report()` has resolved.
  //
  // On Apple Metal, each `createQuerySet` allocates from a shared
  // counter-sample-buffer pool with a hard limit. Failing to destroy
  // QuerySets across many MSM calls exhausts the pool — subsequent
  // `createQuerySet` calls then fail with "Cannot allocate sample
  // buffer", which silently invalidates the affected CommandBuffer
  // and makes the dispatch a no-op. Symptoms: wall time ~1-2 ms with
  // no visible error.
  destroy(): void {
    if (this.querySet !== null) {
      this.querySet.destroy();
      this.querySet = null;
    }
    if (this.resolveBuffer !== null) {
      this.resolveBuffer.destroy();
      this.resolveBuffer = null;
    }
    if (this.readBuffer !== null) {
      this.readBuffer.destroy();
      this.readBuffer = null;
    }
  }
}

/**
 * CPU-side per-phase timer using `performance.now()`.
 *
 * The GPU `Profiler` above measures time inside compute passes, but a
 * significant fraction of per-MSM wall time lives on the CPU side:
 * shader compile, buffer upload (`writeBuffer`), encoder finalisation,
 * `mapAsync` readback, and the JS bigint Horner at the end. Without
 * CPU-side phase-level timing it is impossible to tell whether a
 * speed-up should come from the compute shaders, the host driver, or
 * the post-processing.
 *
 * Usage:
 *   const t = new CpuTimer();
 *   t.mark("upload_begin"); ... t.mark("upload_end");
 *   t.phase("upload", "upload_begin", "upload_end");
 *   t.report();   // prints a table
 */
export class CpuTimer {
  private readonly enabled: boolean;
  private readonly marks = new Map<string, number>();
  private readonly phases: { label: string; ms: number }[] = [];
  private readonly wall_start: number;

  constructor(enabled = true) {
    this.enabled = enabled;
    this.wall_start = performance.now();
  }

  mark(name: string): void {
    if (!this.enabled) return;
    this.marks.set(name, performance.now());
  }

  // Record a phase between two previously-set marks. Both marks must exist.
  phase(label: string, begin: string, end: string): void {
    if (!this.enabled) return;
    const b = this.marks.get(begin);
    const e = this.marks.get(end);
    if (b === undefined || e === undefined) return;
    this.phases.push({ label, ms: e - b });
  }

  // Record a phase from a single start mark to "now".
  phaseFrom(label: string, begin: string): void {
    if (!this.enabled) return;
    const b = this.marks.get(begin);
    if (b === undefined) return;
    this.phases.push({ label, ms: performance.now() - b });
  }

  // Convenience: time the execution of an async function and record it.
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = await fn();
    this.phases.push({ label, ms: performance.now() - t0 });
    return out;
  }

  // Convenience: sync variant.
  timeSync<T>(label: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const out = fn();
    this.phases.push({ label, ms: performance.now() - t0 });
    return out;
  }

  // Accumulate a sub-phase onto an existing label (useful when a phase
  // fires multiple times in a loop and we want the sum, not each call).
  accumulate(label: string, ms: number): void {
    if (!this.enabled) return;
    const existing = this.phases.find(p => p.label === label);
    if (existing) existing.ms += ms;
    else this.phases.push({ label, ms });
  }

  report(): { phases: { label: string; ms: number }[]; total_wall_ms: number } {
    return {
      phases: this.phases.slice(),
      total_wall_ms: performance.now() - this.wall_start,
    };
  }
}
