// WebGPU type ambient declarations. Without this reference, types like
// GPUDevice / GPUBuffer / GPUCommandEncoder used throughout msm_webgpu/
// resolve as `any` (because `@webgpu/types` is a devDependency but not
// listed in tsconfig.json's `types` field). Pulling it in here scoped
// to this directory keeps the global type-pollution off the rest of
// bb.js.
/// <reference types="@webgpu/types" />
export {};
