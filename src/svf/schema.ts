export enum AssetType {
    Image = 'Autodesk.CloudPlatform.Image',
    PropertyViewables = 'Autodesk.CloudPlatform.PropertyViewables',
    PropertyOffsets = 'Autodesk.CloudPlatform.PropertyOffsets',
    PropertyAttributes = 'Autodesk.CloudPlatform.PropertyAttributes',
    PropertyValues = 'Autodesk.CloudPlatform.PropertyValues',
    PropertyIDs = 'Autodesk.CloudPlatform.PropertyIDs',
    PropertyAVs = 'Autodesk.CloudPlatform.PropertyAVs',
    PropertyRCVs = 'Autodesk.CloudPlatform.PropertyRCVs',
    ProteinMaterials = 'ProteinMaterials',
    PackFile = 'Autodesk.CloudPlatform.PackFile',
    FragmentList = 'Autodesk.CloudPlatform.FragmentList',
    GeometryMetadataList = 'Autodesk.CloudPlatform.GeometryMetadataList',
    InstanceTree = 'Autodesk.CloudPlatform.InstanceTree'
}

/**
 * Parsed content of an actual *.svf file.
 */
export interface ISvfRoot {
    manifest: ISvfManifest;
    metadata: ISvfMetadata;
    embedded: { [key: string]: Buffer };
}

/**
 * Top-level manifest containing URIs and types of all assets
 * referenced by or embedded in a specific SVF file.
 * The URIs are typically relative to the SVF file itself.
 */
export interface ISvfManifest {
    name: string;
    manifestversion: number;
    toolkitversion: string;
    assets: ISvfManifestAsset[];
    typesets: ISvfManifestTypeSet[];
}

/**
 * Description of a specific asset referenced by or embedded in an SVF,
 * including the URI, compressed and uncompressed size, type of the asset itself,
 * and types of all entities inside the asset.
 */
export interface ISvfManifestAsset {
    id: string;
    type: AssetType;
    typeset?: string;
    URI: string;
    size: number;
    usize: number;
}

/**
 * Collection of type definitions.
 */
export interface ISvfManifestTypeSet {
    id: string;
    types: ISvfManifestType[];
}

/**
 * Single type definition.
 */
export interface ISvfManifestType {
    class: string;
    type: string;
    version: number;
}

/**
 * Additional metadata for SVF such as the definition of "up" vector,
 * default background, etc.
 */
export interface ISvfMetadata {
    version: string;
    metadata: { [key: string]: any };
}

/**
 * Fragment represents a single scene object,
 * linking together material, geometry, and database IDs,
 * and providing world transform and bounding box on top of that.
 */
export interface IFragment {
    visible: boolean;
    materialID: number;
    geometryID: number;
    dbID: number;
    transform: Transform | null;
    bbox: number[];
}

/**
 * Lightweight data structure pointing to a mesh in a specific packfile and entry.
 * Contains additional information about the type of mesh and its primitive count.
 */
export interface IGeometryMetadata {
    fragType: number;
    primCount: number;
    packID: number;
    entityID: number;
    topoID?: number;
}

export interface IMaterial {
    diffuse?: number[];
    specular?: number[];
    ambient?: number[];
    emissive?: number[];
    glossiness?: number;
    reflectivity?: number;
    opacity?: number;
    metal?: boolean;
    maps?: {
        diffuse?: IMaterialMap;
        specular?: IMaterialMap;
        normal?: IMaterialMap;
        bump?: IMaterialMap;
        alpha?: IMaterialMap;
    };
}

export interface IMaterialMap {
    uri: string;
    scale: {
        texture_UScale: number ,
        texture_VScale: number
    }
}

/**
 * Triangular mesh data, including indices, vertices, optional normals and UVs.
 */
export interface IMesh {
    vcount: number; // Num of vertices
    tcount: number; // Num of triangles
    uvcount: number; // Num of UV maps
    attrs: number; // Number of attributes per vertex
    flags: number;
    comment: string;
    uvmaps: IUVMap[];
    indices: Uint16Array;
    vertices: Float32Array;
    normals?: Float32Array;
    colors?: Float32Array;
    min: IVector3;
    max: IVector3;
}

/**
 * Line segment data.
 */
export interface ILines {
    isLines: true;
    vcount: number; // Number of vertices
    lcount: number; // Number of line segments
    vertices: Float32Array; // Vertex buffer (of length vcount*3)
    indices: Uint16Array; // Index buffer (of length lcount*2)
    colors?: Float32Array; // Optional color buffer (of length vcount*3)
    lineWidth: number;
}

/**
 * Point cloud data.
 */
export interface IPoints {
    isPoints: true;
    vcount: number; // Number of vertices/points
    vertices: Float32Array; // Vertex buffer (of length vcount*3)
    colors?: Float32Array; // Optional color buffer (of length vcount*3)
    pointSize: number;
}

/**
 * Single UV channel. {@link IMesh} can have more of these.
 */
export interface IUVMap {
    name: string;
    file: string;
    uvs: Float32Array;
}

export interface IVector3 {
    x: number;
    y: number;
    z: number;
}

export interface IQuaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

export type Matrix3x3 = number[];

export type Transform = { t: IVector3 } | { t: IVector3, s: IVector3, q: IQuaternion } | { matrix: Matrix3x3, t: IVector3 };
