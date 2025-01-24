import * as IMF from '../common/intermediate-format';
import { PropDbReader } from '../common/propdb-reader';
import { ModelDataClient } from './helpers/ModelDataClient';
import { SharedDataClient } from './helpers/SharedDataClient';
import { parseHashes } from './helpers/HashList';
import { Fragment, parseFragments } from './helpers/Fragment';
import { Geometry, GeometryType, parseGeometry } from './helpers/Geometry';
import { Material, parseMaterial } from './helpers/Material';
import { IAuthenticationProvider } from '../common/authentication-provider';
import { findManifestSVF2, resolveViewURN } from './helpers/Manifest';
import { OTGManifest } from './helpers/Manifest.schema';
import { View } from './helpers/View.schema';
import { getViewAccount, getViewMetadata, parse, resolveAssetUrn, resolveGeometryUrn, resolveMaterialUrn, resolveTextureUrn } from './helpers/View';
import { ResourceType, SharedDataWebSocketClient } from './helpers/SharedDataWebSocketClient';

const UseWebSockets = true;
const BatchSize = 32;

export class Reader {
    static async FromDerivativeService(urn: string, authenticationProvider: IAuthenticationProvider): Promise<Reader> {
        const modelDataClient = new ModelDataClient(authenticationProvider);
        const sharedDataClient = new SharedDataClient(authenticationProvider);
        const derivativeManifest = await modelDataClient.getManifest(urn);
        const manifest = findManifestSVF2(derivativeManifest);
        return new Reader(urn, manifest, modelDataClient, sharedDataClient, authenticationProvider);
    }

    protected constructor(
        protected urn: string,
        protected manifest: OTGManifest,
        protected modelDataClient: ModelDataClient,
        protected sharedDataClient: SharedDataClient,
        protected authenticationProvider: IAuthenticationProvider
    ) {}

    protected properties: PropDbReader | undefined;

    async listViews(): Promise<string[]>  {
        const ids: string[] = [];
        for (const [id, view] of Object.entries(this.manifest.views)) {
            if (view.role === 'graphics' && view.mime === 'application/autodesk-otg') {
                ids.push(id);
            }
        }
        return ids;
    }

    async readView(viewId: string): Promise<Scene> {
        // TODO: Decode property database
        console.log(`Reading view ${viewId}...`);
        const resolvedViewURN = resolveViewURN(this.manifest, this.manifest.views[viewId]);
        const viewData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedViewURN));
        const view = parse(JSON.parse(viewData.toString()));
        const { assets } = view.manifest;
        const [fragments, geometries, materials] = await Promise.all([
            this.readFragments(view, resolveAssetUrn(resolvedViewURN, assets.fragments)),
            UseWebSockets
                ? this.readGeometriesWS(view, resolveAssetUrn(resolvedViewURN, assets.geometry_ptrs))
                : this.readGeometries(view, resolveAssetUrn(resolvedViewURN, assets.geometry_ptrs)),
            UseWebSockets
                ? this.readMaterialsWS(view, resolveAssetUrn(resolvedViewURN, assets.materials_ptrs))
                : this.readMaterials(view, resolveAssetUrn(resolvedViewURN, assets.materials_ptrs)),,
        ]);
        const textures = assets.texture_manifest
            ? await this.readTextures(view, resolveAssetUrn(resolvedViewURN, assets.texture_manifest))
            : new Map<string, any>();
        const metadata = getViewMetadata(view);
        return new Scene(metadata, fragments, geometries, materials, textures);
    }

    protected async readFragments(view: View, resolvedfragListUrn: string): Promise<Fragment[]> {
        console.log('Reading fragment list...');
        const fragmentData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedfragListUrn));
        const fragments = Array.from(parseFragments(fragmentData));
        return fragments;
    }

    protected async readGeometries(view: View, resolvedGeomHashListUrn: string): Promise<Geometry[]> {
        console.log('Reading geometry list...');
        const geometryPromises: Promise<Geometry>[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedGeomHashListUrn));
        for (const hash of parseHashes(assetData)) {
            console.log(`Reading geometry ${hash}...`);
            const geometryUrn = resolveGeometryUrn(view, hash);
            geometryPromises.push(this.sharedDataClient.getAsset(this.urn, geometryUrn).then(parseGeometry));
        }
        const geometries = await Promise.all(geometryPromises);
        return geometries;
    }

    protected async readGeometriesWS(view: View, resolvedGeomHashListUrn: string): Promise<Geometry[]> {
        console.log('Reading geometry list...');
        const sharedDataWebSocketClient = await SharedDataWebSocketClient.Connect(this.authenticationProvider);
        const geometries: Geometry[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedGeomHashListUrn));
        const account = getViewAccount(view);
        let batch: string[] = [];
        for (const hash of parseHashes(assetData)) {
            batch.push(hash);
            if (batch.length >= BatchSize) {
                console.log(`Reading geometries ${batch}...`);
                const buffers = await sharedDataWebSocketClient.getAssets(this.urn, account, ResourceType.Geometry, batch);
                for (const _hash of batch) {
                    geometries.push(parseGeometry(buffers.get(_hash)!));
                }
                batch = [];
            }
        }
        if (batch.length > 0) {
            console.log(`Reading geometries ${batch}...`);
            const buffers = await sharedDataWebSocketClient.getAssets(this.urn, account, ResourceType.Geometry, batch);
            for (const _hash of batch) {
                geometries.push(parseGeometry(buffers.get(_hash)!));
            }
            batch = [];
        }
        sharedDataWebSocketClient.close();
        return geometries;
    }

    protected async readMaterials(view: View, resolvedMaterialHashListUrn: string): Promise<Material[]> {
        console.log('Reading material list...');
        const materials: Material[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedMaterialHashListUrn));
        for (const hash of parseHashes(assetData)) {
            console.log(`Reading material ${hash}...`);
            const materialUrn = resolveMaterialUrn(view, hash);
            const materialData = await this.sharedDataClient.getAsset(this.urn, materialUrn);
            materials.push(parseMaterial(materialData));
        }
        return materials;
    }

    protected async readMaterialsWS(view: View, resolvedMaterialHashListUrn: string): Promise<Material[]> {
        console.log('Reading material list...');
        const sharedDataWebSocketClient = await SharedDataWebSocketClient.Connect(this.authenticationProvider);
        const materials: Material[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedMaterialHashListUrn));
        const account = getViewAccount(view);
        let batch: string[] = [];
        for (const hash of parseHashes(assetData)) {
            batch.push(hash);
            if (batch.length >= BatchSize) {
                console.log(`Reading materials ${batch}...`);
                const buffers = await sharedDataWebSocketClient.getAssets(this.urn, account, ResourceType.Material, batch);
                for (const _hash of batch) {
                    materials.push(parseMaterial(buffers.get(_hash)!));
                }
                batch = [];
            }
        }
        if (batch.length > 0) {
            console.log(`Reading materials ${batch}...`);
            const buffers = await sharedDataWebSocketClient.getAssets(this.urn, account, ResourceType.Material, batch);
            for (const _hash of batch) {
                materials.push(parseMaterial(buffers.get(_hash)!));
            }
            batch = [];
        }
        sharedDataWebSocketClient.close();
        return materials;
    }

    protected async readTextures(view: View, textureManifestUri: string): Promise<Map<string, any>> {
        console.log('Reading texture list...');
        const map = new Map<string, any>();
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(textureManifestUri));
        const textureManifest = JSON.parse(assetData.toString()) as { [key: string]: string };
        for (const [_, uri] of Object.entries(textureManifest)) {
            console.log(`Reading texture ${uri} ...`);
            const textureUrn = resolveTextureUrn(view, uri);
            const textureData = await this.sharedDataClient.getAsset(this.urn, textureUrn);
            map.set(uri, textureData);
        }
        return map;
    }

    // protected async getPropertyDb(view: View): Promise<PropDbReader> {
    //     // const privateDbAssets = viewHelper.listPrivateDatabaseAssets();
    //     // const sharedDbAssets = viewHelper.listSharedDatabaseAssets();

    //     const privateDbAssets = view.manifest.assets.pdb;
    //     const sharedDbAssets = view.manifest.shared_assets.pdb;
    //     if (!privateDbAssets || !sharedDbAssets) {
    //         throw new Error('Could not parse property database. Some of the database assets are missing.');
    //     }

    //     const offsetsAsset = privateDbAssets['offsets'];
    //     const avsAsset = privateDbAssets['avs'];
    //     const dbIdAsset = privateDbAssets['dbid'];

    //     const idsAsset = sharedDbAssets['ids'];
    //     const attrsAsset = sharedDbAssets['attrs'];
    //     const valsAsset = sharedDbAssets['values'];

    //     const buffers = await Promise.all([
    //         this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolveAssetUrn(view, idsAsset))),
    //         this.modelDataClient.getAsset(this.urn, encodeURIComponent(offsetsAsset.resolvedUrn)),
    //         this.modelDataClient.getAsset(this.urn, encodeURIComponent(avsAsset.resolvedUrn)),
    //         this.modelDataClient.getAsset(this.urn, encodeURIComponent(attrsAsset.resolvedUrn)),
    //         this.modelDataClient.getAsset(this.urn, encodeURIComponent(valsAsset.resolvedUrn)),
    //         this.modelDataClient.getAsset(this.urn, encodeURIComponent(dbIdAsset.resolvedUrn)),
    //     ]);

    //     // SVF common function not working with private db assets
    //     return new PropDbReader(buffers[0], buffers[1], buffers[2], buffers[3], buffers[4]);
    // }
}

export class Scene implements IMF.IScene {
    constructor(
        protected metadata: { [key: string]: any },
        protected fragments: Fragment[],
        protected geometries: Geometry[],
        protected materials: Material[],
        protected textures: Map<string, any>
    ) {}

    getMetadata(): IMF.IMetadata {
        return this.metadata;
    }

    getNodeCount(): number {
        return this.fragments.length;
    }

    getNode(id: number): IMF.Node {
        const frag = this.fragments[id];
        const node: IMF.IObjectNode = {
            kind: IMF.NodeKind.Object,
            dbid: frag.dbId,
            geometry: frag.geomId,
            material: frag.materialId
        };
        if (frag.transform) {
            node.transform = {
                kind: IMF.TransformKind.Decomposed,
                translation: frag.transform.translation,
                rotation: frag.transform.quaternion,
                scale: frag.transform.scale,
            };
        }
        return node;
    }

    getGeometryCount(): number {
        return this.geometries.length;
    }

    getGeometry(id: number): IMF.Geometry {
        if (id > this.geometries.length || id === 0) {
            return { kind: IMF.GeometryKind.Empty };
        }
        const geom = this.geometries[id - 1];
        switch (geom.type) {
            case GeometryType.Triangles:
                const meshGeometry: IMF.IMeshGeometry = {
                    kind: IMF.GeometryKind.Mesh,
                    getIndices: () => geom.indices,
                    getVertices: () => geom.vertices,
                    getNormals: () => geom.normals,
                    getColors: () => geom.colors,
                    getUvChannelCount: () => geom.uvs ? 1 : 0,
                    getUvs: (channel: number) => geom.uvs || new Float32Array(),
                }
                return meshGeometry;
            case GeometryType.Lines:
                const lineGeometry: IMF.ILineGeometry = {
                    kind: IMF.GeometryKind.Lines,
                    getIndices: () => geom.indices,
                    getVertices: () => geom.vertices,
                    getColors: () => undefined
                };
                return lineGeometry;
        }
        return { kind: IMF.GeometryKind.Empty };
    }

    getMaterialCount(): number {
        return this.materials.length;
    }

    getMaterial(id: number): IMF.Material {
        const _mat = this.materials[id]; // should fix this remove one array level
        const mat: IMF.IPhysicalMaterial = {
            kind: IMF.MaterialKind.Physical,
            diffuse: { x: 0, y: 0, z: 0 },
            metallic: _mat?.metal ? 1.0 : 0.0,
            opacity: _mat?.opacity ?? 1.0,
            roughness: _mat?.glossiness ? (20.0 / _mat.glossiness) : 1.0, // TODO: how to map glossiness to roughness properly?
            scale: { x: _mat?.maps?.diffuse?.scale.texture_UScale ?? 1.0, y: _mat?.maps?.diffuse?.scale.texture_VScale ?? 1.0 }
        };
        if (_mat?.diffuse) {
            mat.diffuse.x = _mat.diffuse[0];
            mat.diffuse.y = _mat.diffuse[1];
            mat.diffuse.z = _mat.diffuse[2];
        }
        if (_mat?.metal && _mat.specular && _mat.glossiness) {
            mat.diffuse.x = _mat.specular[0];
            mat.diffuse.y = _mat.specular[1];
            mat.diffuse.z = _mat.specular[2];
            mat.roughness = 60 / _mat.glossiness;
        }
        if (_mat?.maps?.diffuse) {
            mat.maps = mat.maps || {};
            mat.maps.diffuse = _mat.maps.diffuse.uri
        }
        return mat;
    }

    getImage(uri: string): Buffer | undefined {
        return this.textures.get(uri);
    }
}