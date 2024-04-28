wasi-sdk:
	docker build -t aztecprotocol/wasi-sdk:22.0 --target wasi-sdk --push .

build:
	docker build -t aztecprotocol/build --target build .

devbox:
	docker build -t aztecprotocol/devbox --target devbox .

sysbox:
	docker build -t aztecprotocol/sysbox --target sysbox .

all: build devbox sysbox

.PHONY: all build devbox sysbox
