/*
 * Example: converting an SVF from Model Derivative service
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node derivative-svf-to-gltf.js <your model urn> <path to output folder>
 */

const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('..');

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

run(process.argv[2], process.argv[3]);
