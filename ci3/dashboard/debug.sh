#!/bin/bash

REDIS_HOST=localhost flask --app rk.py --debug run --port ${PORT:-8080}
