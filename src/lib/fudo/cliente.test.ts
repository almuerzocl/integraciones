import { describe, expect, it, vi } from 'vitest';
import { FudoCliente, FudoError } from './cliente';

const json = (cuerpo: unknown, estado = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json', ...headers } });

const prod = (id: number, extra: Record<string, unknown> = {}, cat = 10) => ({
  id: String(id), type: 'Product',
  attributes: { name: `Plato ${id}`, price: 5000, active: true, stockControl: false, ...extra },
  relationships: { productCategory: { data: { id: String(cat), type: 'ProductCategory' } } },
});
const incl = [{ id: '10', type: 'ProductCategory', attributes: { name: 'Fondos' } }];

function armar(respuestas: (url: string, init?: RequestInit) => Response | Promise<Response>, tamPagina = 2) {
  const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => respuestas(String(u), init));
  const c = new FudoCliente('k', 's', { fetchImpl: f as unknown as typeof fetch, espera: async () => {}, tamPagina });
  return { f, c };
}
const auth = () => json({ token: 'tok-1' });

describe('FudoCliente', () => {
  it('autentica con key y secret y usa el token como Bearer', async () => {
    const { f, c } = armar((u) => u.includes('auth') ? auth() : json({ data: [], included: [] }));
    await c.listarProductosActivos();
    const [authUrl, authInit] = f.mock.calls[0] as [string, RequestInit];
    expect(authUrl).toContain('auth.fu.do');
    expect(JSON.parse(String(authInit.body))).toEqual({ apiKey: 'k', apiSecret: 's' });
    const [, init] = f.mock.calls[1] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-1');
  });
  it('pide solo productos activos con su categoría y pagina hasta una página incompleta', async () => {
    const { f, c } = armar((u) => {
      if (u.includes('auth')) return auth();
      if (u.includes('page[number]=1')) return json({ data: [prod(1), prod(2)], included: incl });
      return json({ data: [prod(3)], included: incl });
    });
    const r = await c.listarProductosActivos();
    expect(r.map((p) => p.id)).toEqual(['1', '2', '3']);
    const u = String(f.mock.calls[1][0]);
    expect(decodeURIComponent(u)).toContain('filter[active]=eq.true');
    expect(u).toContain('include=productCategory');
  });
  it('traduce atributos y categoría', async () => {
    const { c } = armar((u) => u.includes('auth') ? auth() : json({ data: [prod(1, { stockControl: true, stock: 12, description: ' rico ' })], included: incl }));
    expect(await c.listarProductosActivos()).toEqual([{ id: '1', nombre: 'Plato 1', descripcion: 'rico', precio: 5000, stockControl: true, stock: 12, categoriaId: '10', categoriaNombre: 'Fondos' }]);
  });
  it('ignora productos sin nombre y repetidos', async () => {
    const { c } = armar((u) => u.includes('auth') ? auth() : json({ data: [prod(1), prod(1), { id: '9', attributes: { name: ' ' } }], included: incl }), 10);
    expect((await c.listarProductosActivos()).map((p) => p.id)).toEqual(['1']);
  });
  it('reutiliza el token entre peticiones', async () => {
    const { f, c } = armar((u) => u.includes('auth') ? auth() : json({ data: [prod(1), prod(2)], included: incl }), 10);
    await c.listarProductosActivos();
    expect(f.mock.calls.filter((x) => String(x[0]).includes('auth')).length).toBe(1);
  });
  it('si el token vence (401) reautentica una vez', async () => {
    let usos = 0;
    const { f, c } = armar((u) => {
      if (u.includes('auth')) return json({ token: `t${++usos}` });
      return usos === 1 ? new Response('', { status: 401 }) : json({ data: [], included: [] });
    });
    expect(await c.listarProductosActivos()).toEqual([]);
    expect(f.mock.calls.filter((x) => String(x[0]).includes('auth')).length).toBe(2);
  });
  it('credenciales rechazadas: error claro', async () => {
    const { c } = armar(() => new Response('', { status: 401 }));
    await expect(c.listarProductosActivos()).rejects.toThrow(/rechaz/);
  });
  it('429: reintenta y luego informa', async () => {
    let n = 0;
    const { c } = armar((u) => u.includes('auth') ? auth() : (++n, new Response('', { status: 429, headers: { 'retry-after': '1' } })));
    await expect(c.listarProductosActivos()).rejects.toThrow(/429/);
    expect(n).toBe(3);
  });
  it('429 que se recupera', async () => {
    let n = 0;
    const { c } = armar((u) => u.includes('auth') ? auth() : (++n < 2 ? new Response('', { status: 429 }) : json({ data: [prod(1)], included: incl })));
    expect((await c.listarProductosActivos()).length).toBe(1);
  });
  it('respuesta sin token falla', async () => {
    const { c } = armar(() => json({ nada: true }));
    await expect(c.listarProductosActivos()).rejects.toBeInstanceOf(FudoError);
  });
  it('tope de páginas', async () => {
    const f = vi.fn(async (u: string | URL | Request) => String(u).includes('auth') ? auth() : json({ data: [prod(Math.random() * 1e9 | 0), prod(Math.random() * 1e9 | 0)], included: incl }));
    const c = new FudoCliente('k', 's', { fetchImpl: f as unknown as typeof fetch, tamPagina: 2, maxPaginas: 3, espera: async () => {} });
    await expect(c.listarProductosActivos()).rejects.toThrow(/supera/);
  });
  it('error de red no filtra detalles', async () => {
    const c = new FudoCliente('k', 's', { fetchImpl: (async () => { throw new Error('ECONNRESET secreto'); }) as unknown as typeof fetch });
    await expect(c.listarProductosActivos()).rejects.toThrow('No se pudo conectar con FUDO');
  });
});
