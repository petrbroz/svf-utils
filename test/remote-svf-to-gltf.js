/*
 * Example: converting an SVF (without property database) from Model Derivative service
 * with different output options.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     DEBUG=reader,writer:* node remote-svf-to-gltf.js <your model urn> <path to output folder>
 */

const path = require('path');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn, outputDir) {
    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' });
        const writer0 = new GltfWriter(path.join(outputDir, 'gltf-nodedup'), { deduplicate: false, skipUnusedUvs: false, binary: false, compress: false, log: console.log });
        const writer1 = new GltfWriter(path.join(outputDir, 'gltf'), { deduplicate: true, skipUnusedUvs: true, binary: false, compress: false, log: console.log });
        const writer2 = new GltfWriter(path.join(outputDir, 'glb-draco'), { deduplicate: true, skipUnusedUvs: true, binary: true, compress: true, log: console.log });
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
            const svf = await reader.read({ log: console.log });
            writer0.write(svf);
            writer1.write(svf);
            writer2.write(svf);
        }
        await writer0.close();
        await writer1.close();
        await writer2.close();
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
