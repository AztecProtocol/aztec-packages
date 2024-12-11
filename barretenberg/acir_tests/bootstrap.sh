#!/bin/bash

(cd headless-test && yarn && npx playwright install && npx playwright install-deps)
(cd browser-test-app && yarn && yarn build)
