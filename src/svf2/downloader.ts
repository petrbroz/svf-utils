import * as path from 'node:path';
import * as fse from 'fs-extra';
import { ModelDataClient } from './helpers/ModelDataClient';
import { SharedDataClient } from './helpers/SharedDataClient';
import { findManifestSVF2, resolveViewURN } from './helpers/Manifest';
import { parseHashes } from './helpers/HashList';
import { IAuthenticationProvider } from '../common/authentication-provider';
import { OTGManifest } from './schemas/Manifest';
import { parse, resolveAssetUrn, resolveGeometryUrn, resolveMaterialUrn, resolveTextureUrn } from './helpers/View';
import { View } from './schemas/View';

export class Downloader {
    protected readonly modelDataClient: ModelDataClient;
    protected readonly sharedDataClient: SharedDataClient;

    constructor(protected readonly authenticationProvider: IAuthenticationProvider) {
        this.modelDataClient = new ModelDataClient(authenticationProvider);
        this.sharedDataClient = new SharedDataClient(authenticationProvider);
    }

    async download(urn: string, outputDir: string): Promise<void> {
        console.log(`Downloading ${urn}...`);
        await fse.ensureDir(outputDir);
        const sharedAssetsDir = outputDir; // For now, store shared assets in the same directory as the views
        const derivativeManifest = await this.modelDataClient.getManifest(urn);
        await fse.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(derivativeManifest, null, 2));
        const manifest = findManifestSVF2(derivativeManifest);
        for (const [id, view] of Object.entries(manifest.views)) {
            if (view.role === 'graphics' && view.mime === 'application/autodesk-otg') {
                await this.downloadView(urn, manifest, id, path.join(outputDir, id), sharedAssetsDir);
            }
        }
    }

    protected async downloadView(urn: string, manifest: OTGManifest, viewId: string, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading view ${viewId}...`);
        await fse.ensureDir(outputDir);
        const resolvedViewURN = resolveViewURN(manifest, manifest.views[viewId]);
        const viewData = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedViewURN));
        const view = parse(JSON.parse(viewData.toString()));
        const viewFilePath = path.join(outputDir, manifest.views[viewId].urn);
        const viewFolderPath = path.dirname(viewFilePath);
        await fse.ensureDir(viewFolderPath);
        await fse.writeFile(viewFilePath, viewData);
        const { assets } = view.manifest;
        await this.downloadFragments(urn, view, resolveAssetUrn(resolvedViewURN, assets.fragments), viewFolderPath, sharedAssetsDir);
        await this.downloadGeometries(urn, view, resolveAssetUrn(resolvedViewURN, assets.geometry_ptrs), viewFolderPath, sharedAssetsDir);
        await this.downloadMaterials(urn, view, resolveAssetUrn(resolvedViewURN, assets.materials_ptrs), viewFolderPath, sharedAssetsDir);
        if (assets.texture_manifest) {
            await this.downloadTextures(urn, view, resolveAssetUrn(resolvedViewURN, assets.texture_manifest), viewFolderPath, sharedAssetsDir);
        }
    }

    protected async downloadFragments(urn: string, view: View, resolvedFragmentListUrn: string, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading fragment list...`);
        const fragmentListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedFragmentListUrn));
        await fse.writeFile(path.join(outputDir, 'fragments.fl'), fragmentListBuffer);
    }

    protected async downloadGeometries(urn: string, view: View, resolvedGeometryListUrn: string, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading geometry list...`);
        const geometryListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedGeometryListUrn));
        await fse.writeFile(path.join(outputDir, 'geometry_ptrs.hl'), geometryListBuffer);
        const geometryFolderPath = path.join(sharedAssetsDir, view.manifest.shared_assets.geometry);
        await fse.ensureDir(geometryFolderPath);
        for (const hash of parseHashes(geometryListBuffer)) {
            const geometryFilePath = path.join(geometryFolderPath, hash);
            if (await fse.pathExists(geometryFilePath)) {
                console.log(`Geometry ${hash} already exists, skipping...`);
                continue;
            }
            console.log(`Downloading geometry ${hash}...`);
            const geometryUrn = resolveGeometryUrn(view, hash);
            const geometryBuffer = await this.sharedDataClient.getAsset(urn, geometryUrn);
            await fse.writeFile(geometryFilePath, geometryBuffer);
        }
    }

    protected async downloadMaterials(urn: string, view: View, resolvedMaterialListUrn: string, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading material list...`);
        const materialListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedMaterialListUrn));
        await fse.writeFile(path.join(outputDir, 'materials_ptrs.hl'), materialListBuffer);
        const materialFolderPath = path.join(sharedAssetsDir, view.manifest.shared_assets.materials);
        await fse.ensureDir(materialFolderPath);
        for (const hash of parseHashes(materialListBuffer)) {
            const materialFilePath = path.join(materialFolderPath, hash);
            if (await fse.pathExists(materialFilePath)) {
                console.log(`Material ${hash} already exists, skipping...`);
                continue;
            }
            console.log(`Downloading material ${hash}...`);
            const materialUrn = resolveMaterialUrn(view, hash);
            const materialBuffer = await this.sharedDataClient.getAsset(urn, materialUrn);
            await fse.writeFile(materialFilePath, materialBuffer);
        }
    }

    protected async downloadTextures(urn: string, view: View, resolvedTextureManifestUrn: string, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading texture manifest...`);
        const textureManifestBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedTextureManifestUrn));
        await fse.writeFile(path.join(outputDir, 'texture_manifest.json'), textureManifestBuffer);
        const textureFolderPath = path.join(sharedAssetsDir, view.manifest.shared_assets.textures);
        await fse.ensureDir(textureFolderPath);
        const textureManifest = JSON.parse(textureManifestBuffer.toString()) as { [key: string]: string };
        for (const [_, uri] of Object.entries(textureManifest)) {
            const textureFilePath = path.join(textureFolderPath, uri);
            if (await fse.pathExists(textureFilePath)) {
                console.log(`Texture ${uri} already exists, skipping...`);
                continue;
            }
            console.log(`Downloading texture ${uri}...`);
            const textureUrn = resolveTextureUrn(view, uri);
            const textureBuffer = await this.sharedDataClient.getAsset(urn, textureUrn);
            await fse.writeFile(textureFilePath, textureBuffer);
        }
    }

    //TODO: download properties
}