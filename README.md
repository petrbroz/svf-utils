# forge-convert-utils

[![build status](https://travis-ci.org/petrbroz/forge-convert-utils.svg?branch=master)](https://travis-ci.org/petrbroz/forge-convert-utils)
[![npm version](https://badge.fury.io/js/forge-convert-utils.svg)](https://badge.fury.io/js/forge-convert-utils)
![node](https://img.shields.io/node/v/forge-convert-utils.svg)
![npm downloads](https://img.shields.io/npm/dw/forge-convert-utils.svg)
![platforms](https://img.shields.io/badge/platform-windows%20%7C%20osx%20%7C%20linux-lightgray.svg)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)

Utilities for converting [Autodesk Forge](https://forge.autodesk.com) SVF file format into
[glTF 2.0](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0).

## Usage

### From Command line

- install the package: `npm install --global forge-convert-utils`
- run the command without parameters for usage info: `forge-convert`
- run the command with parameters, providing either Forge client credentials or access token:

On Windows

```
set FORGE_CLIENT_ID=<client id>
set FORGE_CLIENT_SECRET=<client secret>
forge-convert --output-folder=test <urn>
```

or

```
set FORGE_ACCESS_TOKEN=<access token>>
forge-convert --output-folder=test <urn>
```

On macOS/Linux

```
export FORGE_CLIENT_ID=<client id>
export FORGE_CLIENT_SECRET=<client secret>
forge-convert --output-folder=test <urn>
```

or

```
export FORGE_ACCESS_TOKEN=<access token>>
forge-convert --output-folder=test <urn>
```

### From Node.js

```js
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('forge-convert-utils');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn, outputDir) {
    const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
    const modelDerivativeClient = new ModelDerivativeClient(auth);
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
        const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
        const svf = await reader.read();
        const writer = new GltfWriter();
        writer.write(svf, outputDir);
    }
}

run('your model urn', 'path/to/output/folder');
```

> For more examples, see the [test](./test) subfolder.
