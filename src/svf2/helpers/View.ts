import * as path from 'node:path';
import { z } from 'zod';

const PrivatePDBSchema = z.object({
    avs: z.string(),
    offsets: z.string(),
    dbid: z.string()
});

const SharedPDBSchema = z.object({
    attrs: z.string(),
    values: z.string(),
    ids: z.string()
});

const PrivateAssetsSchema = z.object({
    pdb: PrivatePDBSchema,
    fragments: z.string(),
    fragments_extra: z.string(),
    materials_ptrs: z.string().optional(),
    geometry_ptrs: z.string().optional(),
    texture_manifest: z.string().optional()
});

const SharedAssetsSchema = z.object({
    pdb: SharedPDBSchema,
    geometry: z.string(),
    materials: z.string(),
    textures: z.string(),
    global_sharding: z.number()
});

const ManifestSchema = z.object({
    assets: PrivateAssetsSchema,
    shared_assets: SharedAssetsSchema
});

const StatsSchema = z.object({
    num_fragments: z.number().optional(),
    num_polys: z.number().optional(),
    num_materials: z.number().optional(),
    num_geoms: z.number().optional(),
    num_textures: z.number().optional()
});

const GeoreferenceSchema = z.object({
    positionLL84: z.array(z.number()).optional(),
    refPointLMV: z.array(z.number()).optional()
});

const FragmentTransformsOffsetSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
});

const ViewSchema = z.object({
    name: z.string(),
    version: z.number(),
    manifest: ManifestSchema,
    stats: StatsSchema.optional(),
    georeference: GeoreferenceSchema.optional(),
    fragmentTransformsOffset: FragmentTransformsOffsetSchema.optional()
});

export type View = z.infer<typeof ViewSchema>;

export function parse(json: any): View {
    return ViewSchema.parse(json);
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

export function getViewAccount(view: View): string {
    let baseUrl = view.manifest.shared_assets.geometry;
    if (baseUrl.startsWith('$otg_cdn$')) {
        baseUrl = baseUrl.substring(baseUrl.indexOf('/'));
    }
    const [_, account] = baseUrl.split('/');
    return account;
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