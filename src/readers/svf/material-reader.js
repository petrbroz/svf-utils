const zlib = require('zlib');
const { getDerivative } = require('../../helpers/forge');

class MaterialReader {
    constructor(buff, basePath, token) {
        if (buff[0] === 31 && buff[1] === 139) {
            this.buff = zlib.gunzipSync(buff);
        } else {
            this.buff = buff;
        }
        this.parseMaterials(basePath, token);
    }

    parseMaterials(basePath, token) {
        const json = JSON.parse(this.buff);
        this.materials = Object.keys(json.materials).map((id) => {
            const group = json.materials[id];
            let output = group.materials[group.userassets[0]];
            output._texture_promise = {}; // For now, store all texture data in a temp. dictionary
            for (const key of Object.keys(group.materials)) {
                const material = group.materials[key];
                if (material.definition === 'UnifiedBitmap') {
                    if (material.properties.uris && material.properties.uris.unifiedbitmap_Bitmap) {
                        const unifiedBitmap = material.properties.uris.unifiedbitmap_Bitmap;
                        if (unifiedBitmap.values.length > 0) {
                            const uri = material.properties.uris.unifiedbitmap_Bitmap.values[0];
                            output._texture_promise[uri] = getDerivative(basePath + uri, token);
                        }
                    }
                }
            }
            return output;
        });
    }
}

module.exports = {
    MaterialReader
};