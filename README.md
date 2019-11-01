# forge-convert-utils

[![build status](https://travis-ci.org/petrbroz/forge-convert-utils.svg?branch=master)](https://travis-ci.org/petrbroz/forge-convert-utils)
[![npm version](https://badge.fury.io/js/forge-convert-utils.svg)](https://badge.fury.io/js/forge-convert-utils)
![node](https://img.shields.io/node/v/forge-convert-utils.svg)
![npm downloads](https://img.shields.io/npm/dw/forge-convert-utils.svg)
![platforms](https://img.shields.io/badge/platform-windows%20%7C%20osx%20%7C%20linux-lightgray.svg)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)

Utilities for converting [Autodesk Forge](https://forge.autodesk.com) SVF file format into
[glTF 2.0](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0).

> Check out [forge-convert-sqlite](https://github.com/petrbroz/forge-convert-sqlite) with an experimental
> serialization/deserialization of glTF to/from sqlite.

## Usage

### Command line

- install the package: `npm install --global forge-convert-utils`
- run the `forge-convert` command without parameters for usage info
- run the command with a path to a local SVF file
- run the command with a Model Derivative URN (and optionally viewable GUID)
    - to access Forge you must also specify credentials (`FORGE_CLIENT_ID` and `FORGE_CLIENT_SECRET`)
    or an authentication token (`FORGE_ACCESS_TOKEN`) as env. variables
- optionally, use any combination of the following command line args:
  - `--output-folder <folder>` to change output folder (by default '.')
  - `--output-type glb` to output _glb_ file instead of _gltf_
  - `--deduplicate` to try and remove duplicate geometries
  - `--skip-unused-uvs` to skip texture UVs that are not used by any material
  - `--compress` to compress meshes using Draco
  - `--ignore-meshes` to exclude mesh geometry from the output
  - `--ignore-lines` to exclude line geometry from the output
  - `--ignore-points` to exclude point geometry from the output

#### Unix/macOS

```
forge-convert <path to local svf> --output-folder <path to output folder>
```

or

```
export FORGE_CLIENT_ID=<client id>
export FORGE_CLIENT_SECRET=<client secret>
forge-convert <urn> --output-folder <path to output folder>
```

or

```
export FORGE_ACCESS_TOKEN=<access token>>
forge-convert <urn> --output-folder <path to output folder>
```

#### Windows

```
forge-convert <path to local svf> --output-folder <path to output folder>
```

or

```
set FORGE_CLIENT_ID=<client id>
set FORGE_CLIENT_SECRET=<client secret>
forge-convert <urn> --output-folder <path to output folder>
```

or

```
set FORGE_ACCESS_TOKEN=<access token>
forge-convert <urn> --output-folder <path to output folder>
```

### Node.js

The library can be used at different levels of granularity.

The easiest way to convert an SVF file is to read the entire model into memory
using [SvfReader#read](https://petrbroz.github.io/forge-convert-utils/docs/classes/_svf_reader_.reader.html#read)
method, and save the model into glTF using [GltfWriter#write](https://petrbroz.github.io/forge-convert-utils/docs/classes/_gltf_writer_.writer.html#write):

```js
const path = require('path');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('forge-convert-utils');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir) {
    const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
    const modelDerivativeClient = new ModelDerivativeClient(auth);
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
    const readerOptions = {
        log: console.log
    };
    const writerOptions = {
        deduplicate: true,
        skipUnusedUvs: true,
        log: console.log
    };
    const writer = new GltfWriter(writerOptions);
    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
        const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
        const svf = await reader.read(readerOptions);
        await writer.write(svf, path.join(outputDir, derivative.guid));
    }
}

run('your model urn', 'path/to/output/folder');
```

If you don't want to read the entire model into memory (for example, when distributing
the parsing of an SVF over multiple servers), you can use methods like
[SvfReader#enumerateFragments](https://petrbroz.github.io/forge-convert-utils/docs/classes/_svf_reader_.reader.html#enumeratefragments)
or [SvfReader#enumerateGeometries](https://petrbroz.github.io/forge-convert-utils/docs/classes/_svf_reader_.reader.html#enumerategeometries)
to _asynchronously_ iterate over individual elements:

```js
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('forge-convert-utils');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn) {
    const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
    const modelDerivativeClient = new ModelDerivativeClient(auth);
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
        const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
        for await (const fragment of reader.enumerateFragments()) {
            console.log(fragment);
        }
    }
}

run('your model urn');
```

And finally, if you already have the individual SVF assets in memory, you can parse the binary data
directly using _synchronous_ iterators like [parseMeshes](https://petrbroz.github.io/forge-convert-utils/docs/modules/_svf_meshes_.html#parsemeshes):

```js
const { parseMeshes } = require('forge-convert-utils/lib/svf/meshes');
for (const mesh of parseMeshes(buffer)) {
    console.log(mesh);
}
```

> For additional examples, see the [test](./test) subfolder.

## Development

- clone the repository
- install dependencies: `yarn install`
- build the library (transpile TypeScript): `yarn run build`
- optionally, generate code docs: `yarn run docs`
- run samples in the _test_ subfolder, for example: `FORGE_CLIENT_ID=<your client id> FORGE_CLIENT_SECRET=<your client secret> node test/remote-svf-to-gltf.js <model urn> <path to output folder>`

If you're using [Visual Studio Code](https://code.visualstudio.com), you can use the following "task" and "launch" configurations:

In _.vscode/tasks.json_:

```json
...
{
    "label": "build",
    "type": "npm",
    "script": "build",
    "problemMatcher": [
        "$tsc"
    ],
    "group": "build",
    "presentation": {
        "echo": true,
        "reveal": "silent",
        "focus": false,
        "panel": "shared",
        "showReuseMessage": false,
        "clear": false
    }
}
...
```

In _.vscode/launch.json_:

```json
...
{
    "type": "node",
    "request": "launch",
    "name": "Convert Model Derivative SVF to glTF",
    "program": "${workspaceFolder}/test/remote-svf-to-gltf.js",
    "args": ["<your model urn>", "<path to output folder>"],
    "env": {
        "FORGE_CLIENT_ID": "<your client id>",
        "FORGE_CLIENT_SECRET": "<your client secret>"
    },
    "preLaunchTask": "build"
},
{
    "type": "node",
    "request": "launch",
    "name": "Convert Local SVF to glTF",
    "program": "${workspaceFolder}/test/local-svf-to-gltf.js",
    "args": ["<path to svf file>", "<path to output folder>"],
    "preLaunchTask": "build"
}
...
```
