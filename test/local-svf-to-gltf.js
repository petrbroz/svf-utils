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
        log: console.log
    };

    try {
        const reader = await SvfReader.FromFileSystem(filepath);
        const svf = await reader.read();
        let writer;
        writer = new GltfWriter(path.join(outputDir, 'gltf-raw'), Object.assign({}, defaultOptions));
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'gltf'), Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true }));
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'gltf-draco'), Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true, compress: true }));
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'glb'), Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true, binary: true }));
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'glb-draco'), Object.assign({}, defaultOptions, { deduplicate: true, skipUnusedUvs: true, binary: true, compress: true }));
        writer.write(svf);
        await writer.close();
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
