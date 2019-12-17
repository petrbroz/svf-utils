#!/usr/bin/env bash

# Script converting an SVF (without property database) from local file system
# into (1) vanilla gltf, (2) gltf with Draco compression, (3) binary gltf, and
# (4) binary gltf with Draco compression.
# Usage example:
#   ./local-svf-to-gltf.sh <path to svf file> <path to output folder>

# Install dependencies
npm install --global forge-convert-utils gltf-pipeline

# Convert SVF to glTF with [forge-convert-utils](https://github.com/petrbroz/forge-convert-utils)
forge-convert $1 --output-folder $2/gltf --deduplicate --skip-unused-uvs --ignore-lines --ignore-points

# Validate glTF using [gltf-validator](https://github.com/KhronosGroup/glTF-Validator), if available
if [ -x "$(command -v gltf_validator)" ]; then
    gltf_validator $2/gltf/output.gltf
fi

# Post-process with [gltf-pipeline](https://github.com/AnalyticalGraphicsInc/gltf-pipeline)
gltf-pipeline -i $2/gltf/output.gltf -o $2/gltf-draco/output.gltf -d
gltf-pipeline -i $2/gltf/output.gltf -o $2/glb/output.glb
gltf-pipeline -i $2/gltf/output.gltf -o $2/glb-draco/output.glb -d

# Post-process with [gltfpack](https://github.com/zeux/meshoptimizer#gltfpack), if available
if [ -x "$(command -v gltfpack)" ]; then
    mkdir -p $2/glb-pack
    gltfpack -i $2/gltf/output.gltf -o $2/glb-pack/output.glb
fi
