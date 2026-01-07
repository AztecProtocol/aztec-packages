---
name: noir-sync-update
description: Perform necessary follow-on updates as a result of updating the noir git submodule.
---

# Noir Sync Update

## Workflow

Each step has a corresponding script in `scripts/` that handles execution and verification.
Run each script and commit the results after each step.

```
Noir Sync Update Progress:
- [ ] Step 1: ./scripts/step1-bootstrap-noir.sh
- [ ] Step 2: ./scripts/step2-update-avm-transpiler-cargo-lock.sh
- [ ] Step 3: ./scripts/step3-update-yarn-lock.sh
- [ ] Step 4: ./scripts/step4-format-noir-projects.sh
- [ ] Step 5: ./scripts/step5-check-noir-projects-compile.sh
```

## Scripts

All scripts are in `.claude/skills/noir-sync-update/scripts/` and can be run from the repository root.

### Step 1: `step1-bootstrap-noir.sh`
Runs `./bootstrap.sh` in `noir` to ensure the new submodule commit has been pulled.
No commit should be necessary.

### Step 2: `step2-update-avm-transpiler-cargo-lock.sh`
Updates the `Cargo.lock` in `avm-transpiler` with only noir-repo packages.

The script:
1. Reads expected version from `noir/noir-repo/.release-please-manifest.json`
2. Extracts noir-repo package names from `avm-transpiler/Cargo.toml` (path dependencies pointing to `../noir/noir-repo`)
3. Shows current version in `Cargo.lock`
4. Runs `cargo update -p <pkg>` for each noir-repo package (not all dependencies)
5. Verifies the version matches expected
6. Runs `cargo check` to ensure it builds

**IMPORTANT:** Do NOT use `cargo update` without `-p` flags—this will update ALL dependencies, not just noir-repo packages.

If `avm-transpiler` no longer builds:
- If transient dependency mismatches mean changes to the dependency tree are necessary, modify the `Cargo.lock` file. **DO NOT MODIFY `noir/noir-repo`**.
- If updates are necessary due to changes in exports from `noir/noir-repo` packages, perform the necessary updates to import statements, etc.

### Step 3: `step3-update-yarn-lock.sh`
Runs `yarn install` in `yarn-project` to update the `yarn.lock` file.

### Step 4: `step4-format-noir-projects.sh`
Runs `./bootstrap.sh format` in `noir-projects`.

This is necessary as updates to the noir compiler may result in the formatter handling the same code differently. Failing to run the formatter will result in a CI failure.

### Step 5: `step5-check-noir-projects-compile.sh`
Runs `./bootstrap.sh` in `noir-projects` as a sanity check to ensure it still compiles after the update.
