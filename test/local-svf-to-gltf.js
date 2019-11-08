/*
 * Example: converting an SVF (without property database) from local file system
 * with different output options.
 * Usage:
 *     node local-svf-to-gltf.js <path to svf file> <path to output folder>
 */

const path = require('path');
const { SvfReader, GltfWriter } = require('..');

async function run (filepath, outputDir) {
    const defaultOptions = {
        deduplicate: false,
        skipUnusedUvs: false,
        binary: false,
        compress: false,
        center: true,
        log: console.log
    };

    try {
        const reader = await SvfReader.FromFileSystem(filepath);
        const svf = await reader.read();
        let writer;
        writer = new GltfWriter(Object.assign({}, defaultOptions));
        await writer.write(svf, path.join(outputDir, 'gltf-raw'));
        writer = new GltfWriter(Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true }));
        await writer.write(svf, path.join(outputDir, 'gltf'));
        writer = new GltfWriter(Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true, compress: true }));
        await writer.write(svf, path.join(outputDir, 'gltf-draco'));
        writer = new GltfWriter(Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true, binary: true }));
        await writer.write(svf, path.join(outputDir, 'glb'));
        writer = new GltfWriter(Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true, binary: true, compress: true }));
        await writer.write(svf, path.join(outputDir, 'glb-draco'));
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
