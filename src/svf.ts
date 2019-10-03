import { IAuthOptions } from 'forge-server-utils/dist/common';
import * as SvfUtils from 'forge-server-utils/dist/svf';

export interface ISvf {
    metadata: SvfUtils.ISvfMetadata;
    fragments: SvfUtils.IFragment[];
    geometries: SvfUtils.IGeometryMetadata[];
    meshpacks: (SvfUtils.IMesh | SvfUtils.ILines | SvfUtils.IPoints | null)[][];
    materials: (SvfUtils.IMaterial | null)[];
    getDerivative: (uri: string) => Promise<Buffer>;
}

export async function deserialize(urn: string, guid: string, auth: IAuthOptions): Promise<ISvf> {
    const deserializer = await SvfUtils.Parser.FromDerivativeService(urn, guid, auth);
    let output: ISvf = {
        metadata: await deserializer.getMetadata(),
        fragments: [],
        geometries: [],
        meshpacks: [],
        materials: [],
        getDerivative: (uri: string) => deserializer.getAsset(uri)
    };
    let tasks: Promise<void>[] = [];

    tasks.push((async function() {
        output.fragments = await deserializer.listFragments();
    })());
    tasks.push((async function() {
        output.geometries = await deserializer.listGeometries();
    })());
    tasks.push((async function() {
        output.materials = await deserializer.listMaterials();
    })());
    for (let i = 0, len = deserializer.getMeshPackCount(); i < len; i++) {
        tasks.push((async function(id: number) {
            output.meshpacks[id] = await deserializer.listMeshPack(id);
        })(i));
    }
    await Promise.all(tasks);
    return output;
}
