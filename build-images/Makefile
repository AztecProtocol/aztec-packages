build:
	docker build -t aztecprotocol/build . --target build

basebox: build
	docker build -t aztecprotocol/basebox . --target basebox

devbox: basebox
	docker build -t aztecprotocol/devbox . --target devbox

sysbox: basebox
	docker build -t aztecprotocol/sysbox --target sysbox .

all: build devbox basebox

.PHONY: all build basebox devbox sysbox
