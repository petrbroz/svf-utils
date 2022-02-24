# glTF animations

## Issues

- No docs for the JSON schema of SVF animations; would have to reverse-engineer from Forge Viewer
- SVF animations can be hierarchical - what does that mean?
- SVF animations can be applied to meshes, cameras, polylines, etc.; glTF only seems to support animations of node translation, rotation, and scale properties
- SVF animations can be applied to arbitrary dbIDs in the logical hierarchy; in glTF we only export a flat list of leaf nodes...
