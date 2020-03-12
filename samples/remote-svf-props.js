/*
 * Example: parsing object properties for all viewables in a Model Derivative URN.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node remote-svf-props.js <your model urn>
 */

const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn) {
    const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
    const modelDerivativeClient = new ModelDerivativeClient(auth);
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
        const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
        const propdb = await reader.getPropertyDb();
        const props = propdb.getProperties(1);
        for (const name of Object.keys(props)) {
            console.log(`${name}: ${props[name]}`);
        }
        console.log(`Children: ${propdb.getChildren(1).join(',')}`);
    }
}

run(process.argv[2]);
