# Changelog

## [0.4.1](https://github.com/rivet-gg/actor-core/compare/v0.4.0...v0.4.1) (2025-02-24)


### Documentation

* fix private method name in schedule example ([#643](https://github.com/rivet-gg/actor-core/issues/643)) ([8ada3a7](https://github.com/rivet-gg/actor-core/commit/8ada3a7e13f564ae0135861951703778d72a39c4))
* new landing page ([#630](https://github.com/rivet-gg/actor-core/issues/630)) ([b8e4a8b](https://github.com/rivet-gg/actor-core/commit/b8e4a8b1c7a5311372faa00aeeb5a883c762032b))
* update Bluesky profile URL ([#644](https://github.com/rivet-gg/actor-core/issues/644)) ([5e4d5ee](https://github.com/rivet-gg/actor-core/commit/5e4d5eec962ab0e243fc99561b5179c351f222dd))
* update feature comparison table ([#640](https://github.com/rivet-gg/actor-core/issues/640)) ([237784e](https://github.com/rivet-gg/actor-core/commit/237784ed69c67a3578c4e51f989ad8816092cefa))


### Chores

* add docs-bump command ([0d9ebb8](https://github.com/rivet-gg/actor-core/commit/0d9ebb8f64a32005e12db808149f63832f197cfd))
* bump mintlify ([6e88f31](https://github.com/rivet-gg/actor-core/commit/6e88f312bb6535b271ce7aeb3e9dafc8ad7a9c3a))
* bump mintlify ([64b99e4](https://github.com/rivet-gg/actor-core/commit/64b99e4178ae2a61a62c0d0874524bcb78b296d0))
* bump mintlify ([42a1d83](https://github.com/rivet-gg/actor-core/commit/42a1d83ec26019f31ab0a0258553f9a3c8833cb5))
* bump mintlify ([e6f0263](https://github.com/rivet-gg/actor-core/commit/e6f026379e51b95e4164e4f818718e0128defa18))
* docs-bump command ([1d93be1](https://github.com/rivet-gg/actor-core/commit/1d93be161db0b55dc7559cd4c57d602b17ff0dc0))
* switch docs middleware to production URL ([#632](https://github.com/rivet-gg/actor-core/issues/632)) ([4698d60](https://github.com/rivet-gg/actor-core/commit/4698d604311501b4d784175fb2759dff84a72f83))
* update rivet links ([#634](https://github.com/rivet-gg/actor-core/issues/634)) ([f5a19b3](https://github.com/rivet-gg/actor-core/commit/f5a19b3c190387967e3f18c99c54edfbddf685fb))

## [0.4.0](https://github.com/rivet-gg/actor-core/compare/v0.2.0...v0.4.0) (2025-02-13)


### Features

* add connection retry with backoff ([#625](https://github.com/rivet-gg/actor-core/issues/625)) ([a0a59a6](https://github.com/rivet-gg/actor-core/commit/a0a59a6387e56f010d7f4df4c3385a76880c6222))
* **bun:** bun support ([#623](https://github.com/rivet-gg/actor-core/issues/623)) ([003a8a7](https://github.com/rivet-gg/actor-core/commit/003a8a761638e036d6edc431f5c7374923828964))
* **nodejs:** add nodejs support ([003a8a7](https://github.com/rivet-gg/actor-core/commit/003a8a761638e036d6edc431f5c7374923828964))


### Bug Fixes

* keep NodeJS process alive with interval ([#624](https://github.com/rivet-gg/actor-core/issues/624)) ([9aa2ace](https://github.com/rivet-gg/actor-core/commit/9aa2ace064c8f9b0581e7f469c10d7d915d651a3))


### Chores

* add bun and nodejs packages to publish script ([#628](https://github.com/rivet-gg/actor-core/issues/628)) ([b0367e6](https://github.com/rivet-gg/actor-core/commit/b0367e66d3d5fb1894b85262eac8c2e0f678e2b4))
* release 0.3.0-rc.1 ([16e25e8](https://github.com/rivet-gg/actor-core/commit/16e25e8158489da127d269f354be651ccbad4ce5))
* release 0.4.0 ([4ca17cd](https://github.com/rivet-gg/actor-core/commit/4ca17cd39fdc2c07bfce56a4326454e16ecadd40))
* release 0.4.0-rc.1 ([82ae37e](https://github.com/rivet-gg/actor-core/commit/82ae37e38e08dba806536811d7bea7678e6380db))
* release version 0.3.0-rc.1 ([5343b64](https://github.com/rivet-gg/actor-core/commit/5343b648466b11fc048a20d1379e38538a442add))
* release version 0.4.0 ([1f21931](https://github.com/rivet-gg/actor-core/commit/1f2193113398f9a51aadcea84e4807ab7d2ed194))
* release version 0.4.0-rc.1 ([9d6bf68](https://github.com/rivet-gg/actor-core/commit/9d6bf68df08045c6e720b3132eb46c5324d0aa92))
* update chat demo with topic ([#626](https://github.com/rivet-gg/actor-core/issues/626)) ([7be4cfb](https://github.com/rivet-gg/actor-core/commit/7be4cfb216f182c43d1e4b8500616d6a661f8006))

## [0.2.0](https://github.com/rivet-gg/actor-core/compare/v24.6.2...v0.2.0) (2025-02-06)


### Features

* sse conncetion driver ([#617](https://github.com/rivet-gg/actor-core/issues/617)) ([8a2b0a3](https://github.com/rivet-gg/actor-core/commit/8a2b0a3a0b07a0b4551c67fe7238da691d590892))


### Bug Fixes

* **cloudflare-workers:** accept requests proxied to actor without upgrade header ([#616](https://github.com/rivet-gg/actor-core/issues/616)) ([71246d3](https://github.com/rivet-gg/actor-core/commit/71246d38810a5ede89fc53458ccf1dae8357399b))


### Code Refactoring

* pass raw req to queryActor ([#613](https://github.com/rivet-gg/actor-core/issues/613)) ([e919123](https://github.com/rivet-gg/actor-core/commit/e919123b6d91497e68ea3b55f9ef10b10aff6f52))


### Continuous Integration

* add release please ([#614](https://github.com/rivet-gg/actor-core/issues/614)) ([c95bcea](https://github.com/rivet-gg/actor-core/commit/c95bceace69df54cf66bb4a339931dccb304c73e))


### Chores

* release 0.2.0 ([ed90143](https://github.com/rivet-gg/actor-core/commit/ed901437203f87aa5345f91bc9a3c5f8517bbfcb))
* release version 0.0.2 ([887af89](https://github.com/rivet-gg/actor-core/commit/887af89414e5fb8cb283efbb6a6948756cf75bab))
* release version 0.0.2 ([64b0cb4](https://github.com/rivet-gg/actor-core/commit/64b0cb4830f66ac864e458fe0ab2d95a88271c8e))
* release version 0.0.2 ([405b520](https://github.com/rivet-gg/actor-core/commit/405b5201730f9faa8c21457b09fc2a62101e34e8))
* release version 0.0.2 ([9e2d438](https://github.com/rivet-gg/actor-core/commit/9e2d438f4b7533925151556f6290a4a50eee2ad6))
* release version 0.0.3 ([951740e](https://github.com/rivet-gg/actor-core/commit/951740e76efe44745168ef1443e7c42931a39e11))
* release version 0.0.4 ([fbd865c](https://github.com/rivet-gg/actor-core/commit/fbd865ccca93a17e24780974f4e4bac2456ae13d))
* release version 0.0.5 ([1b4e780](https://github.com/rivet-gg/actor-core/commit/1b4e780d95092a93d879e45062e5c690199fb6f8))
* release version 0.0.6 ([375a709](https://github.com/rivet-gg/actor-core/commit/375a70965756e432b975a6cff0f49d07430023f2))
* release version 0.1.0 ([b797be8](https://github.com/rivet-gg/actor-core/commit/b797be80da2dbff153645585ac3063bbb4651eba))
* rename `ProtocolFormat` -&gt; `Encoding` ([#618](https://github.com/rivet-gg/actor-core/issues/618)) ([69ed424](https://github.com/rivet-gg/actor-core/commit/69ed42467ccd85a807cc1cd52f6a81584d0a430f))
* update images ([5070663](https://github.com/rivet-gg/actor-core/commit/5070663b2dc5baaa375f9b777295e82ad458188f))
* update release commit format ([#615](https://github.com/rivet-gg/actor-core/issues/615)) ([f7bf62d](https://github.com/rivet-gg/actor-core/commit/f7bf62d37a647383b33e2fb5191d1759a98a1101))
* updated logos and hero ([3e8c99e](https://github.com/rivet-gg/actor-core/commit/3e8c99ee207b7a9006f418d04561920b66faeef1))
