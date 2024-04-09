#!/usr/bin/env bash

# Basic SVF-to-glTF conversion test.
# Usage:
#   export APS_CLIENT_ID=<your client id>
#   export APS_CLIENT_SECRET=<your client secret>
#   ./remote-svf-to-gltf.sh <your model urn> <output folder>

# Convert SVF to glTF
node ./bin/svf-to-gltf.js $1 --output-folder $2/gltf --deduplicate --skip-unused-uvs --ignore-lines --ignore-points

# Iterate over glTFs generated for all viewables (in <urn>/<guid> subfolders)
for gltf in $(find $2/gltf -name "output.gltf"); do
    guid_dir=$(dirname $gltf)
    guid=$(basename $guid_dir)
    urn_dir=$(dirname $guid_dir)
    urn=$(basename $urn_dir)
    echo "Validating URN: $urn GUID: $guid"
    node ./tools/validate.js $gltf
done
