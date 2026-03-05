/**
 * SAP ADT REST API Client
 * Handles authentication, CSRF tokens, session management, and all ADT HTTP interactions.
 */

/**
 * Connection config — supports two modes:
 *
 * 1. Direct URL:  host = "https://my-sap-system:44300"
 * 2. Eclipse-style: ashost = "sap-server.example.com", instanceNr = "00", ssl = true/false
 *    → auto-constructs https://sap-server.example.com:44300 (or http://:8000)
 */
export interface AdtConfig {
  host: string;       // resolved URL — always set after resolveHost()
  client: string;     // SAP client, e.g. "100"
  username: string;
  password: string;
  language?: string;  // e.g. "EN" or "DE"
  systemId?: string;  // SID, e.g. "MED" — informational
}

/**
 * Resolve host URL from Eclipse-style connection params.
 * Same logic as Eclipse ADT: HTTPS port = 443<nn>, HTTP port = 80<nn>
 */
export function resolveHost(params: {
  ashost?: string;
  instanceNr?: string;
  ssl?: boolean;
  host?: string;
}): string {
  // Mode 1: direct URL provided
  if (params.host) {
    return params.host.replace(/\/+$/, "");
  }

  // Mode 2: Eclipse-style
  if (!params.ashost || !params.instanceNr) {
    throw new Error(
      "Provide either SAP_HOST (direct URL) or SAP_ASHOST + SAP_SYSNR (Eclipse-style connection)",
    );
  }

  const nr = params.instanceNr.padStart(2, "0");
  const useSsl = params.ssl !== false; // default to HTTPS

  if (useSsl) {
    return `https://${params.ashost}:443${nr}`;
  }
  return `http://${params.ashost}:80${nr}`;
}

interface CsrfState {
  token: string;
  cookies: string[];
  fetchedAt: number;
}

export class AdtClient {
  private config: AdtConfig;
  private csrf: CsrfState | null = null;
  private readonly CSRF_TTL_MS = 1800_000; // 30 min

  constructor(config: AdtConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.host.replace(/\/+$/, "");
  }

  private get authHeader(): string {
    return "Basic " + Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
  }

  private defaultHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/xml, application/json, text/plain, */*",
    };
    if (this.config.client) {
      h["sap-client"] = this.config.client;
    }
    if (this.config.language) {
      h["sap-language"] = this.config.language;
    }
    return h;
  }

  /** Fetch or reuse a CSRF token for write operations */
  async fetchCsrfToken(): Promise<string> {
    if (this.csrf && Date.now() - this.csrf.fetchedAt < this.CSRF_TTL_MS) {
      return this.csrf.token;
    }

    const res = await fetch(`${this.baseUrl}/sap/bc/adt/discovery`, {
      method: "GET",
      headers: {
        ...this.defaultHeaders(),
        "x-csrf-token": "fetch",
      },
    });

    if (!res.ok) {
      throw new Error(`CSRF fetch failed: ${res.status} ${res.statusText}`);
    }

    const token = res.headers.get("x-csrf-token");
    if (!token) {
      throw new Error("No CSRF token in response headers");
    }

    const setCookies = res.headers.getSetCookie?.() ?? [];
    this.csrf = { token, cookies: setCookies, fetchedAt: Date.now() };
    return token;
  }

  private cookieHeader(): string {
    if (!this.csrf?.cookies.length) return "";
    return this.csrf.cookies.map((c) => c.split(";")[0]).join("; ");
  }

  /** Generic GET request against ADT */
  async get(path: string, accept?: string): Promise<{ status: number; body: string; headers: Headers }> {
    const headers: Record<string, string> = { ...this.defaultHeaders() };
    if (accept) headers.Accept = accept;
    if (this.csrf) headers.Cookie = this.cookieHeader();

    const res = await fetch(`${this.baseUrl}${path}`, { method: "GET", headers });
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
  }

  /** Generic POST request (with CSRF) */
  async post(
    path: string,
    body?: string,
    contentType?: string,
  ): Promise<{ status: number; body: string; headers: Headers }> {
    const csrfToken = await this.fetchCsrfToken();
    const headers: Record<string, string> = {
      ...this.defaultHeaders(),
      "x-csrf-token": csrfToken,
      Cookie: this.cookieHeader(),
    };
    if (contentType) headers["Content-Type"] = contentType;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: body ?? undefined,
    });
    const responseBody = await res.text();
    return { status: res.status, body: responseBody, headers: res.headers };
  }

  /** Generic PUT request (with CSRF) */
  async put(
    path: string,
    body: string,
    contentType: string,
    lockHandle?: string,
  ): Promise<{ status: number; body: string; headers: Headers }> {
    const csrfToken = await this.fetchCsrfToken();
    const headers: Record<string, string> = {
      ...this.defaultHeaders(),
      "x-csrf-token": csrfToken,
      "Content-Type": contentType,
      Cookie: this.cookieHeader(),
    };
    if (lockHandle) headers["X-sap-adt-lockhandle"] = lockHandle;

    const res = await fetch(`${this.baseUrl}${path}`, { method: "PUT", headers, body });
    const responseBody = await res.text();
    return { status: res.status, body: responseBody, headers: res.headers };
  }

  /** Generic DELETE request (with CSRF) */
  async delete(
    path: string,
    lockHandle?: string,
  ): Promise<{ status: number; body: string; headers: Headers }> {
    const csrfToken = await this.fetchCsrfToken();
    const headers: Record<string, string> = {
      ...this.defaultHeaders(),
      "x-csrf-token": csrfToken,
      Cookie: this.cookieHeader(),
    };
    if (lockHandle) headers["X-sap-adt-lockhandle"] = lockHandle;

    const res = await fetch(`${this.baseUrl}${path}`, { method: "DELETE", headers });
    const responseBody = await res.text();
    return { status: res.status, body: responseBody, headers: res.headers };
  }

  // ─── ADT-specific convenience methods ───

  /** Lock an object for editing, returns lock handle */
  async lockObject(objectUrl: string): Promise<string> {
    const res = await this.post(`${objectUrl}?_action=LOCK&accessMode=MODIFY`);
    if (res.status !== 200) {
      throw new Error(`Lock failed (${res.status}): ${res.body}`);
    }
    // Lock handle is in the response body as XML <asx:values><DATA><LOCK_HANDLE>...</LOCK_HANDLE></DATA></asx:values>
    const match = res.body.match(/<LOCK_HANDLE>(.*?)<\/LOCK_HANDLE>/);
    if (!match) throw new Error("Could not parse lock handle from response");
    return match[1];
  }

  /** Unlock an object */
  async unlockObject(objectUrl: string, lockHandle: string): Promise<void> {
    await this.post(`${objectUrl}?_action=UNLOCK&lockHandle=${encodeURIComponent(lockHandle)}`);
  }

  /** Activate one or more objects */
  async activate(objectUrls: string[]): Promise<{ status: number; body: string }> {
    const entries = objectUrls
      .map((u) => `<adtcore:objectReference adtcore:uri="${u}"/>`)
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${entries}
</adtcore:objectReferences>`;

    const res = await this.post(
      "/sap/bc/adt/activation?method=activate&preauditRequested=true",
      xml,
      "application/xml",
    );
    return { status: res.status, body: res.body };
  }

  /** Test connection by hitting the ADT discovery endpoint */
  async testConnection(): Promise<boolean> {
    try {
      const res = await this.get("/sap/bc/adt/discovery", "application/atomsvc+xml");
      return res.status === 200;
    } catch {
      return false;
    }
  }
}
