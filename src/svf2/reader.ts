import * as IMF from '../common/intermediate-format';
import { PropDbReader } from '../common/propdb-reader';
import { ModelDataClient } from './helpers/ModelDataClient';
import { SharedDataClient } from './helpers/SharedDataClient';
import { ManifestHelper } from './helpers/ManifestHelper';
import { ViewHelper } from './helpers/ViewHelper';
import { parseHashes } from './helpers/HashList';
import { Fragment, parseFragments } from './helpers/Fragment';
import { Geometry, GeometryType, parseGeometry } from './helpers/Geometry';
import { Material, parseMaterial } from './helpers/Material';

export interface View {
    id: string;
    resolvedViewUrn: string;
}

export class Reader {
    static async FromDerivativeService(urn: string, accessToken: string): Promise<Reader> {
        const modelDataClient = new ModelDataClient(accessToken);
        const sharedDataClient = new SharedDataClient(accessToken);
        const manifest = await modelDataClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.role === 'viewable' && child.otg_manifest);
        console.assert(viewable, 'Could not find a viewable with SVF2 data');
        return new Reader(urn, viewable.otg_manifest, modelDataClient, sharedDataClient);
    }

    protected constructor(
        protected urn: string,
        protected manifest: any,
        protected modelDataClient: ModelDataClient,
        protected sharedDataClient: SharedDataClient
    ) {}

    protected properties: PropDbReader | undefined;

    async listViews(): Promise<View[]>  {
        const manifestHelper = new ManifestHelper(this.manifest);
        const views: View[] = [];
        for (const view of manifestHelper.listViews()) {
            if (view.role === 'graphics' && view.mime === 'application/autodesk-otg') {
                views.push({ id: view.id, resolvedViewUrn: view.resolvedUrn });
            }
        }
        return views;
    }

    async readView(view: View): Promise<Scene> {
        // TODO: Decode property database
        const viewData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(view.resolvedViewUrn));
        const viewHelper = new ViewHelper(JSON.parse(viewData.toString()), view.resolvedViewUrn);
        const privateModelAssets = viewHelper.listPrivateModelAssets();
        const metadata = viewHelper.getMetadata();
        const [fragments, geometries, materials] = await Promise.all([
            this.readFragments(privateModelAssets!.fragments.resolvedUrn),
            this.readGeometries(privateModelAssets!.geometry_ptrs.resolvedUrn, viewHelper),
            this.readMaterials(privateModelAssets!.materials_ptrs.resolvedUrn, viewHelper)
        ]);
        const textures = new Map(); // await this.readTextures(privateModelAssets!.texture_manifest.resolvedUrn, viewHelper);
        return new Scene(metadata, fragments, geometries, materials, textures);
    }

    protected async readFragments(fragListUrn: string): Promise<Fragment[]> {
        console.time('Reading fragments');
        const fragmentData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(fragListUrn));
        const fragments = Array.from(parseFragments(fragmentData));
        console.timeEnd('Reading fragments');
        return fragments;
    }

    protected async readGeometries(geomHashListUrn: string, viewHelper: ViewHelper): Promise<Geometry[]> {
        console.time('Reading geometries');
        const geometryPromises: Promise<Geometry>[] = [];
        //const geometries: Geometry[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(geomHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const geometryUrn = viewHelper.getGeometryUrn(hash);
            geometryPromises.push(this.sharedDataClient.getAsset(this.urn, geometryUrn).then(parseGeometry));
            // const geometryData = await this.sharedDataClient.getAsset(this.urn, geometryUrn);
            // geometries.push(parseGeometry(geometryData));
        }
        const geometries = await Promise.all(geometryPromises);
        console.timeEnd('Reading geometries');
        return geometries;
    }

    protected async readMaterials(matHashListUrn: string, viewHelper: ViewHelper): Promise<Material[]> {
        console.time('Reading materials');
        const materials: Material[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(matHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const materialUrn = viewHelper.getMaterialUrn(hash);
            const materialData = await this.sharedDataClient.getAsset(this.urn, materialUrn);
            materials.push(parseMaterial(materialData));
        }
        console.timeEnd('Reading materials');
        return materials;
    }

    protected async readTextures(textureManifestUri: string, viewHelper: ViewHelper): Promise<Map<string, any>> {
        return new Map();
        // const assetData = await this.client.getAsset(this.urn, encodeURIComponent(textureManifestUri));
        // const textureManifest = JSON.parse(assetData.toString()) as { [key: string]: string }
        // for (const [_, uri] of Object.entries(textureManifest)) {
        //     console.log(`Downloading image ${uri} ...`)
        //     const textureUrn = viewHelper.getTextureUrn(uri);
        //     const textureData = await this.sharedClient.getAsset(this.urn, textureUrn);
        //     output.set(uri, textureData)
        //     console.log(`Downloading image ${uri}: done`)
        // }
    }

    protected async getPropertyDb(viewHelper: ViewHelper): Promise<PropDbReader> {
        const privateDbAssets = viewHelper.listPrivateDatabaseAssets();
        const sharedDbAssets = viewHelper.listSharedDatabaseAssets();

        if (privateDbAssets === undefined || sharedDbAssets === undefined) {
            throw new Error('Could not parse property database. Some of the database assets are missing.');
        }

        const offsetsAsset = privateDbAssets['offsets'];
        const avsAsset = privateDbAssets['avs'];
        const dbIdAsset = privateDbAssets['dbid'];

        const idsAsset = sharedDbAssets['ids'];
        const attrsAsset = sharedDbAssets['attrs'];
        const valsAsset = sharedDbAssets['values'];

        const buffers = await Promise.all([
            this.modelDataClient.getAsset(this.urn, encodeURIComponent(idsAsset.resolvedUrn)),
            this.modelDataClient.getAsset(this.urn, encodeURIComponent(offsetsAsset.resolvedUrn)),
            this.modelDataClient.getAsset(this.urn, encodeURIComponent(avsAsset.resolvedUrn)),
            this.modelDataClient.getAsset(this.urn, encodeURIComponent(attrsAsset.resolvedUrn)),
            this.modelDataClient.getAsset(this.urn, encodeURIComponent(valsAsset.resolvedUrn)),
            this.modelDataClient.getAsset(this.urn, encodeURIComponent(dbIdAsset.resolvedUrn)),
        ]);

        // SVF common function not working with private db assets
        return new PropDbReader(buffers[0], buffers[1], buffers[2], buffers[3], buffers[4]);
    }
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
                    getUvChannelCount: () => 0,
                    getUvs: (channel: number) => new Float32Array(),
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
        return {
            kind: IMF.MaterialKind.Physical,
            diffuse: { x: 0, y: 0, z: 0 },
            metallic: 0.0,
            roughness: 0.0,
            opacity: 1.0
        };
        // const _mat = this.view.materials[id][0]; // should fix this remove one array level
        // const mat: IMF.IPhysicalMaterial = {
        //     kind: IMF.MaterialKind.Physical,
        //     diffuse: { x: 0, y: 0, z: 0 },
        //     metallic: _mat?.metal ? 1.0 : 0.0,
        //     opacity: _mat?.opacity ?? 1.0,
        //     roughness: _mat?.glossiness ? (20.0 / _mat.glossiness) : 1.0, // TODO: how to map glossiness to roughness properly?
        //     scale: { x: _mat?.maps?.diffuse?.scale.texture_UScale ?? 1.0, y: _mat?.maps?.diffuse?.scale.texture_VScale ?? 1.0 }
        // };
        // if (_mat?.diffuse) {
        //     mat.diffuse.x = _mat.diffuse[0];
        //     mat.diffuse.y = _mat.diffuse[1];
        //     mat.diffuse.z = _mat.diffuse[2];
        // }
        // if (_mat?.metal && _mat.specular && _mat.glossiness) {
        //     mat.diffuse.x = _mat.specular[0];
        //     mat.diffuse.y = _mat.specular[1];
        //     mat.diffuse.z = _mat.specular[2];
        //     mat.roughness = 60 / _mat.glossiness;
        // }
        // if (_mat?.maps?.diffuse) {
        //     mat.maps = mat.maps || {};
        //     mat.maps.diffuse = _mat.maps.diffuse.uri
        // }
        // return mat;
    }

    getImage(uri: string): Buffer | undefined {
        return this.textures.get(uri);
    }
}