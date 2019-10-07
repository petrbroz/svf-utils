#!/usr/bin/env node

const program = require('commander');
const path = require('path');
const fse = require('fs-extra');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');

const { SvfReader, GltfWriter } = require('.');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET, FORGE_ACCESS_TOKEN } = process.env;
let auth = null;
if (FORGE_ACCESS_TOKEN) {
    auth = { token: FORGE_ACCESS_TOKEN };
} else if (FORGE_CLIENT_ID && FORGE_CLIENT_SECRET) {
    auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
}

async function convert(urn, guid, folder) {
    console.log('Converting urn', urn, 'guid', guid);
    const reader = await SvfReader.FromDerivativeService(urn, guid, auth);
    const svf = await reader.read();
    const writer = new GltfWriter();
    writer.write(svf, folder);
}

program
    .version(require('./package.json').version, '-v, --version')
    .option('-o, --output-folder [folder]', 'output folder', '.')
    .option('-t, --output-type [type]', 'output file format (gltf)', 'gltf')
    .arguments('<urn> [guid]')
    .action(async function(urn, guid) {
        try {
            if (!auth) {
                console.warn('Missing environment variables for Autodesk Forge authentication.');
                console.warn('Provide FORGE_CLIENT_ID and FORGE_CLIENT_SECRET, or FORGE_ACCESS_TOKEN.');
                return;
            }

            const client = new ModelDerivativeClient(auth);
            const helper = new ManifestHelper(await client.getManifest(urn));

            // Convert input guid or all guids
            const folder = path.join(program.outputFolder, urn);
            if (guid) {
                await convert(urn, guid, folder);
            } else {
                const derivatives = helper.search({ type: 'resource', role: 'graphics' });
                for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
                    await convert(urn, derivative.guid, path.join(folder, derivative.guid));
                }
            }

            // Store the property database within the <urn> subfolder (it is shared by all viewables)
            const pdbDerivatives = helper.search({ type: 'resource', role: 'Autodesk.CloudPlatform.PropertyDatabase' });
            if (pdbDerivatives.length > 0) {
                const pdb = await client.getDerivative(urn, pdbDerivatives[0].urn);
                fse.writeFileSync(path.join(folder, 'properties.sqlite'), pdb);
            }
        } catch(err) {
            console.error(err);
        }
    })
    .parse(process.argv);

if (program.args.length === 0) {
    program.help();
}
