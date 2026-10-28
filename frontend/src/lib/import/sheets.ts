export function publishedSheetUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid published Google Sheets CSV URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.google.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(
      "Use a published Google Sheets CSV link from docs.google.com.",
    );
  const published =
    /^\/spreadsheets\/d\/e\/[\w-]+\/pub$/.test(url.pathname) &&
    url.searchParams.get("output") === "csv";
  const exported =
    /^\/spreadsheets\/d\/[\w-]+\/export$/.test(url.pathname) &&
    url.searchParams.get("format") === "csv";
  if (!published && !exported)
    throw new Error(
      "Publish the sheet as CSV and paste its CSV export link. Private or edit links are not supported.",
    );
  return url.href;
}
