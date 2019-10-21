/*
 * Example: converting an SVF (without property database) from local file system
 * with different output options.
 * Usage:
 *     node local-svf-to-gltf.js <path to svf file> <path to output folder>
 */

const path = require('path');
const { SvfReader, GltfWriter } = require('..');

async function run (filepath, outputDir) {
    try {
        const reader = await SvfReader.FromFileSystem(filepath);
        const svf = await reader.read();
        let writer;
        writer = new GltfWriter(path.join(outputDir, 'gltf-nodedup'), { deduplicate: false, skipUnusedUvs: false, binary: false, compress: false, log: console.log });
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'gltf'), { deduplicate: true, skipUnusedUvs: true, binary: false, compress: false, log: console.log });
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'gltf-draco'), { deduplicate: true, skipUnusedUvs: true, binary: false, compress: true, log: console.log });
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'glb'), { deduplicate: true, skipUnusedUvs: true, binary: true, compress: false, log: console.log });
        writer.write(svf);
        await writer.close();
        writer = new GltfWriter(path.join(outputDir, 'glb-draco'), { deduplicate: true, skipUnusedUvs: true, binary: true, compress: true, log: console.log });
        writer.write(svf);
        await writer.close();
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
}

run(process.argv[2], process.argv[3]);
