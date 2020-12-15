import * as zlib from 'zlib';
import { IMaterial, IMaterialMap } from './schema';

namespace SvfInternal {
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
}

/**
 * Parses materials from a binary buffer, typically stored in a file called 'Materials.json.gz',
 * referenced in the SVF manifest as an asset of type 'ProteinMaterials'.
 * @generator
 * @param {Buffer} buffer Binary buffer to parse.
 * @returns {Iterable<IMaterial | null>} Instances of parsed materials, or null if there are none (or are not supported).
 */
export function *parseMaterials(buffer: Buffer): Iterable<IMaterial | null> {
    if (buffer[0] === 31 && buffer[1] === 139) {
        buffer = zlib.gunzipSync(buffer);
    }
    if (buffer.byteLength > 0) {
        const json = JSON.parse(buffer.toString()) as SvfInternal.IMaterials;
        for (const key of Object.keys(json.materials)) {
            const group = json.materials[key];
            const material = group.materials[group.userassets[0]];
            switch (material.definition) {
                case 'SimplePhong':
                    yield parseSimplePhongMaterial(group);
                    break;
                default:
                    console.warn('Unsupported material definition', material.definition);
                    yield null;
                    break;
            }
        }
    }
}

function parseSimplePhongMaterial(group: SvfInternal.IMaterialGroup): IMaterial {
    let result: IMaterial = {};
    const material = group.materials[group.userassets[0]];

    result.diffuse = parseColorProperty(material, 'generic_diffuse', [0, 0, 0, 1]);
    result.specular = parseColorProperty(material, 'generic_specular', [0, 0, 0, 1]);
    result.ambient = parseColorProperty(material, 'generic_ambient', [0, 0, 0, 1]);
    result.emissive = parseColorProperty(material, 'generic_emissive', [0, 0, 0, 1]);

    result.glossiness = parseScalarProperty(material, 'generic_glossiness', 30);
    result.reflectivity = parseScalarProperty(material, 'generic_reflectivity_at_0deg', 0);
    result.opacity = 1.0 - parseScalarProperty(material, 'generic_transparency', 0);

    result.metal = parseBooleanProperty(material, 'generic_is_metal', false);

    if (material.textures) {
        result.maps = {};
        const diffuse = parseTextureProperty(material, group, 'generic_diffuse');
        if (diffuse) {
            result.maps.diffuse = diffuse;
        }
        const specular = parseTextureProperty(material, group, 'generic_specular');
        if (specular) {
            result.maps.specular = specular;
        }
        const alpha = parseTextureProperty(material, group, 'generic_alpha');
        if (alpha) {
            result.maps.alpha = alpha;
        }
        const bump = parseTextureProperty(material, group, 'generic_bump');
        if (bump) {
            if (parseBooleanProperty(material, 'generic_bump_is_normal', false)) {
                result.maps.normal = bump;
            } else {
                result.maps.bump = bump;
            }
        }
    }

    return result;
}

function parseBooleanProperty(material: SvfInternal.IMaterial, prop: string, defaultValue: boolean): boolean {
    if (material.properties.booleans && prop in material.properties.booleans) {
        return material.properties.booleans[prop];
    } else {
        return defaultValue;
    }
}

function parseScalarProperty(material: SvfInternal.IMaterial, prop: string, defaultValue: number): number {
    if (material.properties.scalars && prop in material.properties.scalars) {
        return material.properties.scalars[prop].values[0];
    } else {
        return defaultValue;
    }
}

function parseColorProperty(material: SvfInternal.IMaterial, prop: string, defaultValue: number[]): number[] {
    if (material.properties.colors && prop in material.properties.colors) {
        const color = material.properties.colors[prop].values[0];
        return [color.r, color.g, color.b, color.a];
    } else {
        return defaultValue;
    }
}

function parseTextureProperty(material: SvfInternal.IMaterial, group: SvfInternal.IMaterialGroup, prop: string): IMaterialMap | null {
    if (material.textures && prop in material.textures) {
        const connection = material.textures[prop].connections[0];
        const texture = group.materials[connection];
        if (texture && texture.properties.uris && 'unifiedbitmap_Bitmap' in texture.properties.uris) {
            const uri = texture.properties.uris['unifiedbitmap_Bitmap'].values[0];
            // TODO: parse texture transforms aside from scale
            const texture_UScale = texture.properties.scalars?.texture_UScale?.values[0] as number;
            const texture_VScale = texture.properties.scalars?.texture_VScale?.values[0] as number;
            /*
            console.log('uri and scale', {
                uri: uri,
                u: texture_UScale,
                v: texture_VScale
            })
            */
            if (uri) {
                return { uri, scale: {
                    texture_UScale,
                    texture_VScale
                } };
            }
        }
    }
    return null;
}
