const path = require('path');
const fse = require('fs-extra');
const { AuthenticationClient } = require('forge-server-utils');
const { OtgClient } = require('../lib');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

function writeJson(filepath, data) {
    fse.ensureDirSync(path.dirname(filepath));
    fse.writeJsonSync(filepath, data, { spaces: 4 });
}

function writeBuffer(filepath, data) {
    fse.ensureDirSync(path.dirname(filepath));
    fse.writeFileSync(filepath, data);
}

async function downloadAssets(otgClient, assets, modelUrn, versionRoot, basePath, outputPath) {
    try {
        for (const asset of Object.values(assets)) {
            if (typeof asset === 'string') {
                if (asset.startsWith('urn:')) {
                    // Skip urns inside assets for now
                    continue;
                }
                const assetUrn = path.normalize(path.join(versionRoot, basePath, asset));
                const buff = await otgClient.getAsset(modelUrn, assetUrn);
                const assetPath = path.join(outputPath, asset);
                writeBuffer(assetPath, buff);
            } else if (typeof asset === 'object') {
                await downloadAssets(otgClient, asset, modelUrn, versionRoot, basePath, outputPath);
            } else {
                // No other asset values are supported
            }
        }
    } catch (err) {
        if (err.isAxiosError) {
            console.error(err.toJSON());
        } else {
            console.error(err);
        }
    }
}

async function run(urn, outputDir) {
    try {
        const authClient = new AuthenticationClient(FORGE_CLIENT_ID, FORGE_CLIENT_SECRET);
        const auth = await authClient.authenticate(['viewables:read', 'data:read']);
        const otgClient = new OtgClient({ token: auth.access_token });
        const manifest = await otgClient.getManifest(urn);
        writeJson(path.join(outputDir, 'manifest.json'), manifest);

        const viewables = manifest.children.filter(child => child.role === 'viewable' && 'otg_manifest' in child);
        for (const viewable of viewables) {
            const viewableDir = path.join(outputDir, viewable.guid);
            fse.ensureDirSync(viewableDir);
            const otg = viewable.otg_manifest;
            const versionRoot = otg.paths.version_root;
            const sharedRoot = otg.paths.shared_root;
            for (const [guid, view] of Object.entries(otg.views)) {
                console.assert(view.role === 'graphics');
                console.assert(view.mime === 'application/autodesk-otg');
                const otgPath = path.join(viewableDir, view.urn);
                const otgBasePath = path.dirname(view.urn);
                const outputPath = path.dirname(otgPath);
                const otgBuff = await otgClient.getAsset(urn, path.normalize(path.join(versionRoot, view.urn)));
                writeBuffer(otgPath, otgBuff);
                const otg = JSON.parse(otgBuff.toString());
                await downloadAssets(otgClient, otg.manifest.assets, urn, versionRoot, otgBasePath, outputPath);
                await downloadAssets(otgClient, otg.manifest.shared_assets, urn, versionRoot, otgBasePath, outputPath);
            }
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Done!');
}

run(process.argv[2], process.argv[3]);
