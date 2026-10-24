# Demo dataset builders

Each script reads raw source files from `data/raw/` (git-ignored) and writes a Parquet file in
the universal long template (`date`, `series_id`, `target`, numeric factor columns) to
`data/processed/` (`*.parquet` is git-ignored). **Never commit raw or processed data.**

Run from `backend/` so the backend's environment is used:

```bash
cd backend
make demo-data            # cement + online retail, default paths
# or one at a time, with options:
uv run python ../data/scripts/build_cement.py --source ../data/raw/cement/Core_Industries_2011_12.xlsx
uv run python ../data/scripts/build_online_retail.py
uv run python ../data/scripts/build_favorita.py --store 44 --families "GROCERY I" BEVERAGES
```

Tests: `backend/tests/test_demo_builders.py` (synthetic files in each source's layout).

## Manufacturing: India cement production index (monthly)

| | |
|---|---|
| Source | Office of the Economic Adviser (OEA), DPIIT, Government of India — Index of Eight Core Industries, base 2011-12 = 100 |
| Download | https://eaindustry.nic.in/ici_download_data.asp → "Download ICI data (Base Year = 2011-12)" (Excel). Save as `data/raw/cement/Core_Industries_2011_12.xlsx` |
| Output | `data/processed/manufacturing_cement.parquet`: `series_id = cement`, target = cement index; factors = the other seven core indices (coal, crude_oil, natural_gas, petroleum_refinery_products, fertilizers, steel, electricity). The overall index is left out because it includes cement. |
| Coverage (file downloaded 2026-10-24) | Apr 2011 – May 2026, 182 months, no gaps |
| Holiday calendar | `IN` |
| Licence | **Not confirmed.** The OEA site shows no licence or terms, and its disclaimer page returned 404. Indian government data on data.gov.in is usually under the Government Open Data License – India (attribution required), but that is not stated for this file. Confirm before publishing any derived data. If it's allowed, attribute as "Source: Office of the Economic Adviser, DPIIT". |

Note: OEA has also published a base 2022-23 series. The base 2011-12 file may stop being
updated.

## Retail (demo): UCI Online Retail II (daily)

Used for the `retail` demo instead of Favorita, whose Kaggle terms could not be checked.

| | |
|---|---|
| Source | UCI Machine Learning Repository, "Online Retail II" (Daqing Chen; donated 2019), DOI 10.24432/C5CG6D. Transactions of a UK-based online gift retailer that sells mainly to wholesalers. |
| Download | `curl -L -o data/raw/online_retail/online_retail_ii.zip https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip` (no account; the zip or the extracted `online_retail_II.xlsx` both work) |
| Output | `data/processed/retail_online.parquet`: 5 product families assigned from item descriptions by keyword (CHRISTMAS, CANDLES & T-LIGHTS, BAGS, CARDS & WRAP, MUGS & CUPS; first match wins); target = units sold per day; factors `avg_unit_price` (quantity-weighted, carried forward on days without sales) and `holiday` (UK bank holiday). Cancellations and non-positive quantities or prices are dropped. |
| Coverage | 1 Dec 2009 – 9 Dec 2011, 739 days per family. The shop does not trade on Saturdays or over Christmas; those days are recorded as 0 units (real zero-sales days), so the health check finds no gaps. |
| Holiday calendar | `GB` |
| Licence | **CC BY 4.0**, stated on the dataset page (checked 2026-10-24). Attribution required: "Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D". |

## Retail (alternative): Favorita store sales (daily)

Not used for the demo. Kept so it can replace the UCI data once the Kaggle terms are checked.

| | |
|---|---|
| Source | Kaggle competition "Store Sales – Time Series Forecasting" (Corporación Favorita, Ecuador) |
| Download | Accept the competition rules on Kaggle, then `kaggle competitions download -c store-sales-time-series-forecasting -p data/raw/favorita` (the zip or the extracted CSVs both work). Needs `train.csv`, `stores.csv`, `holidays_events.csv`. |
| Output | `data/processed/retail_favorita.parquet`: store 44 (Quito, the largest) × GROCERY I, BEVERAGES, PRODUCE, CLEANING, DAIRY; target = sales; factors `onpromotion` and `holiday` (1 when a national holiday, or one for the store's state or city, applies; transferred holidays and "Work Day" rows are excluded) |
| Known gaps | Stores are closed on 25 December and the source has no rows for it. The health check reports these as missing dates and fills them as blanks. |
| Holiday calendar | `EC` |
| Licence | **Not confirmed.** Kaggle competition data is governed by the competition rules, which need a logged-in account to read. Competition rules often limit use to the competition and forbid redistribution. Check the rules before shipping anything derived from it (B6 writes demo JSON into `frontend/public/demo/`, which gets published). |
