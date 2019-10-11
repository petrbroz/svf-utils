/*
 * Example: converting an SVF (without property database) from local file system to glTF
 * Usage:
 *     node local-svf-to-gltf.js <path to svf file> <path to output folder>
 */

const path = require('path');
const { SvfReader, GltfWriter } = require('..');

async function run (filepath, outputDir) {
    const reader = await SvfReader.FromFileSystem(filepath);
    const svf = await reader.read();
    let writer;
    // Output the same SVF in 4 variants: gltf/glb, and compressed/uncompressed
    writer = new GltfWriter(path.join(outputDir, 'gltf'), { deduplicate: true, binary: false, compress: false });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'gltf-draco'), { deduplicate: true, binary: false, compress: true });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'glb'), { deduplicate: true, binary: true, compress: false });
    writer.write(svf);
    await writer.close();
    writer = new GltfWriter(path.join(outputDir, 'glb-draco'), { deduplicate: true, binary: true, compress: true });
    writer.write(svf);
    await writer.close();
}

run(process.argv[2], process.argv[3]);
