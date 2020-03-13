import * as path from 'path';
import * as fse from 'fs-extra';
import { AuthenticationClient, ModelDerivativeClient } from 'forge-server-utils';
import { Client, SharedClient, ManifestHelper, ViewHelper, IView } from './client';
import { parseHashes } from './hashes';

export interface IDownloadOptions {
    outputDir?: string;
    log?: (message: string) => void;
}

export interface IDownloadTask {
    ready: Promise<void>;
    cancel: () => void;
}

interface IDownloadContext {
    log: (message: string) => void;
    cancelled: boolean;
    otgClient: Client;
    sharedClient: SharedClient;
    outputDir: string;
    urnDir: string;
    guidDir: string;
    viewDataPath: string;
}

interface IModelAssets {
    [key: string]: { uri: string; resolvedUrn: string; };
}

export class Downloader {
    protected auth: { client_id: string; client_secret: string; };
    protected authClient: AuthenticationClient;
    protected modelDerivativeClient: ModelDerivativeClient;

    constructor(client_id: string, client_secret: string) {
        this.auth = { client_id, client_secret };
        this.authClient = new AuthenticationClient(this.auth.client_id, this.auth.client_secret);
        this.modelDerivativeClient = new ModelDerivativeClient(this.auth);
    }

    download(urn: string, options?: IDownloadOptions): IDownloadTask {
        const context: IDownloadContext = {
            log: options?.log || ((message: string) => {}),
            cancelled: false,
            otgClient: new Client(this.auth),
            sharedClient: new SharedClient(this.auth),
            outputDir: options?.outputDir || '.',
            urnDir: '',
            guidDir: '',
            viewDataPath: ''
        };
        return {
            ready: this._download(urn, context),
            cancel: () => { context.cancelled = true; }
        };
    }

    private async _download(urn: string, context: IDownloadContext): Promise<void> {
        const token = await this.authClient.authenticate(['viewables:read', 'data:read']);
        context.otgClient = new Client({ token: token.access_token });
        context.sharedClient = new SharedClient({ token: token.access_token });
        context.log(`Downloading derivative ${urn}`);
        const derivativeManifest = await context.otgClient.getManifest(urn);
        const otgViewable = derivativeManifest.children.find((child: any) => child.otg_manifest);
        if (otgViewable) {
            context.urnDir = path.join(context.outputDir, urn);
            context.guidDir = path.join(context.urnDir, otgViewable.guid);
            fse.ensureDirSync(context.guidDir);
            const helper = new ManifestHelper(otgViewable.otg_manifest);
            for (const view of helper.listViews()) {
                if (context.cancelled) {
                    return;
                }
                context.log(`Downloading view ${view.urn}`);
                await this._downloadView(urn, view, context);
            }
        }
    }

    private async _downloadView(urn: string, view: IView, context: IDownloadContext): Promise<void> {
        const resolvedUrn = view.resolvedUrn;
        const viewData = await context.otgClient.getAsset(urn, resolvedUrn);
        context.viewDataPath = path.join(context.guidDir, view.urn);
        fse.ensureDirSync(path.dirname(context.viewDataPath));
        fse.writeFileSync(context.viewDataPath, viewData);
        const otgViewHelper = new ViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();
        if (privateModelAssets) {
            if (privateModelAssets.fragments) {
                if (context.cancelled) {
                    return;
                }
                await this._downloadFragments(urn, otgViewHelper, privateModelAssets, context);
            }
            if (privateModelAssets.geometry_ptrs) {
                if (context.cancelled) {
                    return;
                }
                await this._downloadGeometries(urn, otgViewHelper, privateModelAssets, context);
            }
            if (privateModelAssets.materials_ptrs) {
                if (context.cancelled) {
                    return;
                }
                await this._downloadMaterials(urn, otgViewHelper, privateModelAssets, context);
            }
        }
    }

    private async _downloadFragments(urn: string, otgViewHelper: ViewHelper, privateModelAssets: IModelAssets, context: IDownloadContext) {
        const fragmentData = await context.otgClient.getAsset(urn, privateModelAssets.fragments.resolvedUrn);
        const fragmentPath = path.join(path.dirname(context.viewDataPath), privateModelAssets.fragments.uri);
        fse.ensureDirSync(path.dirname(fragmentPath));
        fse.writeFileSync(fragmentPath, fragmentData);
    }

    private async _downloadGeometries(urn: string, otgViewHelper: ViewHelper, privateModelAssets: IModelAssets, context: IDownloadContext) {
        const geometryData = await context.otgClient.getAsset(urn, privateModelAssets.geometry_ptrs.resolvedUrn);
        const geometryPath = path.join(path.dirname(context.viewDataPath), privateModelAssets.geometry_ptrs.uri);
        fse.ensureDirSync(path.dirname(geometryPath));
        fse.writeFileSync(geometryPath, geometryData);
        for (const hash of parseHashes(geometryData)) {
            if (context.cancelled) {
                return;
            }
            const geometryUrn = otgViewHelper.getGeometryUrn(hash);
            const geometryData = await context.sharedClient.getAsset(urn, geometryUrn);
            const geometryPath = path.join(context.outputDir, 'g', hash);
            fse.ensureDirSync(path.dirname(geometryPath));
            fse.writeFileSync(geometryPath, geometryData);
        }
    }

    private async _downloadMaterials(urn: string, otgViewHelper: ViewHelper, privateModelAssets: IModelAssets, context: IDownloadContext) {
        const materialsData = await context.otgClient.getAsset(urn, privateModelAssets.materials_ptrs.resolvedUrn);
        const materialsPath = path.join(path.dirname(context.viewDataPath), privateModelAssets.materials_ptrs.uri);
        fse.ensureDirSync(path.dirname(materialsPath));
        fse.writeFileSync(materialsPath, materialsData);
        for (const hash of parseHashes(materialsData)) {
            if (context.cancelled) {
                return;
            }
            const materialUrn = otgViewHelper.getMaterialUrn(hash);
            const materialData = await context.sharedClient.getAsset(urn, materialUrn);
            const materialPath = path.join(context.outputDir, 'm', hash);
            fse.ensureDirSync(path.dirname(materialPath));
            fse.writeFileSync(materialPath, materialData);
            const group = JSON.parse(materialData.toString());
            const material = group.materials[group.userassets[0]];
            if (material.textures) {
                for (const key of Object.keys(material.textures)) {
                    if (context.cancelled) {
                        return;
                    }
                    const connection = material.textures[key].connections[0];
                    const texture = group.materials[connection];
                    if (texture && texture.properties.uris && 'unifiedbitmap_Bitmap' in texture.properties.uris) {
                        const uri = texture.properties.uris['unifiedbitmap_Bitmap'].values[0];
                        const textureUrn = otgViewHelper.getTextureUrn(uri);
                        const textureData = await context.sharedClient.getAsset(urn, textureUrn);
                        const texturePath = path.join(context.outputDir, 't', uri);
                        fse.ensureDirSync(path.dirname(texturePath));
                        fse.writeFileSync(texturePath, textureData);
                    }
                }
            }
        }
    }
}
