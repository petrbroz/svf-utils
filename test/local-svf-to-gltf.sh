#!/usr/bin/env bash

# Example: converting an SVF (without property database) from local file system to glTF,
# and optimizing the result into a GLB format with Draco compression
# Usage:
#     npm install --global forge-convert-utils
#     ./local-svf-to-gltf.sh <path to svf file> <path to output folder>

npm install --global forge-convert-utils gltf-pipeline
forge-convert $1 --output-folder $2 --deduplicate
gltf-pipeline -i $2/output.gltf -o $2/output.glb -d
