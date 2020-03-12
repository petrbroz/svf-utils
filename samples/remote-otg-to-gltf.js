const path = require('path');
const { OtgReader, GltfWriter } = require('../lib');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, guid, outputDir) {
    const defaultOptions = {
        deduplicate: false,
        skipUnusedUvs: false,
        center: true,
        log: console.log
    };

    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const reader = await OtgReader.FromDerivativeService(urn, guid, auth, { log: console.log });
        const scene = await reader.read();
        const writer = new GltfWriter(defaultOptions);
        await writer.write(scene, path.join(outputDir, guid, 'gltf-raw'));
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Done!');
}

run(process.argv[2], process.argv[3], process.argv[4]);
