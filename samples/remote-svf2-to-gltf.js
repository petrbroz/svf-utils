/**
 * A sample script that converts an SVF2 model from the Model Derivative service to glTF.
 *
 * Usage:
 *
 *     node remote-svf2-to-gltf.js <urn> <outputDir>
 *
 * - `urn` is the URN of the SVF2 file to convert.
 * - `outputDir` is the directory to save the converted glTF files.
 *
 * Set the following environment variables:
 *
 * - `APS_CLIENT_ID`: client ID of your APS application.
 * - `APS_CLIENT_SECRET`: client secret of your APS application.
 *
 * Alternatively, you can set the following environment variable:
 *
 * - `APS_ACCESS_TOKEN`: existing access token (with "viewables:read" scope).
 */

const path = require('path')
const { SVF2Reader, GltfWriter } = require('..');
const { initializeAuthenticationProvider } = require('./shared.js');

const [,, urn, outputDir] = process.argv;
if (!urn || !outputDir) {
    console.error('Usage: node remote-svf2-to-gltf.js <urn> <outputDir>');
    process.exit(1);
}

async function run() {
    const authenticationProvider = initializeAuthenticationProvider();
    const reader = await SVF2Reader.FromDerivativeService(urn, authenticationProvider);
    const views = await reader.listViews();
    for (const view of views) {
        const scene = await reader.readView(view);
        const writer = new GltfWriter({
            deduplicate: false,
            skipUnusedUvs: false,
            center: true,
            log: console.log
        });
        await writer.write(scene, path.join(outputDir, view));
    }
}

run()
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });