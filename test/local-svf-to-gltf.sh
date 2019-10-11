#!/usr/bin/env bash

# Example: converting an SVF (without property database) from local file system
# into (1) vanilla gltf, (2) gltf with Draco compression, (3) binary gltf, and
# (4) binary gltf with Draco compression.
# Usage:
#     ./local-svf-to-gltf.sh <path to svf file> <path to output folder>

npm install --global forge-convert-utils
forge-convert $1 --output-folder $2/gltf --deduplicate
forge-convert $1 --output-folder $2/gltf-draco --deduplicate --compress
forge-convert $1 --output-folder $2/glb --deduplicate --binary
forge-convert $1 --output-folder $2/glb-draco --deduplicate --binary --compress
