import { AuthenticationClient } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { Client as Svf2Client, SharedClient as Svf2SharedClient, ManifestHelper as Svf2ManifestHelper, ViewHelper as Svf2ViewHelper } from './client';
import { parseHashes } from './hashes';
import { parseFragments } from './fragments';
import { parseGeometry, IGeometry, IGeometryAttribute, AttributeType, ComponentType, GeometryType } from './geometries';
import * as IMF from '../common/intermediate-format';
import { InputStream } from '../common/input-stream';
import { parseMaterials as parseSvfMaterials } from './materials';

interface ISvf2 {
    views: ISvf2View[];
}

// interface ISvf2View {
//     id: string;
//     fragments: any[];
//     geometries: Map<string, any>;
//     materials: Map<string, any>;
// }

interface ISvf2View {
    id: string;
    fragments: any[];
    geometries: any[];
    materials: any[];
}

export class Scene implements IMF.IScene {
    constructor(protected svf: ISvf2View) {}

    getMetadata(): IMF.IMetadata {
        return []; // TODO add metadata from the manifest: otg_root.json ?
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
        const geometry: IGeometry = this.svf.geometries[id-1].data;

        if(geometry.type === GeometryType.Lines)
        {
            const attributes = geometry.attributes;
            const geom: IMF.ILineGeometry = {
                kind: IMF.GeometryKind.Lines,
                getIndices: () => {
                    let indicesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Index)[0]
                    // let componentType = indicesAttr.componentType
                    if(indicesAttr)
                    {
                        let buffer = geometry.buffers[indicesAttr.bufferId]
                        let is = new InputStream(buffer);
                        let indices: number[] = [];
                        is.seek(indicesAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                            for(let i = 0; i< indicesAttr.itemSize; i++)
                            {
                                //tbd dynamically from componentType
                                indices.push(is.getUint16())
                            }
                        }
                        
                        return new Uint16Array(indices);
                    }
                    
                    return new Uint16Array();
                },
                getVertices: () => {
                    let verticesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Position)[0]
                    // let componentType = indicesAttr.componentType
                    if(verticesAttr){
                        let buffer = geometry.buffers[verticesAttr.bufferId]
                        let is = new InputStream(buffer);
                        let vertices: number[] = [];
                        is.seek(verticesAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                            let originalOffset = is.offset;
                            for(let i = 0; i< verticesAttr.itemSize; i++)
                            {
                                //tbd dynamically from componentType
                                vertices.push(is.getFloat32())
                            }
    
                            is.seek(originalOffset + verticesAttr.itemStride)
                        }
                        
                        return new Float32Array(vertices);
                    }
                    return new Float32Array();
                },
                getColors: () => {
                    let colorsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Color)[0]
                    // let componentType = indicesAttr.componentType
                    if(colorsAttr)
                    {
                        let buffer = geometry.buffers[colorsAttr.bufferId]
                        let is = new InputStream(buffer);
                        let colors: number[] = [];
                        is.seek(colorsAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                            let originalOffset = is.offset;
                            for(let i = 0; i< colorsAttr.itemSize; i++)
                            {
                                //tbd dynamically from componentType
                                colors.push(is.getFloat32())
                            }
    
                            is.seek(originalOffset + colorsAttr.itemStride)
                        }
                        
                        return new Float32Array(colors);

                    }

                    return undefined;
                }
            };
            return geom;
        }
        
        if(geometry.type === GeometryType.Triangles)
        {
            const attributes = geometry.attributes;
            const geom: IMF.IMeshGeometry = {
                kind: IMF.GeometryKind.Mesh,
                getIndices: () => {
                    let indicesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Index)[0];
                    // let componentType = indicesAttr.componentType
                    let indices:any[] = [];
                    if(indicesAttr){
                        let buffer = geometry.buffers[indicesAttr.bufferId];

                        let is = new InputStream(buffer);
                        is.seek(indicesAttr.itemOffset);
                        while(is.offset <= is.length - 2)
                        {
                            let index = is.getUint16();
                            indices.push(index);
                        }                        
                    }
                    else
                    {
                        console.log('no indices')
                    }

                    let edgesIndicesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.IndexEdges)[0];
                    // let componentType = indicesAttr.componentType
                    let edgeIndices: any[]= [];
                    if(edgesIndicesAttr){
                        let buffer = geometry.buffers[edgesIndicesAttr.bufferId]

                        let is = new InputStream(buffer);
                        is.seek(edgesIndicesAttr.itemOffset);
                        while(is.offset <= is.length - 2)
                        {
                            let index = is.getUint16();
                            edgeIndices.push(index);
                        }
                        
                    }
                    else
                    {
                        console.log('no edges indices')
                    }

                    const newIndices: number[] = [];
          
                    for (let i = 0; i < edgeIndices.length; i += 3) {
                        let triangle: number[] = [];

                        let e01 = indices[i * 3]
                        let e02 = indices[(i * 3) + 1]
                    
                        if(triangle.indexOf(e01) === -1) triangle.push(e01);
                        if(triangle.indexOf(e02) === -1) triangle.push(e02);

                        let e11 = indices[(i+1) * 3]
                        let e12 = indices[((i+1) * 3) + 1]
                        
                        if(triangle.indexOf(e11) === -1) triangle.push(e11);
                        if(triangle.indexOf(e12) === -1) triangle.push(e12);

                        let e21 = indices[(i+2) * 3]
                        let e22 = indices[((i+2) * 3) + 1]
                        
                        if(triangle.indexOf(e21) === -1) triangle.push(e21);
                        if(triangle.indexOf(e22) === -1) triangle.push(e22);

                        newIndices.push(...triangle);
                    }

                    return new Uint16Array(newIndices);
                },
                getVertices: () => {
                    let verticesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Position)[0];
                    let componentType = verticesAttr.componentType;
                    if(verticesAttr){
                        let buffer = geometry.buffers[verticesAttr.bufferId]
                        let is = new InputStream(buffer);
                        let vertices: number[] = [];
                        is.seek(verticesAttr.itemOffset);
                        while(is.offset <= is.length - verticesAttr.itemStride)
                        {
                            let originalOffset = is.offset;
    
                            let vA = is.getFloat32();
                            let vB = is.getFloat32();
                            let vC = is.getFloat32();
   
                            vertices.push(vA)
                            vertices.push(vB)
                            vertices.push(vC)
    
                            is.seek(originalOffset + verticesAttr.itemStride)
                        }
                        
                        return new Float32Array(vertices);
                    }
                    return new Float32Array();
                },
                getNormals: () => {
                    // TODO
                    return undefined;
                },
                getColors: () => {
                    let colorsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Color)[0]
                    // let componentType = indicesAttr.componentType
                    if(colorsAttr)
                    {
                        let buffer = geometry.buffers[colorsAttr.bufferId]
                        let is = new InputStream(buffer);
                        let colors: number[] = [];
                        is.seek(colorsAttr.itemOffset);
                        while(is.offset < is.length - colorsAttr.itemStride)
                        {
                            let originalOffset = is.offset;
                            for(let i = 0; i< colorsAttr.itemSize; i++)
                            {
                                colors.push(is.getFloat32())
                            }
    
                            is.seek(originalOffset + colorsAttr.itemStride)
                        }
                        
                        return new Float32Array(colors);
                    }
                    return undefined;
                },
                getUvChannelCount: () => 0,
                getUvs: (channel: number) => new Float32Array()
            };
            return geom;
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
        return undefined;
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

    protected constructor(protected urn: string, protected manifest: any, protected client: Svf2Client, protected sharedClient: Svf2SharedClient) {
    }

    async read(): Promise<ISvf2> {
        const otgManifestHelper = new Svf2ManifestHelper(this.manifest);
        let views: ISvf2View[] = [];
        for (const view of otgManifestHelper.listViews()) {
            console.assert(view.role === 'graphics');
            console.assert(view.mime === 'application/autodesk-otg');
            views.push(await this.readView(view.id, view.resolvedUrn));
        }
        return {
            views
        };
    }

    protected async readView(id: string, resolvedUrn: string): Promise<ISvf2View> {
        let fragments: any[] = [];
        let geometries: any[] = [];
        let materials: any[] = [];
        // let geometries: Map<string, any> = new Map<string, any>();
        // let materials: Map<string, any> = new Map<string, any>();
        const viewData = await this.client.getAsset(this.urn, encodeURIComponent(resolvedUrn));
        const otgViewHelper = new Svf2ViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();
        let tasks: Promise<void>[] = [];
        if (privateModelAssets) {
            if (privateModelAssets.fragments) {
                tasks.push(this.parseFragments(privateModelAssets.fragments.resolvedUrn, fragments));
            }
            if (privateModelAssets.geometry_ptrs) {
                tasks.push(this.parseGeometries(privateModelAssets.geometry_ptrs.resolvedUrn, otgViewHelper, geometries));
            }
            if (privateModelAssets.materials_ptrs) {
                tasks.push(this.parseMaterials(privateModelAssets.materials_ptrs.resolvedUrn, otgViewHelper, materials));
            }
        }
        await Promise.all(tasks);
        return {
            id,
            fragments,
            geometries,
            materials
        };
    }

    protected async parseFragments(fragListUrn: string, output: any[]): Promise<void> {
        const fragmentData = await this.client.getAsset(this.urn, encodeURIComponent(fragListUrn));
        for (const fragment of parseFragments(fragmentData)) {
            output.push(fragment);
        }
    }

    protected async parseGeometries(geomHashListUrn: string, otgViewHelper: Svf2ViewHelper, output: any[]): Promise<void> {
        const assetData = await this.client.getAsset(this.urn, encodeURIComponent(geomHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const geometryUrn = otgViewHelper.getGeometryUrn(hash);
            const geometryData = await this.sharedClient.getAsset(this.urn, geometryUrn);
            output.push({key:hash, data: parseGeometry(geometryData)});
        }
    }

    protected async parseMaterials(matHashListUrn: string, otgViewHelper: Svf2ViewHelper, output: any[]): Promise<void> {
        const assetData = await this.client.getAsset(this.urn, encodeURIComponent(matHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const materialUrn = otgViewHelper.getMaterialUrn(hash);
            const materialData = await this.sharedClient.getAsset(this.urn, materialUrn);
            // output.push({key: hash, data: JSON.parse(materialData.toString())});
            output.push(Array.from(parseSvfMaterials(materialData)));
        }
    }
}
