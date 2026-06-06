#!/bin/bash
# ONE-TIME: turn the installed (non-debuggable) Chromium `content_shell` into a
# debuggable build so AGI/gapit can launch+track it and (if you ever need the
# GraphicsSpy path) inject layers. On a non-rooted phone you cannot make Chrome
# itself debuggable, so content_shell is the WebGPU host of choice.
#
# Prereqs on host (macOS): brew install --cask android-commandlinetools ; brew install apktool
#   (apksigner/zipalign land in $(brew --prefix)/share/android-commandlinetools/build-tools/*/)
#
# Usage: SER=<serial> bash build_debuggable_content_shell.sh
#   If content_shell is already installed it is pulled from the device; otherwise set
#   APK=/path/to/content_shell.apk (obtainable from a Chromium build / CI artifact).
set -euo pipefail
: "${SER:?set SER to your adb serial}"
PKG=org.chromium.content_shell_apk
WORK="${WORK:-$PWD/cshell_build}"
mkdir -p "$WORK"; cd "$WORK"

BT="$(ls -d "$(brew --prefix 2>/dev/null)"/share/android-commandlinetools/build-tools/* 2>/dev/null | tail -1 || true)"
ZIPALIGN="${ZIPALIGN:-$BT/zipalign}"; APKSIGNER="${APKSIGNER:-$BT/apksigner}"

# 1. Obtain the base APK.
if [ -n "${APK:-}" ]; then
  cp "$APK" base.apk
else
  echo "[1/6] pulling installed $PKG from device"
  path="$(adb -s "$SER" shell pm path "$PKG" | head -1 | tr -d '\r' | sed 's/^package://')"
  [ -n "$path" ] || { echo "content_shell not installed; set APK=/path/to/content_shell.apk"; exit 1; }
  adb -s "$SER" pull "$path" base.apk
fi

# 2. Decode (resources only; -s keeps smali as-is for speed).
echo "[2/6] apktool decode"
rm -rf decoded; apktool d -s -f base.apk -o decoded

# 3. Mark the application debuggable.
echo "[3/6] set android:debuggable=true"
python3 - <<'PY'
import re
p="decoded/AndroidManifest.xml"; s=open(p).read()
if 'android:debuggable="true"' not in s:
    s=re.sub(r'<application ', '<application android:debuggable="true" ', s, count=1)
    open(p,"w").write(s)
print("manifest patched")
PY

# 4. Rebuild.
echo "[4/6] apktool build"
apktool b decoded -o cshell_dbg.apk

# 5. Align + sign with a debug keystore (created if missing).
echo "[5/6] zipalign + sign"
KS="$HOME/.android/debug.keystore"
if [ ! -f "$KS" ]; then
  mkdir -p "$HOME/.android"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" \
    -keyalg RSA -keysize 2048 -validity 10000
fi
"$ZIPALIGN" -p -f 4 cshell_dbg.apk cshell_aligned.apk
"$APKSIGNER" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android cshell_aligned.apk

# 6. Reinstall.
echo "[6/6] reinstall"
adb -s "$SER" uninstall "$PKG" >/dev/null 2>&1 || true
adb -s "$SER" install cshell_aligned.apk
echo "verify:"; adb -s "$SER" shell dumpsys package "$PKG" | grep -i DEBUGGABLE || true
echo "done. content_shell is now debuggable."
