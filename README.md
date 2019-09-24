# forge-extract

[![build status](https://travis-ci.org/petrbroz/forge-extract.svg?branch=master)](https://travis-ci.org/petrbroz/forge-extract)
[![npm version](https://badge.fury.io/js/forge-extract.svg)](https://badge.fury.io/js/forge-extract)
![node](https://img.shields.io/node/v/forge-extract.svg)
![npm downloads](https://img.shields.io/npm/dw/forge-extract.svg)
![platforms](https://img.shields.io/badge/platform-windows%20%7C%20osx%20%7C%20linux-lightgray.svg)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](http://opensource.org/licenses/MIT)

Utilities for converting [Autodesk Forge](https://forge.autodesk.com) SVF file format into
[glTF 2.0](https://github.com/KhronosGroup/glTF/tree/master/specification/2.0).

## Usage

### From Command line

- install the package: `npm install --global forge-extract`
- run the command without parameters for usage info: `forge-extract`
- run the command with parameters, providing either Forge client credentials or access token:
    - `FORGE_CLIENT_ID=<client id> FORGE_CLIENT_SECRET=<client secret> forge-extract --output-folder=test <urn>`, or
    - `FORGE_ACCESS_TOKEN=<access token> forge-extract --output-folder=test <urn>`

### From Node.js

```js
const { deserialize } = require('forge-extract/lib/svf');
const { serialize } = require('forge-extract/lib/gltf');
const svf = await deserialize('<model urn>', '<viewable guid>', { client_id: '<client id>', client_secret: '<client secret>' });
await serialize(svf, path.join(__dirname, 'tmp', FORGE_MODEL_URN, FORGE_VIEWABLE_GUID));
```
