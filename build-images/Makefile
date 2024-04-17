build:
        docker build -t aztecprotocol/build --target build .

codespace:
        docker build -t aztecprotocol/codespace --target codespace .

devbox:
        docker build -t aztecprotocol/devbox --target devbox .

sysbox:
        docker build -t aztecprotocol/sysbox --target sysbox .

all: codespace devbox sysbox

.PHONY all build codespace devbox sysbox