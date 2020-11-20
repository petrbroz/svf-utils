/*
 * Example: converting a subset of SVF (based on a specified area) into glTF.
 * Usage:
 *     npm install --save gl-matrix
 *     export FORGE_CLIENT_ID=<your client id>
 *     export FORGE_CLIENT_SECRET=<your client secret>
 *     node filter-by-area.js <your model urn> <path to output folder>
 */

const path = require('path');
const { ModelDerivativeClient, ManifestHelper } = require('forge-server-utils');
const { SvfReader, GltfWriter } = require('../lib');
const { mat4, vec3 } = require('gl-matrix');

/*
 * Customized glTF writer, only outputting meshes completely contained in a specified area.
 */
class AreaFilteredGltfWriter extends GltfWriter {
    /**
     * Initializes the writer.
     * @param {IWriterOptions} [options={}] Additional writer options.
     * @param {number[]} min Minimum x/y/z values of the filtered area.
     * @param {number[]} max Maximum x/y/z values of the filtered area.
     */
    constructor(options, min, max) {
        super(options);
        this._min = min;
        this._max = max;
        this._xform = mat4.create();
    }

    createNode(fragment /* IMF.IObjectNode */, imf /* IMF.IScene */, outputUvs /* boolean */) {
        // A bit of a hack: we need to pass the transform down the call stack to compute world bounds
        mat4.identity(this._xform);
        if (fragment.transform) {
            if (fragment.transform.elements) {
                mat4.copy(this._xform, fragment.transform.elements);
            } else {
                const { rotation: r, translation: t, scale: s } = fragment.transform;
                mat4.fromRotationTranslationScale(
                    this._xform,
                    r ? [r.x, r.y, r.z, r.w] : [0, 0, 0, 1],
                    t ? [t.x, t.y, t.z] : [0, 0, 0],
                    s ? [s.x, s.y, s.z] : [1, 1, 1]
                );
            }
        }
        return super.createNode(fragment, imf, outputUvs);
    }

    createMeshGeometry(geometry /* IMF.IMeshGeometry */, imf /* IMF.IScene */, outputUvs /* boolean */) /* gltf.Mesh */ {
        const bounds = this._computeWorldBoundsVec3(geometry.getVertices(), this._xform);
        // Ignore the geometry if it's not fully contained in the filtered area
        if (bounds.min[0] < this._min[0] || bounds.min[1] < this._min[1] || bounds.min[2] < this._min[2]
            || bounds.max[0] > this._max[0] || bounds.max[1] > this._max[1] || bounds.max[2] > this._max[2]) {
                console.log('Skipping mesh outside of the filtered area...');
                return { primitives: [] };
        }
        return super.createMeshGeometry(geometry, imf, outputUvs);
    }

    createLineGeometry(geometry /* IMF.ILineGeometry */, imf /* IMF.IScene */) {
        const bounds = this._computeWorldBoundsVec3(geometry.getVertices(), this._xform);
        // Ignore the geometry if it's not fully contained in the filtered area
        if (bounds.min[0] < this._min[0] || bounds.min[1] < this._min[1] || bounds.min[2] < this._min[2]
            || bounds.max[0] > this._max[0] || bounds.max[1] > this._max[1] || bounds.max[2] > this._max[2]) {
                console.log('Skipping mesh outside of the filtered area...');
                return { primitives: [] };
        }
        return super.createLineGeometry(geometry, imf);
    }

    createPointGeometry(geometry /* IMF.IPointGeometry */, imf /* IMF.IScene */) {
        const bounds = this._computeWorldBoundsVec3(geometry.getVertices(), this._xform);
        // Ignore the geometry if it's not fully contained in the filtered area
        if (bounds.min[0] < this._min[0] || bounds.min[1] < this._min[1] || bounds.min[2] < this._min[2]
            || bounds.max[0] > this._max[0] || bounds.max[1] > this._max[1] || bounds.max[2] > this._max[2]) {
                console.log('Skipping mesh outside of the filtered area...');
                return { primitives: [] };
        }
        return super.createPointGeometry(geometry, imf);
    }

    _computeWorldBoundsVec3(array /* Float32Array */, xform /* mat4 */) {
        const min = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
        const max = [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE];
        let origPoint = vec3.create();
        let xformPoint = vec3.create();
        for (let i = 0; i < array.length; i += 3) {
            vec3.set(origPoint, array[i], array[i + 1], array[i + 2]);
            vec3.transformMat4(xformPoint, origPoint, xform);
            vec3.min(min, min, xformPoint);
            vec3.max(max, max, xformPoint);
        }
        return { min, max };
    }
}

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, outputDir) {
    const DefaultOptions = {
        deduplicate: false,
        skipUnusedUvs: false,
        center: true,
        log: console.log
    };

    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' });
        const writer = new AreaFilteredGltfWriter(Object.assign({}, DefaultOptions), [-25.0, -25.0, -25.0], [25.0, 25.0, 25.0]);
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, auth);
            const scene = await reader.read({ log: console.log });
            await writer.write(scene, path.join(outputDir, derivative.guid));
        }
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);