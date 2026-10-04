# Data Visualization — CVD-Compliant Palettes

Companion-app charts use color palettes that stay readable for people
with color vision deficiency (CVD). The defaults are wired into
`web/components/chart.tsx` via `web/dataviz/palettes.ts`.

Source: Okabe & Ito, "Color Universal Design" — https://jfly.uni-koeln.de/color/

## Palette table

| # | Name | Hex | Role |
|---|------|-----|------|
| 1 | Orange | `#E69F00` | First categorical series |
| 2 | Sky blue | `#56B4E9` | Second categorical series |
| 3 | Bluish green | `#009E73` | Third categorical series |
| 4 | Yellow | `#F0E442` | Fourth categorical series (brightest tone) |
| 5 | Blue | `#0072B2` | Fifth categorical series |
| 6 | Vermillion | `#D55E00` | Sixth categorical series |
| 7 | Reddish purple | `#CC79A7` | Seventh categorical series |
| 8 | Black / white (theme-dependent) | `#000000` on light, `#FFFFFF` on dark | Eighth categorical series — the published black is invisible on dark surfaces, so the dark theme substitutes white |

The same values are available as CSS custom properties
`--color-dataviz-1` … `--color-dataviz-8` in `web/theme/tokens-light.css`
and `web/theme/tokens-dark.css`. Swatches 1–7 are identical in both
themes; swatch 8 is theme-dependent (`#000000` on light, `#FFFFFF` on
dark) so the 8th series stays visible on either surface. Do not assume
the hex exports in `palettes.ts` track the theme — `OKABE_ITO` /
`OKABE_ITO_HEX` are the published (light) set; use
`--color-dataviz-N` or `themedCategoricalVar()` for theme-aware marks.

Also exported from `web/dataviz/palettes.ts`:

- `GREEN_SEQUENTIAL` — 9-step green ramp, light to dark
  (ColorBrewer Greens). Grayscale-monotonic and CVD-safe; the green
  ramp keeps companion charts feeling native on the G2 green display.
- `DIVERGING_BLUE_ORANGE` — 7-step blue↔orange diverging scale with a
  neutral midpoint (endpoints are Okabe-Ito vermillion and blue).
- `categoricalColor(index, palette?)` — returns the palette color for a
  series index, cycling when there are more than 8. Defaults to the
  Okabe-Ito set; an empty palette falls back to the default instead of
  returning undefined. Returns theme-agnostic hex (the light-theme set).
- `themedCategoricalVar(index)` — theme-aware variant for the default
  palette: returns a `var(--color-dataviz-N)` reference (with a light
  fallback) so the mark follows the active theme, including the
  dark-theme white 8th swatch. Usable in SVG fill/stroke and inline
  styles.
- `OKABE_ITO_DARK` / `OKABE_ITO_DARK_HEX` — dark-theme variant of the
  set: identical except the 8th swatch is white (`#FFFFFF`).

## Usage rules

1. **Categorical data, up to 8 series:** use the Okabe-Ito palette in
   published order, first series first. `PieChart` accepts an optional
   `palette` prop and defaults to Okabe-Ito (theme-aware via
   `--color-dataviz-N`); `BarChart` accepts an optional `palette` prop
   but defaults to a single `--color-accent` fill — pass a palette
   explicitly for per-bar colors. A caller-provided palette is used
   as-is and is not adjusted for the theme. More than 8 series is a
   design problem, not a palette problem — combine small series into an
   "Other" slice or split the chart before reaching for more colors.
2. **Never encode by color alone.** Pair every color with a direct
   label, a legend entry that includes the value, a different marker
   shape, or a line style. Hue helps readers find a series faster;
   it must never be the only thing carrying the meaning.
3. **Ordered magnitudes → sequential.** Use `GREEN_SEQUENTIAL` for
   data that runs low→high with no special midpoint: step counts,
   volume, heat levels. The ramp should map to lightness as well as
   hue so it survives grayscale.
4. **Two directions from a midpoint → diverging.** Use
   `DIVERGING_BLUE_ORANGE` for data with a meaningful center: delta
   vs baseline, deviation from zero, sentiment above/below neutral.
5. **Forbidden ramps.** Never use a red↔green, green↔amber↔red, or
   rainbow ramp to encode meaning. Red/green contrast is invisible to
   the most common forms of CVD (deuteranomaly, protanopia), and the
   green/amber/red gradient is reserved for a different product —
   it does not belong in this toolkit.
6. **Yellow is the accent, not the text.** `#F0E442` has low contrast
   on white; use it for marks and fills, not for axis labels or
   legend text. Axis and legend text keep using `--color-text-dim`.
7. **Keep it consistent across a session.** The same color means the
   same series everywhere in a view. Do not mix Okabe-Ito with ad-hoc
   hex values in the same surface.
