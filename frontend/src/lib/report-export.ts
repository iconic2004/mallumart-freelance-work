import type { Product, Sale } from "@/lib/types";

export type ReportPeriod = "today" | "7-days" | "30-days" | "this-month";
export type ExportSnapshot = { products: Product[]; sales: Sale[]; inventoryValue: number; periodLabel: string; period: ReportPeriod };

function inPeriod(date: string, period: ReportPeriod) {
  const value = new Date(date);
  const now = new Date();
  if (period === "today") return value.toDateString() === now.toDateString();
  if (period === "this-month") return value.getMonth() === now.getMonth() && value.getFullYear() === now.getFullYear();
  const days = period === "7-days" ? 7 : 30;
  return value.getTime() >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

const currency = "₹#,##0.00";
const percentage = "0%";
const formatDate = (date: string) => new Date(date).toLocaleDateString("en-IN");
const formatTime = (date: string) => new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
function styleSheet(sheet: Record<string, unknown>, width: number, lastColumn: string) { sheet["!cols"] = Array.from({ length: width }, () => ({ wch: 18 })); sheet["!autofilter"] = { ref: `A1:${lastColumn}${(sheet["!ref"] as string)?.split(":")[1]?.replace(/\D/g, "") ?? 1}` }; sheet["!freeze"] = { xSplit: 0, ySplit: 1 }; }

export async function exportExcelReport(snapshot: ExportSnapshot) {
  const XLSX = await import("xlsx");
  const filteredSales = snapshot.sales.filter((sale) => inPeriod(sale.createdAt, snapshot.period));
  const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const totalProfit = filteredSales.reduce((sum, sale) => sum + sale.grossProfit, 0);
  const paymentRows = (["Cash", "UPI", "Card", "Other"] as const).map((method) => { const methodSales = filteredSales.filter((sale) => sale.paymentMethod === method); const revenue = methodSales.reduce((sum, sale) => sum + sale.totalAmount, 0); return { "Payment Method": method, Transactions: methodSales.length, Revenue: revenue, Percentage: totalRevenue ? revenue / totalRevenue : 0 }; });
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([["MALLU MART"], ["Business Report"], ["Report Period", snapshot.periodLabel], [], ["Metric", "Value"], ["Total Revenue", totalRevenue], ["Total Gross Profit", totalProfit], ["Total Transactions", filteredSales.length], ["Average Order Value", filteredSales.length ? totalRevenue / filteredSales.length : 0], ["Inventory Value", snapshot.inventoryValue], [], ["Payment Method", "Revenue", "Percentage"], ...paymentRows.map((row) => [row["Payment Method"], row.Revenue, row.Percentage])]);
  summary["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 18 }]; summary["!freeze"] = { xSplit: 0, ySplit: 5 };
  ["B6", "B7", "B9", "B10", "B13", "B14", "B15", "B16"].forEach((cell) => { if (summary[cell]) summary[cell].z = currency; }); ["C13", "C14", "C15", "C16"].forEach((cell) => { if (summary[cell]) summary[cell].z = percentage; });
  const salesSheet = XLSX.utils.json_to_sheet(filteredSales.map((sale) => ({ "Sale ID": sale.id, Date: formatDate(sale.createdAt), Time: formatTime(sale.createdAt), Items: sale.items, "Total Amount": sale.totalAmount, "Total Cost": sale.totalCost, "Gross Profit": sale.grossProfit, "Payment Method": sale.paymentMethod, "Created By": "Local demo user" }))); styleSheet(salesSheet, 9, "I");
  filteredSales.forEach((_, index) => { ["E", "F", "G"].forEach((column) => { if (salesSheet[`${column}${index + 2}`]) salesSheet[`${column}${index + 2}`].z = currency; }); });
  const itemRows = filteredSales.flatMap((sale) => sale.saleItems.map((item) => ({ "Sale ID": sale.id, Date: formatDate(sale.createdAt), Product: item.productName, Quantity: item.quantity, "Selling Price": item.sellingPrice, "Cost Price": item.costPrice, Revenue: item.totalAmount, Cost: item.totalCost, Profit: item.totalAmount - item.totalCost }))); const itemsSheet = XLSX.utils.json_to_sheet(itemRows); styleSheet(itemsSheet, 9, "I"); itemRows.forEach((_, index) => { ["E", "F", "G", "H", "I"].forEach((column) => { if (itemsSheet[`${column}${index + 2}`]) itemsSheet[`${column}${index + 2}`].z = currency; }); });
  const inventorySheet = XLSX.utils.json_to_sheet(snapshot.products.map((product) => ({ Product: product.name, SKU: product.sku, Category: product.category, "Cost Price": product.costPrice, "Selling Price": product.sellingPrice, "Current Stock": product.stockQuantity, "Minimum Stock": product.minimumStock, "Stock Status": product.stockQuantity === 0 ? "OUT OF STOCK" : product.stockQuantity <= product.minimumStock ? "LOW STOCK" : "IN STOCK", "Inventory Value": product.costPrice * product.stockQuantity }))); styleSheet(inventorySheet, 9, "I");
  const paymentSheet = XLSX.utils.json_to_sheet(paymentRows); styleSheet(paymentSheet, 4, "D"); paymentRows.forEach((_, index) => { if (paymentSheet[`C${index + 2}`]) paymentSheet[`C${index + 2}`].z = currency; if (paymentSheet[`D${index + 2}`]) paymentSheet[`D${index + 2}`].z = percentage; });
  XLSX.utils.book_append_sheet(workbook, summary, "Summary"); XLSX.utils.book_append_sheet(workbook, salesSheet, "Sales"); XLSX.utils.book_append_sheet(workbook, itemsSheet, "Sale Items"); XLSX.utils.book_append_sheet(workbook, inventorySheet, "Inventory"); XLSX.utils.book_append_sheet(workbook, paymentSheet, "Payments");
  const stamp = snapshot.period === "this-month" ? new Date().toLocaleString("en-US", { month: "long", year: "numeric" }).replace(" ", "-") : snapshot.periodLabel.replaceAll(" ", "-");
  XLSX.writeFile(workbook, `Mallu-Mart-Report-${stamp}.xlsx`);
}
