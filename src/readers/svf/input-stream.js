class InputStream {
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
        this.length = buffer.length;
    }

    seek(offset) {
        this.offset = offset;
    }

    getUint8() {
        const val = this.buffer.readUInt8(this.offset);
        this.offset += 1;
        return val;
    }

    getUint16() {
        const val = this.buffer.readUInt16LE(this.offset);
        this.offset += 2;
        return val;
    }

    getInt16() {
        const val = this.buffer.readInt16LE(this.offset);
        this.offset += 2;
        return val;
    }

    getUint32() {
        const val = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return val;
    }

    getInt32() {
        const val = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return val;
    }

    getFloat32() {
        const val = this.buffer.readFloatLE(this.offset);
        this.offset += 4;
        return val;
    }

    getFloat64() {
        const val = this.buffer.readDoubleLE(this.offset);
        this.offset += 8;
        return val;
    }

    getVarint() {
        let byte, val = 0, shift = 0;
        do {
            byte = this.buffer[this.offset++];
            val |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);
        return val;
    }

    getString(len) {
        const val = this.buffer.toString('utf8', this.offset, this.offset + len);
        this.offset += len;
        return val;
    }
}

module.exports = {
    InputStream
};