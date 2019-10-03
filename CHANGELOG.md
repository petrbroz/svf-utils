# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
