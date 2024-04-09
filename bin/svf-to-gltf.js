#!/usr/bin/env node

const program = require('commander');
const path = require('path');
const { SdkManagerBuilder } = require('@aps_sdk/autodesk-sdkmanager');
const { ModelDerivativeClient} = require('@aps_sdk/model-derivative');
const { Scopes } = require('@aps_sdk/authentication');
const { SvfReader, GltfWriter, BasicAuthenticationProvider, TwoLeggedAuthenticationProvider } = require('../lib');

const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_ACCESS_TOKEN } = process.env;
let authenticationProvider = null;
if (APS_ACCESS_TOKEN) {
    authenticationProvider = new BasicAuthenticationProvider(APS_ACCESS_TOKEN);
} else if (APS_CLIENT_ID && APS_CLIENT_SECRET) {
    authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
}

async function convertRemote(urn, guid, outputFolder, options) {
    console.log(`Converting urn ${urn}, guid ${guid}`);
    const reader = await SvfReader.FromDerivativeService(urn, guid, authenticationProvider);
    const scene = await reader.read({ log: console.log });
    const writer = new GltfWriter(options);
    await writer.write(scene, path.join(outputFolder, guid));
}

async function convertLocal(svfPath, outputFolder, options) {
    console.log(`Converting local file ${svfPath}`);
    const reader = await SvfReader.FromFileSystem(svfPath);
    const scene = await reader.read({ log: console.log });
    const writer = new GltfWriter(options);
    await writer.write(scene, path.join(outputFolder));
}

program
    .version(require('../package.json').version, '-v, --version')
    .option('-o, --output-folder [folder]', 'output folder', '.')
    .option('-d, --deduplicate', 'deduplicate geometries (may increase processing time)', false)
    .option('-s, --skip-unused-uvs', 'skip unused texture coordinate data', false)
    .option('-im, --ignore-meshes', 'ignore mesh geometry', false)
    .option('-il, --ignore-lines', 'ignore line geometry', false)
    .option('-ip, --ignore-points', 'ignore point geometry', false)
    .option('--center', 'move model to origin', false)
    .arguments('<URN-or-local-path> [GUID]')
    .action(async function (id, guid) {
        const options = {
            deduplicate: program.deduplicate,
            skipUnusedUvs: program.skipUnusedUvs,
            ignoreMeshGeometry: program.ignoreMeshes,
            ignoreLineGeometry: program.ignoreLines,
            ignorePointGeometry: program.ignorePoints,
            center: program.center,
            log: console.log
        };
        try {
            if (id.endsWith('.svf')) {
                // ID is a path to local SVF file
                const filepath = id;
                convertLocal(filepath, program.outputFolder, options);
            } else {
                // ID is the Model Derivative URN
                // Convert input guid or all guids
                if (!authenticationProvider) {
                    console.warn('Missing environment variables for APS authentication.');
                    console.warn('Provide APS_CLIENT_ID and APS_CLIENT_SECRET, or APS_ACCESS_TOKEN.');
                    return;
                }

                const urn = id;
                const folder = path.join(program.outputFolder, urn);
                if (guid) {
                    await convertRemote(urn, guid, folder, options);
                } else {
                    const sdkManager = SdkManagerBuilder.create().build();
                    const modelDerivativeClient = new ModelDerivativeClient(sdkManager);
                    const accessToken = await authenticationProvider.getToken([Scopes.ViewablesRead]);
                    const manifest = await modelDerivativeClient.getManifest(accessToken, urn);
                    const derivatives = [];
                    function traverse(derivative) {
                        if (derivative.type === 'resource' && derivative.role === 'graphics' && derivative.mime === 'application/autodesk-svf') {
                            derivatives.push(derivative);
                        }
                        if (derivative.children) {
                            for (const child of derivative.children) {
                                traverse(child);
                            }
                        }
                    }
                    for (const derivative of manifest.derivatives) {
                        if (derivative.children) {
                            for (const child of derivative.children) {
                                traverse(child);
                            }
                        }
                    }
                    for (const derivative of derivatives) {
                        await convertRemote(urn, derivative.guid, folder, options);
                    }
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
