/**
 * Persistent GPU context — owns one `GPUDevice`, a shader/pipeline cache,
 * and a storage-buffer pool that can be reused across many MSM invocations.
 *
 * Motivation. Previously, `compute_curve_msm` called `get_device()` and
 * `device.destroy()` on every invocation. That path:
 *   1. Re-requests the WebGPU adapter + device (tens of ms on most
 *      browsers).
 *   2. Re-compiles all five shader modules (convert / transpose / smvp /
 *      bpr stage_1 / bpr stage_2). On Dawn/Metal this alone can be >100 ms
 *      on first submission of each pass.
 *   3. Drops every intermediate `GPUBuffer` — next call allocates all of
 *      them again.
 *
 * For the Honk / chonk prover use-case the same SRS-backed MSM size is
 * called 20–50 times per proof. Keeping the device alive and caching
 * pipelines and intermediate buffers across calls eliminates those
 * per-call overheads.
 *
 * The context is opt-in: callers that want the old self-destructing
 * behaviour just omit it and keep calling `compute_bn254_msm(points,
 * scalars)`. Callers that repeatedly MSM can construct one via
 * `await GpuContext.create()` and pass it through.
 */
import { ShaderManager } from './shader_manager.js';
import { CurveConfig } from './curve_config.js';
import { get_device, read_write_buffer_usage } from './gpu.js';

type PipelineEntry = {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
};

export class GpuContext {
  readonly device: GPUDevice;

  // Rendered shader code (post-Mustache) keyed by a logical shader ID.
  private readonly shaderCodeCache = new Map<string, string>();
  // Compiled pipelines keyed by a logical shader ID plus entry-point name
  // and layout shape.
  private readonly pipelineCache = new Map<string, PipelineEntry>();

  // Simple size-keyed storage-buffer pool. A freed buffer can be re-handed
  // out to the next MSM call that asks for the same size, avoiding the
  // WebGPU allocator round-trip. Uniform buffers are cheap, so we don't
  // pool them.
  private readonly sbPool = new Map<number, GPUBuffer[]>();
  private readonly sbInFlight = new Set<GPUBuffer>();

  // Key-keyed persistent storage-buffer cache. Unlike `sbPool`, these
  // buffers are tied to a stable identity (e.g. "bn254:bucket_sum_x")
  // and survive across MSM calls — repeat calls with the same input_size
  // / num_subtasks reuse the SAME GPUBuffer object every time. This is
  // what enables bind-group caching downstream (WebGPU requires the same
  // GPUBuffer object reference for the bind group to remain valid).
  //
  // Used for per-MSM workspace buffers: SMVP/BPR coordinate scratch,
  // transpose CSC pointers, batch-affine running_x/y, pair pool, etc.
  // The buffer is recreated only if the requested size changes (size
  // bumps when the user benchmarks a different N).
  private readonly persistentBuffers = new Map<string, GPUBuffer>();

  // Persistent uniform-buffer cache. Same idea as persistentBuffers but
  // for uniforms; the contents are written once when first created and
  // reused thereafter. Caller must manage write-once via the boolean
  // returned by `getOrCreatePersistentUniform`.
  private readonly persistentUniforms = new Map<string, GPUBuffer>();

  // Persistent bind-group cache. Bind groups are functions of (layout,
  // GPUBuffer references), so once we make the underlying buffers
  // persistent the bind group itself can also be cached. Cache key is
  // arbitrary but should encode the call site + pipeline variant.
  private readonly persistentBindGroups = new Map<string, GPUBindGroup>();

  // Cached ShaderManager per (curveId, chunk_size, input_size) so that
  // template substitution (Mustache) happens at most once per
  // configuration. The substitution output is deterministic; there is no
  // reason to redo it per call.
  private readonly shaderManagerCache = new Map<string, ShaderManager>();

  private constructor(device: GPUDevice) {
    this.device = device;
  }

  static async create(): Promise<GpuContext> {
    const device = await get_device();
    return new GpuContext(device);
  }

  /**
   * Return a cached `ShaderManager` for this configuration, creating one
   * on first use. The input_size parameter is included in the key because
   * it affects a handful of shader template constants (`input_size`, etc).
   */
  getShaderManager(curveConfig: CurveConfig, chunk_size: number, input_size: number): ShaderManager {
    const key = `${curveConfig.id}:${chunk_size}:${input_size}`;
    let sm = this.shaderManagerCache.get(key);
    if (!sm) {
      sm = new ShaderManager(chunk_size, input_size, curveConfig, false);
      this.shaderManagerCache.set(key, sm);
    }
    return sm;
  }

  /**
   * Idempotent shader-code cache: callers that previously rebuilt the WGSL
   * string on every invocation can now ask the context for it. The code
   * key is arbitrary but must be unique per textual output.
   */
  getOrRenderShaderCode(key: string, render: () => string): string {
    let code = this.shaderCodeCache.get(key);
    if (!code) {
      code = render();
      this.shaderCodeCache.set(key, code);
    }
    return code;
  }

  /**
   * Return an existing compiled pipeline for `key`, or compile one via
   * `build()` and cache it. The first call can be slow (shader compile);
   * subsequent calls are a Map lookup.
   */
  async getOrCreatePipeline(key: string, build: () => Promise<PipelineEntry>): Promise<PipelineEntry> {
    let entry = this.pipelineCache.get(key);
    if (!entry) {
      entry = await build();
      this.pipelineCache.set(key, entry);
    }
    return entry;
  }

  /**
   * Acquire a storage buffer of exactly `size` bytes. If the pool has a
   * free buffer of that size, return it (its contents are undefined);
   * otherwise allocate a fresh one. Caller must `releaseBuffer(b)` when
   * done, or the buffer will leak (but the context itself will still
   * free it on `destroy()`).
   */
  acquireStorageBuffer(size: number): GPUBuffer {
    const pool = this.sbPool.get(size);
    if (pool && pool.length > 0) {
      const buf = pool.pop()!;
      this.sbInFlight.add(buf);
      return buf;
    }
    const buf = this.device.createBuffer({
      size,
      usage: read_write_buffer_usage,
    });
    this.sbInFlight.add(buf);
    return buf;
  }

  /**
   * Return a buffer to the pool. The buffer's contents are invalidated.
   * Caller must not touch it again after this call.
   */
  releaseBuffer(buf: GPUBuffer): void {
    if (!this.sbInFlight.delete(buf)) return;
    const size = buf.size;
    let pool = this.sbPool.get(size);
    if (!pool) {
      pool = [];
      this.sbPool.set(size, pool);
    }
    pool.push(buf);
  }

  /**
   * Acquire a persistent storage buffer keyed by `cacheKey`. Returns the
   * same `GPUBuffer` object across calls so long as `size` matches; if
   * the requested size differs from the cached one, the old buffer is
   * destroyed and a fresh one allocated.
   *
   * Use this for per-MSM workspace buffers whose size depends only on
   * (input_size, num_subtasks, num_columns, num_words) — these survive
   * across MSM calls in a benchmark loop, eliminating the per-call
   * allocator round-trip and (more importantly) keeping the buffer
   * identity stable so cached bind groups remain valid.
   *
   * Caller is responsible for clearing buffer contents when needed
   * (e.g. atomic counters, transpose count arrays). Buffers that are
   * fully overwritten by their first writer each call don't need a clear.
   */
  acquirePersistentBuffer(cacheKey: string, size: number, extraUsage = 0): GPUBuffer {
    const existing = this.persistentBuffers.get(cacheKey);
    if (existing && existing.size === size) {
      return existing;
    }
    if (existing) {
      // Size changed — invalidate any bind groups that reference this
      // key's buffer and destroy the old buffer.
      this.invalidateBindGroupsReferencing(cacheKey);
      existing.destroy();
    }
    const buf = this.device.createBuffer({
      size,
      usage: read_write_buffer_usage | extraUsage,
    });
    this.persistentBuffers.set(cacheKey, buf);
    return buf;
  }

  /**
   * Persistent uniform buffer. Same lifecycle as `acquirePersistentBuffer`
   * but with `UNIFORM` usage. The returned object has `created === true`
   * the first time (or after a size change) so the caller knows it must
   * write the uniform contents; subsequent calls return the cached buffer
   * with `created === false` and the caller can skip the write.
   */
  acquirePersistentUniform(cacheKey: string, size: number): { buffer: GPUBuffer; created: boolean } {
    const existing = this.persistentUniforms.get(cacheKey);
    if (existing && existing.size === size) {
      return { buffer: existing, created: false };
    }
    if (existing) existing.destroy();
    const buf = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.persistentUniforms.set(cacheKey, buf);
    return { buffer: buf, created: true };
  }

  /**
   * Persistent bind group cache. The caller passes a `cacheKey` that
   * encodes the pipeline + which buffers are bound; if a bind group is
   * already cached for that key it's returned directly, otherwise
   * `build()` is invoked and the result cached.
   *
   * SAFETY: the underlying buffers must come from `acquirePersistentBuffer`
   * (so their identities are stable). If a buffer is recreated (size
   * change), this entry is invalidated automatically by
   * `acquirePersistentBuffer`. Bind groups built against pooled or
   * fresh-allocated buffers must NOT be cached here.
   */
  getOrCreatePersistentBindGroup(cacheKey: string, build: () => GPUBindGroup): GPUBindGroup {
    let bg = this.persistentBindGroups.get(cacheKey);
    if (!bg) {
      bg = build();
      this.persistentBindGroups.set(cacheKey, bg);
    }
    return bg;
  }

  /**
   * Drop any cached bind group entries whose key contains `bufferKey`.
   * Called when a persistent buffer is recreated due to size change so
   * stale bind groups aren't returned.
   */
  private invalidateBindGroupsReferencing(bufferKey: string): void {
    void bufferKey;
    this.invalidateAllBindGroups();
  }

  /**
   * Drop every cached persistent bind group. Use when a buffer referenced
   * by cached bind groups is destroyed but lives outside the persistent
   * buffer cache (e.g. `CachedBases.point_x_sb` / `point_y_sb`, owned by
   * the caller). Without this, returning to a previously-seen N after the
   * caller has rotated CachedBases would hand back a bind group bound to
   * destroyed buffers — the MSM dispatches against zeroed memory and
   * returns identity. Cheap: bind groups rebuild on the next dispatch.
   */
  invalidateAllBindGroups(): void {
    if (this.persistentBindGroups.size > 0) {
      this.persistentBindGroups.clear();
    }
  }

  /**
   * Release the entire GPU context. Destroys the device and invalidates
   * every cached pipeline and pooled buffer. Call this when the page is
   * tearing down, not between MSMs.
   */
  destroy(): void {
    // device.destroy() is the nuclear option — it invalidates everything
    // transitively held by this context.
    this.device.destroy();
    this.shaderCodeCache.clear();
    this.pipelineCache.clear();
    this.sbPool.clear();
    this.sbInFlight.clear();
    this.persistentBuffers.clear();
    this.persistentUniforms.clear();
    this.persistentBindGroups.clear();
    this.shaderManagerCache.clear();
  }
}
