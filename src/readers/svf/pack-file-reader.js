const zlib = require('zlib');

const { InputStream } = require('./input-stream');

class PackFileReader {
    constructor(buff) {
        if (buff[0] === 31 && buff[1] === 139) {
            this.buff = zlib.gunzipSync(buff);
        } else {
            this.buff = buff;
        }
        this.stream = new InputStream(this.buff);
        const len = this.stream.getInt32();
        this.type = this.stream.getString(len);
        this.version = this.stream.getInt32();
        this.parseContents();
    }

    parseContents() {
        // Get offsets to TOC and type sets from the end of the file
        const originalOffset = this.stream.offset;
        this.stream.seek(this.stream.length - 8);
        const entriesOffset = this.stream.getUint32();
        const typesOffset = this.stream.getUint32();

        // Populate entries
        this.entries = []; // offsets to individual entries in the pack file
        this.stream.seek(entriesOffset);
        const entriesCount = this.stream.getVarint();
        for (let i = 0; i < entriesCount; i++) {
            this.entries.push(this.stream.getUint32());
        }

        // Populate type sets
        this.types = []; // types of all entries in the pack file
        this.stream.seek(typesOffset);
        const typesCount = this.stream.getVarint();
        for (let i = 0; i < typesCount; i++) {
            this.types.push({
                _class: this.getString(),
                _type: this.getString(),
                version: this.stream.getVarint()
            });
        }

        // Restore offset
        this.stream.seek(originalOffset);
    }

    numEntries() {
        return this.entries.length;
    }

    seekEntry(i) {
        if (i >= this.numEntries()) {
            return null;
        }

        // Read the type index and populate the entry data
        this.stream.seek(this.entries[i]);
        const type = this.stream.getUint32();
        if (type >= this.types.length) {
            return null;
        }
        return this.types[type];
    }

    getString() {
        return this.stream.getString(this.stream.getVarint());
    }

    getVector3D() {
       return {
           x: this.stream.getFloat64(),
           y: this.stream.getFloat64(),
           z: this.stream.getFloat64()
       };
    }

    getQuaternion() {
        return {
            x: this.stream.getFloat32(),
            y: this.stream.getFloat32(),
            z: this.stream.getFloat32(),
            w: this.stream.getFloat32()
        };
    }

    getMatrix3x3() {
       const elements = [];
       for (let i = 0; i < 3; i++) {
           for (let j = 0; j < 3; j++) {
               elements.push(this.stream.getFloat32());
           }
       }
       return elements;
    }

    getTransform() {
        const xformType = this.stream.getUint8();
        let q, t, s, matrix;
        switch (xformType) {
            case 0: // translation
                return { t: this.getVector3D() };
            case 1: // rotation & translation
                q = this.getQuaternion();
                t = this.getVector3D();
                s = { x: 1, y: 1, z: 1 };
                return { q, t, s };
            case 2: // uniform scale & rotation & translation
                const scale = this.stream.getFloat32();
                q = this.getQuaternion();
                t = this.getVector3D();
                s = { x: scale, y: scale, z: scale };
                return { q, t, s };
            case 3: // affine matrix
                matrix = this.getMatrix3x3();
                t = this.getVector3D();
                return { matrix, t };
        }
    }
}

module.exports = {
    PackFileReader
};