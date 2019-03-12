const zlib = require('zlib');

class MaterialReader {
    constructor(buff) {
        if (buff[0] === 31 && buff[1] === 139) {
            this.buff = zlib.gunzipSync(buff);
        } else {
            this.buff = buff;
        }
        this.parseMaterials();
    }

    parseMaterials() {
        const json = JSON.parse(this.buff);
        this.materials = Object.keys(json.materials).map((id) => {
            const material = json.materials[id];
            return material.materials[material.userassets[0]]
        });
    }
}

module.exports = {
    MaterialReader
};