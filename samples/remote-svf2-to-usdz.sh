#!/usr/bin/env bash

# Script converting an SVF2 (without property database) from Model Derivative service
# to glTF, and post-processing it using various 3rd party tools.
#
# Usage example with APS credentials:
#   export APS_CLIENT_ID="your client id"
#   export APS_CLIENT_SECRET="your client secret"
#   ./remote-svf2-to-usdz.sh "your model urn" "path to output folder"
#
# Usage example with an existing token:
#   export APS_ACCESS_TOKEN="your token"
#   ./remote-svf2-to-usdz.sh "your model urn" "path to output folder"

docker_image="marlon360/usd-from-gltf:latest"

# Check if the required arguments are provided
urn=$1
output_dir=$2
if [ -z "$urn" ] || [ -z "$output_dir" ]; then
  echo "Usage: remote-svf2-to-usdz.sh <urn> <output_dir>"
  exit 1
fi

# Convert SVF2 to glTF
echo "Converting SVF2 to glTF..."
npx svf2-to-gltf "$urn" "$output_dir"

# Optimize glTFs
echo "Optimizing glTF to glb..."
for dir in "$output_dir"/*/; do
    view=$(basename $dir)
    echo "Processing view: $view..."
    # npx gltfpack -i "$output_dir/$view/output.gltf" -o "$output_dir/$view.glb" -cc # Cannot use gltfpack because the gltf-to-usdz tool does not support its extensions
    npx gltf-pipeline -i "$output_dir/$view/output.gltf" -o "$output_dir/$view.glb" -d
done

# Convert glTFs of individual views to USDZ
echo "Converting glTF to USDz..."
for dir in "$output_dir"/*/; do
    view=$(basename $dir)
    echo "Processing view: $view..."
    docker run -it --rm -v "$output_dir":/usr/app $docker_image "$view/output.gltf" "$view.usdz"
    docker run -it --rm -v "$output_dir":/usr/app $docker_image "$view.glb" "$view.draco.usdz"
    rm -rf "$output_dir/$view"
    rm -rf "$output_dir/$view.glb"
done