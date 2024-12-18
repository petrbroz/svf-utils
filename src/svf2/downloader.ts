import * as path from 'node:path';
import * as fse from 'fs-extra';
import { ModelDataClient } from './helpers/ModelDataClient';
import { SharedDataClient } from './helpers/SharedDataClient';
import { ManifestHelper, IView } from './helpers/ManifestHelper';
import { ViewHelper } from './helpers/ViewHelper';
import { parseHashes } from './helpers/HashList';

export class Downloader {
    protected readonly modelDataClient: ModelDataClient;
    protected readonly sharedDataClient: SharedDataClient;

    constructor(accessToken: string) {
        this.modelDataClient = new ModelDataClient(accessToken);
        this.sharedDataClient = new SharedDataClient(accessToken);
    }

    async download(urn: string, outputDir: string): Promise<void> {
        // TODO: use a separate output directory for "shared assets"
        await fse.ensureDir(outputDir);
        const manifest = await this.modelDataClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.role === 'viewable' && child.otg_manifest);
        console.assert(viewable, 'Could not find a viewable with SVF2 data');
        const manifestHelper = new ManifestHelper(viewable.otg_manifest);
        for (const view of manifestHelper.listViews()) {
            if (view.role === 'graphics' && view.mime === 'application/autodesk-otg') {
                await this.downloadView(urn, view, path.join(outputDir, view.id));
            }
        }
    }

    protected async downloadView(urn: string, view: IView, outputDir: string): Promise<void> {
        console.log(`Downloading view ${view.urn}...`);
        await fse.ensureDir(outputDir);
        const viewData = await this.modelDataClient.getAsset(urn, encodeURIComponent(view.resolvedUrn));
        const viewFilePath = path.join(outputDir, view.urn);
        await fse.ensureDir(path.dirname(viewFilePath));
        await fse.writeFile(viewFilePath, viewData);
        const viewHelper = new ViewHelper(JSON.parse(viewData.toString()), view.resolvedUrn);
        const privateModelAssets = viewHelper.listPrivateModelAssets()!;
        await this.downloadFragments(urn, privateModelAssets.fragments.resolvedUrn, outputDir, viewHelper);
        await this.downloadGeometries(urn, privateModelAssets.geometry_ptrs.resolvedUrn, outputDir, viewHelper);
        await this.downloadMaterials(urn, privateModelAssets.materials_ptrs.resolvedUrn, outputDir, viewHelper);
        if (privateModelAssets.texture_manifest) {
            console.log('TEST', privateModelAssets.texture_manifest);
            await this.downloadTextures(urn, privateModelAssets.texture_manifest.resolvedUrn, outputDir, viewHelper);
        }
    }

    protected async downloadFragments(urn: string, resolvedFragmentListUrn: string, outputDir: string, viewHelper: ViewHelper): Promise<void> {
        console.log(`Downloading fragment list...`);
        const fragmentListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedFragmentListUrn));
        await fse.writeFile(path.join(outputDir, 'fragments.fl'), fragmentListBuffer);
    }

    protected async downloadGeometries(urn: string, resolvedGeometryListUrn: string, outputDir: string, viewHelper: ViewHelper): Promise<void> {
        console.log(`Downloading geometry list...`);
        const geometryListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedGeometryListUrn));
        await fse.writeFile(path.join(outputDir, 'geometry_ptrs.hl'), geometryListBuffer);
        const geometryFolderPath = path.join(outputDir, viewHelper.view.manifest.shared_assets.geometry);
        await fse.ensureDir(geometryFolderPath);
        for (const hash of parseHashes(geometryListBuffer)) {
            console.log(`Downloading geometry ${hash}...`);
            const geometryUrn = viewHelper.getGeometryUrn(hash);
            const geometryBuffer = await this.sharedDataClient.getAsset(urn, geometryUrn);
            await fse.writeFile(path.join(geometryFolderPath, hash), geometryBuffer);
        }
    }

    protected async downloadMaterials(urn: string, resolvedMaterialListUrn: string, outputDir: string, viewHelper: ViewHelper): Promise<void> {
        console.log(`Downloading material list...`);
        const materialListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedMaterialListUrn));
        await fse.writeFile(path.join(outputDir, 'materials_ptrs.hl'), materialListBuffer);
        const materialFolderPath = path.join(outputDir, viewHelper.view.manifest.shared_assets.materials);
        await fse.ensureDir(materialFolderPath);
        for (const hash of parseHashes(materialListBuffer)) {
            console.log(`Downloading material ${hash}...`);
            const materialUrn = viewHelper.getMaterialUrn(hash);
            const materialBuffer = await this.sharedDataClient.getAsset(urn, materialUrn);
            await fse.writeFile(path.join(materialFolderPath, hash), materialBuffer);
        }
    }

    protected async downloadTextures(urn: string, resolvedTextureManifestUrn: string, outputDir: string, viewHelper: ViewHelper): Promise<void> {
        console.log(`Downloading texture manifest...`);
        const textureManifestBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedTextureManifestUrn));
        await fse.writeFile(path.join(outputDir, 'texture_manifest.json'), textureManifestBuffer);
        const textureFolderPath = path.join(outputDir, viewHelper.view.manifest.shared_assets.textures);
        await fse.ensureDir(textureFolderPath);
        const textureManifest = JSON.parse(textureManifestBuffer.toString()) as { [key: string]: string };
        for (const [_, uri] of Object.entries(textureManifest)) {
            console.log(`Downloading texture ${uri}...`);
            const textureUrn = viewHelper.getTextureUrn(uri);
            const textureBuffer = await this.sharedDataClient.getAsset(urn, textureUrn);
            await fse.writeFile(path.join(textureFolderPath, uri), textureBuffer);
        }
    }
}