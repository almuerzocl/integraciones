import { describe, expect, it } from 'vitest';
import { puedeAdministrarIntegraciones as can } from './permisos';

describe('puedeAdministrarIntegraciones', () => {
  it('admite administrador, dueño y admin con restaurante', () => {
    for (const role of ['RESTAURANT_ADMIN', 'owner', ' Admin ']) expect(can({ role, restaurant_id: 'r1' })).toBe(true);
  });
  it('rechaza sin restaurante', () => {
    expect(can({ role: 'RESTAURANT_ADMIN', restaurant_id: null })).toBe(false);
    expect(can({ role: 'OWNER' })).toBe(false);
  });
  it('rechaza roles operativos, clientes y super admin', () => {
    for (const role of ['USER', 'MENU', 'MENU_MANAGER', 'STAFF', 'PEDIDOS', 'SUPER_ADMIN', '', null, undefined]) {
      expect(can({ role, restaurant_id: 'r1' })).toBe(false);
    }
  });
  it('rechaza perfil nulo', () => {
    expect(can(null)).toBe(false);
    expect(can(undefined)).toBe(false);
  });
});
