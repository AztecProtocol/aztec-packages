# yarn-project-base

## Why?

If you want to rebuild a docker container for a project in the workspace, you don't want to have to be waiting
to download the entire set of workspace dependencies just because you changed a line of code. The way docker caches
and reuses layers is very powerful. We build this base image in order to:

1. Encapsulate the downloading of all workspace dependencies.
1. Check our package.json files have inherited from the common package.json.
1. Check out tsconfig project references are all correct.
1. Check all formatting is correct.
1. Generate L1 contract ABIs.
1. Generate Noir contract ABIs.

All downstream projects can then assume these things have already been handled, greatly improving build times,
and reducing possiblities of bugs.

## Do we care about docker layer caching, when build-system rebuild patterns only trigger on yarn.lock changes?

Yes. When building the containers locally for development or debugging purposes, you can't use the content hash
to skip parts of the build, as content hashes require everything to have been committed to git. This is usually
is not the case during development.

## Why are we split into two, Dockerfile and Dockerfile.deps?

Dockerfile.deps is built first, and has it's own .dockerignore file that ensures none of the project source code
is within it's context. Only files related to steps 1-3.

Dockerfile is built second and builds upon Dockerfile.deps. It copies in the rest of the yarn workspace context and
handles steps 4-6.
