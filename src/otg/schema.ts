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

export interface IGeometry {
    type: GeometryType;
    attributes: IGeometryAttribute[];
    buffers: Buffer[];
}

export interface IGeometryAttribute {
    attributeType: AttributeType; // Type of attribute (indices, vertices, UVs, etc.)
    componentType: ComponentType; // Type of individual components of each item for this attribute (for example, FLOAT for vec3 vertices)
    itemSize: number; // Number of components in each item for this attribute (for example, 3 for vec3 vertices)
    itemOffset: number; // Byte offset of attribute data within a single stride
    itemStride: number; // Byte size of a single stride, can be 0 in which case stride is equal to `itemSize * sizeof(componentType)`
    bufferId: number;
}

export enum GeometryType {
    Triangles = 0,
    Lines = 1,
    Points = 2,
    WideLines = 3
}

export enum AttributeType {
	Index = 0,
	IndexEdges = 1,
	Position = 2,
	Normal = 3,
	TextureUV = 4,
	Color = 5
}

export enum ComponentType {
	BYTE = 0,
	SHORT = 1,
	UBYTE = 2,
	USHORT = 3,

	BYTE_NORM = 4,
	SHORT_NORM = 5,
	UBYTE_NORM = 6,
	USHORT_NORM = 7,

	FLOAT = 8,
	INT = 9,
	UINT = 10
	//DOUBLE = 11
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
}
