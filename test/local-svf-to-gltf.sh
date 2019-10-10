#!/usr/bin/env bash

# Example: converting an SVF (without property database) from local file system to glTF
# Usage:
#     npm install --global forge-convert-utils
#     ./local-svf-to-gltf.sh <path to svf file> <path to output folder>

npm install --global forge-convert-utils
forge-convert $1 --output-folder $2 --deduplicate
