import * as path from 'path';
import * as fse from 'fs-extra';
import { AuthenticationClient, ModelDerivativeClient } from 'forge-server-utils';
import { Client, SharedClient, ManifestHelper, ViewHelper, IView } from './client';
import { parseHashes } from './hashes';

export class Downloader {
    protected auth: { client_id: string; client_secret: string; };
    protected authClient: AuthenticationClient;
    protected modelDerivativeClient: ModelDerivativeClient;

    constructor(client_id: string, client_secret: string) {
        this.auth = { client_id, client_secret };
        this.authClient = new AuthenticationClient(this.auth.client_id, this.auth.client_secret);
        this.modelDerivativeClient = new ModelDerivativeClient(this.auth);
    }

    async download(urn: string, outputDir: string): Promise<void> {
        const token = await this.authClient.authenticate(['viewables:read', 'data:read']);
        const otgClient = new Client({ token: token.access_token });
        const sharedClient = new SharedClient({ token: token.access_token });
        const derivativeManifest = await otgClient.getManifest(urn);
        const otgViewable = derivativeManifest.children.find((child: any) => child.otg_manifest);
        if (otgViewable) {
            const urnDir = path.join(outputDir, urn);
            const guidDir = path.join(urnDir, otgViewable.guid);
            fse.ensureDirSync(guidDir);
            const helper = new ManifestHelper(otgViewable.otg_manifest);
            for (const view of helper.listViews()) {
                await this.downloadView(urn, view, otgClient, sharedClient, outputDir, guidDir);
            }
        }
    }

    private async downloadView(urn: string, view: IView, otgClient: Client, sharedClient: SharedClient, outputDir: string, guidDir: string): Promise<void> {
        const resolvedUrn = view.resolvedUrn;
        const viewData = await otgClient.getAsset(urn, resolvedUrn);
        const viewDataPath = path.join(guidDir, view.urn);
        fse.ensureDirSync(path.dirname(viewDataPath));
        fse.writeFileSync(viewDataPath, viewData);
        const otgViewHelper = new ViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();
        if (privateModelAssets) {
            if (privateModelAssets.fragments) {
                await this.downloadFragments(otgClient, urn, privateModelAssets, viewDataPath);
            }
            if (privateModelAssets.geometry_ptrs) {
                await this.downloadGeometries(otgClient, urn, privateModelAssets, viewDataPath, otgViewHelper, sharedClient, outputDir);
            }
            if (privateModelAssets.materials_ptrs) {
                await this.downloadMaterials(otgClient, urn, privateModelAssets, viewDataPath, otgViewHelper, sharedClient, outputDir);
            }
        }
    }

    private async downloadFragments(otgClient: Client, urn: string, privateModelAssets: { [key: string]: { uri: string; resolvedUrn: string; }; }, viewDataPath: string) {
        const fragmentData = await otgClient.getAsset(urn, privateModelAssets.fragments.resolvedUrn);
        const fragmentPath = path.join(path.dirname(viewDataPath), privateModelAssets.fragments.uri);
        fse.ensureDirSync(path.dirname(fragmentPath));
        fse.writeFileSync(fragmentPath, fragmentData);
    }

    private async downloadGeometries(otgClient: Client, urn: string, privateModelAssets: { [key: string]: { uri: string; resolvedUrn: string; }; }, viewDataPath: string, otgViewHelper: ViewHelper, sharedClient: SharedClient, outputDir: string) {
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

    private async downloadMaterials(otgClient: Client, urn: string, privateModelAssets: { [key: string]: { uri: string; resolvedUrn: string; }; }, viewDataPath: string, otgViewHelper: ViewHelper, sharedClient: SharedClient, outputDir: string) {
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
}
