import { PackFileReader } from '../common/packfile-reader';
import { IFragment } from './schema';

/**
 * Parses fragments from a binary buffer, typically stored in a file called 'FragmentList.pack',
 * referenced in the SVF manifest as an asset of type 'Autodesk.CloudPlatform.FragmentList'.
 * @generator
 * @param {Buffer} buffer Binary buffer to parse.
 * @returns {Iterable<IFragment>} Instances of parsed fragments.
 */
export function *parseFragments(buffer: Buffer): Iterable<IFragment> {
    const pfr = new PackFileReader(buffer);
    for (let i = 0, len = pfr.numEntries(); i < len; i++) {
        const entryType = pfr.seekEntry(i);
            console.assert(entryType);
            console.assert(entryType.version > 4);

            const flags = pfr.getUint8();
            const visible: boolean = (flags & 0x01) !== 0;
            const materialID = pfr.getVarint();
            const geometryID = pfr.getVarint();
            const transform = pfr.getTransform();
            const bboxOffset = [0, 0, 0]; // TODO: find the bbox offset
            const bbox = [0, 0, 0, 0, 0, 0];
            for (let j = 0; j < 6; j++) {
                bbox[j] = pfr.getFloat32() + bboxOffset[j % 3];
            }
            const dbID = pfr.getVarint();

            yield { visible, materialID, geometryID, dbID, transform, bbox };
    }
}
