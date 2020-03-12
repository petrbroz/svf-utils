/*
 * Example: downloading OTG assets for all viewables in a Model Derivative URN.
 * The script will generate the following folder structure under the output folder:
 * - <output folder>
 *   - <urn folder>
 *     - <guid folder>
 *     - <guid folder>
 *   - <urn folder>
 *     - <guid folder>
 *     - <guid folder>
 *   - <"g" folder with all shared geometries>
 *     - <hash file with geometry content>
 *     - <hash file with geometry content>
 *   - <"m" folder with all shared materials>
 *     - <hash file with material json>
 *     - <hash file with material json>
 *   - <"t" folder with all shared textures>
 *     - <hash file with texture image>
 *     - <hash file with texture image>
 * Usage:
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node download-otg.js <your model urn> <output folder>
 */

const path = require('path');
const fse = require('fs-extra');
const { AuthenticationClient } = require('forge-server-utils');
const { Client, SharedClient, ManifestHelper, ViewHelper } = require('../lib/otg/client');
const { parseHashes } = require('../lib/otg/hashes');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir = '.') {
    const authClient = new AuthenticationClient(FORGE_CLIENT_ID, FORGE_CLIENT_SECRET);
    const token = await authClient.authenticate(['viewables:read', 'data:read']);
    const otgClient = new Client({ token: token.access_token });
    const sharedClient = new SharedClient({ token: token.access_token });
    const derivativeManifest = await otgClient.getManifest(urn);
    const otgViewable = derivativeManifest.children.find(child => child.otg_manifest);
    if (otgViewable) {
        const urnDir = path.join(outputDir, urn);
        const guidDir = path.join(urnDir, otgViewable.guid);
        fse.ensureDirSync(guidDir);
        const helper = new ManifestHelper(otgViewable.otg_manifest);
        for (const view of helper.listViews()) {
            await downloadView(view, otgClient, urn, guidDir, sharedClient, outputDir);
        }
    }
}

async function downloadView(view, otgClient, urn, guidDir, sharedClient, outputDir) {
    const resolvedUrn = view.resolvedUrn;
    const viewData = await otgClient.getAsset(urn, resolvedUrn);
    const viewDataPath = path.join(guidDir, view.urn);
    fse.ensureDirSync(path.dirname(viewDataPath));
    fse.writeFileSync(viewDataPath, viewData);
    const otgViewHelper = new ViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
    const privateModelAssets = otgViewHelper.listPrivateModelAssets();
    if (privateModelAssets) {
        if (privateModelAssets.fragments) {
            await downloadFragments(otgClient, urn, privateModelAssets, viewDataPath);
        }
        if (privateModelAssets.geometry_ptrs) {
            await downloadGeometries(otgClient, urn, privateModelAssets, viewDataPath, otgViewHelper, sharedClient, outputDir);
        }
        if (privateModelAssets.materials_ptrs) {
            await downloadMaterials(otgClient, urn, privateModelAssets, viewDataPath, otgViewHelper, sharedClient, outputDir);
        }
    }
}

async function downloadFragments(otgClient, urn, privateModelAssets, viewDataPath) {
    const fragmentData = await otgClient.getAsset(urn, privateModelAssets.fragments.resolvedUrn);
    const fragmentPath = path.join(path.dirname(viewDataPath), privateModelAssets.fragments.uri);
    fse.ensureDirSync(path.dirname(fragmentPath));
    fse.writeFileSync(fragmentPath, fragmentData);
}

async function downloadGeometries(otgClient, urn, privateModelAssets, viewDataPath, otgViewHelper, sharedClient, outputDir) {
    const geometryData = await otgClient.getAsset(urn, privateModelAssets.geometry_ptrs.resolvedUrn);
    const geometryPath = path.join(path.dirname(viewDataPath), privateModelAssets.geometry_ptrs.uri);
    fse.ensureDirSync(path.dirname(geometryPath));
    fse.writeFileSync(geometryPath, geometryData);
    for (const hash of parseHashes(geometryData)) {
        const geometryUrn = otgViewHelper.getGeometryUrn(hash);
        const geometryData = await sharedClient.getAsset(urn, geometryUrn);
        const geometryPath = path.join(outputDir, 'g', hash);
        fse.ensureDirSync(path.dirname(geometryPath));
        fse.writeFileSync(geometryPath, geometryData);
    }
}

async function downloadMaterials(otgClient, urn, privateModelAssets, viewDataPath, otgViewHelper, sharedClient, outputDir) {
    const materialsData = await otgClient.getAsset(urn, privateModelAssets.materials_ptrs.resolvedUrn);
    const materialsPath = path.join(path.dirname(viewDataPath), privateModelAssets.materials_ptrs.uri);
    fse.ensureDirSync(path.dirname(materialsPath));
    fse.writeFileSync(materialsPath, materialsData);
    for (const hash of parseHashes(materialsData)) {
        const materialUrn = otgViewHelper.getMaterialUrn(hash);
        const materialData = await sharedClient.getAsset(urn, materialUrn);
        const materialPath = path.join(outputDir, 'm', hash);
        fse.ensureDirSync(path.dirname(materialPath));
        fse.writeFileSync(materialPath, materialData);
        const group = JSON.parse(materialData.toString());
        const material = group.materials[group.userassets[0]];
        if (material.textures) {
            for (const key of Object.keys(material.textures)) {
                const connection = material.textures[key].connections[0];
                const texture = group.materials[connection];
                if (texture && texture.properties.uris && 'unifiedbitmap_Bitmap' in texture.properties.uris) {
                    const uri = texture.properties.uris['unifiedbitmap_Bitmap'].values[0];
                    const textureUrn = otgViewHelper.getTextureUrn(uri);
                    const textureData = await sharedClient.getAsset(urn, textureUrn);
                    const texturePath = path.join(outputDir, 't', uri);
                    fse.ensureDirSync(path.dirname(texturePath));
                    fse.writeFileSync(texturePath, textureData);
                }
            }
        }
    }
}

run(process.argv[2], process.argv[3]);
