---
name: noir-sync-update
description: Perform necessary follow-on updates as a result of updating the noir git submodule.
---

# Noir Sync Update

## Workflow

Copy this checklist and track progress:

```
Changelog Update Progress:
- [ ] Step 1: Ensure that the new submodule commit has been pulled.
- [ ] Step 2: Update the `Cargo.lock` file in `avm-transpiler`.
- [ ] Step 3: Update the `yarn.lock` file in `yarn-project`.
- [ ] Step 4: Format `noir-project`.
- [ ] Step 4: Check `noir-project` still compiles.
```

After each step, commit the results.

### Step 1: Ensure that the new submodule commit has been pulled

Run `./bootstrap.sh` in `noir` to ensure that the new submodule commit has been pulled.

This shouldn't update any files such that a commit is necesssary.

### Step 2: Update `Cargo.lock` in `avm-transpiler`

Run `cargo check` in `avm-transpiler` to update the `Cargo.lock` file.

This is required when a new release of noir has updated the version numbers of the packages which `avm-transpiler` has dependencies on.

It's possible that changes in dependencies results in `avm-transpiler` no longer building.
  - If transient dependency mismatches mean changes to the dependency tree are necessary, then the `Cargo.lock` file in `avm-transpiler` should be modified. **DO NOT MODIFY `noir/noir-repo`**.
  - If updates are necessary due to changes in exports from `noir/noir-repo` packages, then perform the necessary updates to import statements, etc.

### Step 3: Update `yarn.lock` in `yarn-project`

Run `yarn install` in `yarn-project` to update the `yarn.lock` file.

### Step 4: Format `noir-project`

Run `./bootstrap.sh format` in `noir-projects`.

This is necessary as the updates to the noir compiler may result in the formatter handling the same code differently.

Failing to run the formatter will result in a CI failure.

### Step 5: Check `noir-project` still compiles

Run `./bootstrap.sh` in `noir-projects`.

As a sanity check, we want to ensure that `noir-projects` still compiles after the update.
