import { setup, dataDir } from './frame-config.mjs';
const { host } = setup();
console.log(`Frame Terminal paired for TV ${host.tvIP}.`);
console.log(`Mac service: ${host.listenHost}:${host.port}`);
console.log(`Private pairing files: ${dataDir}`);
