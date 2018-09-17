import manifest from "#serviceworker-virtual-manifest-path";

export default function loadManifest () {
	return fetch(manifest)
		.then(res => {
			if (!res.ok) throw new Error(`${res.statusText}`);
			return res.json();
		});
};