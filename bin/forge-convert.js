#!/usr/bin/env node

const program = require('commander');
const path = require('path');
const fse = require('fs-extra');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');

const { SvfReader, GltfWriter } = require('..');

async function convertRemote(urn, guid, outputFolder, deduplicate) {
    console.log('Converting urn', urn, 'guid', guid);
    const reader = await SvfReader.FromDerivativeService(urn, guid, auth);
    const svf = await reader.read();
    const writer = new GltfWriter(outputFolder, { deduplicate });
    writer.write(svf);
    await writer.close();
}

async function convertLocal(svfPath, outputFolder) {
    console.log('Converting local file', svfPath);
    const reader = await SvfReader.FromFileSystem(svfPath);
    const svf = await reader.read();
    const writer = new GltfWriter(outputFolder);
    writer.write(svf);
    await writer.close();
}

program
    .version(require('./package.json').version, '-v, --version')
    .option('-o, --output-folder [folder]', 'output folder', '.')
    .option('-t, --output-type [type]', 'output file format (gltf)', 'gltf')
    .option('-d, --deduplicate', 'deduplicate geometries (may increase processing time)', false)
    .arguments('<URN or path/to/svf> [GUID]')
    .action(async function (id, guid) {
        try {
            if (id.endsWith('.svf')) {
                // ID is a path to local SVF file
                const filepath = id;
                convertLocal(filepath, program.outputFolder);
            } else {
                // ID is the Model Derivative URN
                // Convert input guid or all guids
                const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET, FORGE_ACCESS_TOKEN } = process.env;
                let auth = null;
                if (FORGE_ACCESS_TOKEN) {
                    auth = { token: FORGE_ACCESS_TOKEN };
                } else if (FORGE_CLIENT_ID && FORGE_CLIENT_SECRET) {
                    auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
                }
                if (!auth) {
                    console.warn('Missing environment variables for Autodesk Forge authentication.');
                    console.warn('Provide FORGE_CLIENT_ID and FORGE_CLIENT_SECRET, or FORGE_ACCESS_TOKEN.');
                    return;
                }

                const urn = id;
                const client = new ModelDerivativeClient(auth);
                const helper = new ManifestHelper(await client.getManifest(urn));
                const folder = path.join(program.outputFolder, urn);
                if (guid) {
                    await convertRemote(urn, guid, folder, program.deduplicate);
                } else {
                    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
                    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
                        await convertRemote(urn, derivative.guid, path.join(folder, derivative.guid), program.deduplicate);
                    }
                }

                // Store the property database within the <urn> subfolder (it is shared by all viewables)
                const pdbDerivatives = helper.search({ type: 'resource', role: 'Autodesk.CloudPlatform.PropertyDatabase' });
                if (pdbDerivatives.length > 0) {
                    const pdb = await client.getDerivative(urn, pdbDerivatives[0].urn);
                    fse.writeFileSync(path.join(folder, 'properties.sqlite'), pdb);
                }
            }
        } catch (err) {
            console.error(err);
        }
    })
    .parse(process.argv);

if (program.args.length === 0) {
    program.help();
}
