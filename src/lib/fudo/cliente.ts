// Cliente mínimo de la API pública de FUDO (v1alpha1, JSON:API). Solo LEE: nunca escribe en FUDO.
//
// VERIFICAR con credenciales reales (no se pudo leer dev.fu.do, que carga su contenido con scripts):
//   - la URL y el cuerpo del endpoint de autenticación (hoy: POST {apiKey, apiSecret} a FUDO_AUTH_URL) y el campo del token;
//   - el tamaño de página máximo.
// Lo demás (GET /products, filtros, include, atributos) viene de la especificación OpenAPI publicada en apis.io.

export interface FudoProducto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stockControl: boolean;
  stock: number | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
}

export interface FudoOpciones {
  apiUrl?: string;
  authUrl?: string;
  fetchImpl?: typeof fetch;
  tamPagina?: number;
  maxPaginas?: number;
  timeoutMs?: number;
  espera?: (ms: number) => Promise<void>;
  ahora?: () => number;
}

export class FudoError extends Error {
  constructor(message: string, readonly estado?: number) { super(message); this.name = 'FudoError'; }
}

const VIDA_TOKEN_MS = 23 * 60 * 60 * 1000; // FUDO: el token dura 24 h; se renueva antes.
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type JsonApiRecurso = { id?: string | number; type?: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string | number; type?: string } | null }> };
type JsonApiRespuesta = { data?: JsonApiRecurso[]; included?: JsonApiRecurso[] };

export class FudoCliente {
  private token: { valor: string; vence: number } | null = null;
  private readonly apiUrl: string;
  private readonly authUrl: string;
  private readonly f: typeof fetch;
  private readonly tam: number;
  private readonly maxPaginas: number;
  private readonly timeoutMs: number;
  private readonly espera: (ms: number) => Promise<void>;
  private readonly ahora: () => number;

  constructor(private readonly apiKey: string, private readonly apiSecret: string, o: FudoOpciones = {}) {
    this.apiUrl = (o.apiUrl ?? process.env.FUDO_API_URL ?? 'https://api.fu.do/v1alpha1').replace(/\/$/, '');
    this.authUrl = o.authUrl ?? process.env.FUDO_AUTH_URL ?? 'https://auth.fu.do/api';
    this.f = o.fetchImpl ?? fetch;
    this.tam = o.tamPagina ?? 200;
    this.maxPaginas = o.maxPaginas ?? 50;
    this.timeoutMs = o.timeoutMs ?? 15_000;
    this.espera = o.espera ?? dormir;
    this.ahora = o.ahora ?? Date.now;
  }

  private async peticion(url: string, init: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try { return await this.f(url, { ...init, signal: ctl.signal }); }
    catch (e) { throw new FudoError(e instanceof Error && e.name === 'AbortError' ? 'FUDO no respondió a tiempo' : 'No se pudo conectar con FUDO'); }
    finally { clearTimeout(t); }
  }

  async autenticar(): Promise<string> {
    const r = await this.peticion(this.authUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey, apiSecret: this.apiSecret }),
    });
    if (r.status === 401 || r.status === 403) throw new FudoError('FUDO rechazó las credenciales', r.status);
    if (!r.ok) throw new FudoError(`FUDO no pudo autenticar (HTTP ${r.status})`, r.status);
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    const data = (j?.data as { attributes?: Record<string, unknown> } | undefined)?.attributes;
    const token = (j?.token ?? j?.access_token ?? data?.token) as unknown;
    if (typeof token !== 'string' || !token) throw new FudoError('La respuesta de autenticación de FUDO no trae token');
    this.token = { valor: token, vence: this.ahora() + VIDA_TOKEN_MS };
    return token;
  }

  private async bearer(): Promise<string> {
    if (this.token && this.ahora() < this.token.vence) return this.token.valor;
    return this.autenticar();
  }

  private async get(ruta: string, reintentoAuth = true): Promise<JsonApiRespuesta> {
    for (let intento = 0; intento < 3; intento++) {
      const r = await this.peticion(`${this.apiUrl}${ruta}`, { headers: { authorization: `Bearer ${await this.bearer()}`, accept: 'application/json' } });
      if (r.status === 401 && reintentoAuth) { this.token = null; return this.get(ruta, false); }
      if (r.status === 429 || r.status >= 500) {
        if (intento < 2) { await this.espera(Math.min(5_000, Number(r.headers.get('retry-after') ?? 1) * 1000 || 1_000)); continue; }
        throw new FudoError(r.status === 429 ? 'FUDO limitó las consultas (429)' : `FUDO con error (HTTP ${r.status})`, r.status);
      }
      if (r.status === 401 || r.status === 403) throw new FudoError('FUDO rechazó el acceso: revise permisos del usuario de la API', r.status);
      if (!r.ok) throw new FudoError(`FUDO respondió HTTP ${r.status}`, r.status);
      return (await r.json()) as JsonApiRespuesta;
    }
    throw new FudoError('FUDO no respondió');
  }

  /** Productos VIGENTES (active = true) con su categoría. Los que no aparecen aquí se consideran fuera de la carta. */
  async listarProductosActivos(): Promise<FudoProducto[]> {
    const out: FudoProducto[] = [];
    const vistos = new Set<string>();
    for (let pagina = 1; pagina <= this.maxPaginas; pagina++) {
      const q = `?filter[active]=eq.true&include=productCategory&sort=id&page[size]=${this.tam}&page[number]=${pagina}`;
      const j = await this.get(`/products${q}`);
      const categorias = new Map<string, string>();
      for (const inc of j.included ?? []) {
        if (inc.type === 'ProductCategory' && inc.id != null && typeof inc.attributes?.name === 'string') categorias.set(String(inc.id), inc.attributes.name);
      }
      const datos = j.data ?? [];
      for (const p of datos) {
        if (p.id == null) continue;
        const id = String(p.id);
        if (vistos.has(id)) continue;
        vistos.add(id);
        const a = p.attributes ?? {};
        const nombre = typeof a.name === 'string' ? a.name.trim() : '';
        if (!nombre) continue;
        const catId = p.relationships?.productCategory?.data?.id;
        const precio = typeof a.price === 'number' && isFinite(a.price) ? a.price : 0;
        out.push({
          id,
          nombre,
          descripcion: typeof a.description === 'string' && a.description.trim() ? a.description.trim() : null,
          precio,
          stockControl: a.stockControl === true,
          stock: typeof a.stock === 'number' && isFinite(a.stock) ? a.stock : null,
          categoriaId: catId != null ? String(catId) : null,
          categoriaNombre: catId != null ? categorias.get(String(catId)) ?? null : null,
        });
      }
      if (datos.length < this.tam) return out;
    }
    throw new FudoError(`La carta de FUDO supera ${this.maxPaginas * this.tam} productos: se detuvo por seguridad`);
  }
}
