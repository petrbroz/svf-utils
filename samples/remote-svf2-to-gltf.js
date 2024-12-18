const { SVF2Reader, GltfWriter } = require('..');
const path = require('path')

const { APS_ACCESS_TOKEN } = process.env;
const [,, urn, outputDir] = process.argv;

async function run() {
    const reader = await SVF2Reader.FromDerivativeService(urn, APS_ACCESS_TOKEN);
    const views = await reader.listViews();
    if (views.length > 0) {
        const view = views[0]; // Read the first view
        const scene = await reader.readView(view);
        const writer = new GltfWriter({
            deduplicate: false,
            skipUnusedUvs: false,
            center: true,
            log: console.log
        });
        await writer.write(scene, path.join(outputDir, view.id));
    } else {
        console.error('No views found in the SVF2 file.');
    }
}

run()
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });