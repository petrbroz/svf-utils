#!/usr/bin/env bash

# Script converting an SVF (without property database) from Model Derivative service
# to glTF, and post-processing it using various 3rd party tools.
#
# Usage example with Forge credentials:
#   export FORGE_CLIENT_ID=<your client id>
#   export FORGE_CLIENT_SECRET=<your client secret>
#   ./remote-svf-to-gltf.sh <your model urn> <path to output folder>
#
# Usage example with an existing token:
#   export FORGE_ACCESS_TOKEN=<your token>
#   ./remote-svf-to-gltf.sh <your model urn> <path to output folder>

# Convert SVF to glTF with [forge-convert-utils](https://github.com/petrbroz/forge-convert-utils)
npm install --global forge-convert-utils
forge-convert $1 --output-folder $2/gltf --deduplicate --skip-unused-uvs --ignore-lines --ignore-points

# Validate glTF using [gltf-validator](https://github.com/KhronosGroup/glTF-Validator), if available
if [ -x "$(command -v gltf_validator)" ]; then
    gltf_validator $2/gltf/output.gltf
fi

# Post-process with [gltf-pipeline](https://github.com/AnalyticalGraphicsInc/gltf-pipeline)
npm install --global gltf-pipeline
gltf-pipeline -i $2/gltf/output.gltf -o $2/gltf-draco/output.gltf -d
gltf-pipeline -i $2/gltf/output.gltf -o $2/glb/output.glb
gltf-pipeline -i $2/gltf/output.gltf -o $2/glb-draco/output.glb -d

# Post-process with [gltfpack](https://github.com/zeux/meshoptimizer#gltfpack), if available
if [ -x "$(command -v gltfpack)" ]; then
    mkdir -p $2/glb-pack
    gltfpack -i $2/gltf/output.gltf -o $2/glb-pack/output.glb
fi
