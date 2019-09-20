# forge-extract

Prototype of a simple SVF-to-glTF translator.

## Usage

### From Command line

- install the package: `npm install --global forge-extract`
- run the command without parameters for usage info: `forge-extract`
- run the command line script with parameters, providing either Forge client credentials or access token:
    - `FORGE_CLIENT_ID=<client id> FORGE_CLIENT_SECRET=<client secret> forge-extract --output-folder=test <urn>`
    - `FORGE_ACCESS_TOKEN=<access token> forge-extract --output-folder=test <urn>`

### From Node.js

```js
const { deserialize } = require('forge-extract/lib/svf');
const { serialize } = require('forge-extract/lib/gltf');
const svf = await deserialize('<model urn>', '<viewable guid>', { client_id: '<client id>', client_secret: '<client secret>' });
await serialize(svf, path.join(__dirname, 'tmp', FORGE_MODEL_URN, FORGE_VIEWABLE_GUID));
```
