// Thin re-export of the production `TrivialMsm` lifecycle so the dev/
// bench pages, the sanity HTML, and the in-browser unit-test page can
// import it from the same path they used through P6. The canonical
// implementation lives at `src/msm_webgpu/cuzk/trivial_msm.ts`.

export { TrivialMsm } from "../../src/msm_webgpu/cuzk/trivial_msm.js";
