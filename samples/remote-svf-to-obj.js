/*
 * Example: converting an SVF (incl. property database) from Model Derivative service.
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node remote-svf-to-obj.js <your model urn> <path to output obj file>
 */

const path = require('path');
const fse = require('fs-extra');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, ObjWriter } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run (urn, outputDir) {
    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' });
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
            const scene = await reader.read({ log: console.log });
            fse.ensureDirSync(path.join(outputDir, derivative.guid));
            const writer = new ObjWriter();
            await writer.write(scene, path.join(outputDir, derivative.guid, 'output.obj'));
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
