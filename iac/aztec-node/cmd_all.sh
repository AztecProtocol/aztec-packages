#!/bin/bash
parallel --tag --line-buffered ./cmd.sh {} $@ ::: eu-central ca-central ap-southeast us-west sa-east
