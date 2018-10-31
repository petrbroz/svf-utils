const fs = require('fs');

function serialize(model, fileroot) {
    let counter = 0;
    for (const fragment of model.fragments) {
        const fd = fs.openSync(fileroot + '.' + counter + '.obj', 'w');
        fs.writeSync(fd, `# Fragment (dbid ${fragment.dbID})\n`);
        const geometry = model.geometries[fragment.geometryID];
        const mesh = model.meshpacks[geometry.packID][geometry.entityID];
        fs.writeSync(fd, '# Vertices\n');
        for (let i = 0; i < mesh.vcount; i++) {
            const x = mesh.vertices[i * 3];
            const y = mesh.vertices[i * 3 + 1];
            const z = mesh.vertices[i * 3 + 2];
            fs.writeSync(fd, `v ${x} ${y} ${z}\n`);
        }
        fs.writeSync(fd, '# Normals\n');
        for (let i = 0; i < mesh.vcount; i++) {
            const x = mesh.normals[i * 3];
            const y = mesh.normals[i * 3 + 1];
            const z = mesh.normals[i * 3 + 2];
            fs.writeSync(fd, `vn ${x} ${y} ${z}\n`);
        }
        fs.writeSync(fd, '# Faces\n');
        for (let i = 0; i < mesh.tcount; i++) {
            const i1 = mesh.indices[i * 3] + 1;
            const i2 = mesh.indices[i * 3 + 1] + 1;
            const i3 = mesh.indices[i * 3 + 2] + 1;
            fs.writeSync(fd, `f ${i1} ${i2} ${i3}\n`);
        }
        counter++;
        fs.closeSync(fd);
    }
}

module.exports = {
    serialize
};