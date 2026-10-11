import type { DateRange, Product, Sale, SalesReport, StoreSettings } from "@/lib/types";
import { rangeFileStamp, rangeLabel } from "@/lib/periods";
import { stockStatus } from "@/lib/validation";

export type ExportSnapshot = {
  range: DateRange;
  report: SalesReport;
  sales: Sale[];
  products: Product[];
  // Staff exports leave out every cost and profit column.
  isOwner: boolean;
  store: StoreSettings | null;
};

const currency = "₹#,##0.00";
const percentage = "0%";
const formatDate = (date: string) => new Date(date).toLocaleDateString("en-IN");
const formatTime = (date: string) => new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const statusText: Record<Sale["status"], string> = {
  completed: "Completed",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

type Sheet = Record<string, unknown> & { "!ref"?: string };

// Column widths, header filter, frozen header row and currency formats.
function styleSheet(sheet: Sheet, headers: string[], currencyHeaders: string[], percentHeaders: string[] = []) {
  const rows = Number(sheet["!ref"]?.split(":")[1]?.replace(/\D/g, "") ?? 1);
  const column = (index: number) => String.fromCharCode(65 + index);
  sheet["!cols"] = headers.map(() => ({ wch: 16 }));
  sheet["!autofilter"] = { ref: `A1:${column(headers.length - 1)}${rows}` };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  headers.forEach((header, index) => {
    const format = currencyHeaders.includes(header) ? currency : percentHeaders.includes(header) ? percentage : null;
    if (!format) return;
    for (let row = 2; row <= rows; row++) {
      const cell = sheet[`${column(index)}${row}`] as { z?: string } | undefined;
      if (cell) cell.z = format;
    }
  });
}

export async function exportExcelReport({ range, report, sales, products, isOwner, store }: ExportSnapshot) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  // Summary
  const summaryRows: (string | number)[][] = [
    [(store?.storeName || "Mallu Mart").toUpperCase()],
    ["Business Report"],
    ["Period", rangeLabel(range)],
    ...(store?.gstin ? [["GSTIN", store.gstin]] : []),
    [],
    ["Metric", "Value"],
    ["Gross Sales", report.grossRevenue],
    ["Refunds", report.refunds],
    ["Net Revenue", report.revenue],
    ["GST included in net revenue", report.tax],
  ];
  if (isOwner && report.profit !== null) summaryRows.push(["Gross Profit (after refunds)", report.profit]);
  summaryRows.push(
    ["Sales (transactions)", report.salesCount],
    ["Refunds (count)", report.refundCount],
    ["Average Sale Value", report.salesCount ? report.grossRevenue / report.salesCount : 0]
  );
  if (isOwner) {
    summaryRows.push(["Inventory Value (at cost, now)", products.reduce((sum, p) => sum + (p.costPrice ?? 0) * p.stockQuantity, 0)]);
  }
  const summary = XLSX.utils.aoa_to_sheet(summaryRows) as Sheet;
  summary["!cols"] = [{ wch: 32 }, { wch: 22 }];
  summaryRows.forEach((row, index) => {
    const cell = summary[`B${index + 1}`] as { z?: string } | undefined;
    if (cell && typeof row[1] === "number" && !/\(count\)|transactions/i.test(String(row[0]))) cell.z = currency;
  });
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");

  // Sales
  const saleHeaders = [
    "Invoice", "Date", "Time", "Customer", "Payment Method", "Total Amount", "GST", "Refunded", "Status",
    ...(isOwner ? ["Total Cost", "Gross Profit"] : []), "Cashier",
  ];
  const salesSheet = XLSX.utils.json_to_sheet(
    sales.map((sale) => ({
      Invoice: sale.invoiceNumber,
      Date: formatDate(sale.createdAt),
      Time: formatTime(sale.createdAt),
      Customer: sale.customer?.name ?? "",
      "Payment Method": sale.paymentMethod,
      "Total Amount": sale.totalAmount,
      GST: sale.taxAmount,
      Refunded: sale.refundedAmount,
      Status: statusText[sale.status],
      ...(isOwner ? { "Total Cost": sale.totalCost ?? 0, "Gross Profit": sale.grossProfit ?? 0 } : {}),
      Cashier: sale.cashierName || "-",
    })),
    { header: saleHeaders }
  ) as Sheet;
  styleSheet(salesSheet, saleHeaders, ["Total Amount", "GST", "Refunded", "Total Cost", "Gross Profit"]);
  XLSX.utils.book_append_sheet(workbook, salesSheet, "Sales");

  // Sale items
  const itemHeaders = [
    "Invoice", "Date", "Product", "Category", "HSN", "Quantity", "Unit", "Selling Price", "Revenue", "GST Rate", "GST",
    "Refunded Qty", ...(isOwner ? ["Cost", "Profit"] : []),
  ];
  const itemsSheet = XLSX.utils.json_to_sheet(
    sales.flatMap((sale) =>
      sale.saleItems.map((item) => ({
        Invoice: sale.invoiceNumber,
        Date: formatDate(sale.createdAt),
        Product: item.productName,
        Category: item.categoryName,
        HSN: item.hsnCode,
        Quantity: item.quantity,
        Unit: item.unit,
        "Selling Price": item.sellingPrice,
        Revenue: item.totalAmount,
        "GST Rate": item.gstRate / 100,
        GST: item.taxAmount,
        "Refunded Qty": item.refundedQuantity,
        ...(isOwner ? { Cost: item.totalCost ?? 0, Profit: item.totalAmount - (item.totalCost ?? 0) } : {}),
      }))
    ),
    { header: itemHeaders }
  ) as Sheet;
  styleSheet(itemsSheet, itemHeaders, ["Selling Price", "Revenue", "GST", "Cost", "Profit"], ["GST Rate"]);
  XLSX.utils.book_append_sheet(workbook, itemsSheet, "Sale Items");

  // GST by rate (intra-state: half CGST, half SGST)
  if (report.gst.length) {
    const gstHeaders = ["GST Rate", "Taxable Value", "CGST", "SGST", "Total GST"];
    const gstSheet = XLSX.utils.json_to_sheet(
      report.gst.map((row) => ({
        "GST Rate": row.rate / 100,
        "Taxable Value": row.taxableValue,
        CGST: row.tax / 2,
        SGST: row.tax / 2,
        "Total GST": row.tax,
      })),
      { header: gstHeaders }
    ) as Sheet;
    styleSheet(gstSheet, gstHeaders, ["Taxable Value", "CGST", "SGST", "Total GST"], ["GST Rate"]);
    XLSX.utils.book_append_sheet(workbook, gstSheet, "GST");
  }

  // Inventory (current stock)
  const inventoryHeaders = [
    "Product", "SKU", "Barcode", "Category", "Unit", ...(isOwner ? ["Cost Price"] : []), "Selling Price", "GST Rate",
    "Current Stock", "Minimum Stock", "Stock Status", ...(isOwner ? ["Inventory Value"] : []),
  ];
  const inventorySheet = XLSX.utils.json_to_sheet(
    products.map((product) => ({
      Product: product.name,
      SKU: product.sku,
      Barcode: product.barcode ?? "",
      Category: product.category,
      Unit: product.unit,
      ...(isOwner ? { "Cost Price": product.costPrice ?? 0 } : {}),
      "Selling Price": product.sellingPrice,
      "GST Rate": product.gstRate / 100,
      "Current Stock": product.stockQuantity,
      "Minimum Stock": product.minimumStock,
      "Stock Status": stockStatus(product).toUpperCase(),
      ...(isOwner ? { "Inventory Value": (product.costPrice ?? 0) * product.stockQuantity } : {}),
    })),
    { header: inventoryHeaders }
  ) as Sheet;
  styleSheet(inventorySheet, inventoryHeaders, ["Cost Price", "Selling Price", "Inventory Value"], ["GST Rate"]);
  XLSX.utils.book_append_sheet(workbook, inventorySheet, "Inventory");

  // Payments
  const paymentHeaders = ["Payment Method", "Sales", "Revenue (after refunds)", "Share"];
  const paymentSheet = XLSX.utils.json_to_sheet(
    report.payments.map((payment) => ({
      "Payment Method": payment.method === "Credit" ? "Credit (khata)" : payment.method,
      Sales: payment.count,
      "Revenue (after refunds)": payment.revenue,
      Share: report.revenue ? payment.revenue / report.revenue : 0,
    })),
    { header: paymentHeaders }
  ) as Sheet;
  styleSheet(paymentSheet, paymentHeaders, ["Revenue (after refunds)"], ["Share"]);
  XLSX.utils.book_append_sheet(workbook, paymentSheet, "Payments");

  XLSX.writeFile(workbook, `Mallu-Mart-Report-${rangeFileStamp(range)}.xlsx`);
}
