import { InputStream } from "../common/input-stream";
import { IGeometry, GeometryType, IGeometryAttribute, AttributeType } from "./geometries";

interface Vec2 {
    x:number;
    y:number;
}

interface Vec3 {
    x:number;
    y:number;
    z:number;
}

/**
 * Triangular mesh data, including indices, vertices, optional normals and UVs.
 */
export interface IMesh {
    // uvcount: number; // Num of UV maps
    // uvmaps: IUVMap[];
    uvs?: Float32Array
    indices: Uint16Array;
    vertices: Float32Array;
    normals?: Float32Array;
    colors?: Float32Array;
}

/**
 * Line segment data.
 */
export interface ILines {
    isLines: true;
    vertices: Float32Array; // Vertex buffer (of length vcount*3)
    indices: Uint16Array; // Index buffer (of length lcount*2)
    colors?: Float32Array; // Optional color buffer (of length vcount*3)
    // lineWidth: number;
}

/**
 * Point cloud data.
 */
export interface IPoints {
    isPoints: true;
    // vcount: number; // Number of vertices/points
    vertices: Float32Array; // Vertex buffer (of length vcount*3)
    colors?: Float32Array; // Optional color buffer (of length vcount*3)
    // pointSize: number;
}

/**
 * Single UV channel. {@link IMesh} can have more of these.
 */
export interface IUVMap {
    name: string;
    file: string;
    uvs: Float32Array;
}

export function parseMeshes(geometry: IGeometry): IMesh | ILines | IPoints | null {

    let geom = null;
    if(geometry.type === GeometryType.Lines)
    {
        return parseLines(geometry)
    }
    
    if(geometry.type === GeometryType.Triangles)
    {
        return parseMeshe(geometry)
    }  

    //TODO: handle points geometry
    
    return geom;
}

function parseLines(geometry: IGeometry): ILines
{
    let attributes = geometry.attributes;
    
    let indices = getIndices(attributes, geometry.buffers, true);
    let vertices = getVertices(attributes, geometry.buffers);
    let colors = getColors(attributes, geometry.buffers);

    const lines : ILines = { isLines: true, indices, vertices };

    if(colors)
    {
        lines.colors = colors;
    }

    return lines;
}

function parseMeshe(geometry: IGeometry): IMesh
{
    let attributes = geometry.attributes;
    
    let indices = getIndices(attributes, geometry.buffers, false);
    let vertices = getVertices(attributes, geometry.buffers);
    let normals = getNormals(attributes, geometry.buffers);
    let colors = getColors(attributes, geometry.buffers);
    let uvs = getUvs(attributes, geometry.buffers);

    const meshes : IMesh = { indices, vertices, normals };

    if(colors)
    {
        meshes.colors = colors;
    }

    if(uvs)
    {
        meshes.uvs = uvs;
    }

    return meshes;
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

function deltaDecodeIndexBuffer2(ib: any) {

    if (!ib.length)
    return;
  
    ib[1] += ib[0];
  
    for (var i = 2; i < ib.length; i += 2) {
      ib[i] += ib[i - 2];
      ib[i + 1] += ib[i];
    }
  }

function DecodeNormal (enc: Vec2)
{
    let ang = { x: enc.x * 2.0 - 1.0, y: enc.y * 2.0 - 1.0} as Vec2;
    let scth = { x: Math.sin(ang.x * Math.PI), y: Math.cos(ang.x * Math.PI)} as Vec2;
    let scphi = {x: Math.sqrt(1.0 - ang.y * ang.y), y:ang.y} as Vec2;
    return {x: scth.y * scphi.x, y: scth.x * scphi.x, z: scphi.y} as Vec3;
}

function getIndices(attributes: IGeometryAttribute[], buffers: Buffer[], isLines: boolean): Uint16Array
{
    let indicesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Index)[0]
    if(indicesAttr)
    {
        let buffer = buffers[indicesAttr.bufferId]
        let is = new InputStream(buffer);
        let ind: number[] = [];
        is.seek(indicesAttr.itemOffset);
        while(is.offset < is.length)
        {
            ind.push(is.getUint16());
        }

        if(isLines)
            deltaDecodeIndexBuffer2(ind);
        else
            deltaDecodeIndexBuffer3(ind);

        return new Uint16Array(ind)
    }

    return new Uint16Array()
}

function getVertices(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array
{
    let verticesAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Position)[0]
    if(verticesAttr){
        let buffer = buffers[verticesAttr.bufferId]
        let is = new InputStream(buffer);
        let vert: number[] = [];
        is.seek(verticesAttr.itemOffset);
        while(is.offset < is.length)
        {
            let originalOffset = is.offset;
            for(let i = 0; i< verticesAttr.itemSize; i++)
            {
                vert.push(is.getFloat32());
            }

            is.seek(originalOffset + verticesAttr.itemStride);
        }
        return new Float32Array(vert)
    }
    return new Float32Array()
}

function getColors(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array | undefined
{
    let colorsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Color)[0]
    if(colorsAttr)
    {
        let buffer = buffers[colorsAttr.bufferId]
        let is = new InputStream(buffer);
        let colors: number[] = [];
        is.seek(colorsAttr.itemOffset);
        while(is.offset < is.length)
        {
            let originalOffset = is.offset;
            for(let i = 0; i< colorsAttr.itemSize; i++)
            {
                colors.push(is.getFloat32());
            }

            is.seek(originalOffset + colorsAttr.itemStride);
        }
        
        return new Float32Array(colors);

    }

    return undefined;
}

function getNormals(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array | undefined
{
    let normalsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.Normal)[0]
    if(normalsAttr)
    {
        let buffer = buffers[normalsAttr.bufferId]
        // let componentType = normalsAttr.componentType;
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
}

// TODO: handle uvmaps with multiple channels as done in svf ?
function getUvs(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array | undefined
{
    let uvsAttr:IGeometryAttribute = attributes.filter((a:IGeometryAttribute) => a.attributeType === AttributeType.TextureUV)[0];            
    if(uvsAttr){
        let buffer = buffers[uvsAttr.bufferId]
        let is = new InputStream(buffer);
        let uvs: number[] = [];
        is.seek(uvsAttr.itemOffset);
        while(is.offset < is.length)
        {
            let originalOffset = is.offset;

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
    return undefined;
}