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
        this._ids = JSON.parse(zlib.gunzipSync(ids).toString());
        this._offsets = JSON.parse(zlib.gunzipSync(offsets).toString());
        this._avs = JSON.parse(zlib.gunzipSync(avs).toString());
        this._attrs = JSON.parse(zlib.gunzipSync(attrs).toString());
        this._vals = JSON.parse(zlib.gunzipSync(vals).toString());
    }

    /**
     * Finds properties of given object.
     * @param {number} id Object ID.
     * @returns {{ [name: string]: any }} Dictionary of property names and values.
     */
    findProperties(id: number): { [name: string]: any } {
        let props: { [name: string]: any } = {};
        if (id > 0 && id < this._offsets.length) {
            const avStart = this._offsets[id];
            const avEnd = (id + 1 < this._offsets.length) ? this._offsets[id + 1] : this._avs.length;
            for (let i = avStart; i < avEnd; i += 2) {
                const attrOffset = this._avs[i];
                const valOffset = this._avs[i + 1];
                const attr = this._attrs[attrOffset];
                const value = this._vals[valOffset];
                props[attr[0]] = value;
            }
        }
        return props;
    }
}
