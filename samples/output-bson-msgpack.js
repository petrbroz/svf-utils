/*
 * Example: outputting the manifest in the BSON and msgpack formats.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node output-bson-msgpack.js <your model urn> <path to output folder>
 */

const path = require('path');
const fs = require('fs').promises;
const BSON = require('bson');
const msgpack = require('msgpack');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('../lib');

class MyGltfWriter extends GltfWriter {
    async postprocess(imf, gltfPath) {
        const bsonBuff = BSON.serialize(this.manifest);
        await fs.writeFile(gltfPath + '.bson', bsonBuff);
        const msgpackBuff = msgpack.pack(this.manifest);
        await fs.writeFile(gltfPath + '.msgpack', msgpackBuff);
    }
}

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir) {
    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' });
        const writer = new MyGltfWriter({
            deduplicate: true,
            skipUnusedUvs: true,
            log: console.log
        });
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
            const scene = await reader.read({ log: console.log });
            await writer.write(scene, path.join(outputDir, derivative.guid));
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
