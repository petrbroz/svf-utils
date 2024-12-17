const { SVF2Reader, SVF2Scene, GltfWriter } = require('..');
const path = require('path')

const { APS_ACCESS_TOKEN } = process.env;
const [,, urn, outputDir] = process.argv;

async function run() {
    const reader = await SVF2Reader.FromDerivativeService(urn, APS_ACCESS_TOKEN);
    const model = await reader.read();
    const scene = new SVF2Scene(model.views[0]); // For now, just grab the first view
    const writer = new GltfWriter({
        deduplicate: false,
        skipUnusedUvs: false,
        center: true,
        log: console.log
    });
    await writer.write(scene, path.join(outputDir, model.views[0].id));
}

run()
    .then(() => console.log('Done!'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });