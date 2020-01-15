import { IMaterial } from './schema';

export function parseMaterial(json: string): IMaterial {
    let result: IMaterial = {};
    const group = JSON.parse(json);
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

function parseBooleanProperty(material: any, prop: string, defaultValue: boolean): boolean {
    if (material.properties.booleans && prop in material.properties.booleans) {
        return material.properties.booleans[prop];
    } else {
        return defaultValue;
    }
}

function parseScalarProperty(material: any, prop: string, defaultValue: number): number {
    if (material.properties.scalars && prop in material.properties.scalars) {
        return material.properties.scalars[prop].values[0];
    } else {
        return defaultValue;
    }
}

function parseColorProperty(material: any, prop: string, defaultValue: number[]): number[] {
    if (material.properties.colors && prop in material.properties.colors) {
        const color = material.properties.colors[prop].values[0];
        return [color.r, color.g, color.b, color.a];
    } else {
        return defaultValue;
    }
}

function parseTextureProperty(material: any, group: any, prop: string) {
    if (material.textures && prop in material.textures) {
        const connection = material.textures[prop].connections[0];
        const texture = group.materials[connection];
        if (texture && texture.properties.uris && 'unifiedbitmap_Bitmap' in texture.properties.uris) {
            const uri = texture.properties.uris['unifiedbitmap_Bitmap'].values[0];
            if (uri) {
                // TODO: parse texture transforms
                return { uri };
            }
        }
    }
    return null;
}
