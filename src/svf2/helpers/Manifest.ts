import * as path from 'node:path';
import { Ajv } from 'ajv';
import { Manifest, OTGManifest, View } from './Manifest.schema';
import schema from '../schemas/Manifest.schema.json';

/**
 * Parse a manifest JSON object.
 * @param json The manifest JSON object.
 * @returns The parsed manifest.
 * @throws If the manifest is invalid.
 */
export function parse(json: any): Manifest {
    const ajv = new Ajv();
    const validate = ajv.compile<Manifest>(schema);
    if (!validate(json)) {
        throw new Error(ajv.errorsText(validate.errors));
    }
    return json;
}

/**
 * Find the SVF2 manifest in a derivative manifest.
 * @param manifest The derivative manifest.
 * @returns The SVF2 manifest.
 * @throws If the SVF2 manifest is not found.
 */
export function findManifestSVF2(manifest: Manifest): OTGManifest {
    const viewable = manifest.children.find((child: any) => child.role === 'viewable' && child.otg_manifest);
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