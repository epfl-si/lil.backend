import CryptoJS from "crypto-js";

interface ApiCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, any>;
  bearerToken?: string;
  basicAuth?: {
    username: string;
    password?: string;
  };
}

async function callExternalApi(
  url: string,
  options: ApiCallOptions = {}
){
  const method = options.method || 'GET';
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (!headers.has('Authorization')) {
    if (options.bearerToken) {
      headers.set('Authorization', `Bearer ${options.bearerToken}`);
    } else if (options.basicAuth) {
      const authString = Buffer.from(`${options.basicAuth.username}:${options.basicAuth.password || ''}`).toString('base64');
      headers.set('Authorization', `Basic ${authString}`);
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (options.body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  try {
    return await response.json();
  } catch ( e ) {
    throw new Error(`Failed to fetch external API: ${url} (${response.status})`);
  }
}

function getApiBasicAuth () {
  return {
    basicAuth: {
      username: process.env.SERVICE_ACCOUNT_NAME || '',
      password: process.env.SERVICE_ACCOUNT_PASSWORD || ''
    }
  };
}

export async function getRoomsFromApi(search: string): Promise<any> {
  const url = `${process.env.API_EPFL_CH_URL}/rooms?query=${encodeURIComponent(search)}`;

  return await callExternalApi(url, getApiBasicAuth());
}

export async function getUsersFromApi(search: string): Promise<any> {
  const url = `${process.env.API_EPFL_CH_URL}/persons?query=${encodeURIComponent(search)}&isaccredited=1`;

  return await callExternalApi(url, getApiBasicAuth());
}

export async function getRoomFromApiById(id: number): Promise<any> {
  const url = `${process.env.API_EPFL_CH_URL}/rooms/${id}`;

  return await callExternalApi(url, getApiBasicAuth());
}

export async function getRoomFromApiByName(name: string): Promise<any> {
  const url = `${process.env.API_EPFL_CH_URL}/rooms?query=${encodeURIComponent(name)}`;

  const rooms = await callExternalApi(url, getApiBasicAuth());
  if (!rooms || !rooms.rooms || rooms.rooms.length === 0) {
    return [];
  }
  return rooms.rooms.map((u: { name: string; building: { name: string; site: { label: string; }; }; floor: string; }) => ({
    name: u.name,
    building: u.building.name,
    site: convertInRMMSite(u.building.site.label),
    floor: u.floor
  }))[0];
}

function convertInRMMSite(apiSite: string) {
  const siteMapping: Record<string, string> = JSON.parse(process.env.RMM_SITE_MAPPING ?? '{}');
  return siteMapping[apiSite] ?? apiSite;
}

export async function getUserFromApi(sciper: string): Promise<any[]> {
  const url = `${process.env.API_EPFL_CH_URL}/persons?ids=${sciper}`;

  return await callExternalApi(url, getApiBasicAuth());
}

function getAccessSignature(date: string, uri: string, body: Record<string, string | number>): string {
  let signature = `${date}:${uri}:${getQueryString(body, ':')}:`;
  const binary = CryptoJS.HmacSHA256(signature, process.env.RMM_ENCRYPTED_KEY!);
  return CryptoJS.enc.Base64.stringify(binary);
}

export function getQueryString (body: Record<string, string | number>, separator: string) {
  const queryString: string[] = [];
  const sortedKeys = Object.keys(body).sort();
  for (const key of sortedKeys) {
    queryString.push(`${key}${separator === ':' ? ':' : '='}${body[key]}`);
  }
  return queryString.join(separator);
}

export async function callRMM(uri: string, body: Record<string, string | number>) {
  const url = `${process.env.RMM_URL}${uri}?${getQueryString(body, '&')}`;
  console.log(url);
  const date = String(Date.now());

  const authorization = process.env.RMM_ACCESS_KEY + ":" + getAccessSignature(date, uri, body);

  return await callExternalApi(url, {
    headers: {
      Accept: "application/vnd.sciquest-v1+json",
      "x-sciq-date": date,
      Authorization: authorization
    },
    method: 'POST'
  });
}
