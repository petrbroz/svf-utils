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

# Install dependencies
npm install --global forge-convert-utils gltf-pipeline

# Convert SVF to glTF with [forge-convert-utils](https://github.com/petrbroz/forge-convert-utils)
forge-convert $1 --output-folder $2/gltf --deduplicate --skip-unused-uvs --ignore-lines --ignore-points

# Iterate over glTFs generated for all viewables (in <urn>/<guid> subfolders)
for gltf in $(find $2/gltf -name "output.gltf"); do
    guid_dir=$(dirname $gltf)
    guid=$(basename $guid_dir)
    urn_dir=$(dirname $guid_dir)
    urn=$(basename $urn_dir)

    echo Postprocessing URN: $urn GUID: $guid

    # Validate glTF using [gltf-validator](https://github.com/KhronosGroup/glTF-Validator), if available
    if [ -x "$(command -v gltf_validator)" ]; then
        gltf_validator $gltf
    fi

    # Post-process with [gltf-pipeline](https://github.com/AnalyticalGraphicsInc/gltf-pipeline)
    gltf-pipeline -i $gltf -o $2/gltf-draco/$urn/$guid/output.gltf -d
    gltf-pipeline -i $gltf -o $2/glb/$urn/$guid/output.glb
    gltf-pipeline -i $gltf -o $2/glb-draco/$urn/$guid/output.glb -d

    # Post-process with [gltfpack](https://github.com/zeux/meshoptimizer#gltfpack), if available
    if [ -x "$(command -v gltfpack)" ]; then
        mkdir -p $2/glb-pack/$urn/$guid
        gltfpack -i $gltf -o $2/glb-pack/$urn/$guid/output.glb
    fi
done
