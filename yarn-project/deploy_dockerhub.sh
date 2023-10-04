#!/bin/bash
deploy_dockerhub aztec-sandbox x86_64
deploy_dockerhub aztec-sandbox arm64
create_dockerhub_manifest aztec-sandbox x86_64,arm64

deploy_dockerhub pxe x86_64
deploy_dockerhub pxe arm64
create_dockerhub_manifest pxe x86_64,arm64