import * as zlib from 'zlib';
import * as SVF2 from './interfaces';

export function parseMaterial(buffer: Buffer): SVF2.IMaterial {
    if (buffer[0] === 31 && buffer[1] === 139) {
        buffer = zlib.gunzipSync(buffer);
    }
    console.assert(buffer.byteLength > 0);
    const group = JSON.parse(buffer.toString()) as SVF2.IMaterialGroup;
    const material = group.materials['0'];
    switch (material.definition) {
        case 'SimplePhong':
            return parseSimplePhongMaterial(group);
        default:
            throw new Error('Unsupported material definition: ' + material.definition);
    }
}

function parseSimplePhongMaterial(group: SVF2.IMaterialGroup): SVF2.IMaterial {
    let result: any = {};
    const material = group.materials[0];

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

function parseBooleanProperty(material: SVF2.IMaterial, prop: string, defaultValue: boolean): boolean {
    if (material.properties.booleans && prop in material.properties.booleans) {
        return material.properties.booleans[prop];
    } else {
        return defaultValue;
    }
}

function parseScalarProperty(material: SVF2.IMaterial, prop: string, defaultValue: number): number {
    if (material.properties.scalars && prop in material.properties.scalars) {
        return material.properties.scalars[prop].values[0];
    } else {
        return defaultValue;
    }
}

function parseColorProperty(material: SVF2.IMaterial, prop: string, defaultValue: number[]): number[] {
    if (material.properties.colors && prop in material.properties.colors) {
        const color = material.properties.colors[prop].values[0];
        return [color.r, color.g, color.b, color.a];
    } else {
        return defaultValue;
    }
}

function parseTextureProperty(material: SVF2.IMaterial, group: SVF2.IMaterialGroup, prop: string): any | null {
    if (material.textures && prop in material.textures) {
        const connection = material.textures[prop].connections[0];
        const texture = group.materials[connection];
        if (texture && texture.properties.uris && 'unifiedbitmap_Bitmap' in texture.properties.uris) {
            const uri = texture.properties.uris['unifiedbitmap_Bitmap'].values[0];
            // TODO: parse texture transforms aside from scale
            const texture_UScale = texture.properties.scalars?.texture_UScale?.values[0] as number || 1;
            const texture_VScale = texture.properties.scalars?.texture_VScale?.values[0] as number || 1;
            /*
            console.log('uri and scale', {
                uri: uri,
                u: texture_UScale,
                v: texture_VScale
            })
            */
            if (uri) {
                return {
                    uri,
                    scale: {
                        texture_UScale,
                        texture_VScale
                    }
                };
            }
        }
    }
    return null;
}