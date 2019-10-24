#!/usr/bin/env node

const program = require('commander');
const path = require('path');
const fse = require('fs-extra');
const debug = require('debug');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');

const { SvfReader, GltfWriter } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET, FORGE_ACCESS_TOKEN } = process.env;
let auth = null;
if (FORGE_ACCESS_TOKEN) {
    auth = { token: FORGE_ACCESS_TOKEN };
} else if (FORGE_CLIENT_ID && FORGE_CLIENT_SECRET) {
    auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
}

async function convertRemote(urn, guid, outputFolder, options) {
    const log = debug('cli');
    log(`Converting urn ${urn}, guid ${guid}`);
    const reader = await SvfReader.FromDerivativeService(urn, guid, auth);
    const svf = await reader.read({ log: debug('cli:reader') });
    options.log = debug('cli:writer');
    const writer = new GltfWriter(outputFolder, options);
    writer.write(svf);
    await writer.close();
}

async function convertLocal(svfPath, outputFolder, options) {
    const log = debug('cli');
    log(`Converting local file ${svfPath}`);
    const reader = await SvfReader.FromFileSystem(svfPath);
    const svf = await reader.read({ log: debug('cli:reader') });
    options.log = debug('cli:writer');
    const writer = new GltfWriter(outputFolder, options);
    writer.write(svf);
    await writer.close();
}

program
    .version(require('../package.json').version, '-v, --version')
    .option('-o, --output-folder [folder]', 'output folder', '.')
    .option('-t, --output-type [type]', 'output file format (gltf, glb)', 'gltf')
    .option('-d, --deduplicate', 'deduplicate geometries (may increase processing time)', false)
    .option('-s, --skip-unused-uvs', 'skip unused texture coordinate data', false)
    .option('-c, --compress', 'compress meshes using Draco (may increase processing time)', false)
    .option('-im, --ignore-meshes', 'ignore mesh geometry', false)
    .option('-il, --ignore-lines', 'ignore line geometry', false)
    .option('-ip, --ignore-points', 'ignore point geometry', false)
    .option('--sqlite', 'serialize gltf manifest into sqlite', false)
    .arguments('<URN or path/to/svf> [GUID]')
    .action(async function (id, guid) {
        const options = {
            binary: program.outputType === 'glb',
            compress: program.compress,
            sqlite: program.sqlite,
            deduplicate: program.deduplicate,
            skipUnusedUvs: program.skipUnusedUvs,
            ignoreMeshGeometry: program.ignoreMeshes,
            ignoreLineGeometry: program.ignoreLines,
            ignorePointGeometry: program.ignorePoints
        };
        try {
            if (id.endsWith('.svf')) {
                // ID is a path to local SVF file
                const filepath = id;
                convertLocal(filepath, program.outputFolder, options);
            } else {
                // ID is the Model Derivative URN
                // Convert input guid or all guids
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
                    await convertRemote(urn, guid, folder, options);
                } else {
                    const derivatives = helper.search({ type: 'resource', role: 'graphics' });
                    for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
                        await convertRemote(urn, derivative.guid, path.join(folder, derivative.guid), options);
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
