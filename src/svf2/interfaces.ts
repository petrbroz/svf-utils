export interface IModel {
    views: IView[];
}

export interface IView {
    id: string;
    metadata: { [key: string]: any };
    fragments: IFragment[];
    geometries: Geometry[];
    materials: IMaterial[];
    textures: Map<string, any>;
}

export interface IVec2 {
    x: number;
    y: number;
}

export interface IVec3 {
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

export interface ITransform {
    translation: IVec3;
    quaternion: IQuaternion;
    scale: IVec3;
}

export interface IFragment {
    geomId: number;
    materialId: number;
    dbId: number;
    flags: number;
    transform: ITransform;
}

export type Geometry = IMeshGeometry | ILineGeometry;

export interface IMeshGeometry {
    type: GeometryType.Triangles;
    indices: Uint16Array;
    vertices: Float32Array;
    normals?: Float32Array;
    colors?: Float32Array;
    uvs?: Float32Array
}

export interface ILineGeometry {
    type: GeometryType.Lines;
    indices: Uint16Array;
    vertices: Float32Array;
}

export enum GeometryType {
    Triangles = 0,
    Lines = 1,
    Points = 2,
    WideLines = 3,
}

// export interface IUVMap {
//     name: string;
//     file: string;
//     uvs: Float32Array;
// }

export interface IMaterials {
    name: string;
    version: string;
    scene: { [key: string]: any };
    materials: { [key: string]: IMaterialGroup };
}

export interface IMaterialGroup {
    version: number;
    userassets: string[];
    materials: { [key: string]: IMaterial };
}

export interface IMaterial {
    tag: string;
    proteinType: string;
    definition: string;
    transparent: boolean;
    keywords?: string[];
    categories?: string[];
    properties: {
        integers?: { [key: string]: number; };
        booleans?: { [key: string]: boolean; };
        strings?: { [key: string]: { values: string[] }; };
        uris?: { [key: string]: { values: string[] }; };
        scalars?: { [key: string]: { units: string; values: number[] }; };
        colors?: { [key: string]: { values: { r: number; g: number; b: number; a: number; }[]; connections?: string[]; }; };
        choicelists?: { [key: string]: { values: number[] }; };
        uuids?: { [key: string]: { values: number[] }; };
        references?: any; // TODO
    };
    textures?: { [key: string]: { connections: string[] }; };
}