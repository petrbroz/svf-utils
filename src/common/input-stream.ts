/**
 * Simple binary stream reader. Used for parsing different types of SVF assets.
 */
export class InputStream {
    protected _buffer: Buffer;
    protected _offset: number;
    protected _length: number;

    public get offset(): number {
        return this._offset;
    }

    public get length(): number {
        return this._length;
    }

    constructor(buffer: Buffer) {
        this._buffer = buffer;
        this._offset = 0;
        this._length = buffer.length;
    }

    seek(offset: number) {
        this._offset = offset;
    }

    getUint8(): number {
        const val = this._buffer.readUInt8(this._offset);
        this._offset += 1;
        return val;
    }

    getUint16(): number {
        const val = this._buffer.readUInt16LE(this._offset);
        this._offset += 2;
        return val;
    }

    getInt16(): number {
        const val = this._buffer.readInt16LE(this._offset);
        this._offset += 2;
        return val;
    }

    getUint32(): number {
        const val = this._buffer.readUInt32LE(this._offset);
        this._offset += 4;
        return val;
    }

    getInt32(): number {
        const val = this._buffer.readInt32LE(this._offset);
        this._offset += 4;
        return val;
    }

    getFloat32(): number {
        const val = this._buffer.readFloatLE(this._offset);
        this._offset += 4;
        return val;
    }

    getFloat64(): number {
        const val = this._buffer.readDoubleLE(this._offset);
        this._offset += 8;
        return val;
    }

    getVarint(): number {
        let byte, val = 0, shift = 0;
        do {
            byte = this._buffer[this._offset++];
            val |= (byte & 0x7f) << shift;
            shift += 7;
        } while (byte & 0x80);
        return val;
    }

    getString(len: number): string {
        const val = this._buffer.toString('utf8', this._offset, this._offset + len);
        this._offset += len;
        return val;
    }
}
