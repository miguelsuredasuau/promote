/** Canonical origin URLs that identify `owner/name` on GitHub. */
export function expectedOriginUrls(repo: string) {
  return [`https://github.com/${repo}.git`, `https://github.com/${repo}`, `git@github.com:${repo}.git`];
}

/**
 * The checkout's *configured* origin. `git remote get-url` reports the URL after
 * `url.<base>.insteadOf` transport rewrites (credential proxies, mirrors); the
 * repository a checkout claims to be is the URL written in its config.
 */
export async function configuredOrigin(git: (args: string[]) => Promise<string>) {
  return git(['config', '--get', 'remote.origin.url']);
}

export async function originMatchesRepo(git: (args: string[]) => Promise<string>, repo: string) {
  return expectedOriginUrls(repo).includes(await configuredOrigin(git));
}
