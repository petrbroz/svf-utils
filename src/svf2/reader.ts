import { AuthenticationClient } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { Client as Svf2Client, SharedClient as Svf2SharedClient, ManifestHelper as Svf2ManifestHelper, ViewHelper as Svf2ViewHelper } from './client';
import { parseHashes } from './hashes';
import { parseFragments } from './fragments';
import { parseGeometry } from './geometries';
import { parseMeshes } from './meshes';
import { parseMaterials } from './materials';

import * as IMF from '../common/intermediate-format';
import { PropDbReader } from '../common/propdb-reader';

interface ISvf2 {
    views: ISvf2View[];
}

//TODO: replace any with correct types
interface ISvf2View {
    id: string;
    metadata: { [key: string]: any };
    fragments: any[];
    geometries: any[];
    materials: any[];
    textures: Map<string, any>;
}


export class Scene implements IMF.IScene {
    constructor(protected svf: ISvf2View) {}

    getMetadata(): IMF.IMetadata {
        return this.svf.metadata;
    }

    getNodeCount(): number {
        return this.svf.fragments.length;
    }

    getNode(id: number): IMF.Node {
        const frag = this.svf.fragments[id];
        const node: IMF.IObjectNode = {
            kind: IMF.NodeKind.Object,
            dbid: frag.dbId,
            geometry: frag.geomId,
            material: frag.materialId
        };
        if (frag.transform) {
            if ('matrix' in frag.transform) {
                const { matrix, t } = frag.transform;
                node.transform = {
                    kind: IMF.TransformKind.Matrix,
                    elements: [
                        matrix[0], matrix[1], matrix[2], 0,
                        matrix[3], matrix[4], matrix[5], 0,
                        matrix[6], matrix[7], matrix[8], 0,
                        t ? t.x : 0, t ? t.y : 0, t ? t.z : 0, 1
                    ]
                };
            } else {
                node.transform = { kind: IMF.TransformKind.Decomposed };
                if ('quaternion' in frag.transform) {
                    node.transform.rotation = frag.transform.quaternion;
                }
                if ('scale' in frag.transform) {
                    node.transform.scale = frag.transform.scale;
                }
                if ('translation' in frag.transform) {
                    node.transform.translation = frag.transform.translation;
                }
            }
        }
        return node;
    }

    getGeometryCount(): number {
        return this.svf.geometries.length;
    }

    getGeometry(id: number): IMF.Geometry {
        if(id > this.svf.geometries.length || id === 0)
        {
            return { kind: IMF.GeometryKind.Empty }; 
        }
        const mesh = this.svf.geometries[id].data;

        if (mesh) {
            if ('isLines' in mesh) {
                const geom: IMF.ILineGeometry = {
                    kind: IMF.GeometryKind.Lines,
                    getIndices: () => mesh.indices,
                    getVertices: () => mesh.vertices,
                    getColors: () => mesh.colors
                };
                return geom;
            } else if ('isPoints' in mesh) {
                const geom: IMF.IPointGeometry = {
                    kind: IMF.GeometryKind.Points,
                    getVertices: () => mesh.vertices,
                    getColors: () => mesh.colors
                };
                return geom;
            } else {
                const geom: IMF.IMeshGeometry = {
                    kind: IMF.GeometryKind.Mesh,
                    getIndices: () => mesh.indices,
                    getVertices: () => mesh.vertices,
                    getNormals: () => mesh.normals,
                    getColors: () => mesh.colors,
                    getUvChannelCount: () => mesh.uvs ? 1 : 0,
                    getUvs: (channel: number) => mesh.uvs ?? new Float32Array()
                };
                return geom;
            }
        }

        
        return { kind: IMF.GeometryKind.Empty };
    }

    getMaterialCount(): number {
        return this.svf.materials.length;
    }

    getMaterial(id: number): IMF.Material {
        const _mat = this.svf.materials[id][0]; // should fix this remove one array level
        const mat: IMF.IPhysicalMaterial = {
            kind: IMF.MaterialKind.Physical,
            diffuse: { x: 0, y: 0, z: 0 },
            metallic: _mat?.metal ? 1.0 : 0.0,
            opacity: _mat?.opacity ?? 1.0,
            roughness: _mat?.glossiness ? ( 20.0/ _mat.glossiness ) : 1.0, // TODO: how to map glossiness to roughness properly?
            scale: {x: _mat?.maps?.diffuse?.scale.texture_UScale ?? 1.0 , y: _mat?.maps?.diffuse?.scale.texture_VScale ?? 1.0}
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
            mat.roughness = 60/_mat.glossiness;
        }   
        if (_mat?.maps?.diffuse) {
            mat.maps = mat.maps || {};
            mat.maps.diffuse = _mat.maps.diffuse.uri
        }
        return mat;
    }

    getImage(uri: string): Buffer | undefined {
        return this.svf.textures.get(uri);
    }
}
export class Reader {
    static async FromDerivativeService(urn: string, guid: string, auth: IAuthOptions): Promise<Reader> {
        urn = urn.replace(/=/g, '');
        let otgClient: Svf2Client;
        let sharedClient: Svf2SharedClient;
        if ('token' in auth) {
            otgClient = new Svf2Client({ token: auth.token });
            sharedClient = new Svf2SharedClient({ token: auth.token });
        } else {
            const authClient = new AuthenticationClient(auth.client_id, auth.client_secret);
            const newAuth = await authClient.authenticate(['viewables:read', 'data:read']);
            otgClient = new Svf2Client({ token: newAuth.access_token });
            sharedClient = new Svf2SharedClient({ token: newAuth.access_token });
        }

        const manifest = await otgClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.guid === guid);
        console.assert(viewable);
        console.assert(viewable.role === 'viewable');
        console.assert('otg_manifest' in viewable);
        return new Reader(urn, viewable.otg_manifest, otgClient, sharedClient);
    }

    protected constructor(protected urn: string,
        protected manifest: any,
        protected client: Svf2Client,
        protected sharedClient: Svf2SharedClient) {
    }

    protected properties: PropDbReader | undefined;


    async read(): Promise<ISvf2> {
        const otgManifestHelper = new Svf2ManifestHelper(this.manifest);
        let views: ISvf2View[] = [];
        for (const view of otgManifestHelper.listViews()) {
            // console.assert(view.role === 'graphics');
            // console.assert(view.mime === 'application/autodesk-otg');
            if(view.role === 'graphics' && view.mime === 'application/autodesk-otg')
                views.push(await this.readView(view.id, view.resolvedUrn));
        }
        return {
            views
        };
    }

    protected async readView(id: string, resolvedUrn: string): Promise<ISvf2View> {
        let fragments: any[] = [];
        let geometries: any[] = [null];
        let materials: any[] = [];
        let textures: Map<string, any> = new Map();
        const viewData = await this.client.getAsset(this.urn, encodeURIComponent(resolvedUrn));
        const otgViewHelper = new Svf2ViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();

        let metadata = otgViewHelper.getMetadata();

        // TODO: Decode avs and offsets files
        // How to decode avs.pack and avs.idx ? 
        // this.properties = await this.getPropertyDb(otgViewHelper);

        let tasks: Promise<void>[] = [];
        if (privateModelAssets) {
            if (privateModelAssets.fragments) {
                tasks.push(this.readFragments(privateModelAssets.fragments.resolvedUrn, fragments));
            }
            if (privateModelAssets.geometry_ptrs) {
                tasks.push(this.readGeometries(privateModelAssets.geometry_ptrs.resolvedUrn, otgViewHelper, geometries));
            }
            if (privateModelAssets.materials_ptrs) {
                tasks.push(this.readMaterials(privateModelAssets.materials_ptrs.resolvedUrn, otgViewHelper, materials));
            }
            if (privateModelAssets.texture_manifest) {
                tasks.push(this.readTextures(privateModelAssets.texture_manifest.resolvedUrn, otgViewHelper, textures));
            }
        }

        await Promise.all(tasks);

        return {
            id,
            metadata,
            fragments,
            geometries,
            materials,
            textures
        };
    }

    protected async readFragments(fragListUrn: string, output: any[]): Promise<void> {
        console.log(`Reading fragments ...`);
        const fragmentData = await this.client.getAsset(this.urn, encodeURIComponent(fragListUrn));
        for (const fragment of parseFragments(fragmentData)) {
            output.push(fragment);
        }
        console.log(`Reading fragments: done`);
    }
    
    protected async readGeometries(geomHashListUrn: string, otgViewHelper: Svf2ViewHelper, output: any[]): Promise<void> {
        console.log(`Reading geometries ...`);
        const assetData = await this.client.getAsset(this.urn, encodeURIComponent(geomHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const geometryUrn = otgViewHelper.getGeometryUrn(hash);
            const geometryData = await this.sharedClient.getAsset(this.urn, geometryUrn);
            // output.push({ key: hash, data: parseGeometry(geometryData) });
            const geometry = parseGeometry(geometryData);
            output.push({key:hash, data: parseMeshes(geometry)});
        }
        
        console.log(`Reading geometries: done`);
    }
    
    protected async readMaterials(matHashListUrn: string, otgViewHelper: Svf2ViewHelper, output: any[]): Promise<void> {
        console.log(`Reading materials ...`);
        const assetData = await this.client.getAsset(this.urn, encodeURIComponent(matHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const materialUrn = otgViewHelper.getMaterialUrn(hash);
            const materialData = await this.sharedClient.getAsset(this.urn, materialUrn);
            // output.push({key: hash, data: JSON.parse(materialData.toString())});
            output.push(Array.from(parseMaterials(materialData)));
        }
        console.log(`Reading materials: done`);
    }

    protected async readTextures(textureManifestUri: string, otgViewHelper: Svf2ViewHelper, output: Map<string, any>): Promise<void> {
        const assetData = await this.client.getAsset(this.urn, encodeURIComponent(textureManifestUri));
        const textureManifest = JSON.parse(assetData.toString()) as { [key: string]: string }
        for (const [_, uri] of Object.entries(textureManifest)) {
            console.log(`Downloading image ${uri} ...`)
            const textureUrn = otgViewHelper.getTextureUrn(uri);
            const textureData = await this.sharedClient.getAsset(this.urn, textureUrn);
            output.set(uri, textureData)
            console.log(`Downloading image ${uri}: done`)
        }
    }

    protected async getPropertyDb(otgViewHelper: Svf2ViewHelper): Promise<PropDbReader> {
        const privateDbAssets = otgViewHelper.listPrivateDatabaseAssets();
        const sharedDbAssets = otgViewHelper.listSharedDatabaseAssets();

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
            await this.client.getAsset(this.urn, encodeURIComponent(idsAsset.resolvedUrn)),
            await this.client.getAsset(this.urn, encodeURIComponent(offsetsAsset.resolvedUrn)),
            await this.client.getAsset(this.urn, encodeURIComponent(avsAsset.resolvedUrn)),
            await this.client.getAsset(this.urn, encodeURIComponent(attrsAsset.resolvedUrn)),
            await this.client.getAsset(this.urn, encodeURIComponent(valsAsset.resolvedUrn)),
            await this.client.getAsset(this.urn, encodeURIComponent(dbIdAsset.resolvedUrn)),
        ]);

        // SVF common function not working with private db assets
        return new PropDbReader(buffers[0], buffers[1], buffers[2], buffers[3], buffers[4]);

    }

}
