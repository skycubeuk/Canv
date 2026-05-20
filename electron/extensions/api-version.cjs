'use strict'

/**
 * The Canv extension preload-API version. Independent of package.json's app
 * version. Bump on any breaking change to the surface exposed by
 * extension-preload.cjs (canv.* namespaces). Existing extensions declare an
 * engines.canv semver range that the manifest validator checks at install /
 * load / spawn against this constant.
 */
const CANV_API_VERSION = '1.0.0'

module.exports = { CANV_API_VERSION }
