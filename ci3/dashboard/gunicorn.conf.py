# Raise worker timeout so proxy requests to ci-metrics don't hit the 30s default.
# The systemd service passes -w and -b via CLI args; timeout is not set there.
timeout = 120
