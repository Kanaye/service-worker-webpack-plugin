const path = require('path');
const crypto = require('crypto');

const webpack = require('webpack');
const VirtualModules = require('webpack-virtual-modules');

const virtualPefix = '#serviceworker-virtual';

const moduleComment = '/** injected by service-worker-webpack-plugin */\n';

function runChildCompiler(compiler) {
	return new Promise((res, rej) => {
		// Dirty workarround for webpack-virtual-modules (these hooks aren't called for childCompilations ... )
		compiler.hooks.afterEnvironment.call();
		compiler.hooks.afterResolvers.call(compiler);
		compiler.compile((err, compilation) => {
			compiler.parentCompilation.children.push(compilation);

			compilation.fileDependencies.forEach(dep => {
				if (!dep.includes(virtualPefix) && !compiler.parentCompilation.fileDependencies.has(dep)) {
					compiler.parentCompilation.fileDependencies.add(dep);
				}
			});

			if (err) return rej(err);

			if (compilation.errors && compilation.errors.length) {
        		const errorDetails = compilation.errors.map(error => error.details).join('\n');
        		return rej( new Error('Child compilation failed:\n' + errorDetails));
      		}

			res(compilation);
		});
	});
}

function createHash(asset) {
	return crypto.createHash('md5')
		.update(asset.source(), 'utf8')
		.digest('hex');
}

function matchesList(subject, list, fallback = true) {
	if (list.length === 0) {
		return fallback;
	}
	for (let key in list) {
		if (list[key].test(subject)) {
			return true;
		}
	}
}

function extractResources(compilation, { include, exclude }) {
	let assets = compilation.assets;
	let manifest = [];
	for (let url in assets) {
		let asset = assets[url];
		if (!matchesList(url, include)) continue;
		if (matchesList(url, exclude, false)) continue;
		manifest.push({
			url,
			revision: createHash(asset)
		});
	}
	return manifest;
}

class ServiceWorkerWebpackPlugin {
	constructor(config = {}) {
		if(!config.entry) throw new Error('Option `config.entry` must be supplied');

		this.config = Object.assign({},
			{
				include: [],
				exclude: []
			},
			config
		);
		this.vm = new VirtualModules();
		this._lastAssets = [];
	}

	async handleEmit(compilation) {
		let jsonManifestPath = false;
		const parentOptions = compilation.compiler.options;
		const outputOptions = Object.assign({}, parentOptions.output || {}, { filename: this.config.filename || 'sw.js' });
		const compiler = compilation.createChildCompiler(
			`ServiceWorkerWebpackPlugin<${this.config.entry}>`,
			outputOptions,
			[
				new webpack.webworker.WebWorkerTemplatePlugin(outputOptions),
				new webpack.SingleEntryPlugin(parentOptions.context, this.config.entry, undefined)
			]
		);

		this.vm.apply(compiler);

		compiler.hooks.beforeCompile.tap(this.constructor.name, () => {
			const assets = extractResources(compilation, this.config);
			const manifestFile = this.config.manifestFile;
			if (manifestFile) {
				jsonManifestPath = manifestFile;
				let loadPath = manifestFile;

				if (path.resolve(manifestFile) === path.normalize(manifestFile)) {
					jsonManifestPath = path.relative(compilation.options.output.path, manifestFile);
					loadPath = path.relative(compilation.options.output.path, jsonManifestPath);
				}

				loadPath = `${compilation.options.output.publicPath ||'./'}${loadPath.split(path.sep).join('/')}`;

				this.vm.writeModule(`node_modules/${virtualPefix}-manifest-path.js`, `${moduleComment} export default "${loadPath}";`);
			}

			this.vm.writeModule(`node_modules/${virtualPefix}-manifest.js`, `${moduleComment} export default ${JSON.stringify(assets)};`);
		});

		try {
			const results = await runChildCompiler(compiler);
			this._lastAssets = Object.keys(results.assets);

			for (let asset in results.assets) {
				compilation.assets[asset] = results.assets[asset];
			}
		} catch(e) {
			for (let asset in this._lastAssets) {
				delete compilation.assets[asset];
			}
		}

		if (jsonManifestPath) {
			const manifest = JSON.stringify(extractResources(compilation, this.config));
			compilation.assets[jsonManifestPath] = {
				source: () => manifest,
				size: () => manifest.length
			};
		}
	}

	apply(compiler) {
		compiler.hooks.emit.tapPromise(this.constructor.name, (compilation) => this.handleEmit(compilation));
	}

}

module.exports = ServiceWorkerWebpackPlugin;