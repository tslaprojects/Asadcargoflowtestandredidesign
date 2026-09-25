import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, Permission, permissionsForRole, roleHasPermission, ROLES_BY_COMPANY_TYPE } from "@/lib/permissions";

describe("permissions", () => {
  it("только перевозчик создаёт ставки", () => {
    expect(roleHasPermission("CARRIER_ADMIN", "BID_CREATE")).toBe(true);
    expect(roleHasPermission("CARRIER_DISPATCHER", "BID_CREATE")).toBe(true);
    expect(roleHasPermission("SHIPPER", "BID_CREATE")).toBe(false);
    expect(roleHasPermission("FORWARDER", "BID_CREATE")).toBe(false);
    expect(roleHasPermission("DRIVER", "BID_CREATE")).toBe(false);
  });

  it("только грузовладелец/экспедитор публикует груз и принимает ставки", () => {
    for (const r of ["SHIPPER", "FORWARDER"] as const) {
      expect(roleHasPermission(r, "LOAD_PUBLISH")).toBe(true);
      expect(roleHasPermission(r, "BID_ACCEPT")).toBe(true);
    }
    for (const r of ["CARRIER_ADMIN", "CARRIER_DISPATCHER", "DRIVER"] as const) {
      expect(roleHasPermission(r, "LOAD_PUBLISH")).toBe(false);
      expect(roleHasPermission(r, "BID_ACCEPT")).toBe(false);
    }
  });

  it("диспетчер не управляет компанией и не подписывает договор", () => {
    expect(roleHasPermission("CARRIER_DISPATCHER", "COMPANY_MANAGE")).toBe(false);
    expect(roleHasPermission("CARRIER_DISPATCHER", "COMPANY_MEMBERS_MANAGE")).toBe(false);
    expect(roleHasPermission("CARRIER_DISPATCHER", "CONTRACT_SIGN")).toBe(false);
    expect(roleHasPermission("CARRIER_DISPATCHER", "ORDER_ASSIGN_VEHICLE")).toBe(true);
  });

  it("водитель не видит биржу, финансы и админку", () => {
    const p = permissionsForRole("DRIVER");
    expect(p.has("MARKETPLACE_VIEW")).toBe(false);
    expect(p.has("PAYMENT_VIEW")).toBe(false);
    expect(p.has("ADMIN_USERS")).toBe(false);
    expect(p.has("TRACKING_UPDATE")).toBe(true);
    expect(p.has("ORDER_STATUS_UPDATE")).toBe(true);
  });

  it("администратор имеет все права", () => {
    expect(ADMIN_PERMISSIONS.length).toBe(Object.keys(Permission).length);
    expect(permissionsForRole(null, true).has("ADMIN_AUDIT")).toBe(true);
  });

  it("роли по типам компаний", () => {
    expect(ROLES_BY_COMPANY_TYPE.CARRIER).toContain("DRIVER");
    expect(ROLES_BY_COMPANY_TYPE.SHIPPER).toEqual(["SHIPPER"]);
  });
});
