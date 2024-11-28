# Build System

The Aztec build system is agnostic to its underlying platform. The cache system supports a remote cache that is S3 API compatible, e.g. AWS S3 or minio.

## Requirements

There were several intentional requirements.

- Monorepo support (or at least, multiple projects within one repository).
- Builds on a rich docker build image and normal dockerized execution.
- Don't rebuild projects that haven't changed as part of a commit (generate and compare content hashes).
- Allow fine or coarse grained control, of which file changes within a project, trigger a rebuild.
- Stateless (apart from the source repository itself, and the remote cache).
- Enable building on EC2 spot instances. They're extremely cheap and powerful relative to CI offerings.
- Deploy updated services only on a fully successful build of entire project.
- No vendor lock-in (don't use vendor specific features). Vendor easily changeable, only used for orchestration.

## Important Concepts

We avoid using any CI platform-specific features. They are very general purpose, and are thus often flawed. Also, we don't want vendor lock-in as vendors have caused us multiple problems in the past.

The build system leverages a remote cache to keep track of build artifacts and historical success or failure in terms of builds, tests, and deployments. It's otherwise stateless.

We work in terms of _content hashes_, not commit hashes or branches. Content hashes are like commit hashes, but are scoped to files matching the rebuild patterns.

A rebuild pattern is a regular expression that is matched against a list of changed files. We often use pretty broad regular expressions that trigger rebuilds if _any_ file in a project changes, but you can be more fine-grained, e.g. not triggering rebuilds if you change something inconsequential.

This module provides a series of tools intended to write straight-forward scripts. A script should source ci3/base/source and write their scripts using the $ci3 path installed. Then tools can be accessed using the $ci3 path variable.
