# UI patterns to use

Learned from studying an established demand-planning SaaS. Borrow the **patterns**, never its
branding, colours, icons, copy or code. Our own look: one primary colour, muted greys, colour only
for meaning (status, +/−, warnings). Light and dark themes.

| Pattern | Use in ZeroCast |
|---|---|
| **Empty state with numbered steps** (1 Choose → 2 Run → 3 Explore) | Every page before first use |
| **Parameters → Run → Result**; nothing heavy runs until Run | Forecast, Review, Factor check |
| **Breadcrumb title in the top bar** (`FORECAST · Dairy`) | Orientation without a sidebar |
| **Problem tabs with counts** ("Missing dates 12 · Too short 3"); tab filters the table | Data health |
| **Quantified warning banner** with source and %, dismissible | Data quality, model limits |
| **KPI card**: label, big number, mini trend bars, "Complete / Limited data" label | Scenario cards, summary |
| **Signed deltas** with colour + % + base (`+1,240 / +7.4%`) | Surprises, factor effects |
| **Last year next to the forecast** | Fan chart |
| **Grid with per-column filters**, sortable, export | Series tables, portfolio risk |
| **Import template + export everywhere** | Connect data, results |
| **Every AI number one click from "why"** (tooltip: which quantile, which data period) | All numbers |
| **Show the cost of not acting** ("~15% chance demand exceeds capacity") | Plan and risk cards |

## Do not replicate
Dense 30-column statistics tables · admin/SQL tools · password-to-save settings · 60 screens.
