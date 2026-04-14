---
name: read-gist
description: Fetch and display a GitHub gist. Triggers when the user asks to read, fetch, or view a URL from gist.github.com.
argument-hint: "<gist URL or ID>"
allowed-tools: Bash(gh gist *), WebFetch
---

# Read Gist

Fetch and display the contents of a GitHub gist.

## Trigger

Activate this skill when the user provides a URL matching `gist.github.com` or asks to fetch/read a gist by ID.

## Parameters

The argument is a gist URL or gist ID: $ARGUMENTS

## Steps

1. **Extract the gist ID** from the input. It can be:
   - A full URL like `https://gist.github.com/<user>/<id>` -> extract `<id>`
   - A full URL like `https://gist.github.com/<id>` -> extract `<id>`
   - A raw URL like `https://gist.githubusercontent.com/...` -> extract the gist ID segment
   - A bare gist ID (hex string)

2. **Try `gh gist view`** first (preferred):

   ```bash
   gh gist view <id> --raw
   ```

   If the gist has multiple files, list them first with `gh gist view <id>` (without `--raw`) to show filenames, then fetch with `--raw` or specify a filename with `-f <filename>` if the user asked for a specific file.

3. **Fallback to WebFetch** only if `gh` is not available or the command fails with an auth/install error:
   - Fetch `https://gist.githubusercontent.com/<user>/<id>/raw` for single-file gists
   - Or fetch the gist API endpoint `https://api.github.com/gists/<id>` and extract file contents from the JSON response

4. **Return the contents** to the caller. If there are multiple files, show each file with its filename as a header.
