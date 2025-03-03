import * as zlib from 'zlib';

/**
 * Helper class for parsing and querying property database
 * stored in various 'objects_*.json.gz' assets in an SVF.
 */
export class PropDbReader {
    protected _ids: number[];
    protected _offsets: number[];
    protected _avs: number[];
    protected _attrs: any[];
    protected _vals: any[];

    /**
     * Initializes the property database reader.
     * @param {Buffer} ids Content of objects_ids.json.gz file.
     * @param {Buffer} offsets Content of objects_offs.json.gz file.
     * @param {Buffer} avs Content of objects_avs.json.gz file.
     * @param {Buffer} attrs Content of objects_attrs.json.gz file.
     * @param {Buffer} vals Content of objects_vals.json.gz file.
     */
   constructor(ids: Buffer, offsets: Buffer, avs: Buffer, attrs: Buffer, vals: Buffer) {

        this._ids = JSON.parse(ids.toString());
        this._offsets = this.readIdxFile(offsets);
        this._avs = this.readAvsFile(avs);
        this._attrs = JSON.parse(attrs.toString());
        this._vals = JSON.parse(vals.toString());
    }

     readIdxFile(buffer: Buffer): number[] {
        const integers: number[] = [];
        
        for (let i = 0; i < buffer.length; i += 4) {
            integers.push(buffer.readUInt32LE(i)); // Read as little-endian 32-bit integer
        }
    
        return integers;
    }

        /**
     * Reads the avs.pack file (binary-encoded AVS data) and converts it to an array of numbers.
     * @param {Buffer} buffer The buffer containing the avs.pack file data.
     * @returns {number[]} The extracted AVS data in a format similar to objects_avs.json.
     */
        readAvsFile(buffer: Buffer): number[] {
            const avs: number[] = [];
        
            // Ensure we only read in pairs and avoid out-of-bounds access
            for (let i = 0; i < buffer.length - 1; i += 2) {
                const key = buffer.readUInt8(i);       // First byte
                const value = buffer.readUInt8(i + 1); // Second byte
                avs.push(key, value);
            }
        
            return avs;
        }
        

    /**
     * Enumerates all properties (including internal ones such as "__child__" property
     * establishing the parent-child relationships) of given object.
     * @generator
     * @param {number} id Object ID.
     * @returns {Iterable<{ name: string; category: string; value: any }>} Name, category, and value of each property.
     */
    *enumerateProperties(id: number): Iterable<{ name: string; category: string; value: any }> {
        if (id > 0 && id < this._offsets.length) {
            const avStart = 2 * this._offsets[id];
            const avEnd = id == this._offsets.length - 1 ? this._avs.length : 2 * this._offsets[id + 1];
            for (let i = avStart; i < avEnd; i += 2) {
                const attrOffset = this._avs[i];
                const valOffset = this._avs[i + 1];
                const attr = this._attrs[attrOffset];
                const value = this._vals[valOffset];
                yield { name: attr[0], category: attr[1], value };
            }
        }
    }

    /**
     * Finds "public" properties of given object.
     * Additional properties like parent-child relationships are not included in the output.
     * @param {number} id Object ID.
     * @returns {{ [name: string]: any }} Dictionary of property names and values.
     */
    getProperties(id: number): { [name: string]: any } {
        let props: { [name: string]: any } = {};
        for (const prop of this.enumerateProperties(id)) {
            if (prop.category && prop.category.match(/^__\w+__$/)) {
                // Skip internal attributes
            } else {
                props[prop.name] = prop.value;
            }
        }
        return props;
    }

    /**
     * Finds IDs of all children of given object.
     * @param {number} id Object ID.
     * @returns {number[]} Children IDs.
     */
    getChildren(id: number): number[] {
        let children: number[] = [];
        for (const prop of this.enumerateProperties(id)) {
            if (prop.category === '__child__') {
                children.push(prop.value as number);
            }
        }
        return children;
    }
}
