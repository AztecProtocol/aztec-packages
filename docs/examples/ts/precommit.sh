#!/usr/bin/env bash
# Compatibility shim for contributors with the previous pre-commit hook
# installed. The old hook enforced "yarn.lock must be committed empty";
# committed link-mode lockfiles replaced that policy. This shim is a no-op
# so stale installed hooks don't fail with "No such file or directory".
# Re-run ./bootstrap.sh from the repo root to refresh hooks; this file can
# be deleted once contributors have rotated.
exit 0
