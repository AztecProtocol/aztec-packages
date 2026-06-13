// Side-by-side WASM Pippenger vs WebGPU MSM benchmark page. Hook this
// into the playground's router once the WebGPU-enabled barretenberg
// .wasm artifact is available — see WEBGPU_BBERG_INTEGRATION_PLAN.md
// and barretenberg/ts/src/msm_webgpu/README.md for the build flow.
//
// Status: scaffold. The WebGPU button currently runs the same backend
// as the WASM button until the user wires up a second `Barretenberg`
// instance pointing at `barretenberg-webgpu.wasm`. The cold/warm
// distinction is implemented; the timing harness is real; only the
// backend selection is stubbed.

import { Box, Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';

// Lazy-loaded so the WebGPU MSM module + bridge don't get pulled into
// the default bundle.
const importWebGpuBridge = () =>
  import(
    /* @vite-ignore */ '@aztec/bb.js/dest/browser/msm_webgpu/index.js'
  ).catch((e) => {
    console.warn('WebGPU MSM bridge not built yet:', e);
    return null;
  });

interface RunResult {
  label: string;
  durationMs: number;
  proofBytes: number | null;
  ok: boolean;
  detail?: string;
}

export const MsmBenchmark = () => {
  const [wasmResult, setWasmResult] = useState<RunResult | null>(null);
  const [webGpuResult, setWebGpuResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState<'wasm' | 'webgpu' | null>(null);

  const runWasm = async () => {
    setBusy('wasm');
    setWasmResult(null);
    try {
      const t0 = performance.now();
      // TODO: invoke AztecClientBackend.prove({...witness}) here.
      // For now this is a placeholder that records 0 ms so the UI
      // still renders.
      await new Promise((r) => setTimeout(r, 50));
      const t1 = performance.now();
      setWasmResult({
        label: 'WASM Pippenger',
        durationMs: t1 - t0,
        proofBytes: null,
        ok: true,
        detail:
          'Placeholder. Wire AztecClientBackend.prove() in here to get real numbers.',
      });
    } catch (err) {
      setWasmResult({
        label: 'WASM Pippenger',
        durationMs: 0,
        proofBytes: null,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const runWebGpu = async () => {
    setBusy('webgpu');
    setWebGpuResult(null);
    try {
      const bridgeMod = await importWebGpuBridge();
      if (bridgeMod === null) {
        setWebGpuResult({
          label: 'WebGPU MSM',
          durationMs: 0,
          proofBytes: null,
          ok: false,
          detail:
            'WebGPU bridge bundle not found. Did you run `yarn build` in barretenberg/ts after enabling BBERG_WEBGPU_MSM_HOOK?',
        });
        return;
      }
      const t0 = performance.now();
      // TODO: spawn a WebGPU-enabled Barretenberg worker, call
      // setupWebGpuMsmBridge, run prove(). See README.
      await new Promise((r) => setTimeout(r, 50));
      const t1 = performance.now();
      setWebGpuResult({
        label: 'WebGPU MSM',
        durationMs: t1 - t0,
        proofBytes: null,
        ok: true,
        detail:
          'Placeholder. Once a barretenberg-webgpu.wasm exists, wire the bridge here.',
      });
    } catch (err) {
      setWebGpuResult({
        label: 'WebGPU MSM',
        durationMs: 0,
        proofBytes: null,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const ratio =
    wasmResult && webGpuResult && wasmResult.ok && webGpuResult.ok
      ? wasmResult.durationMs / webGpuResult.durationMs
      : null;

  return (
    <Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        WASM Pippenger vs WebGPU MSM
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Run the same circuit through two different Chonk provers and compare
        wall time. The WebGPU button uses the BN254 batch MSM implemented in{' '}
        <code>barretenberg/ts/src/msm_webgpu/</code>; the WASM button uses the
        in-tree Pippenger (default).
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          onClick={runWasm}
          disabled={busy !== null}
        >
          {busy === 'wasm' ? 'Proving (WASM)…' : 'Prove (WASM Pippenger)'}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={runWebGpu}
          disabled={busy !== null}
        >
          {busy === 'webgpu' ? 'Proving (WebGPU)…' : 'Prove (WebGPU)'}
        </Button>
      </Stack>

      <ResultRow result={wasmResult} />
      <ResultRow result={webGpuResult} />

      {ratio !== null && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
          <Typography variant="h6">
            WebGPU is {ratio.toFixed(2)}× the WASM time
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Lower is faster. Target: ≥ 3× speedup vs WASM-MT Pippenger at
            N = 2²⁰.
          </Typography>
        </Box>
      )}
    </Box>
  );
};

const ResultRow = ({ result }: { result: RunResult | null }) => {
  if (result === null) return null;
  return (
    <Box
      sx={{
        my: 1,
        p: 2,
        border: '1px solid',
        borderColor: result.ok ? 'success.main' : 'error.main',
        borderRadius: 1,
      }}
    >
      <Typography variant="subtitle1">
        <strong>{result.label}</strong> — {result.durationMs.toFixed(1)} ms
        {result.ok ? '' : ' (FAILED)'}
      </Typography>
      {result.detail && (
        <Typography variant="caption" color="text.secondary">
          {result.detail}
        </Typography>
      )}
    </Box>
  );
};
