# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.5] - 2024-09-11

- Added
  - SVF/F2D downloads can now be configured for different regions
- Fixed
  - Bug in URN resolution on Windows (https://github.com/petrbroz/svf-utils/issues/84)

## [5.0.4] - 2024-09-10

- Added
  - Cleaning up error logs for Axios-related errors
- Modified
  - Upgraded to newer version of APS SDK

## [5.0.3] - 2024-04-09

- Modified
  - Increased the minimum required Node.js version to 16

## [5.0.0] - 2024-04-09

- Modified
  - **[BREAKING CHANGE]** Library has been renamed from `forge-convert-utils` to `svf-utils`
  - **[BREAKING CHANGE]** SVF readers and downloaders now expect an `IAuthenticationProvider` interface
  for specifying how the requests to the Model Derivative service will be authenticated
  - Changed branding from Forge to APS everywhere
  - Migrated to the official APS SDKs

## [4.0.5] - 2023-09-29

- Added
  - SVF materials that are not referenced by anything are excluded from the glTF output

## [4.0.4] - 2023-08-08

- Added
  - Support for gltf output filtering based on fragment IDs.
  - Support for svf input filtering based on dbID or fragment ID.

## [4.0.3] - 2023-06-28

- Fixed
  - Solved an issue with glTF geometry being broken in certain scenarios (kudos to [henrikbuchholz](https://github.com/henrikbuchholz)!)

## [4.0.2] - 2023-03-10

- Added
  - Support for custom serialization of the glTF manifest
- Fixed
  - Parsing of properties for the very last object (kudos to [johannesheesterman](https://github.com/johannesheesterman)!)

## [4.0.1] - 2022-03-24

- Fixed
  - Deduplication of geometries now using maps instead of arrays, bringing dramatic speed improvements (kudos to [VFedyk](https://github.com/VFedyk)!)

## [4.0.0] - 2022-03-24

- Removed
  - Support for the (experimental) OTG format download and parsing

## [3.6.3] - 2022-01-20

- Fixed
  - Conversion of SVF 3x3 matrix + translation into glTF 4x4 matrix

## [3.6.2] - 2021-11-04

- Fixed
  - Failing TypeScript build due to changes in `adm-zip` dependency

## [3.6.1] - 2021-11-04

- Fixed
  - Updated dependencies
  - Added URL-encoding when downloading SVF viewables

## [3.6.0] - 2021-02-04

- Added
  - Re-introduced code docs generator
- Fixed
  - Updated dependencies
- Changed
  - CI/CD now in Github Actions

## [3.5.2] - 2021-01-04

- Fixed
  - Downloading of SVF assets with special characters (kudos [thejakobn](https://github.com/thejakobn))
  - Parsing textures with custom scale (kudos [thejakobn](https://github.com/thejakobn))
  - Bug when parsing props with undefined category

## [3.5.1] - 2020-11-20

- Added
  - New version of forge-server-utils
  - Support for chunked download of Model Derivative assets

## [3.5.0] - 2020-03-30

- Added
  - Mapping SVF/OTG glossiness to glTF roughness (need to confirm that the mapping is correct)

## [3.4.5] - 2020-03-26

- Fixed
  - SVF parser property db config from 3.4.4

## [3.4.4] - 2020-03-26

- Added
  - SVF parser can now be configured to skip property DB

## [3.4.3] - 2020-03-25

- Fixed
  - Travis config

## [3.4.1] - 2020-03-25

- Added
  - SVF downloader can now be initialized with custom host URL and region
  - SVF parser can now be initialized with custom host URL and region
- Removed
  - Docs generator (due to audit warnings and lack of updates); will continue generating the docs manually.

## [3.4.0] - 2020-03-24

- Added
  - Support for meshes with vertex colors

## [3.3.1] - 2020-03-17

- Fixed
  - Npm dependency vulnerability

## [3.3.0] - 2020-03-13

- Added
  - F2D downloader
- Changed
  - SVF/OTG/F2D downloaders can now accept existing auth tokens
  - SVF/OTG/F2D downloaders can now be configured to ignore missing assets

## [3.2.0] - 2020-03-13

- Added
  - SVF and OTG downloader classes

## [3.1.2] - 2020-03-12

- Fixed
  - When converting to gltf, empty `textures` or `images` are removed to prevent validation errors (thanks [@AlexPiro](https://github.com/AlexPiro)!)
- Added
  - Dev utility for validating gltf manifests (to be used in CI/CD)

## [3.1.1] - 2020-02-25

- Fixed
  - Alpha blending only enabled when opacity is less than 1.0 ([#21](https://github.com/petrbroz/forge-convert-utils/issues/21))

## [3.1.0] - 2020-01-15

- Added
  - **[experimental]** OTG parser
- Fixed
  - Flipped V component of texture coords ([#18](https://github.com/petrbroz/forge-convert-utils/issues/18), kudos to [@dykarohora](https://github.com/dykarohora)!)

## [3.0.0] - 2020-01-07

- Changed
  - Updated to TypeScript version 3.7
  - **[BREAKING CHANGE]** loaders/writers now load/write a centralized _intermediate file format_
- Fixed
  - Extended fix from version 2.0.1: 1x1 black pixel images now used also when materials reference non-existent texture URIs

## [2.0.1] - 2019-12-20

- Fixed
  - Missing SVF textures no longer cause the conversion to fail, and are instead replaced with 1x1 black pixel images

## [2.0.0] - 2019-12-17

- Changed
  - **[BREAKING CHANGE]** removed post-processing options (Draco compression and binary output)
    - We encourage users to post-process the raw glTFs generated by this library in their own pipelines,
    using Node.js modules and CLI tools like [gltf-pipeline](https://github.com/AnalyticalGraphicsInc/gltf-pipeline)
    or [gltfpack](https://github.com/zeux/meshoptimizer#gltfpack)
    - See [test/remote-svf-to-gltf.sh](test/remote-svf-to-gltf.sh) for an example of such integration

## [1.2.1] - 2019-12-13

- Added
  - Scaling the output model based on SVF distance units (added by @dykarohora)
- Fixed
  - Sanitizing URNs (removing trailing '='s)

## [1.2.0] - 2019-12-10

- Fixed
  - Missing folders when post-processing ([#11](https://github.com/petrbroz/forge-convert-utils/issues/11), fixed by @AlexPiro)
- Added
  - Filtering of objects to be included in the output glTF

## [1.1.2] - 2019-11-30

- Fixed
  - Multi-byte characters in derivative URNs (thanks @dykarohora!)

## [1.1.1] - 2019-11-13

- Changed
  - When exporting to glTF+Draco, resources are no longer embedded into the manifest ([#7](https://github.com/petrbroz/forge-convert-utils/issues/7))

## [1.1.0] - 2019-11-08

- Added
  - Opt-in feature to move the model to origin
- Changed
  - Forge models are now reoriented based on their metadata to align with the glTF coordinate system (X=left, Y=up, Z=front)

> Note: scene hierarchies in the generated glTFs now contain two additional levels:
all scene objects are grouped into an _xform node_ that applies additional
transformations (for example, moving the model to origin), and the _xform node_
is a child of a _root node_ which transforms the entire scene to the glTF
coordinate system.

## [1.0.2] - 2019-11-01

- Removed
  - Support for sqlite output
    - Since [sqlite3](https://www.npmjs.com/package/sqlite3) is a native Node.js module, it was a [pain](https://css-tricks.com/what-i-learned-by-building-my-own-vs-code-extension/) to use this library in [vscode-forge-tools](https://github.com/petrbroz/vscode-forge-tools)
    - The experimental serialization/deserialization to/from sqlite is now developed in [forge-convert-sqlite](https://github.com/petrbroz/forge-convert-sqlite)

## [1.0.1] - 2019-10-31

- Fixed
  - Calls to `GltfWriter.prototype.write` now await postprocessing (if there's any)

## [1.0.0] - 2019-10-31

- Changed
  - **[BREAKING]** gltf/glb is now written with a single call (`await writer.write(svf, outputDir)`)
- Removed
  - `debug` dependency (using `console.log` instead)

## [0.8.0] - 2019-10-29

- Added
  - The `sqlite` flag now generates a sqlite manifest with both the glTF data and the property database
  - When deserializing sqlite back to glTF, you can now pass in a filter of dbids
    - The filter can be either a `SELECT dbid FROM properties WHERE ...`, or a list of dbids
- Fixed
  - Iterating of object properties
- Changed
  - Adding multiple SVFs into single glTF is now considered unsupported
    - Trying to do so will cause an exception in the `GltfWriter.write` method

## [0.7.2] - 2019-10-25

- Added
  - deserialization of sqlite manifest back to glTF

## [0.7.1] - 2019-10-24

- Fixed
  - glTF deduplication (incl. performance improvement)
  - sqlite serialization when ignoring mesh, line, or point geometries

## [0.7.0] - 2019-10-24

- Added
  - More deduplication, now also on the glTF accessor and mesh level
  - Additional CLI options for ignoring mesh, line, or point geometry
  - (experimental) serialization of glTF manifest into sqlite
    - Can only be used when texture/buffer data is referenced and not embedded
    - Potentially could be used for dynamically generating glTF variants with subsets of the original model
    - Additional CLI option for serializing glTF manifest into sqlite
    - Note that the schema of the sqlite database might change

## [0.6.4] - 2019-10-22

- Added
  - Skipping texture UVs when there's no material using them
- Fixed
  - Computing position bounds

## [0.6.3] - 2019-10-17

- Changed
  - Geometry deduplication now on BufferView (instead of Mesh) level
  - Sample scripts now using proper error catching

## [0.6.2] - 2019-10-17

- Added
  - Opt-in deduplication of materials
- Fixed
  - Caching of meshes

## [0.6.1] - 2019-10-14

- Added
  - Progress logging when parsing SVF and writing glTF
- Fixed
  - Typo in reference to package.json in CLI tool
  - Typo in CLI when accessing Forge credentials

## [0.6.0] - 2019-10-11

- Added
  - Opt-in deduplication of exported geometries
  - Opt-in output to GLB
  - Opt-in output with Draco compression
- Fixed
  - Normalizing windows/posix paths of SVF assets

## [0.5.0] - 2019-10-08

- Added
  - Listing IDs of object children from SVF property database
- Changed
  - Excluding internal attributes when parsing SVF property database

## [0.4.1] - 2019-10-07

- Added
  - Access to internal SVF manifest
- Fixed
  - Gltf schema now included in build output

## [0.4.0] - 2019-10-07

- Added
  - Support for converting both remote and local SVFs using the CLI tool
  - Support for configuring glTF output (max. size of binary files, ignoring line/point geometries, ...)
  - Outputting multiple scenes in one glTF
- Changed
  - Moved to new version of forge-server-utils

## [0.3.0] - 2019-10-07

- Added
  - TypeScript definition files with glTF and SVF schemas
- Changed
  - Code restructure
  - SVF parsing code moved from forge-server-utils back here

## [0.2.1] - 2019-10-04

- Fixed
  - Images now extracted with both lower-cased and unmodified URIs

## [0.2.0] - 2019-10-03

- Added
  - Support for line/point geometry, incl. colors

## [0.1.0] - 2019-10-03

- Added
  - Parsing individual SVF assets in parallel
  - CI/CD pipeline setup
  - Support for basic material textures (texture transforms not yet supported)
- Changed
  - Moved to TypeScript for additional type security, incl. official typings for the glTF 2.0 schema
  - Moved to yarn
  - Reusing SVF parser from [forge-server-utils](https://www.npmjs.com/package/forge-server-utils) module
- Fixed
  - Crash when no materials are available

## [0.0.2] - 2019-09-24

- Fixed
  - CLI script

## [0.0.1] - 2019-09-20

- First release
