# Release Image

The final release image is a "mono-container". That is it contains everything that we build and ship.
This keeps things simple, do not diverge from this pattern without discussion.

## Context (Dockerfile.dockerignore)

It's extremely important that we keep the image size as minimal as possible.
The docker context is rooted at the repository root.
We obviously do not want the entire build context in the container.
Therefore we start by excluding _everything_, then specifically "un-ignore" what's needed to run the container.

Broadly, we are only including final compiled binaries required at runtime, and only include the compiled javascript.

## yarn-project dependencies

We want these to only reflect required _production_ dependencies.
The context loads in enough of yarn's requirements to perform this switch to production dependencies in the image.
We finally erase the unnecessary yarn files.

## Multi Stage Image

The Dockerfile is a multi-stage image.
This allows us to strip back to production dependencies, and then create a new slimmer image from that.
The slim image is based on ubuntu:noble, to ensure we have the approptiate runtime system libraries (as per devbox).
We then manually install our required version of node, and a handful of require tools (git, curl, etc).

# Entrypoint

The entrypoint will the aztec cli, you should pass as arguments the desired entrypoint and arguments.
When wanting to run nargo, aztec-wallet, aztec cli, anvil, etc, update the entrypoint to just be bash before executing.
