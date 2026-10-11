import { describe, expect, it } from "vitest";
import { friendlyError } from "./errors";

describe("friendlyError", () => {
  it("explains a duplicate SKU", () => {
    const message = friendlyError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "products_sku_key"',
      details: "Key (sku)=(MM-001) already exists.",
    });
    expect(message).toMatch(/SKU is already used/);
  });

  it("explains a duplicate category name", () => {
    const message = friendlyError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "categories_name_key"',
    });
    expect(message).toMatch(/category with that name already exists/);
  });

  it("explains permission errors", () => {
    expect(friendlyError({ code: "42501", message: "permission denied for table products" })).toMatch(/permission/);
  });

  it("passes through messages raised by the database functions", () => {
    const message = "Insufficient stock for Rice (Available: 2, Requested: 5)";
    expect(friendlyError({ code: "P0001", message })).toBe(message);
  });

  it("explains a database that is behind the app", () => {
    const message = friendlyError({
      code: "PGRST202",
      message: "Could not find the function public.daily_sales(p_from, p_to, p_tz) in the schema cache",
    });
    expect(message).toMatch(/re-run supabase\/000_full_setup.sql/);
  });
});
