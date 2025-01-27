#!/usr/bin/env bash

docker run -it --rm -v $(PWD)/tmp/svf2-gltf/rst-basic-websockets/3c2f6701-637e-83fb-8f2d-f4c4ad90cd99:/usr/app marlon360/usd-from-gltf:latest output.gltf output.usdz