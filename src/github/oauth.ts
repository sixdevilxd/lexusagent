import { config } from "../config";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

export type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};

/**
 * Step 1 of the GitHub OAuth Device Flow.
 * Device Flow is used because a Telegram bot has no web callback URL.
 */
export async function startDeviceFlow(): Promise<DeviceCode> {
  if (!config.github.clientId) {
    throw new Error("GITHUB_CLIENT_ID not set in .env — see GITHUB.md");
  }
  const res = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId,
      scope: config.github.scopes,
    }),
  });
  if (!res.ok) throw new Error(`GitHub device code ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  if (data.error) {
    throw new Error(`${data.error}: ${data.error_description ?? ""}`);
  }
  return data as DeviceCode;
}

/** Step 2: poll until the user authorizes (or the code expires). */
export async function pollForToken(
  deviceCode: string,
  intervalSec: number,
  expiresIn: number,
): Promise<string> {
  const deadline = Date.now() + expiresIn * 1000;
  let interval = Math.max(intervalSec || 5, 5) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.github.clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const data: any = await res.json();

    if (data.access_token) return data.access_token as string;

    switch (data.error) {
      case "authorization_pending":
        break;
      case "slow_down":
        interval += 5000;
        break;
      case "expired_token":
        throw new Error("Code expired. Run /github again.");
      case "access_denied":
        throw new Error("Authorization was denied.");
      default:
        if (data.error) {
          throw new Error(`${data.error}: ${data.error_description ?? ""}`);
        }
    }
  }
  throw new Error("Timed out waiting for authorization.");
}
