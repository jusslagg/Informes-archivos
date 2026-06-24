function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function escapeHtml(value) {
  return normalizeCell(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeTsv(value) {
  const text = normalizeCell(value).replace(/\r?\n/g, " ");
  return /[\t"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function tableToTsv(lines = []) {
  return lines.map((line) => line.map(escapeTsv).join("\t")).join("\n");
}

export function tableToHtml(lines = []) {
  const [header = [], ...body] = lines;
  const head = header.length
    ? `<thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>`
    : "";
  const rows = body
    .map((line) => `<tr>${line.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${head}<tbody>${rows}</tbody></table>`;
}

export async function copyTableToClipboard(lines = []) {
  const text = tableToTsv(lines);
  const html = tableToHtml(lines);
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(text);
}

export function setClipboardTableData(event, lines = []) {
  event.preventDefault();
  event.clipboardData.setData("text/plain", tableToTsv(lines));
  event.clipboardData.setData("text/html", tableToHtml(lines));
}
