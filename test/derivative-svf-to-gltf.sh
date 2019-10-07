#!/usr/bin/env bash

# Example: converting an SVF (without property database) from local file system into glTF
# Usage:
#     npm install --global forge-convert-utils
#     export FORGE_CLIENT_ID=<your client id>
#     export FORGE_CLIENT_SECRET=<your client secret>
#     forge-convert <your model urn> [guid] --output-folder <path to output folder>

npm install --global forge-convert-utils
forge-convert $1 --output-folder ./tmp
