// Run `npm install msgpackr` first

const fs = require('fs');
const path = require('path');
const { pack } = require('msgpackr');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('..');

class MsgpackGltfWriter extends GltfWriter {
    serializeManifest(manifest, outputPath) {
        // fs.writeFileSync(outputPath, JSON.stringify(manifest));
        fs.writeFileSync(outputPath + '.msgpack', pack(manifest));
    }
}

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn, outputDir) {
    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' });
        const writer = new MsgpackGltfWriter({ deduplicate: true, center: true, log: console.log });
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
