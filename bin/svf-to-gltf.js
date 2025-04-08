#!/usr/bin/env node

const path = require('path');
const { parseArgs } = require('node:util');
const { Scopes } = require('@aps_sdk/authentication');
const { ModelDerivativeClient} = require('@aps_sdk/model-derivative');
const { SvfReader, GltfWriter, BasicAuthenticationProvider, TwoLeggedAuthenticationProvider } = require('../lib');

const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_ACCESS_TOKEN, APS_REGION } = process.env;
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

// Parse command line arguments
const args = parseArgs({
    options: {
        'output-folder': {
            type: 'string',
            short: 'o',
            default: '.',
            description: 'Output folder.'
        },
        'deduplicate': {
            type: 'boolean',
            default: false,
            description: 'Deduplicate geometries (may increase processing time).'
        },
        'skip-unused-uvs': {
            type: 'boolean',
            short: 's',
            default: false,
            description: 'Skip unused texture coordinate data.'
        },
        'ignore-meshes': {
            type: 'boolean',
            short: 'im',
            default: false,
            description: 'Ignore mesh geometry.'
        },
        'ignore-lines': {
            type: 'boolean',
            short: 'il',
            default: false,
            description: 'Ignore line geometry.'
        },
        'ignore-points': {
            type: 'boolean',
            short: 'ip',
            default: false,
            description: 'Ignore point geometry.'
        },
        'center': {
            type: 'boolean',
            default: false,
            description: 'Move the model to the origin.',
        }
    },
    allowPositionals: true
});
const [urn, guid] = args.positionals;
if (!urn || !guid) {
    console.error('Usage: svf-to-gltf.js <urn> <guid>');
    process.exit(1);
}

const options = {
    deduplicate: args.values.deduplicate,
    skipUnusedUvs: args.values['skip-unused-uvs'],
    ignoreMeshGeometry: args.values['ignore-meshes'],
    ignoreLineGeometry: args.values['ignore-lines'],
    ignorePointGeometry: args.values['ignore-points'],
    center: args.values.center,
    log: console.log
};
try {
    if (id.endsWith('.svf')) {
        // ID is a path to local SVF file
        const filepath = id;
        convertLocal(filepath, args.values['output-folder'], options);
    } else {
        // ID is the Model Derivative URN
        // Convert input guid or all guids
        if (!authenticationProvider) {
            console.warn('Missing environment variables for APS authentication.');
            console.warn('Provide APS_CLIENT_ID and APS_CLIENT_SECRET, or APS_ACCESS_TOKEN.');
            return;
        }

        const urn = id;
        const folder = path.join(args.values['output-folder'], urn);
        if (guid) {
            await convertRemote(urn, guid, folder, options);
        } else {
            const modelDerivativeClient = new ModelDerivativeClient();
            const accessToken = await authenticationProvider.getToken([Scopes.ViewablesRead]);
            const manifest = await modelDerivativeClient.getManifest(urn, { accessToken, region: APS_REGION });
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