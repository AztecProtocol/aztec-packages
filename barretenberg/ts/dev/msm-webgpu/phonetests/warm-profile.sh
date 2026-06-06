#!/bin/bash
# warm-profile.sh <dest_dir> — clone the warm SRS playwright profile (port-agnostic blobs)
# so an agent gets its OWN unlocked profile with SRS already cached → no lock collision,
# no 30s cold SRS load. Usage: PROFILE=$(bash warm-profile.sh /tmp/agentX-profile)
DEST="${1:?usage: warm-profile.sh <dest>}"
SRC="$HOME/localclaudebox/playwright-msm-profile"
rm -rf "$DEST"
# cp -c uses APFS copy-on-write (instant, no extra disk) on macOS
cp -c -R "$SRC" "$DEST" 2>/dev/null || cp -R "$SRC" "$DEST"
# drop any stale singleton lock from the source
rm -f "$DEST"/Singleton* "$DEST"/Default/LOCK 2>/dev/null
echo "$DEST"
