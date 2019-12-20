const path = require('path');
const fse = require('fs-extra');
const { AuthenticationClient } = require('forge-server-utils');
const { OtgClient, OtgManifestHelper, OtgViewHelper } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

function writeJson(filepath, data) {
    fse.ensureDirSync(path.dirname(filepath));
    fse.writeJsonSync(filepath, data, { spaces: 4 });
}

function writeBuffer(filepath, data) {
    fse.ensureDirSync(path.dirname(filepath));
    fse.writeFileSync(filepath, data);
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
            const otgManifestHelper = new OtgManifestHelper(viewable.otg_manifest);
            const viewableDir = path.join(outputDir, viewable.guid);
            fse.ensureDirSync(viewableDir);

            // Store shared database assets
            for (const asset of otgManifestHelper.listSharedDatabaseAssets()) {
                const assetPath = path.join(viewableDir, asset.resolvedUrn.replace(otgManifestHelper.sharedRoot, ''));
                const assetData = await otgClient.getAsset(urn, asset.resolvedUrn);
                writeBuffer(assetPath, assetData);
            }

            // Store each view manifest
            for (const view of otgManifestHelper.listViews()) {
                console.assert(view.role === 'graphics');
                console.assert(view.mime === 'application/autodesk-otg');
                const viewPath = path.join(viewableDir, view.resolvedUrn.replace(otgManifestHelper.sharedRoot, ''));
                const viewData = await otgClient.getAsset(urn, view.resolvedUrn);
                writeBuffer(viewPath, viewData);
                const otgViewHelper = new OtgViewHelper(JSON.parse(viewData.toString()), view.resolvedUrn);

                // Store private model assets
                const privateModelAssets = otgViewHelper.listPrivateModelAssets();
                if (privateModelAssets) {
                    for (const asset of Object.values(privateModelAssets)) {
                        const assetPath = path.join(viewableDir, asset.resolvedUrn.replace(otgManifestHelper.sharedRoot, ''));
                        const assetData = await otgClient.getAsset(urn, asset.resolvedUrn);
                        writeBuffer(assetPath, assetData);
                    }
                }

                // Store private database assets
                const privateDatabaseAssets = otgViewHelper.listPrivateDatabaseAssets();
                if (privateDatabaseAssets) {
                    for (const asset of Object.values(privateDatabaseAssets)) {
                        const assetPath = path.join(viewableDir, asset.resolvedUrn.replace(otgManifestHelper.sharedRoot, ''));
                        const assetData = await otgClient.getAsset(urn, asset.resolvedUrn);
                        writeBuffer(assetPath, assetData);
                    }
                }
            }
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Done!');
}

run(process.argv[2], process.argv[3]);
