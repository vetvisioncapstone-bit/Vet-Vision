---
name: VET Vision
description: A calm, green, record-book interface for a multi-branch veterinary clinic's analytics, stock and patient work.
colors:
  brand-green: "#2d7a4d"
  leaf-green: "#4caf50"
  success-green: "#1f8a4c"
  forest: "#163a26"
  deep-forest: "#0f2a1a"
  success-tint: "#e4f6e8"
  paper: "#ffffff"
  page-mist: "#f0f4f1"
  panel-mist: "#f9fbfa"
  hairline: "#ececec"
  hairline-strong: "#dfe3e1"
  ink: "#1a1a1a"
  ink-soft: "#45514a"
  ink-muted: "#6b736f"
  ink-faint: "#9aa5a0"
  danger: "#e53935"
  danger-tint: "#fdecea"
  warning: "#b8720a"
  warning-tint: "#fdf1e0"
typography:
  headline:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "28px"
    fontWeight: 700
  title:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  body:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.brand-green}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    rounded: "30px"
    padding: "14px"
  button-primary-hover:
    backgroundColor: "#1e5a3a"
  input:
    backgroundColor: "#fafafa"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "13px 15px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  sidebar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-soft}"
    width: "250px"
---

# Design System: VET Vision

## Overview

**Creative North Star: "The Clinic Ledger"**

VET Vision reads like a well-kept record book for the clinic: white pages on a pale green-grey desk, thin hairlines, and one calm green voice. The owner comes to it to decide what to stock and where, and staff use it at the counter, so it stays orderly, legible and quiet. Warmth comes from soft corners and a friendly green, not from decoration.

The system is flat with hairlines. Structure comes from borders and tint, and shadows appear only when something rises above the page: a modal, a hover, a focused field. Controls are soft and reassuring: rounded corners, a pill primary button, a gentle green glow on focus.

**Key Characteristics:**
- White surfaces on a pale green-grey page (`page-mist`).
- One green family for action, focus and positive state; red and amber only for danger and warning.
- Segoe UI throughout, small and dense for data (13-14px), large only for page titles.
- Corners 8-14px, pill for the main call to action.
- Density suits tables and cards; the customer portal is the airier variant of the same language.

## Colors

One green family on cool, slightly green neutrals. Green means "act" or "good"; nothing else is decorated with it.

### Primary
- **Clinic Green** (#2d7a4d): the primary button, links and key active states.
- **Leaf Green** (#4caf50): hover and accent, chart highlights, and the focus glow (rgba(76,175,80,0.12) ring).
- **Ledger Green** (#1f8a4c): positive figures and success states (about 18 uses).
- **Forest** (#163a26) and **Deep Forest** (#0f2a1a): headings, the skip link and dark surfaces where white text sits.
- **Mint Tint** (#e4f6e8): success backgrounds and badges.

### Neutral
- **Paper** (#ffffff): cards, sidebar, modals, table bodies.
- **Page Mist** (#f0f4f1): the page background behind every card.
- **Panel Mist** (#f9fbfa): quiet inner panels and soft backgrounds.
- **Hairline** (#ececec) and **Strong Hairline** (#dfe3e1): card borders and dividers.
- **Ink** (#1a1a1a), **Soft Ink** (#45514a), **Muted Ink** (#6b736f), **Faint Ink** (#9aa5a0): primary text, secondary text, captions, placeholders and icons. Faint Ink is for icons and decoration only; it is too light for small text.

### Alert
- **Alarm Red** (#e53935) on **Red Wash** (#fdecea): errors, low stock, delete.
- **Caution Amber** (#b8720a) on **Amber Wash** (#fdf1e0): warnings and stale-data notices.

### Named Rules
**The One Voice Rule.** Green is the only brand color. Red and amber carry meaning, never decoration.

**The Tint Not Shadow Rule.** Separate surfaces with a hairline or a mist tint before reaching for a shadow.

## Typography

**Font:** Segoe UI (with Tahoma, Geneva, Verdana, sans-serif). The clinic's PCs are Windows, and the system font stays fast and familiar. The printed patient sheet uses Arial.

**Character:** Plain and functional. Weight and size carry hierarchy; there is no display face.

### Hierarchy
- **Headline** (700, 28px): the page title in each content header.
- **Title** (600, 15-16px): card titles, the primary button label, modal titles.
- **Body** (400, 14px): forms, paragraphs, table cells (13-14px).
- **Label** (600, 12-12.5px): field labels, table headers, badges. Keep the smallest text (11px) for chart axes and captions.

### Named Rules
**The Small Data Rule.** Data screens run at 13-14px. Type above 16px is only for page titles and KPI numbers.

## Layout

An app shell: a fixed 250px sidebar (an off-canvas drawer with an overlay below 900px) beside a scrolling content column on Page Mist. Content is a stack of cards and tables on an 8px rhythm (8, 12, 16, 24). The main breakpoints in use are 1024, 900, 700, 640 and 480px; tables scroll inside their card on narrow screens. Every page has a skip link and a focusable `main`. The customer portal keeps the same colors and shapes with roomier spacing.

## Elevation & Depth

Flat by default. Cards are Paper on Page Mist, edged by a Hairline, so depth is tonal.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 4px 16px rgba(16, 60, 40, 0.06)`): soft green-tinted shadow under cards that respond to hover.
- **Hover raise** (`box-shadow: 0 10px 24px rgba(20, 40, 30, 0.08)`): stat and feature cards on hover.
- **Focus glow** (`box-shadow: 0 0 0 3px rgba(76, 175, 80, 0.12)`): input focus, alongside a Leaf Green border.
- **Modal** (`box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3)`): dialogs over a dimmed backdrop (rgba(20, 30, 25, 0.45)).

### Named Rules
**The Flat-At-Rest Rule.** Surfaces carry no shadow at rest; shadows answer hover, focus or elevation.

## Shapes

Soft, rounded rectangles. Fields and small controls use 8-10px, cards 12-14px, large hero panels 20px, and the main call to action and status badges are pills (999px, or 30px on the login button). Borders are 1px hairlines. There are no sharp corners and no cut or clipped silhouettes.

## Components

### Buttons
- **Shape:** pill (30px radius) for the primary call to action; 8-10px for in-table and toolbar buttons.
- **Primary:** Clinic Green (#2d7a4d) fill, white 16px/600 label, 14px vertical padding; hover darkens to #1e5a3a (white on Leaf Green fails contrast).
- **Secondary / Ghost:** white or transparent with a hairline border and Soft Ink text.
- **Danger:** Alarm Red text or fill for delete and reject actions.
- **Motion:** color and transform transitions of about 0.3s. Hover scale stays small (at most 1.15) and keeps its centering transform. Reduced-motion users get essentially none.

### Inputs / Fields
- **Style:** #fafafa fill, 1px #e6e6e6 border, 10px radius, 13px 15px padding (42px left when an icon sits inside); labels above in Label style.
- **Focus:** Leaf Green border and the 3px focus glow; keyboard focus also shows a 2px Clinic Green outline.
- **Error / Disabled:** error uses Alarm Red border with a Red Wash message; a Caps Lock warning turns the border amber.

### Cards / Containers
- **Corner Style:** 12-14px.
- **Background:** Paper on Page Mist.
- **Border:** 1px Hairline.
- **Shadow Strategy:** none at rest; Card lift on hover only where the card is interactive.
- **Internal Padding:** 16-24px.

### Navigation
- **Sidebar:** Paper, 250px, right hairline, 24px/16px padding. The active item is a solid Clinic Green (#2d7a4d) row with white text; hover nudges an item sideways and pressing scales it slightly. Below 900px it becomes a drawer over a dimmed overlay.

### Stat Cards (signature)
- Paper card, 1px Hairline, **3px Leaf Green top border**, 12px radius, 18px 20px padding, a 13px Muted Ink label above a large figure.
- Alarm Red top border with a soft red edge for low-stock alerts; Caution Amber top border for follow-ups due.
- Hover lifts 4px and adds the Hover raise shadow.

## Do's and Don'ts

### Do:
- **Do** use Clinic Green (#2d7a4d) for the one primary action on a screen.
- **Do** separate surfaces with a Hairline (#ececec) or Page Mist before adding a shadow.
- **Do** keep data text at 13-14px and reserve 28px for page titles.
- **Do** show a visible focus ring on every interactive element (WCAG 2.1 AA).
- **Do** tie every input to a visible label and give icon-only buttons an `aria-label`.
- **Do** say when data is thin or stale, in Caution Amber on Amber Wash.

### Don't:
- **Don't** use Faint Ink (#9aa5a0) or Leaf Green (#4caf50) for text; use #646c68 for secondary text and Clinic Green for green text. Status text on tints: #17693a green, #8a5300 amber, #c62828 red (all ≥4.5:1).
- **Don't** add a second brand hue, gradients or decorative color.
- **Don't** animate `transform` in a keyframe on an element that positions itself with `transform`; the keyframe overrides the centering and the element jumps (the password eye button bug).
- **Don't** use `transition: all`; list the properties that change.
- **Don't** show a control the signed-in role cannot use.
