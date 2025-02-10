import * as IMF from '../common/intermediate-format';
import { IAuthenticationProvider } from '../common/authentication-provider';
import { PropDbReader } from '../common/propdb-reader';
import { ModelDataHttpClient } from './clients/ModelDataHttpClient';
import { SharedDataHttpClient } from './clients/SharedDataHttpClient';
import { SharedDataWebSocketClient, AssetType } from './clients/SharedDataWebSocketClient';
import { parseHashes } from './helpers/HashList';
import { Fragment, parseFragments } from './helpers/Fragment';
import { Geometry, GeometryType, parseGeometry } from './helpers/Geometry';
import { Material, parseMaterial } from './helpers/Material';
import { findManifestSVF2, resolveViewURN, OTGManifest } from './helpers/Manifest';
import { getViewAccount, getViewMetadata, parse, resolveAssetUrn, resolveGeometryUrn, resolveMaterialUrn, resolveTextureUrn, View } from './helpers/View';

const UseWebSockets = true;
const BatchSize = 32;

export class Reader {
    static async FromDerivativeService(urn: string, authenticationProvider: IAuthenticationProvider): Promise<Reader> {
        const modelDataClient = new ModelDataHttpClient(authenticationProvider);
        const sharedDataClient = new SharedDataHttpClient(authenticationProvider);
        const derivativeManifest = await modelDataClient.getManifest(urn);
        const manifest = findManifestSVF2(derivativeManifest);
        return new Reader(urn, manifest, modelDataClient, sharedDataClient, authenticationProvider);
    }

    protected constructor(
        protected urn: string,
        protected manifest: OTGManifest,
        protected modelDataClient: ModelDataHttpClient,
        protected sharedDataClient: SharedDataHttpClient,
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
        const viewManifestBuffer = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedViewURN));
        const view = parse(JSON.parse(viewManifestBuffer.toString()));
        const { assets } = view.manifest;
        const fragments = await this.readFragments(view, resolveAssetUrn(resolvedViewURN, assets.fragments));
        const geometries: Geometry[] = assets.geometry_ptrs
            ? (UseWebSockets
                ? await this.readGeometriesBatch(view, resolveAssetUrn(resolvedViewURN, assets.geometry_ptrs))
                : await this.readGeometries(view, resolveAssetUrn(resolvedViewURN, assets.geometry_ptrs)))
            : [];
        const materials: Material[] = assets.materials_ptrs
            ? (UseWebSockets
                ? await this.readMaterialsBatch(view, resolveAssetUrn(resolvedViewURN, assets.materials_ptrs))
                : await this.readMaterials(view, resolveAssetUrn(resolvedViewURN, assets.materials_ptrs)))
            : [];
        const textures = assets.texture_manifest
            ? await this.readTextures(view, resolveAssetUrn(resolvedViewURN, assets.texture_manifest))
            : new Map<string, any>();
        const metadata = getViewMetadata(view);
        return new Scene(metadata, fragments, geometries, materials, textures);
    }

    protected async readFragments(view: View, resolvedfragListUrn: string): Promise<Fragment[]> {
        console.log('Reading fragment list...');
        const fragmentData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedfragListUrn));
        const fragments = Array.from(parseFragments(fragmentData, view.fragmentTransformsOffset));
        return fragments;
    }

    protected async readGeometries(view: View, resolvedGeomHashListUrn: string): Promise<Geometry[]> {
        console.log('Reading geometry list...');
        const geometryPromises: Promise<Geometry>[] = [];
        const geometryListBuffer = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedGeomHashListUrn));
        for (const hash of parseHashes(geometryListBuffer)) {
            console.log(`Reading geometry ${hash}...`);
            const geometryUrn = resolveGeometryUrn(view, hash);
            geometryPromises.push(this.sharedDataClient.getAsset(this.urn, geometryUrn).then(parseGeometry));
        }
        const geometries = await Promise.all(geometryPromises);
        return geometries;
    }

    protected async readGeometriesBatch(view: View, resolvedGeomHashListUrn: string): Promise<Geometry[]> {
        console.log('Reading geometry list...');
        const sharedDataWebSocketClient = await SharedDataWebSocketClient.Connect(this.authenticationProvider);
        const account = getViewAccount(view);
        const geometryListBuffer = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedGeomHashListUrn));
        const geometries: Geometry[] = [];

        let batch: string[] = [];
        const processBatch = async () => {
            console.log(`Reading geometry batch ${batch.map(hash => hash.substring(0, 4))}...`);
            const buffers = await sharedDataWebSocketClient.getAssets(this.urn, account, AssetType.Geometry, batch);
            geometries.push(...batch.map(hash => parseGeometry(buffers.get(hash)!)));
            batch = [];
        };

        for (const hash of parseHashes(geometryListBuffer)) {
            batch.push(hash);
            if (batch.length === BatchSize) {
                await processBatch();
            }
        }
        if (batch.length > 0) {
            await processBatch();
        }
        sharedDataWebSocketClient.close();
        return geometries;
    }

    protected async readMaterials(view: View, resolvedMaterialHashListUrn: string): Promise<Material[]> {
        console.log('Reading material list...');
        const materialListBuffer = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedMaterialHashListUrn));
        const materials: Material[] = [];
        for (const hash of parseHashes(materialListBuffer)) {
            console.log(`Reading material ${hash}...`);
            const materialUrn = resolveMaterialUrn(view, hash);
            const materialData = await this.sharedDataClient.getAsset(this.urn, materialUrn);
            materials.push(parseMaterial(materialData));
        }
        return materials;
    }

    protected async readMaterialsBatch(view: View, resolvedMaterialHashListUrn: string): Promise<Material[]> {
        console.log('Reading material list...');
        const sharedDataWebSocketClient = await SharedDataWebSocketClient.Connect(this.authenticationProvider);
        const account = getViewAccount(view);
        const materialListBuffer = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedMaterialHashListUrn));
        const materials: Material[] = [];

        let batch: string[] = [];
        const processBatch = async () => {
            console.log(`Reading material batch ${batch.map(hash => hash.substring(0, 4))}...`);
            const buffers = await sharedDataWebSocketClient.getAssets(this.urn, account, AssetType.Material, batch);
            materials.push(...batch.map(hash => parseMaterial(buffers.get(hash)!)));
            batch = [];
        };

        for (const hash of parseHashes(materialListBuffer)) {
            batch.push(hash);
            if (batch.length === BatchSize) {
                await processBatch();
            }
        }
        if (batch.length > 0) {
            await processBatch();
        }
        sharedDataWebSocketClient.close();
        return materials;
    }

    protected async readTextures(view: View, textureManifestUri: string): Promise<Map<string, any>> {
        console.log('Reading texture list...');
        const map = new Map<string, any>();
        const textureListBuffer = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(textureManifestUri));
        const textureManifest = JSON.parse(textureListBuffer.toString()) as { [key: string]: string };
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