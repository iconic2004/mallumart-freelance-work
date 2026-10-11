type DbError = { code?: string; message: string; details?: string | null };

// Turns Postgres / PostgREST errors into messages a shop owner can act on.
export function friendlyError(error: DbError): string {
  const text = `${error.message} ${error.details ?? ""}`;
  if (error.code === "23505") {
    if (text.includes("sku")) return "That SKU is already used by another product (it may be an archived one). Choose a different SKU.";
    if (text.includes("categories")) return "A category with that name already exists.";
    return "That record already exists.";
  }
  if (error.code === "23503") return "This record is still referenced by other data and cannot be changed.";
  if (error.code === "23514") return "One of the values is out of the allowed range.";
  if (error.code === "22P02") return "One of the values has an invalid format.";
  if (error.code === "42501") return "You do not have permission to do this. Ask the store owner.";
  // The app calls a database function that doesn't exist yet: the database is
  // on an older version of supabase/000_full_setup.sql than the app.
  if (error.code === "PGRST202" || error.code === "42883") {
    return "The database is out of date for this version of the app. The owner needs to re-run supabase/000_full_setup.sql in the Supabase SQL Editor.";
  }
  return error.message;
}
