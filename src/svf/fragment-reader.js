const { PackFileReader } = require('./pack-file-reader');

class FragmentReader extends PackFileReader {
    constructor(buff) {
        super(buff);
        this.parseFragments();
    }

    parseFragments() {
        const entries = this.numEntries();
        this.fragments = [];
        for (let i = 0; i < entries; i++) {
            const entryType = this.seekEntry(i);
            console.assert(entryType);
            console.assert(entryType.version > 4);

            const fragment = {
                visible: true,
                materialID: -1,
                geometryID: -1,
                dbID: -1,
                transform: null,
                bbox: [0, 0, 0, 0, 0, 0]
            };

            // Flags
            const flags = this.stream.getUint8();
            fragment.visible = (flags & 0x01) !== 0;

            // Material
            fragment.materialID = this.stream.getVarint();

            // Geometry
            fragment.geometryID = this.stream.getVarint();

            // Transform
            fragment.transform = this.getTransform();

            // Bounding box
            const bboxOffset = [0, 0, 0]; // TODO: find the bbox offset
            for (let i = 0; i < 6; i++) {
                fragment.bbox[i] = this.stream.getFloat32() + bboxOffset[i % 3];
            }

            // Database ID
            fragment.dbID = this.stream.getVarint();

            this.fragments.push(fragment);
        }
    }
}

module.exports = {
    FragmentReader
};