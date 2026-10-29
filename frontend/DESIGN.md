# ZeroCast design system

The single source of truth for how ZeroCast looks. The implementation lives in
`src/app/design.css` (loaded last) and `src/lib/chart-theme.ts`.

**Reference.** This system borrows its discipline from the community
[Linear DESIGN.md](https://github.com/VoltAgent/awesome-design-md): depth from
a surface ladder and 1px hairlines instead of shadows, one accent colour,
tight display type, 8px controls. Linear's file is dark-only marketing with no
tables or light theme. We adapt it for a data product: both themes, dense
tables and charts, and ZeroCast's green accent.

## Principles

1. **Calm instrument.** The data is the loudest thing on the page. Chrome
   recedes: neutral surfaces, hairlines, no gradients, no decorative shadows.
2. **One accent.** Green marks the primary action, the current nav item,
   focus, and the forecast series. Status colours (warning, danger) appear
   only when they carry meaning.
3. **Numbers first.** Tabular numerals everywhere; key figures are large and
   semibold; units and definitions sit beside them in muted text.
4. **Plain language.** No job IDs, polling controls or internal field names in
   the UI. Say what is happening ("Running the forecast… 40%") and what to do.
5. **Never a dead page.** Every page opens ready to run (sensible defaults)
   or tells you exactly what to do next.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` (canvas) | `#f7f8f7` | `#0b0e0d` | Page, sidebar, top bar |
| `--card` (surface-1) | `#ffffff` | `#121614` | Cards, panels, inputs |
| `--muted` (surface-2) | `#f1f3f2` | `#191e1c` | Hover, table header, chips |
| `--border` (hairline) | `#e4e7e5` | `#232a27` | Default 1px borders |
| `--border-strong` | `#d2d7d4` | `#313a36` | Inputs, focused/featured |
| `--foreground` (ink) | `#101714` | `#eef2f0` | Headings, values |
| `--muted-foreground` | `#5b6661` | `#9ba7a1` | Labels, help text (≥ 4.5:1) |
| `--primary` (accent) | `#15664a` | `#5fd4a0` | Primary button, active, focus |
| `--primary-soft` | `#e7f2ec` | `#14271f` | Selected chips, active nav |
| `--destructive` | `#b42318` | `#ff8a7a` | Errors, drops |

Charts: forecast `#1f7a57` (dark `#5fd4a0`), history `#6b7a72`, comparison
blue `#3b6fb6`, risk red `#c4605a`. Gridlines use the hairline colour.

## Type

Inter (variable), `font-feature-settings: "cv11", "ss01"`, tabular numerals.

| Role | Size / weight / tracking |
|---|---|
| Page title (h1) | 26px / 600 / −0.025em |
| Eyebrow | 11px / 600 / +0.08em, uppercase, accent |
| Section & card title | 15px / 600 / −0.01em |
| Body | 14px / 400, line-height 1.55 |
| Label | 12.5px / 500, muted |
| Caption & hint | 12px / 400, muted |
| Stat value | 24px / 600 / −0.02em |

Display weights stay at 500–600; never 700+.

## Space, radius, elevation

- 4px base: 4 · 8 · 12 · 16 · 24 · 32 · 48. Card padding 20–24px; gaps
  between blocks 16–24px.
- Radius: chips 6px · buttons & inputs 8px · cards & callouts 12px ·
  pills 999px.
- Elevation: level 0 canvas → level 1 card (white + hairline) → level 2
  hover/selected (surface-2). Only floating layers (popovers, menus,
  tooltips) get a shadow.
- Focus: 3px ring at 22% accent, plus a 1px accent border on inputs.

## Components

- **Buttons.** 36px (sm 30px), radius 8, weight 500. Primary = accent fill;
  outline = card + strong hairline; ghost = text only. One primary per view.
- **Inputs & pickers.** 36px, card fill, strong hairline, radius 8.
  Multi-selects show chips (`shop_01 · gulab-jamun`, never the raw `|`).
- **Cards.** Card fill, hairline, radius 12, no shadow. Title row on top,
  optional actions at the right.
- **Stats.** Label (muted, sentence case) → value → hint. Never uppercase
  labels.
- **Tables.** Surface-2 header with 12px muted labels; hairline row
  dividers; row hover surface-2; numbers right-aligned and tabular.
- **Job status.** A single line with a spinner, plain message, percentage
  and a 4px accent progress bar; success collapses to "Forecast ready";
  failures use a danger callout with a retry.
- **Empty states.** Card with icon tile, a title that says what to do, and a
  sentence of context. Never a blank half-page.
- **Navigation.** Sidebar on the canvas colour; items 36px, radius 8; active
  item = surface-1 fill + hairline + accent icon.

## Don'ts

- No raw IDs, debug text or polling controls in the UI.
- No uppercase stat labels, no bold 700 headings.
- No shadows on cards, no gradients, no second accent colour.
- No pure black canvas in dark mode; no pure white canvas in light mode
  (white is for cards).
