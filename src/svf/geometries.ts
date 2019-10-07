import { IGeometryMetadata } from "./schema";
import { PackFileReader } from "../common/packfile-reader";

/**
 * Parses geometries from a binary buffer, typically stored in a file called 'GeometryMetadata.pf',
 * referenced in the SVF manifest as an asset of type 'Autodesk.CloudPlatform.GeometryMetadataList'.
 * @generator
 * @param {Buffer} buffer Binary buffer to parse.
 * @returns {Iterable<IGeometryMetadata>} Instances of parsed geometries.
 */
export function *parseGeometries(buffer: Buffer): Iterable<IGeometryMetadata> {
    const pfr = new PackFileReader(buffer);
    for (let i = 0, len = pfr.numEntries(); i < len; i++) {
        const entry = pfr.seekEntry(i);
        console.assert(entry);
        console.assert(entry.version >= 3);

        const fragType = pfr.getUint8();
        // Skip past object space bbox -- we don't use that
        pfr.seek(pfr.offset + 24);
        const primCount = pfr.getUint16();
        const packID = parseInt(pfr.getString(pfr.getVarint()));
        const entityID = pfr.getVarint();
        // geometry.topoID = this.stream.getInt32();

        yield { fragType, primCount, packID, entityID };
    }
}
