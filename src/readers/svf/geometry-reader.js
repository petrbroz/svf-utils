const { PackFileReader } = require('./pack-file-reader');

class GeometryReader extends PackFileReader {
    constructor(buff) {
        super(buff);
        this.parseGeometries();
    }

    parseGeometries() {
        const entries = this.numEntries();
        this.geometries = [];
        for (let i = 0; i < entries; i++) {
            const entry = this.seekEntry(i);
            console.assert(entry);
            console.assert(entry.version >= 3);

            const geometry = {
                fragType: -1
            };

            geometry.fragType = this.stream.getUint8();
            // Skip past object space bbox -- we don't use that
            this.stream.offset += 24;
            geometry.primCount = this.stream.getUint16();
            geometry.packID = parseInt(this.getString());
            geometry.entityID = this.stream.getVarint();
            // geometry.topoID = this.stream.getInt32();

            this.geometries.push(geometry);
        }
    }
}

module.exports = {
    GeometryReader
};