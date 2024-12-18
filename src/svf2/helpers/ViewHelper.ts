import * as path from 'path';

export interface View {
    name: string;
    version: number;
    manifest: Manifest;
    stats: { [key: string]: any };
    // "double sided geometry": { value: boolean; };
    // "navigation hint": { value: string; };
    // "cameras": any[];
    // "fragmentTransformsOffset": { x: number; y: number; z: number; };
    // ...
}

export interface Manifest {
    assets: {
        fragments: string;
        fragments_extra?: string;
        materials_ptrs: string;
        geometry_ptrs: string;
        texture_manifest?: string;
        pdb?: {
            avs: string;
            offsets: string;
            dbid: string;
        };
    };
    shared_assets: {
        geometry: string;
        materials: string;
        textures: string;
        global_sharding: number;
        pdb?: {
            attrs: string;
            values: string;
            ids: string;
        };
    };
}

/**
 * Utility class to handle and resolve various assets associated with a view's manifest
 * in Autodesk Platform Services. It includes methods to list private and shared model assets,
 * private and shared database assets, and resolve asset URNs. Additionally, it provides methods
 * to get URNs for geometry, materials, and textures, as well as retrieve metadata from the view.
 */
export class ViewHelper {
    constructor(public view: View, protected resolvedViewUrn: string) {}

    listPrivateModelAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const assets = this.view.manifest && this.view.manifest.assets;
        if (assets) {
            let result: { [key: string]: { uri: string; resolvedUrn: string; } } = {};
            if (assets.fragments) {
                result.fragments = {
                    uri: assets.fragments,
                    resolvedUrn: this.resolveAssetUrn(assets.fragments)
                };
            }
            if (assets.fragments_extra) {
                result.fragments_extra = {
                    uri: assets.fragments_extra,
                    resolvedUrn: this.resolveAssetUrn(assets.fragments_extra)
                };
            }
            if (assets.materials_ptrs) {
                result.materials_ptrs = {
                    uri: assets.materials_ptrs,
                    resolvedUrn: this.resolveAssetUrn(assets.materials_ptrs)
                };
            }
            if (assets.geometry_ptrs) {
                result.geometry_ptrs = {
                    uri: assets.geometry_ptrs,
                    resolvedUrn: this.resolveAssetUrn(assets.geometry_ptrs)
                };
            }
            if (assets.texture_manifest) {
                result.texture_manifest = {
                    uri: assets.texture_manifest,
                    resolvedUrn: this.resolveAssetUrn(assets.texture_manifest)
                }
            }
            return result;
        } else {
            return undefined;
        }
    }

    listSharedModelAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const assets = this.view.manifest && this.view.manifest.shared_assets;
        if (assets) {
            let result: { [key: string]: { uri: string; resolvedUrn: string; } } = {};
            if (assets.geometry) {
                result.geometry = {
                    uri: assets.geometry,
                    resolvedUrn: this.resolveAssetUrn(assets.geometry)
                };
            }
            if (assets.materials) {
                result.materials = {
                    uri: assets.materials,
                    resolvedUrn: this.resolveAssetUrn(assets.materials)
                };
            }
            if (assets.textures) {
                result.textures = {
                    uri: assets.textures,
                    resolvedUrn: this.resolveAssetUrn(assets.textures)
                };
            }
            return result;
        } else {
            return undefined;
        }
    }

    listPrivateDatabaseAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const pdb = this.view.manifest && this.view.manifest.assets && this.view.manifest.assets.pdb;
        if (pdb) {
            return {
                avs: {
                    uri: pdb.avs,
                    resolvedUrn: this.resolveAssetUrn(pdb.avs)
                },
                offsets: {
                    uri: pdb.offsets,
                    resolvedUrn: this.resolveAssetUrn(pdb.offsets)
                },
                dbid: {
                    uri: pdb.dbid,
                    resolvedUrn: this.resolveAssetUrn(pdb.dbid)
                }
            };
        } else {
            return undefined;
        }
    }

    listSharedDatabaseAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const pdb = this.view.manifest && this.view.manifest.shared_assets && this.view.manifest.shared_assets.pdb;
        if (pdb) {
            return {
                attrs: {
                    uri: pdb.attrs,
                    resolvedUrn: this.resolveAssetUrn(pdb.attrs)
                },
                values: {
                    uri: pdb.values,
                    resolvedUrn: this.resolveAssetUrn(pdb.values)
                },
                ids: {
                    uri: pdb.ids,
                    resolvedUrn: this.resolveAssetUrn(pdb.ids)
                }
            };
        } else {
            return undefined;
        }
    }

    resolveAssetUrn(assetUrn: string): string {
        if (assetUrn.startsWith('urn:')) {
            return assetUrn;
        } else {
            return path.normalize(path.join(path.dirname(this.resolvedViewUrn), assetUrn));
        }
    }

    getGeometryUrn(hash: string): string {
        let baseUrl = this.view.manifest.shared_assets.geometry;
        if (baseUrl.startsWith('$otg_cdn$')) {
            baseUrl = baseUrl.substring(baseUrl.indexOf('/'));
        }
        return baseUrl + encodeURI(hash);
    }

    getMaterialUrn(hash: string): string {
        return this.view.manifest.shared_assets.materials + encodeURI(hash);
    }

    getTextureUrn(hash: string): string {
        return this.view.manifest.shared_assets.textures + encodeURI(hash);
    }

    getMetadata(): { [key: string]: any } {
        // Only map necessary values
        const map = this.view as any;
        let metadata = {
            "world bounding box": map["world bounding box"],
            "world up vector": map["world up vector"],
            "world front vector": map["world front vector"],
            "world north vector": map["world north vector"],
            "distance unit": map["distance unit"],
        }
        return metadata;
    }
}