#!/bin/bash
set +e
WT=/Users/zac/localclaudebox/wt-fp22n
TS=$WT/barretenberg/ts
SM=$TS/src/msm_webgpu
OUT=$WT/fp22work/CHECKS_SUMMARY.txt
: > "$OUT"
log(){ echo "$@" >> "$OUT"; }

log "=== fp22-native full check run $(date) ==="

# 1) regenerate WGSL from templates
cd "$TS"
node src/msm_webgpu/scripts/inline-wgsl.mjs > /tmp/_inl.txt 2>&1
log "[1] inline-wgsl rc=$? : $(tail -1 /tmp/_inl.txt)"

# 2) prove the native body is SERVED in the generated shaders (only when fp22native is rendered)
#    The generated file holds TEMPLATES; the native body is spliced at render-time in TS,
#    so we instead render via a tiny TS-less node harness that imports the compiled generator.
#    Simpler: grep the generator TS file is present and montgomery_product_22 is producible.
node --input-type=module -e '
import { genFp22NativeMontgomeryProductBody } from "'"$SM"'/cuzk/fp22_native_montmul.ts";
' > /tmp/_imp.txt 2>&1
if grep -q "Unknown file extension\|Cannot use import" /tmp/_imp.txt; then
  log "[2] (ts import needs loader; using built artifact check instead)"
fi

# 3) Render the actual served body through the real ShaderManager to PROVE native is served.
cat > /tmp/_render_probe.mjs <<'NODE'
// Use tsx if available; else fall back to a structural check.
NODE
# Use a TS-aware run: try tsx, else node with ts-node/esm
RENDER_OK="skip"
if npx --no-install tsx --version >/dev/null 2>&1; then
  cat > /tmp/_render_probe.ts <<TS2
import { ShaderManager } from "$SM/cuzk/shader_manager.js";
const sm = new ShaderManager(4, 1<<14, undefined as any, false, "fp22native" as any);
const body = (sm as any).mont_product_src as string;
const served =
  body.includes("montgomery_product_22(") &&
  body.includes("FP22_N0_22: u32 = 418697u") &&
  /fn montgomery_product\(/.test(body) &&
  !/2\^260|correction|fixup/.test(body);
const rc = (sm as any).r_cubed_limbs as string;
console.log("SERVED_NATIVE=" + served);
console.log("HAS_FP22_MADD=" + body.includes("fn fp22_madd"));
console.log("RBODY_LEN=" + body.length);
TS2
  npx --no-install tsx /tmp/_render_probe.ts > /tmp/_render.txt 2>&1
  RENDER_OK=$?
fi
log "[3] render-probe rc=$RENDER_OK :"
sed 's/^/    /' /tmp/_render.txt >> "$OUT" 2>/dev/null

# 4) host verifications
cd "$WT/fp22work"
run(){ node "$1" > "/tmp/_$(basename $1).txt" 2>&1; local r=$?; local tag="$2"; local pat="$3"; if grep -q "$pat" "/tmp/_$(basename $1).txt"; then log "[4] $tag = PASS"; else log "[4] $tag = FAIL (rc=$r)"; tail -3 "/tmp/_$(basename $1).txt" | sed 's/^/      /' >> "$OUT"; fi; }
run verify_native_r264.mjs "native_montmul_host" "RESULT: PASS"
run verify_ec_domain264.mjs "ec_affine_264_bridge" "RESULT: PASS"
run verify_inverse_r3_264.mjs "inverse_R3_264" "RESULT: PASS"
run verify_full_pipeline_domain.mjs "full_pipeline_domain" "COHERENT-NATIVE (entry R264 + native-264 mul): fails=0"

# 5) typecheck
cd "$TS"
npx tsc --noEmit -p tsconfig.json > /tmp/_tsc.txt 2>&1
if grep -qE "error TS" /tmp/_tsc.txt; then log "[5] tsc = FAIL"; grep -E "error TS" /tmp/_tsc.txt | head -10 | sed 's/^/      /' >> "$OUT"; else log "[5] tsc = PASS (no errors)"; fi

# 6) forbidden-tell grep on the rendered native body
if [ -f /tmp/_render.txt ] && grep -q "SERVED_NATIVE=true" /tmp/_render.txt; then
  log "[6] forbidden-tell (260/correction/fixup) in served body = NONE (asserted by render-probe)"
fi

log "=== DONE ==="
echo "SUMMARY_WRITTEN"
