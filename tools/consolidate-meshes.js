const { parseArgs } = require('node:util');
const { NodeIO } = require('@gltf-transform/core');
const { PropertyType } = require('@gltf-transform/core');
const { join, flatten, dedup, prune, meshopt } = require('@gltf-transform/functions');

async function mergeMeshes(inputPath, outputPath) {
    const io = new NodeIO();

    // Load the GLTF file into a Document
    const document = await io.read(inputPath);

    // Create a simple material
    const material = document.createMaterial('SimpleMaterial').setBaseColorFactor([1.0, 0.8, 0.8, 1.0]);

    // Iterate over all meshes and primitives in the glTF
    const root = document.getRoot();
    for (const node of root.listNodes()) {
        const mesh = node.getMesh();
        if (mesh) {
            for (const primitive of mesh.listPrimitives()) {
                // Ensure all primitives use the new material
                primitive.setMaterial(material);
            }
        }
    }

    await document.transform(
        dedup({ propertyTypes: [PropertyType.MATERIAL] }),
        flatten(),
        join({ keepNamed: false }),
        prune(),
        meshopt()
    );

    // Save the updated document back to a new file
    await io.write(outputPath, document);
}

// Parse command line arguments
const args = parseArgs({
    options: {},
    allowPositionals: true
});
const [inputPath, outputPath] = args.positionals;
if (!inputPath || !outputPath) {
    console.error('Usage: node consolidate-meshes.js path/to/input.gltf path/to/output.glb');
    process.exit(1);
}
mergeMeshes(inputPath, outputPath)
    .then(() => console.log('Done.'))
    .catch(err => { console.error(err); process.exit(1); });