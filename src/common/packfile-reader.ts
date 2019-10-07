import * as zlib from 'zlib';

import { InputStream } from './input-stream';
import { IVector3, IQuaternion, Matrix3x3, Transform } from '../svf/schema';

/**
 * Reader of "packfile" protocol used to encode various types of SVF assets,
 * for example, geometry metadata, or meshes.
 */
export class PackFileReader extends InputStream {
    protected _type: string;
    protected _version: number;
    protected _entries: any[] = []; // offsets to individual entries in the pack file
    protected _types: any[] = []; // types of all entries in the pack file

    constructor(buffer: Buffer) {
        super((buffer[0] === 31 && buffer[1] === 139) ? zlib.gunzipSync(buffer) : buffer);
        this._type = this.getString(this.getVarint());
        this._version = this.getInt32();
        this.parseContents();
    }

    parseContents() {
        // Get offsets to TOC and type sets from the end of the file
        const originalOffset = this._offset;
        this.seek(this.length - 8);
        const entriesOffset = this.getUint32();
        const typesOffset = this.getUint32();

        // Populate entries
        this._entries = []; 
        this.seek(entriesOffset);
        const entriesCount = this.getVarint();
        for (let i = 0; i < entriesCount; i++) {
            this._entries.push(this.getUint32());
        }

        // Populate type sets
        this.seek(typesOffset);
        const typesCount = this.getVarint();
        for (let i = 0; i < typesCount; i++) {
            const _class = this.getString(this.getVarint());
            const _type = this.getString(this.getVarint());
            this._types.push({
                _class,
                _type,
                version: this.getVarint()
            });
        }

        // Restore offset
        this.seek(originalOffset);
    }

    numEntries() {
        return this._entries.length;
    }

    seekEntry(i: number) {
        if (i >= this.numEntries()) {
            return null;
        }

        // Read the type index and populate the entry data
        const offset = this._entries[i];
        this.seek(offset);
        const type = this.getUint32();
        if (type >= this._types.length) {
            return null;
        }
        return this._types[type];
    }

    getVector3D(): IVector3 {
       return {
           x: this.getFloat64(),
           y: this.getFloat64(),
           z: this.getFloat64()
       };
    }

    getQuaternion(): IQuaternion {
        return {
            x: this.getFloat32(),
            y: this.getFloat32(),
            z: this.getFloat32(),
            w: this.getFloat32()
        };
    }

    getMatrix3x3(): Matrix3x3 {
       const elements = [];
       for (let i = 0; i < 3; i++) {
           for (let j = 0; j < 3; j++) {
               elements.push(this.getFloat32());
           }
       }
       return elements;
    }

    getTransform(): Transform | null {
        const xformType = this.getUint8();
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
                const scale = this.getFloat32();
                q = this.getQuaternion();
                t = this.getVector3D();
                s = { x: scale, y: scale, z: scale };
                return { q, t, s };
            case 3: // affine matrix
                matrix = this.getMatrix3x3();
                t = this.getVector3D();
                return { matrix, t };
        }
        return null;
    }
}
