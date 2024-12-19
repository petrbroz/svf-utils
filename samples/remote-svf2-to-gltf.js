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
        console.log('Processing view:', view.id);
        const scene = await reader.readView(view);
        const writer = new GltfWriter({
            deduplicate: false,
            skipUnusedUvs: false,
            center: true,
            log: console.log
        });
        await writer.write(scene, path.join(outputDir, view.id));
    }
}

run()
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });