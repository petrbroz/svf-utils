import * as path from 'node:path';
import { Ajv } from 'ajv';
import schema from '../schemas/View.schema.json';
import { View } from '../schemas/View';

export function parse(json: any): View {
    const ajv = new Ajv();
    const validate = ajv.compile<View>(schema);
    if (!validate(json)) {
        throw new Error(ajv.errorsText(validate.errors));
    }
    return json;
}

export function getViewMetadata(view: View): { [key: string]: any } {
    // Only map necessary values
    const map = view as any;
    let metadata = {
        "world bounding box": map["world bounding box"],
        "world up vector": map["world up vector"],
        "world front vector": map["world front vector"],
        "world north vector": map["world north vector"],
        "distance unit": map["distance unit"],
    }
    return metadata;
}

export function resolveAssetUrn(resolvedViewUrn: string, assetUrn: string): string {
    if (assetUrn.startsWith('urn:')) {
        return assetUrn;
    } else {
        return path.normalize(path.join(path.dirname(resolvedViewUrn), assetUrn));
    }
}

export function resolveGeometryUrn(view: View, hash: string): string {
    let baseUrl = view.manifest.shared_assets.geometry;
    if (baseUrl.startsWith('$otg_cdn$')) {
        baseUrl = baseUrl.substring(baseUrl.indexOf('/'));
    }
    return baseUrl + encodeURI(hash);
}

export function resolveMaterialUrn(view: View, hash: string): string {
    return view.manifest.shared_assets.materials + encodeURI(hash);
}

export function resolveTextureUrn(view: View, hash: string): string {
    return view.manifest.shared_assets.textures + encodeURI(hash);
}