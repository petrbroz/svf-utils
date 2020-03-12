/*
 * Example: downloading SVF assets for all viewables in a Model Derivative URN.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node download-svf.js <your model urn> <output folder>
 */

const path = require('path');
const fse = require('fs-extra');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir = '.') {
    const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
    const modelDerivativeClient = new ModelDerivativeClient(auth);
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
        const guid = derivative.guid;
        const guidDir = path.join(outputDir, guid);
        fse.ensureDirSync(guidDir);
        const svf = await modelDerivativeClient.getDerivative(urn, derivative.urn);
        fse.writeFileSync(path.join(guidDir, 'output.svf'), svf);
        const reader = await SvfReader.FromDerivativeService(urn, guid, auth);
        const manifest = await reader.getManifest();
        for (const asset of manifest.assets) {
            if (!asset.URI.startsWith('embed:')) {
                const assetData = await reader.getAsset(asset.URI);
                const assetPath = path.join(guidDir, asset.URI);
                const assetFolder = path.dirname(assetPath);
                fse.ensureDirSync(assetFolder);
                fse.writeFileSync(assetPath, assetData);
            }
        }
    }
}

run(process.argv[2], process.argv[3]);
