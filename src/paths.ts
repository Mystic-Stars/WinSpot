export function displayWindowsPath(path: string): string {
  const prefix = "\\\\?\\";
  if (!path.startsWith(prefix)) return path;

  const target = path.slice(prefix.length);
  if (target.slice(0, 4).toUpperCase() === "UNC\\") {
    return `\\\\${target.slice(4)}`;
  }
  if (/^[a-z]:\\/i.test(target)) return target;

  // Other device namespaces cannot be displayed as ordinary filesystem paths.
  return path;
}
