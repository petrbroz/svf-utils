import * as path from 'node:path';
import { z } from 'zod';

const ViewSchema = z.object({
    role: z.string(),
    mime: z.string(),
    urn: z.string()
});

export type View = z.infer<typeof ViewSchema>;

const PDBManifestSchema = z.object({
    pdb_version_rel_path: z.string().optional(),
    pdb_shared_rel_path: z.string().optional(),
    assets: z.array(z.object({
        uri: z.string().optional(),
        tag: z.string().optional(),
        type: z.string().optional(),
        isShared: z.boolean().optional()
    })).optional()
});

export type PDBManifest = z.infer<typeof PDBManifestSchema>;

const OTGManifestSchema = z.object({
    version: z.number(),
    creator: z.string().optional(),
    first_started_at: z.string().optional(),
    last_started_at: z.string().optional(),
    last_modified_at: z.string().optional(),
    invocations: z.number().optional(),
    status: z.string().optional(),
    success: z.string().optional(),
    progress: z.string().optional(),
    urn: z.string().optional(),
    pdb_manifest: PDBManifestSchema.optional(),
    views: z.record(ViewSchema),
    account_id: z.string().optional(),
    paths: z.object({
        version_root: z.string(),
        shared_root: z.string(),
        global_root: z.string(),
        global_sharding: z.number(),
        region: z.string()
    })
});

export type OTGManifest = z.infer<typeof OTGManifestSchema>;

const ChildSchema = z.object({
    guid: z.string(),
    role: z.string().optional(),
    hasThumbnail: z.enum(['true', 'false']).optional(),
    progress: z.string().optional(),
    type: z.string(),
    status: z.string().optional(),
    version: z.string().optional(),
    urn: z.string().optional(),
    inputFileSize: z.number().optional(),
    inputFileType: z.string().optional(),
    name: z.string().optional(),
    properties: z.object({}).optional(),
    otg_manifest: OTGManifestSchema.optional(),
    children: z.array(z.lazy((): z.ZodTypeAny => ChildSchema)).optional()
});

export type Child = z.infer<typeof ChildSchema>;

const ManifestSchema = z.object({
    guid: z.string(),
    owner: z.string().optional(),
    hasThumbnail: z.enum(['true', 'false']),
    startedAt: z.string().optional(),
    type: z.string(),
    urn: z.string(),
    success: z.string(),
    progress: z.string(),
    region: z.string().optional(),
    status: z.string(),
    registerKeys: z.map(z.string(), z.array(z.string())).optional(),
    children: z.array(ChildSchema)
});

export type Manifest = z.infer<typeof ManifestSchema>;

/**
 * Parse a manifest JSON object.
 * @param json The manifest JSON object.
 * @returns The parsed manifest.
 * @throws If the manifest is invalid.
 */
export function parse(json: any): Manifest {
    return ManifestSchema.parse(json);
}

/**
 * Find the SVF2 manifest in a derivative manifest.
 * @param manifest The derivative manifest.
 * @returns The SVF2 manifest.
 * @throws If the SVF2 manifest is not found.
 */
export function findManifestSVF2(manifest: Manifest): OTGManifest {
    const viewable = manifest.children.find((child) => child.role === 'viewable' && child.otg_manifest);
    if (!viewable || !viewable.otg_manifest) {
        throw new Error('Could not find a viewable with SVF2 data.');
    }
    console.assert(viewable.otg_manifest.version === 1);
    console.assert(viewable.otg_manifest.progress === 'complete');
    console.assert(viewable.otg_manifest.status === 'success');
    return viewable.otg_manifest;
}

/**
 * Resolve the URN of a view.
 * @param manifest The SVF2 manifest.
 * @param view The view.
 * @returns The resolved URN.
 */
export function resolveViewURN(manifest: OTGManifest, view: View) {
    return path.normalize(path.join(manifest.paths.version_root, view.urn))
}