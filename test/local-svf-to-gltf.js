/*
 * Example: converting an SVF (without property database) from local file system
 * into (1) vanilla glTF, (2) glTF with Draco compression, (3) binary glTF, and
 * (4) binary glTF with Draco compression.
 * Usage:
 *     node local-svf-to-gltf.js <path to svf file> <path to output folder>
 */

const path = require('path');
const { SvfReader, GltfWriter } = require('..');

async function run (filepath, outputDir) {
    const reader = await SvfReader.FromFileSystem(filepath);
    const svf = await reader.read();
    let writer;
    writer = new GltfWriter(path.join(outputDir, 'gltf-nodedup'), { deduplicate: false, binary: false, compress: false, log: console.log });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'gltf'), { deduplicate: true, binary: false, compress: false, log: console.log });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'gltf-draco'), { deduplicate: true, binary: false, compress: true, log: console.log });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'glb'), { deduplicate: true, binary: true, compress: false, log: console.log });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'glb-draco'), { deduplicate: true, binary: true, compress: true, log: console.log });
    writer.write(svf);
    await writer.close();
}

try {
    run(process.argv[2], process.argv[3]);
} catch(err) {
    console.error(err);
    process.exit(1);
}
