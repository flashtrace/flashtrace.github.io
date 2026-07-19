// node:url replacement. The bundle only uses these two in runAsCli(), where
// argv[1] (seeded to the served bundle's pathname) is compared against
// import.meta.url (an https: URL in the browser) - mapping any URL to its
// decoded pathname makes that comparison come out true, so runCli() starts.
export function fileURLToPath(url) {
  return decodeURIComponent(new URL(url).pathname);
}

export function pathToFileURL(path) {
  return new URL(String(path), 'file:///');
}

export default { fileURLToPath, pathToFileURL };
