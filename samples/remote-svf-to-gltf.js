/*
 * Example: converting an SVF from Model Derivative service.
 * Usage:
 *     export APS_CLIENT_ID=<your client id>
 *     export APS_CLIENT_SECRET=<your client secret>
 *     node remote-svf-to-gltf.js <your model urn> <path to output folder>
 */

const path = require('path');
const { getSvfDerivatives } = require('./shared.js');
const { SvfReader, GltfWriter, TwoLeggedAuthenticationProvider } = require('..');

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

async function run(urn, outputDir) {
    try {
        const derivatives = await getSvfDerivatives(urn, APS_CLIENT_ID, APS_CLIENT_SECRET);
        const writer0 = new GltfWriter({ deduplicate: false, skipUnusedUvs: false, center: true, log: console.log });
        const writer1 = new GltfWriter({ deduplicate: true, skipUnusedUvs: true, center: true, log: console.log });
        const authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
        for (const derivative of derivatives) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, authenticationProvider);
            const scene = await reader.read({ log: console.log });
            await writer0.write(scene, path.join(outputDir, derivative.guid, 'gltf-raw'));
            await writer1.write(scene, path.join(outputDir, derivative.guid, 'gltf-dedup'));
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
