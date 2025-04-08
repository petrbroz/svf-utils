#!/usr/bin/env node

const path = require('path');
const { parseArgs } = require('node:util');
const { SVF2Reader, GltfWriter, BasicAuthenticationProvider, TwoLeggedAuthenticationProvider } = require('..');

async function run(urn, outputDir, options, authenticationProvider) {
    const reader = await SVF2Reader.FromDerivativeService(urn, authenticationProvider);
    const views = await reader.listViews();
    for (const view of views) {
        const scene = await reader.readView(view);
        const writer = new GltfWriter({
            deduplicate: false,
            center: options.center,
            ignoreLineGeometry: true,
            ignorePointGeometry: true,
            skipUnusedUvs: true,
            log: console.log
        });
        await writer.write(scene, path.join(outputDir, view));
    }
}

// Read authentication credentials from environment variables
const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_ACCESS_TOKEN } = process.env;
let authenticationProvider = null;
if (APS_ACCESS_TOKEN) {
    authenticationProvider = new BasicAuthenticationProvider(APS_ACCESS_TOKEN);
} else if (APS_CLIENT_ID && APS_CLIENT_SECRET) {
    authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
} else {
    console.error('Missing authentication credentials. Set APS_ACCESS_TOKEN or APS_CLIENT_ID and APS_CLIENT_SECRET.');
    process.exit(1);
}

// Parse command line arguments
const args = parseArgs({
    options: {
        center: {
            type: 'boolean',
            default: true,
            description: 'Move the model to the origin.'
        }
    },
    allowPositionals: true
});
const [urn, outputDir] = args.positionals;
if (!urn || !outputDir) {
    console.error('Usage: svf2-to-gltf.js <urn> <outputDir> [--center]');
    process.exit(1);
}

run(urn, outputDir, args.values, authenticationProvider)
    .then(() => console.log('Done!'))
    .catch(err => { console.error(err.message); process.exit(1); });