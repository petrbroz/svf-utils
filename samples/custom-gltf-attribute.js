/*
 * Example: converting an SVF from Model Derivative service into glTF,
 * embedding object IDs into the COLOR_0 mesh channel.
 * Usage:
 *     export APS_CLIENT_ID=<your client id>
 *     export APS_CLIENT_SECRET=<your client secret>
 *     node custom-gltf-attribute.js <your model urn> <path to output folder>
 */

const path = require('path');
const { getSvfDerivatives } = require('./shared.js');
const { SvfReader, GltfWriter, TwoLeggedAuthenticationProvider } = require('..');

/*
 * Customized glTF writer, outputting meshes with an additional _CUSTOM_INDEX
 * mesh attribute (UNSIGNED_BYTE, vec4) encoding a 32-bit object ID.
 */
class CustomGltfWriter extends GltfWriter {
    constructor(options) {
        super(options);
        this._currentDbId = -1;
    }

    createNode(fragment /* IMF.IObjectNode */, imf /* IMF.IScene */, outputUvs /* boolean */) /* gltf.Node */ {
        this._currentDbId = fragment.dbid;
        return super.createNode(fragment, imf, outputUvs);
    }

    createMeshGeometry(geometry /* IMF.IMeshGeometry */, imf /* IMF.IScene */, outputUvs /* boolean */) /* gltf.Mesh */ {
        let mesh = super.createMeshGeometry(geometry, imf, outputUvs);
        let prim = mesh.primitives[0];

        if (prim) {
            // Output custom attr buffer
            const vertexCount = geometry.getVertices().length / 3;
            const customBuffer = Buffer.alloc(vertexCount * 4);
            for (let i = 0; i < customBuffer.length; i += 4) {
                customBuffer[i] = this._currentDbId & 0xff;
                customBuffer[i + 1] = (this._currentDbId >> 8) & 0xff;
                customBuffer[i + 2] = (this._currentDbId >> 16) & 0xff;
                customBuffer[i + 3] = (this._currentDbId >> 24) & 0xff;
            }
            const customBufferView = this.createBufferView(customBuffer);
            const customBufferViewID = this.addBufferView(customBufferView);
            const customAccessor = this.createAccessor(customBufferViewID, 5121 /* UNSIGNED_BYTE */, customBufferView.byteLength / 4, 'VEC4');
            customAccessor.normalized = true;
            const customAccessorID = this.addAccessor(customAccessor);
            prim.attributes['COLOR_0'] = customAccessorID;
        }

        return mesh;
    }

    computeMeshHash(mesh /* gltf.Mesh */) /* string */ {
        return mesh.primitives.map(p => {
            return `${p.mode || ''}/${p.material || ''}/${p.indices}`
                + `/${p.attributes['POSITION'] || ''}/${p.attributes['NORMAL'] || ''}/${p.attributes['TEXCOORD_0'] || ''}`
                + `/${p.attributes['COLOR_0'] || ''}`;
        }).join('/');
    }
}

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

async function run(urn, outputDir) {
    try {
        const derivatives = await getSvfDerivatives(urn, APS_CLIENT_ID, APS_CLIENT_SECRET);
        const authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
        const writer = new CustomGltfWriter({
            deduplicate: false,
            skipUnusedUvs: false,
            center: true,
            log: console.log
        });
        for (const derivative of derivatives) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, authenticationProvider);
            const scene = await reader.read({ log: console.log });
            await writer.write(scene, path.join(outputDir, derivative.guid));
        }
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
