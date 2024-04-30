wasi-sdk:
	docker build -t aztecprotocol/wasi-sdk:$$(uname -m | sed 's/aarch64/arm64/')-22.0 --target wasi-sdk --push .
	docker manifest create aztecprotocol/wasi-sdk:22.0 \
		--amend aztecprotocol/wasi-sdk:x86_64-22.0 \
		--amend aztecprotocol/wasi-sdk:arm64-22.0
	docker manifest push aztecprotocol/wasi-sdk:22.0

osxcross:
	docker build -t aztecprotocol/osxcross:$$(uname -m | sed 's/aarch64/arm64/')-14.0 --target osxcross --push .
	docker manifest create aztecprotocol/osxcross:14.0 \
		--amend aztecprotocol/osxcross:x86_64-14.0 \
		--amend aztecprotocol/osxcross:arm64-14.0
	docker manifest push aztecprotocol/osxcross:14.0

build:
	docker build -t aztecprotocol/build --target build .

devbox:
	docker build -t aztecprotocol/devbox --target devbox .

sysbox:
	docker build -t aztecprotocol/sysbox --target sysbox .

all: build devbox sysbox

.PHONY: all build devbox sysbox
