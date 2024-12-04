#!/usr/bin/env bash

(cd cpp && ./bootstrap.sh $@)
(cd ts && ./bootstrap.sh $@)
(cd acir_tests && ./bootstrap.sh $@)
