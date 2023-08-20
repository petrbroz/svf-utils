const { Svf2Reader, GltfWriter } = require('..');
const { Scene } = require('../lib/svf2/reader');
const path = require('path')

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;


const defaultOptions = {
    deduplicate: false,
    skipUnusedUvs: false,
    center: true,
    log: console.log
};

async function run(urn, guid) {
    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET};
        const reader = await Svf2Reader.FromDerivativeService(urn, guid, auth);
        const svf2 = await reader.read();
        // console.log(svf2);
        let scene = new Scene(svf2.views[0])
        const writer = new GltfWriter(Object.assign({}, defaultOptions));
        await writer.write(scene, path.join('../output', 'gltf', svf2.views[0].id));

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Done!');
}

run(process.argv[2], process.argv[3]);
