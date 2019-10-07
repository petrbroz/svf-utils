# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
