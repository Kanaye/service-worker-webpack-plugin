# Service Worker Webpack Plugin
---
**Note**: This Plugin is still in "alpha" until I've had time to write tests. So things may break or features change. Please report bugs if you encounter some.

---

This plugin is intended for when you want to cache the assets generated by webpack but want to customize how caching's done or want to add features like [web-push](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).
It also bundles your service worker and respects your loader config, so if you can use typescript or similar.

This plugin uses [webpack-virutal-modules](https://github.com/sysgears/webpack-virtual-modules) to include the manifest or manifest location within your build without messing with the filesystem itself.

## Installation
```bash
$ npm i -D @kanaye/service-worker-webpack-plugin
```
## Usage
*Note*: in this usage examples I am using googles [workbox-preacaching](https://www.npmjs.com/package/workbox-precaching).
But you can use any library.

There are currently two ways to use this plugin:
1. include a manifest within your service worker bundle.
   This has the advantage that you don't need to load a separate file after the service worker got installed. But you can't cache the service worker file itself
 
1. Create a separate json manifest and load it when starting the service worker.
   This is the (imho) better way because you can cache all your assets including the assets used in your service worker and only need to fetch the manifest file to check for new versions. I recommend to use this, but it's a little more configuration.

### Verison 1: Inline manifest
**webpack.config.js**
```js
const ServiceWorkerPlugin = require('@kanaye/service-worker-webpack-plugin');
module.exports = {
    entry: './src/index.js',
    output: {
      path: __dirname + '/dist',
      filename: 'bundle.js'
    },
    plugins: [
      new ServiceWorkerPlugin({
        entry: './src/serviceWorker.js',
        filename: 'sw.js'
      })
    ]
};
```
**src/index.js**
```js
/* your normal imports, rendering and whatever here */

// install service worker if available
if ('serviceWorker' in window.navigator) {
  // defer loading of service worker until the page is loaded 
  // so your users don't get slowed down ;)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
```

**src/serviceWorker.js**
```js
import workboxPrecaching from 'workbox-precaching';
// import the manifest from the virtual module
import resources from '#serviceworker-virtual-manifest';
workboxPrecaching.precacheAndRoute(resources);
```

This will generate `bundle.js` and `sw.js`  within the `dist` folder and cache all files generated in the process excluding `sw.js`.

### Version 2: External manifest
**webpack.config.js**
```js
const ServiceWorkerPlugin = require('@kanaye/service-worker-webpack-plugin');
module.exports = {
    entry: './src/index.js',
    output: {
      path: __dirname + '/dist',
      filename: 'bundle.js'
    },
    plugins: [
      new ServiceWorkerPlugin({
        entry: './src/serviceWorker.js',
        filename: 'sw.js',
        manifestFile: 'cache-manifest.json'
      })
    ]
};
```

**src/index.js**
```js
// same as in version one, just copy it from there ;)
```

**src/serviceWorker.js**
```js
import workboxPrecaching from 'workbox-precaching';
// import the manifests path from the virtual module
import manifestPath from '#serviceworker-virtual-manifest';

fetch(manifestPath)
  .then(res => res.json())
  .then(resources => workboxPrecaching.precacheAndRoute(resources));
  
// OR: service-worker-webpack-plugin also includes a helper function that fetches the generated manifest for you.
import loadManifest from 'service-worker-webpack-plugin/load-manifest';

loadManifest()
  .then(resources => workboxPrecaching.precacheAndRoute(resources));
```

This will generate a new file called `cache-manifest.json` in your `dist` folder.
Note that this version also will cache your `serviceWorker.js` and all other generated assets with it. The manifest will never include itself.

## Options
 Name | Type | Default | Required | Description
 ---- | ---- | ------- | -------- | -----------
 entry | String | - | ✓ | The entry file of your service worker.
 filename | String | "sw.js" | ❌ | The name of your bundled service worker asset.
 manifestFile | String | - | ❌| If specified the plugin will generate a manifest file with the specified name and generate the virtual module `#serviceworker-virtual-manifest.js`.
 include | RegExp[] | - | ❌ | If specified, only assets matching one or more regex will be included in manifest generation.
 exclude | RegExp[] | - | ❌ | If specified, assets matching one or more regex will be excluded from manifest generation.
## Virtual Modules
* `#serviceworker-virtual-manifest`: 
exports an array of objects representing your assets.
The object has two properties `url` the url of the asset and `revision` a hash of the files content. *Note* this manifest will *never* contain the service worker bundle or any assets emitted by the service worker entry.

* `#servicewoerker-virtual-manifest-path`:
exports the url to the manifest file as a string. *note*: This module is only generated if you set `options.manifestFile`. 
