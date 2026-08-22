const API = "https://api.github.com";

export async function githubApi<T = any>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "lexusagent",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function getViewer(token: string) {
  return githubApi<any>(token, "/user");
}

export async function listRepos(token: string, limit = 10) {
  return githubApi<any[]>(
    token,
    `/user/repos?sort=updated&per_page=${limit}&affiliation=owner,collaborator,organization_member`,
  );
}
