import * as path from 'node:path';
import * as fse from 'fs-extra';
import { ModelDataHttpClient } from './helpers/ModelDataHttpClient';
import { SharedDataHttpClient } from './helpers/SharedDataHttpClient';
import { SharedDataWebSocketClient, AssetType } from './helpers/SharedDataWebSocketClient';
import { findManifestSVF2, resolveViewURN } from './helpers/Manifest';
import { parseHashes } from './helpers/HashList';
import { IAuthenticationProvider } from '../common/authentication-provider';
import { OTGManifest } from './helpers/Manifest.schema';
import { View } from './helpers/View.schema';
import { getViewAccount, parse, resolveAssetUrn, resolveGeometryUrn, resolveMaterialUrn, resolveTextureUrn } from './helpers/View';

const UseWebSockets = true;
const BatchSize = 32;

export class Downloader {
    protected readonly modelDataClient: ModelDataHttpClient;
    protected readonly sharedDataClient: SharedDataHttpClient;
    protected sharedDataWebSocketClient?: SharedDataWebSocketClient;

    constructor(protected readonly authenticationProvider: IAuthenticationProvider) {
        this.modelDataClient = new ModelDataHttpClient(authenticationProvider);
        this.sharedDataClient = new SharedDataHttpClient(authenticationProvider);
    }

    async download(urn: string, outputDir: string): Promise<void> {
        console.log(`Downloading ${urn}...`);
        await fse.ensureDir(outputDir);
        const sharedAssetsDir = outputDir; // For now, store shared assets in the same directory as the views
        const derivativeManifest = await this.modelDataClient.getManifest(urn);
        await fse.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(derivativeManifest, null, 2));
        const manifest = findManifestSVF2(derivativeManifest);
        this.sharedDataWebSocketClient = await SharedDataWebSocketClient.Connect(this.authenticationProvider);
        for (const [id, view] of Object.entries(manifest.views)) {
            if (view.role === 'graphics' && view.mime === 'application/autodesk-otg') {
                await this.downloadView(urn, manifest, id, path.join(outputDir, id), sharedAssetsDir);
            }
        }
        this.sharedDataWebSocketClient.close();
    }

    protected async downloadView(urn: string, manifest: OTGManifest, viewId: string, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading view ${viewId}...`);
        await fse.ensureDir(outputDir);
        const resolvedViewURN = resolveViewURN(manifest, manifest.views[viewId]);
        const viewManifestBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedViewURN));
        const view = parse(JSON.parse(viewManifestBuffer.toString()));
        const viewFilePath = path.join(outputDir, manifest.views[viewId].urn);
        const viewFolderPath = path.dirname(viewFilePath);
        await fse.ensureDir(viewFolderPath);
        await fse.writeFile(viewFilePath, viewManifestBuffer);
        await this.downloadFragments(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
        if (UseWebSockets) {
            await this.downloadGeometriesBatch(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
            await this.downloadMaterialsBatch(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
        } else {
            await this.downloadGeometries(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
            await this.downloadMaterials(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
        }
        await this.downloadTextures(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
        await this.downloadProperties(urn, resolvedViewURN, view, viewFolderPath, sharedAssetsDir);
    }

    protected async downloadFragments(urn: string, resolvedViewURN: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading fragment list...`);
        const resolvedFragmentListUrn = resolveAssetUrn(resolvedViewURN, view.manifest.assets.fragments);
        const fragmentListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedFragmentListUrn));
        await fse.writeFile(path.join(outputDir, 'fragments.fl'), fragmentListBuffer);
    }

    protected async downloadGeometries(urn: string, resolvedViewURN: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading geometry list...`);
        const resolvedGeometryListUrn = resolveAssetUrn(resolvedViewURN, view.manifest.assets.geometry_ptrs);
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

    protected async downloadGeometriesBatch(urn: string, resolvedViewURN: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading geometry list...`);
        const resolvedGeometryListUrn = resolveAssetUrn(resolvedViewURN, view.manifest.assets.geometry_ptrs);
        const geometryListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedGeometryListUrn));
        await fse.writeFile(path.join(outputDir, 'geometry_ptrs.hl'), geometryListBuffer);
        const geometryFolderPath = path.join(sharedAssetsDir, view.manifest.shared_assets.geometry);
        await fse.ensureDir(geometryFolderPath);
        const account = getViewAccount(view);

        let batch: { hash: string; path: string; }[] = [];
        const processBatch = async () => {
            console.log(`Downloading geometry batch ${batch.map(e => e.hash.substring(0, 4))}...`);
            const buffers = await this.sharedDataWebSocketClient!.getAssets(urn, account, AssetType.Geometry, batch.map(e => e.hash));
            await Promise.all(batch.map(({ hash, path }) => fse.writeFile(path, buffers.get(hash))));
            batch = [];
        }

        for (const hash of parseHashes(geometryListBuffer)) {
            const geometryFilePath = path.join(geometryFolderPath, hash);
            if (await fse.pathExists(geometryFilePath)) {
                console.log(`Geometry ${hash} already exists, skipping...`);
                continue;
            }
            batch.push({ hash, path: geometryFilePath });
            if (batch.length === BatchSize) {
                await processBatch();
            }
        }
        if (batch.length > 0) {
            await processBatch();
        }
    }

    protected async downloadMaterials(urn: string, resolvedViewURN: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading material list...`);
        const resolvedMaterialListUrn = resolveAssetUrn(resolvedViewURN, view.manifest.assets.materials_ptrs);
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

    protected async downloadMaterialsBatch(urn: string, resolvedViewURN: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading material list...`);
        const resolvedMaterialListUrn = resolveAssetUrn(resolvedViewURN, view.manifest.assets.materials_ptrs);
        const materialListBuffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedMaterialListUrn));
        await fse.writeFile(path.join(outputDir, 'materials_ptrs.hl'), materialListBuffer);
        const materialFolderPath = path.join(sharedAssetsDir, view.manifest.shared_assets.materials);
        await fse.ensureDir(materialFolderPath);
        const account = getViewAccount(view);

        let batch: { hash: string; path: string }[] = [];
        const processBatch = async () => {
            console.log(`Downloading material batch ${batch.map(e => e.hash.substring(0, 4))}...`);
            const buffers = await this.sharedDataWebSocketClient!.getAssets(urn, account, AssetType.Material, batch.map(e => e.hash));
            await Promise.all(batch.map(({ hash, path }) => fse.writeFile(path, buffers.get(hash))));
            batch = [];
        }

        for (const hash of parseHashes(materialListBuffer)) {
            const materialFilePath = path.join(materialFolderPath, hash);
            if (await fse.pathExists(materialFilePath)) {
                console.log(`Material ${hash} already exists, skipping...`);
                continue;
            }
            batch.push({ hash, path: materialFilePath });
            if (batch.length === BatchSize) {
                await processBatch();
            }
        }
        if (batch.length > 0) {
            await processBatch();
        }
    }

    protected async downloadTextures(urn: string, resolvedViewUrn: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        if (!view.manifest.assets.texture_manifest) {
            return;
        }
        console.log(`Downloading texture manifest...`);
        const resolvedTextureManifestUrn = resolveAssetUrn(resolvedViewUrn, view.manifest.assets.texture_manifest!);
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

    protected async downloadProperties(urn: string, resolvedViewURN: string, view: View, outputDir: string, sharedAssetsDir: string): Promise<void> {
        console.log(`Downloading property assets...`);
        const write = async (uri?: string) => {
            if (uri) {
                console.log(`Downloading ${uri}...`);
                const resolvedAssetUrn = resolveAssetUrn(resolvedViewURN, uri);
                const buffer = await this.modelDataClient.getAsset(urn, encodeURIComponent(resolvedAssetUrn));
                const filePath = path.join(outputDir, uri);
                await fse.ensureDir(path.dirname(filePath));
                await fse.writeFile(filePath, buffer);
            }
        };
        const { avs, dbid, offsets } = view.manifest.assets.pdb;
        const { attrs, ids, values } = view.manifest.shared_assets.pdb;
        await Promise.all([
            write(avs),
            write(dbid),
            write(offsets),
            write(attrs),
            write(ids),
            write(values),
        ]);
    }
}