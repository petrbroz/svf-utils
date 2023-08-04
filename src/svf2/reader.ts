import { AuthenticationClient } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { Client as Svf2Client, SharedClient as Svf2SharedClient, ManifestHelper as Svf2ManifestHelper, ViewHelper as Svf2ViewHelper } from './client';
import { parseHashes } from './hashes';
import { parseFragments } from './fragments';
import { parseGeometry, IGeometry, IGeometryAttribute, AttributeType, GeometryType } from './geometries';
import * as IMF from '../common/intermediate-format';
import { InputStream } from '../common/input-stream';
import { parseMaterials as parseSvfMaterials } from './materials';
import { OtgManifestHelper } from '..';

interface ISvf2 {
    views: ISvf2View[];
}

//TODO: replace any with correct types
interface ISvf2View {
    id: string;
    metadata: { [key:string]: any};
    fragments: any[];
    geometries: any[];
    materials: any[];
    textures: Map<string, any>;
}

interface Vec2 {
    x:number;
    y:number;
}

interface Vec3 {
    x:number;
    y:number;
    z:number;
}

function deltaDecodeIndexBuffer3(ib: any) {
    if (!ib.length)
    return;

    ib[1] += ib[0];
    ib[2] += ib[0];

    for (var i=3; i<ib.length; i+=3) {
        ib[i] += ib[i-3];
        ib[i+1] += ib[i];
        ib[i+2] += ib[i];
    }
}

function DecodeNormal (enc: Vec2)
{
    let ang = { x: enc.x * 2.0 - 1.0, y: enc.y * 2.0 - 1.0} as Vec2;
    let scth = { x: Math.sin(ang.x * Math.PI), y: Math.cos(ang.x * Math.PI)} as Vec2;
    let scphi = {x: Math.sqrt(1.0 - ang.y * ang.y), y:ang.y} as Vec2;
    return {x: scth.y * scphi.x, y: scth.x * scphi.x, z: scphi.y} as Vec3;
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
        const geomBuffer = this.svf.geometries[id]
        if(geomBuffer === undefined) 
        {
            console.log(`Error with geom id: ${id}`);
            return { kind: IMF.GeometryKind.Empty };;
        }
        const geometry: IGeometry = geomBuffer.data;

        if(geometry.type === GeometryType.Lines)
        {
            const attributes = geometry.attributes;
            const geom: IMF.ILineGeometry = {
                kind: IMF.GeometryKind.Lines,
                getIndices: () => {
                    let indicesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Index)[0]
                    if(indicesAttr)
                    {
                        let buffer = geometry.buffers[indicesAttr.bufferId]
                        let is = new InputStream(buffer);
                        let indices: number[] = [];
                        is.seek(indicesAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                                indices.push(is.getUint16())
                        }
                        return new Uint16Array(indices)
                    }
                    
                    return new Uint16Array();
                },
                getVertices: () => {
                    let verticesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Position)[0]
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
                                vertices.push(is.getFloat32())
                            }
    
                            is.seek(originalOffset + verticesAttr.itemStride)
                        }
                        return new Float32Array(vertices)
                    }
                    return new Float32Array();
                },
                getColors: () => {
                    let colorsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Color)[0]
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
                    if(indicesAttr){
                        let buffer = geometry.buffers[indicesAttr.bufferId];
                        let is = new InputStream(buffer);
                        let indices: number[] = [];
                        is.seek(indicesAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                            indices.push(is.getUint16())
                        }
                        deltaDecodeIndexBuffer3(indices)
                        return new Uint16Array(indices);
                    }

                    return new Uint16Array();
                },
                getVertices: () => {
                    let verticesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Position)[0];            
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
                                vertices.push(is.getFloat32())
                            }
    
                            is.seek(originalOffset + verticesAttr.itemStride)
                        }
                        return new Float32Array(vertices)
                    }
                    return new Float32Array();
                },
                getNormals: () => {
                    let normalsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Normal)[0]
                    if(normalsAttr)
                    {
                        let buffer = geometry.buffers[normalsAttr.bufferId]
                        let componentType = normalsAttr.componentType;
                        let is = new InputStream(buffer);
                        let normals: number[] = [];
                        is.seek(normalsAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                            let originalOffset = is.offset;
                            let encodedNorm = [];

                            for(let i = 0; i< normalsAttr.itemSize; i++)
                            {
                                encodedNorm.push((is.getUint16() / 65535))
                            }

                            let decodedNorm = DecodeNormal({x:encodedNorm[0], y:encodedNorm[1]})

                            normals.push(decodedNorm.x, decodedNorm.y, decodedNorm.z);
    
                            is.seek(originalOffset + normalsAttr.itemStride)
                        }
                        return new Float32Array(normals)
                    }
                    return undefined;
                },
                getColors: () => {
                    let colorsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Color)[0]
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
                getUvChannelCount: () => 1,
                getUvs: (channel: number) => {
                    // how to use channel ?
                    let uvsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.TextureUV)[0];            
                    if(uvsAttr){
                        let buffer = geometry.buffers[uvsAttr.bufferId]
                        let is = new InputStream(buffer);
                        let uvs: number[] = [];
                        is.seek(uvsAttr.itemOffset);
                        while(is.offset < is.length)
                        {
                            let originalOffset = is.offset;
                            // for(let i = 0; i< uvsAttr.itemSize; i++)
                            // {
                            //     uvs.push(is.getFloat32())
                            // }
                            if(uvsAttr.itemSize === 2)
                            {
                                uvs.push(is.getFloat32())
                                uvs.push(1.0 - is.getFloat32())
                            }
                            else
                            {
                                console.log(`Can't parse uvs with this itemSize`)
                            }
    
                            is.seek(originalOffset + uvsAttr.itemStride)
                        }
                        return new Float32Array(uvs)
                    }
                    return new Float32Array();
                }
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
        let geometries: any[] = [null];
        let materials: any[] = [];
        let textures: Map<string, any> = new Map();
        const viewData = await this.client.getAsset(this.urn, encodeURIComponent(resolvedUrn));
        const otgViewHelper = new Svf2ViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();

        let metadata = otgViewHelper.getMetadata();

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
            if (privateModelAssets.texture_manifest) {
                tasks.push(this.parseTextures(privateModelAssets.texture_manifest.resolvedUrn, otgViewHelper, textures));
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

    protected async parseTextures(textureManifestUri: string, otgViewHelper: Svf2ViewHelper, output: Map<string, any>): Promise<void> {
        const assetData = await this.client.getAsset(this.urn, encodeURIComponent(textureManifestUri));
        const textureManifest = JSON.parse(assetData.toString()) as {[key:string]: string}
        for(const [_, uri] of Object.entries(textureManifest))
        {
            const textureUrn = otgViewHelper.getTextureUrn(uri);
            const textureData = await this.sharedClient.getAsset(this.urn, textureUrn);
            output.set(uri, textureData)
        }
    }

    // protected async getTexture(texUri: string, otgViewHelper: Svf2ViewHelper, output: Map<string, any>): Promise<void> {
    //     const textureUrn = otgViewHelper.getTextureUrn(texUri);
    //     const textureData = await this.sharedClient.getAsset(this.urn, textureUrn);
    //     // output.push({key: texUri, data: textureData})
    //     output.set(texUri, textureData)
    // }

}
