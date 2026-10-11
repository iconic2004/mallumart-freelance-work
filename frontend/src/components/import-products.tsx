"use client";

import { useState } from "react";
import type { ImportResult, ImportRow } from "@/lib/types";
import { importProducts } from "@/lib/supabase/services/products";
import { ErrorBox, Modal, primaryButton, secondaryButton } from "@/components/ui";

// Column headers in the template, and the import field each maps to.
const columns: [header: string, field: keyof ImportRow, example: string][] = [
  ["Name", "name", "Kerala Matta Rice"],
  ["SKU", "sku", "MM-101"],
  ["Category", "category", "Grocery"],
  ["Barcode", "barcode", "8901234567890"],
  ["Unit", "unit", "kg"],
  ["Cost Price", "costPrice", "52"],
  ["Selling Price", "sellingPrice", "64"],
  ["Opening Stock", "openingStock", "25"],
  ["Minimum Stock", "minimumStock", "5"],
  ["GST Rate", "gstRate", "5"],
  ["HSN Code", "hsnCode", "1006"],
];

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z]/g, "");
const fieldByHeader = new Map(columns.map(([header, field]) => [normalise(header), field]));
// Common alternative headings.
for (const [alias, field] of [
  ["productname", "name"],
  ["product", "name"],
  ["itemname", "name"],
  ["code", "sku"],
  ["mrp", "sellingPrice"],
  ["price", "sellingPrice"],
  ["cost", "costPrice"],
  ["stock", "openingStock"],
  ["quantity", "openingStock"],
  ["gst", "gstRate"],
  ["hsn", "hsnCode"],
] as const) {
  fieldByHeader.set(alias, field);
}

const BATCH = 500;

export function ImportProductsModal({ close, done }: { close: () => void; done: (message: string) => Promise<void> }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([columns.map(([header]) => header), columns.map(([, , example]) => example)]);
    sheet["!cols"] = columns.map(() => ({ wch: 16 }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Products");
    XLSX.writeFile(book, "Mallu-Mart-Product-Import-Template.xlsx");
  };

  const readFile = async (file: File) => {
    setError("");
    setResult(null);
    setRows([]);
    setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) return setError("The file is larger than 5 MB.");
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const parsed = raw
        .map((record) => {
          const row: Record<string, string> = {};
          for (const [header, value] of Object.entries(record)) {
            const field = fieldByHeader.get(normalise(header));
            if (field) row[field] = String(value ?? "").trim();
          }
          return row as unknown as ImportRow;
        })
        .filter((row) => Object.values(row).some(Boolean));
      if (!parsed.length) return setError("No product rows found. Use the template's column headings.");
      if (parsed.length > 5000) return setError("Import at most 5000 products at a time.");
      setRows(parsed);
    } catch {
      setError("Could not read this file. Save it as .xlsx or .csv and try again.");
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError("");
    const total: ImportResult = { created: 0, updated: 0, errors: [] };
    try {
      for (let start = 0; start < rows.length; start += BATCH) {
        const batch = await importProducts(rows.slice(start, start + BATCH));
        total.created += batch.created;
        total.updated += batch.updated;
        // Report spreadsheet row numbers (row 1 is the header).
        total.errors.push(...batch.errors.map((item) => ({ ...item, row: item.row + start + 1 })));
      }
      setResult(total);
      await done(`Imported ${total.created + total.updated} products (${total.created} new, ${total.updated} updated)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const missing = rows.filter((row) => !row.name || !row.sku || !row.sellingPrice).length;

  return (
    <Modal title="Import products" subtitle="Add or update many products at once from Excel or CSV" onClose={close} wide>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[#1f2924]">
        <li>
          <button type="button" onClick={downloadTemplate} className="font-semibold text-[#226b4c] hover:underline">
            Download the template
          </button>{" "}
          and fill one product per row. <b>Name</b>, <b>SKU</b> and <b>Selling Price</b> are required.
        </li>
        <li>Unit is pcs, kg or l. Prices include GST. GST Rate is one of 0, 0.25, 3, 5, 12, 18, 28, 40.</li>
        <li>
          Existing SKUs are <b>updated</b> (name, prices, category, GST...). Their stock is never changed: use ± Stock for
          that. New SKUs are created with their opening stock. Missing categories are created.
        </li>
      </ol>

      <label className="mt-5 block rounded-2xl border-2 border-dashed border-[#dfe7df] p-6 text-center text-sm text-[#718078] hover:bg-[#fbfcfa]">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file);
            event.target.value = "";
          }}
        />
        {fileName ? (
          <>
            <b className="text-[#1f2924]">{fileName}</b> · {rows.length} product rows
            {missing > 0 && <span className="text-[#c25e4a]"> · {missing} missing name, SKU or price</span>}
          </>
        ) : (
          "Click to choose a file (.xlsx or .csv)"
        )}
      </label>

      {rows.length > 0 && !result && (
        <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-[#e4e9e4]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-[#fbfcfa] text-[#87948c]">
              <tr>
                {columns.map(([header]) => (
                  <th key={header} className="px-2 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f4ef]">
              {rows.slice(0, 8).map((row, index) => (
                <tr key={index}>
                  {columns.map(([header, field]) => (
                    <td key={header} className="px-2 py-1.5">
                      {row[field] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 8 && <div className="px-3 py-2 text-xs text-[#87948c]">…and {rows.length - 8} more rows</div>}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl bg-[#f0f6f0] p-4 text-sm">
          <b>{result.created}</b> created · <b>{result.updated}</b> updated
          {result.errors.length > 0 && <span className="text-[#c25e4a]"> · {result.errors.length} rows skipped</span>}
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[#c25e4a]">
              {result.errors.map((item) => (
                <li key={`${item.row}-${item.sku}`}>
                  Row {item.row}
                  {item.sku && ` (${item.sku})`}: {item.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4">
        <ErrorBox message={error} />
      </div>

      <div className="mt-2 flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={close} className={secondaryButton}>
          {result ? "Close" : "Cancel"}
        </button>
        {!result && (
          <button type="button" disabled={!rows.length || busy} onClick={runImport} className={primaryButton}>
            {busy ? "Importing..." : `Import ${rows.length} products`}
          </button>
        )}
      </div>
    </Modal>
  );
}
