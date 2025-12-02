# Local Sandbox FAQ

This page answers common questions about running the Aztec Sandbox on
your local machine.

It is meant to complement, not replace, the official documentation on:

- getting started on Sandbox
- node prerequisites
- running and updating the Aztec toolchain

---

## 1. What are the minimum prerequisites for the Sandbox?

Before starting the Sandbox, make sure that:

- Node.js is installed:
  - recommended: the LTS version used by the Aztec toolchain
  - supported: a recent Node.js release in the range documented in the
    Sandbox guide (for example, Node 20+)
- Docker is installed and the Docker daemon is running
- you have enough free disk space for images, containers, and logs

Quick checks:

```bash
node --version
docker --version
docker ps
