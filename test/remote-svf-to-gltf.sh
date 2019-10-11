#!/usr/bin/env bash

# Example: converting an SVF (without property database) from local file system into glTF,
# and optimizing the result into a GLB format with Draco compression
# Usage:
#     npm install --global forge-convert-utils
#     export FORGE_CLIENT_ID=<your client id>
#     export FORGE_CLIENT_SECRET=<your client secret>
#     ./remote-svf-to-gltf.sh <your model urn> <path to output folder>

npm install --global forge-convert-utils gltf-pipeline
forge-convert $1 --output-folder $2 --deduplicate
gltf-pipeline -i $2/output.gltf -o $2/output.glb -d
