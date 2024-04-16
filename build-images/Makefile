#!/bin/sh
build:
	docker build -f Dockerfile.build -t aztecprotocol/build .

basebox: build
	docker build -f Dockerfile.basebox -t aztecprotocol/basebox .

codespace: basebox
	docker build -f Dockerfile.codespace -t aztecprotocol/codespace .

devbox: basebox
	docker build -f Dockerfile.devbox -t aztecprotocol/devbox .

sysbox: basebox
	docker build -f Dockerfile.sysbox -t aztecprotocol/sysbox .