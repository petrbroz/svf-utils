// Run `npm install msgpackr` first

const fs = require('fs');
const path = require('path');
const { pack } = require('msgpackr');
const { getSvfDerivatives } = require('./shared.js');
const { SvfReader, GltfWriter, TwoLeggedAuthenticationProvider } = require('..');

class MsgpackGltfWriter extends GltfWriter {
    serializeManifest(manifest, outputPath) {
        // fs.writeFileSync(outputPath, JSON.stringify(manifest));
        fs.writeFileSync(outputPath + '.msgpack', pack(manifest));
    }
}

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

async function run(urn, outputDir) {
    try {
        const derivatives = await getSvfDerivatives(urn, APS_CLIENT_ID, APS_CLIENT_SECRET);
        const authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
        const writer = new MsgpackGltfWriter({ deduplicate: true, center: true, log: console.log });
        for (const derivative of derivatives) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, authenticationProvider);
            const scene = await reader.read({ log: console.log });
            await writer.write(scene, path.join(outputDir, derivative.guid));
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
