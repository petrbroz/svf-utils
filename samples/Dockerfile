FROM node:lts

LABEL maintainer="petr.broz@autodesk.com"
LABEL description="Docker image for experimenting with svf-utils and other glTF tools."

# Prepare gltfpack
RUN wget https://github.com/zeux/meshoptimizer/releases/download/v0.13/gltfpack-0.13-ubuntu.zip -O /tmp/gltfpack.zip
RUN unzip -j -d /usr/local/bin /tmp/gltfpack.zip
RUN chmod a+x /usr/local/bin/gltfpack
RUN rm /tmp/gltfpack.zip

# Install Node.js dependencies
RUN npm install --global gltf-pipeline@^2.0.0
RUN npm install --global svf-utils@^5.0.0

# Add test scripts
ADD *.sh *.js /tmp/

WORKDIR /tmp
