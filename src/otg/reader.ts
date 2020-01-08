import { AuthenticationClient } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { Client as OtgClient, SharedClient as OtgSharedClient, ManifestHelper as OtgManifestHelper, ViewHelper as OtgViewHelper } from './client';
import { parseHashes } from './hashes';
import { parseFragments } from './fragments';
import { parseGeometry } from './geometries';
import { parseMaterial } from './materials';
import * as OTG from './schema';
import * as IMF from '../imf/schema';

interface IOtgView {
    id: string;
    fragments: OTG.IFragment[];
    geometryHashes: string[];
    geometryMap: Map<string, OTG.IGeometry>;
    materialHashes: string[];
    materialMap: Map<string, OTG.IMaterial>;
}

export class Scene implements IMF.IScene {
    constructor(protected otg: IOtgView) {}

    getMetadata(): { [key: string]: string; } {
        return {}; // TODO
    }

    getNodeCount(): number {
        return this.otg.fragments.length;
    }

    getNode(id: number): IMF.Node {
        const frag = this.otg.fragments[id];
        const node: IMF.IObjectNode = {
            kind: IMF.NodeKind.Object,
            dbid: frag.dbId,
            geometry: frag.geomId - 1,
            material: frag.materialId - 1
        };
        if (frag.transform) {
            node.transform = { kind: IMF.TransformKind.Decomposed };
            if (frag.transform.quaternion) {
                node.transform.rotation = frag.transform.quaternion;
            }
            if (frag.transform.scale) {
                node.transform.scale = frag.transform.scale;
            }
            if (frag.transform.translation) {
                node.transform.translation = frag.transform.translation;
            }
        }
        return node;
    }

    getGeometryCount(): number {
        return this.otg.materialHashes.length;
    }

    private _parseVertexAttributes(geometry: OTG.IGeometry, attributeType: OTG.AttributeType): Float32Array | undefined {
        const attr = geometry.attributes.find(attr => attr.attributeType === attributeType);
        if (attr) {
            if (attr.componentType !== OTG.ComponentType.FLOAT) {
                console.warn('Currently vertex buffers with other than float components are not supported.');
                return undefined;
            }
            const srcBuffer = geometry.buffers[attr.bufferId];
            const srcByteStride = attr.itemStride || attr.itemSize * 4;
            const srcByteOffset = attr.itemOffset;
            const count = srcBuffer.byteLength / srcByteStride;
            const dstBuffer = Buffer.alloc(count * attr.itemSize * 4);
            const dstByteStride = attr.itemSize * 4;
            for (let i = 0; i < count; i++) {
                const srcOffset = i * srcByteStride + srcByteOffset;
                srcBuffer.copy(dstBuffer, i * dstByteStride, srcOffset, srcOffset + dstByteStride);
            }
            return new Float32Array(dstBuffer.buffer);
        } else {
            return undefined;
        }
    }

    private _parseIndices(geometry: OTG.IGeometry): Uint16Array | undefined {
        const attr = geometry.attributes.find(attr => attr.attributeType === OTG.AttributeType.Index);
        if (attr) {
            console.assert(attr.componentType === OTG.ComponentType.USHORT);
            const srcBuffer = geometry.buffers[attr.bufferId];
            const srcByteStride = attr.itemStride || attr.itemSize * 2;
            const srcByteOffset = attr.itemOffset;
            const count = srcBuffer.byteLength / srcByteStride;
            const dstBuffer = Buffer.alloc(count * attr.itemSize * 2);
            const dstByteStride = attr.itemSize * 2;
            for (let i = 0; i < count; i++) {
                const srcOffset = i * srcByteStride + srcByteOffset;
                srcBuffer.copy(dstBuffer, i * dstByteStride, srcOffset, srcOffset + dstByteStride);
            }
            const indices = new Uint16Array(dstBuffer.buffer);
            // Decode delta-encoded indices
            indices[1] += indices[0];
            indices[2] += indices[0];
            for (let i = 3, len = indices.length; i < len; i += 3) {
                indices[i] += indices[i - 3];
                indices[i + 1] += indices[i];
                indices[i + 2] += indices[i];
            }
            return indices;
        } else {
            return undefined;
        }
    }

    getGeometry(id: number): IMF.Geometry {
        const hash = this.otg.geometryHashes[id];
        const mesh = this.otg.geometryMap.get(hash);
        if (mesh) {
            let geom: IMF.Geometry | undefined = undefined;
            switch (mesh.type) {
                case OTG.GeometryType.Lines:
                    geom = {
                        kind: IMF.GeometryKind.Lines,
                        getIndices: () => this._parseIndices(mesh),
                        getVertices: () => this._parseVertexAttributes(mesh, OTG.AttributeType.Position),
                        getColors: () => this._parseVertexAttributes(mesh, OTG.AttributeType.Color)
                    } as IMF.ILineGeometry;
                    return geom;
                case OTG.GeometryType.Points:
                    geom = {
                        kind: IMF.GeometryKind.Points,
                        getVertices: () => this._parseVertexAttributes(mesh, OTG.AttributeType.Position),
                        getColors: () => this._parseVertexAttributes(mesh, OTG.AttributeType.Color)
                    } as IMF.IPointGeometry;
                    return geom;
                case OTG.GeometryType.Triangles:
                    geom = {
                        kind: IMF.GeometryKind.Mesh,
                        getIndices: () => this._parseIndices(mesh),
                        getVertices: () => this._parseVertexAttributes(mesh, OTG.AttributeType.Position),
                        getNormals: () => this._parseVertexAttributes(mesh, OTG.AttributeType.Normal),
                        getUvChannelCount: () => 0,
                        getUvs: (channel: number) => new Float32Array() // TODO
                    } as IMF.IMeshGeometry;
                    return geom;
                case OTG.GeometryType.WideLines:
                    console.warn('OTG wide line geometries not supported.')
                    break;
            }
        }
        return { kind: IMF.GeometryKind.Empty };
    }

    getMaterialCount(): number {
        return this.otg.materialHashes.length;
    }

    getMaterial(id: number): IMF.Material {
        const hash = this.otg.materialHashes[id];
        const _mat = this.otg.materialMap.get(hash);
        const mat: IMF.IPhysicalMaterial = {
            kind: IMF.MaterialKind.Physical,
            diffuse: { x: 0, y: 0, z: 0 },
            metallic: _mat?.metal ? 1.0 : 0.0,
            opacity: _mat?.opacity ?? 1.0,
        };
        if (_mat?.diffuse) {
            mat.diffuse.x = _mat.diffuse[0];
            mat.diffuse.y = _mat.diffuse[1];
            mat.diffuse.z = _mat.diffuse[2];
        }
        if (_mat?.maps?.diffuse) {
            mat.maps = mat.maps || {};
            mat.maps.diffuse = _mat.maps.diffuse.uri
        }
        return mat;
    }

    getCameraCount(): number {
        return 0;
    }

    getCamera(id: number): IMF.Camera {
        throw new Error("Method not implemented.");
    }

    getLightCount(): number {
        return 0;
    }

    getLight(id: number): IMF.ISpotLight {
        throw new Error("Method not implemented.");
    }

    getImage(uri: string): Buffer | undefined {
        return undefined; // TODO
    }
}

/**
 * Additional reader options.
 */
export interface IReaderOptions {
    log?: (msg: string) => void;
}

/**
 * Experimental reader of the OTG file format (successor to SVF, with focus on geometry deduplication).
 * Missing features:
 *   - parsing geometry normals (encoded in 2 shorts)
 *   - reading material textures
 */
export class Reader {
    protected log: (msg: string) => void;

    static async FromDerivativeService(urn: string, guid: string, auth: IAuthOptions, options?: IReaderOptions): Promise<Reader> {
        urn = urn.replace(/=/g, '');
        let otgClient: OtgClient;
        let sharedClient: OtgSharedClient;
        if ('token' in auth) {
            otgClient = new OtgClient({ token: auth.token });
            sharedClient = new OtgSharedClient({ token: auth.token });
        } else {
            const authClient = new AuthenticationClient(auth.client_id, auth.client_secret);
            const newAuth = await authClient.authenticate(['viewables:read', 'data:read']);
            otgClient = new OtgClient({ token: newAuth.access_token });
            sharedClient = new OtgSharedClient({ token: newAuth.access_token });
        }

        const manifest = await otgClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.guid === guid);
        console.assert(viewable);
        console.assert(viewable.role === 'viewable');
        console.assert('otg_manifest' in viewable);
        return new Reader(urn, viewable.otg_manifest, otgClient, sharedClient, options);
    }

    protected constructor(protected urn: string, protected manifest: any, protected client: OtgClient, protected sharedClient: OtgSharedClient, options?: IReaderOptions) {
        this.log = options?.log || ((msg: string) => {});
    }

    async read(): Promise<Scene> {
        const otgManifestHelper = new OtgManifestHelper(this.manifest);
        let views: IOtgView[] = [];
        for (const view of otgManifestHelper.listViews()) {
            console.assert(view.role === 'graphics');
            console.assert(view.mime === 'application/autodesk-otg');
            views.push(await this.readView(view.id, view.resolvedUrn));
        }
        // Currently we're only interested in the 1st view
        return new Scene(views[0]);
    }

    protected async readView(id: string, resolvedUrn: string): Promise<IOtgView> {
        this.log(`Reading view ${id}`);
        let fragments: OTG.IFragment[] = [];
        let geometryHashes: string[] = [];
        let geometryMap: Map<string, OTG.IGeometry> = new Map<string, any>();
        let materialHashes: string[] = [];
        let materialMap: Map<string, OTG.IMaterial> = new Map<string, any>();
        const viewData = await this.client.getAsset(this.urn, resolvedUrn);
        const otgViewHelper = new OtgViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();
        let tasks: Promise<void>[] = [];
        if (privateModelAssets) {
            if (privateModelAssets.fragments) {
                tasks.push(this.parseFragments(privateModelAssets.fragments.resolvedUrn, fragments));
            }
            if (privateModelAssets.geometry_ptrs) {
                tasks.push(this.parseGeometries(privateModelAssets.geometry_ptrs.resolvedUrn, otgViewHelper, geometryHashes, geometryMap));
            }
            if (privateModelAssets.materials_ptrs) {
                tasks.push(this.parseMaterials(privateModelAssets.materials_ptrs.resolvedUrn, otgViewHelper, materialHashes, materialMap));
            }
        }
        await Promise.all(tasks);
        return {
            id,
            fragments,
            geometryHashes,
            geometryMap,
            materialHashes,
            materialMap
        };
    }

    protected async parseFragments(fragListUrn: string, output: OTG.IFragment[]): Promise<void> {
        this.log(`Parsing fragment list`);
        const fragmentData = await this.client.getAsset(this.urn, fragListUrn);
        for (const fragment of parseFragments(fragmentData)) {
            output.push(fragment);
        }
        this.log(`Fragment list parsed`);
    }

    protected async parseGeometries(geomHashListUrn: string, otgViewHelper: OtgViewHelper, hashes: string[], map: Map<string, OTG.IGeometry>): Promise<void> {
        this.log(`Parsing geometries`);
        const assetData = await this.client.getAsset(this.urn, geomHashListUrn);
        let tasks: Promise<void>[] = [];
        for (const hash of parseHashes(assetData)) {
            hashes.push(hash);
            tasks.push(this.parseGeometry(otgViewHelper, hash, map));
        }
        await Promise.all(tasks);
        this.log(`Geometries parsed`);
    }

    protected async parseGeometry(otgViewHelper: OtgViewHelper, hash: string, map: Map<string, OTG.IGeometry>) {
        this.log(`Parsing geometry ${hash}`);
        const geometryUrn = otgViewHelper.getGeometryUrn(hash);
        const geometryData = await this.sharedClient.getAsset(this.urn, geometryUrn);
        map.set(hash, parseGeometry(geometryData));
    }

    protected async parseMaterials(matHashListUrn: string, otgViewHelper: OtgViewHelper, hashes: string[], map: Map<string, OTG.IMaterial>): Promise<void> {
        this.log(`Parsing materials`);
        const assetData = await this.client.getAsset(this.urn, matHashListUrn);
        let tasks: Promise<void>[] = [];
        for (const hash of parseHashes(assetData)) {
            hashes.push(hash);
            tasks.push(this.parseMaterial(otgViewHelper, hash, map));
        }
        await Promise.all(tasks);
        this.log(`Materials parsed`);
    }

    protected async parseMaterial(otgViewHelper: OtgViewHelper, hash: string, map: Map<string, OTG.IMaterial>) {
        this.log(`Parsing material ${hash}`);
        const materialUrn = otgViewHelper.getMaterialUrn(hash);
        const materialData = await this.sharedClient.getAsset(this.urn, materialUrn);
        map.set(hash, parseMaterial(materialData.toString()));
    }
}
