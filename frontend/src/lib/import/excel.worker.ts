import * as XLSX from "xlsx";
self.onmessage = async (event: MessageEvent<{ file: File; sheet: string }>) => {
  try {
    const workbook = XLSX.read(await event.data.file.arrayBuffer(), {
      type: "array",
      cellDates: true,
      dense: false,
    });
    const sheet = event.data.sheet || workbook.SheetNames[0];
    if (!sheet || !workbook.Sheets[sheet])
      throw new Error(
        "Choose a workbook with at least one readable worksheet.",
      );
    const worksheet = workbook.Sheets[sheet];
    for (const [key, cell] of Object.entries(worksheet)) {
      if (key.startsWith("!") || !cell) continue;
      if (cell.t === "e")
        throw new Error(
          "The worksheet contains an Excel error. Fix error cells before importing.",
        );
      if (cell.f && cell.v === undefined)
        throw new Error(
          "Some formulas have no saved result. Recalculate and save the workbook in Excel first.",
        );
      if (cell.t === "d" && cell.v instanceof Date) {
        cell.t = "s";
        cell.v = cell.v.toISOString().slice(0, 19).replace("T", " ");
        delete cell.w;
      }
    }
    const csv = XLSX.utils.sheet_to_csv(worksheet, {
      blankrows: false,
      rawNumbers: true,
    });
    self.postMessage({
      file: new File([csv], "workbook.csv", { type: "text/csv" }),
      sheets: workbook.SheetNames,
      sheet,
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "This workbook could not be read. Try exporting the worksheet as CSV.",
    });
  }
};
