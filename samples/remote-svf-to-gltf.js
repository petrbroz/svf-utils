/*
 * Example: converting an SVF (incl. property database) from Model Derivative service.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node remote-svf-to-gltf.js <your model urn> <path to output folder>
 */

const path = require('path');
const fs = require('fs');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn, outputDir) {
    const defaultOptions = {
        deduplicate: false,
        skipUnusedUvs: false,
        center: true,
        log: console.log
    };

    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' });
        const writer0 = new GltfWriter(Object.assign({}, defaultOptions));
        const writer1 = new GltfWriter(Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true }));
        // Convert individual 3D viewables into glTFs
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
            const scene = await reader.read({ log: console.log });
            await writer0.write(scene, path.join(outputDir, derivative.guid, 'gltf-raw'));
            await writer1.write(scene, path.join(outputDir, derivative.guid, 'gltf-dedup'));
        }
        // Also download property database in sqlite form
        const pdbDerivatives = helper.search({ type: 'resource', role: 'Autodesk.CloudPlatform.PropertyDatabase' });
        if (pdbDerivatives.length > 0) {
            const databaseStream = modelDerivativeClient.getDerivativeChunked(urn, pdbDerivatives[0].urn, 1 << 20);
            databaseStream.pipe(fs.createWriteStream(path.join(outputDir, 'properties.sqlite')));
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
