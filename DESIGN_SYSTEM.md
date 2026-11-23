# Recora Design System

This document records the visual foundations and interaction patterns used by the Recora desktop app. Keep it in sync with `src/App.css` when changing the interface.

## Product feel

Recora should feel calm, focused, and dependable. Use a light workspace for browsing and setup, with dark surfaces reserved for recording controls. Keep the next action easy to find, reduce visual noise, and use motion only to clarify a state change.

## Mandatory color-palette rule

**Every Recora UI surface, component, icon, status, and illustration MUST use this supplied palette. Do not introduce additional hues or gray values.** Use only these four base colors, or alpha variants built from those same RGB values. This is a product-wide requirement for future work, not a suggestion.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#1A1A1A` | Primary text, icons, and dark surfaces |
| `--pink` | `#E01A4F` | Recording/live state and destructive emphasis |
| `--accent` | `#4C8DF1` | Primary actions, links, focus, selection, and Recora mark |
| `--paper` | `#F2F2F2` | App background, cards, panels, and light surfaces |

Use `rgba(26,26,26, alpha)` for muted text, borders, and shadows; use `rgba(76,141,241, alpha)` or `rgba(224,26,79, alpha)` for subtle accent fills. Alpha changes are allowed; changing the underlying RGB values or adding another hue is not. Keep the CSS custom properties in `src/App.css` as the source of truth and use those tokens instead of adding new hard-coded colors. This rule also applies to the favicon, native app icons, floating widgets, artwork, and any new screen.

Use pink for the active recording and destructive states. Use blue for interactive focus and selected states. Keep neutral text and surfaces derived from the supplied black and off-white. The favicon, native app icons, floating widgets, artwork, and new UI must follow the same rule.

## Typography

### Font stack

Use the native system sans stack for a crisp desktop feel, with Inter preferred when installed:

```css
Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Use a system monospace stack with tabular numerals for timers and durations:

```css
ui-monospace, SFMono-Regular, monospace
```

### Type scale

| Role | Size | Weight | Examples |
| --- | ---: | ---: | --- |
| Page title | 27 px | 630 | Library heading |
| Detail title | 23 px | 630 | Recording title |
| Brand | 21 px | 680 | Recora wordmark |
| Dialog heading | 21 px | 620 | Recorder setup |
| Section heading | 13 px | 620 | Library sections |
| Body | 10–11 px | 400–550 | Descriptions and metadata |
| UI label | 9–10 px | 550–700 | Buttons, navigation, status |
| Eyebrow / helper | 8–9 px | 600–700 | Uppercase context labels |

Use slightly negative letter spacing only for prominent headings. Keep helper copy readable and avoid making essential instructions smaller than 9 px.

## Layout and components

- Use a 4 px base spacing rhythm, with 8 px increments for common gaps and padding.
- Main window opens at 1200 × 820 px, with a minimum of 800 × 620 px.
- Use 6–8 px radii for controls and cards, 9–14 px for larger panels and dialogs, and a pill shape only for status indicators.
- Primary actions use the blue accent or the black recording surface. Secondary actions use off-white surfaces with a quiet black-alpha border.
- Selected navigation uses a soft blue fill and blue text. Focus uses a visible 3 px blue-alpha outline.
- Keep icons simple and consistent, using a 1.7 px outline stroke at standard sizes.
- The camera bubble, recorder controls, and home button are separate floating windows. They stay above other windows, can be moved, and retain their last position.

## Motion and accessibility

- Use short transitions for hover, selection, and window entry; avoid continuous decorative animation.
- Respect `prefers-reduced-motion`.
- Keep keyboard focus visible, controls labeled for assistive technology, and recording status understandable without color alone.
- Use explicit labels for pause, resume, stop, export, and destructive actions.
