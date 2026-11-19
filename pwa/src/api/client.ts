import { getToken } from '../storage/repo'

export class ApiError extends Error {
  status: number
  code: string
  extra?: unknown
  constructor(status: number, code: string, message: string, extra?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export class NetworkError extends Error {
  constructor(message = 'Geen verbinding') {
    super(message)
    this.name = 'NetworkError'
  }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn
}

export interface ApiResponse<T> {
  status: number
  data: T | null
  etag?: string
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { etag?: string } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = await getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    headers['X-Auth-Token'] = token
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.etag) headers['If-None-Match'] = opts.etag

  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : undefined)
  }

  const etag = res.headers.get('ETag') ?? undefined
  if (res.status === 304) return { status: 304, data: null, etag }

  const text = await res.text()
  let parsed: unknown = null
  let isJson = false
  if (text) {
    try {
      parsed = JSON.parse(text)
      isJson = true
    } catch {
      // non-JSON body: handled below
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !(method === 'POST' && path === '/login')) onUnauthorized()
    const b = (isJson && parsed && typeof parsed === 'object' ? parsed : {}) as { error?: string; message?: string }
    const code = typeof b.error === 'string' ? b.error : `http_${res.status}`
    throw new ApiError(res.status, code, b.message ?? res.statusText, isJson ? parsed : undefined)
  }

  return { status: res.status, data: isJson ? (parsed as T) : null, etag }
}
