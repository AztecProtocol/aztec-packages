#!/bin/bash
# Source this file to define the PROJECTS variable, needed by build_local, used by bootstrap_docker.sh.
#
# PROJECT elements have structure PROJECT_DIR_NAME:WORKING_DIR:DOCKERFILE:REPO.
#  PROJECT_DIR_NAME: Should reflect the projects directory name.
#  WORKING_DIR: Everything within this directory is copied into the docker context (excluding paths in .dockerignore).
#  DOCKERFILE: Defaults to Dockerfile. However some projects have multiple build Dockerfiles located in subdirs.
#  REPO: Defaults to <PROJECT_DIR_NAME>. The docker repository name, used to name the resulting docker image.
#
# This file tells bootstrap_docker.sh which and in which order to build projects for locally testing the docker builds.
# To check *most* of the build works as expected, we can just do the minimum to produce the e2e tests, and run them
# locally to check they work. Other projects can be *temporarily* uncommented to test their Dockerfiles, but don't
# commit them, so that the most important build path remains fast and simple.

PROJECTS=(
  circuits:circuits/cpp:./dockerfiles/Dockerfile.wasm-linux-clang:circuits-wasm-linux-clang
  l1-contracts:l1-contracts
  noir-contracts:yarn-project
  yarn-project-base:yarn-project
  end-to-end:yarn-project
  aztec-sandbox:yarn-project
)
