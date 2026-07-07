---
name: Kinetic Industrial
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#e6beb2'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#ad897e'
  outline-variant: '#5c4037'
  surface-tint: '#ffb59e'
  primary: '#ffb59e'
  on-primary: '#5e1700'
  primary-container: '#ff571a'
  on-primary-container: '#521300'
  inverse-primary: '#ae3200'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#c8c6c5'
  on-tertiary: '#313030'
  tertiary-container: '#929090'
  on-tertiary-container: '#2a2a2a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59e'
  on-primary-fixed: '#3a0b00'
  on-primary-fixed-variant: '#852400'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474746'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-xl:
    fontFamily: Anybody
    fontSize: 120px
    fontWeight: '800'
    lineHeight: 110px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Anybody
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Anybody
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 36px
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
spacing:
  unit: 4px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  container-max-width: 1440px
---

## Brand & Style

This design system is built for a high-performance FilmDownloader utility, emphasizing efficiency, speed, and technical precision. The brand personality is **utilitarian, industrial, and high-tech**. It aims to evoke a sense of professional-grade tooling through a high-contrast aesthetic.

The visual style blends **Brutalism** with **Modern Minimalism**. It utilizes heavy-weight typography, a strict monochromatic base with a singular high-energy accent, and structured, grid-based layouts. The interface should feel like an industrial dashboard—functional, raw, and unapologetically digital.

## Colors

The palette is anchored in a deep, "Void Black" environment to reduce eye strain during long sessions and emphasize the cinematic nature of the content. 

- **Primary (Vivid Orange):** Reserved for critical actions, progress indicators, and active states. It represents the "energy" of the download process.
- **Secondary (High White):** Used for primary text and high-contrast borders to ensure absolute legibility.
- **Neutrals (Carbon & Slate):** Used for surface layering and container backgrounds.
- **Functional Colors:** Success states use a technical green (#00FF41), while errors use the primary orange but with increased saturation or blinking patterns.

## Typography

Typography is the primary driver of the industrial aesthetic. We use **Anybody** for headlines to provide a variable, "heavy-duty" feel that mimics industrial signage. 

**JetBrains Mono** is utilized for data-driven elements—file sizes, bitrates, and paths—to reinforce the technical nature of the application. **Space Grotesk** serves as the functional bridge for navigation and UI labels, offering a futuristic but highly readable geometric structure.

Headlines should often be used in lowercase with a trailing period (e.g., `downloading.`) to mirror the provided visual reference.

## Layout & Spacing

The layout follows a **Fixed Grid** system inspired by technical blueprints. A 12-column grid is used for desktop, with generous outer margins to focus the user’s eye on the central "action zone."

- **Grid:** 12 columns (Desktop), 4 columns (Mobile).
- **Rhythm:** All spacing is derived from a 4px base unit. 
- **Alignment:** Elements should favor hard-left alignment for a structured, editorial look.
- **Reflow:** On mobile, side-by-side cards stack vertically, and the "Display" type scales down significantly to maintain the architectural balance without overflowing.

## Elevation & Depth

This system rejects traditional shadows in favor of **Tonal Layers** and **Bold Borders**. 

Depth is achieved through:
- **Surface Tiering:** Background is `#0F0F0F`. Primary cards are `#1A1A1A`. Hover states slightly lighten the surface to `#252525`.
- **Hard Outlines:** Instead of soft shadows, use 1px or 2px solid borders in `#FFFFFF` (10-20% opacity) to define boundaries.
- **Z-Index Overlays:** High-priority modals use a thick, solid 4px primary orange border to "force" themselves to the front of the visual hierarchy.
- **Zero Blur:** There are no blurs in this system. Every edge is sharp and definitive.

## Shapes

The shape language is strictly **Sharp (0px roundedness)**. 

To maintain the industrial/technical aesthetic, all buttons, input fields, and card containers must have 90-degree corners. This creates a "machined" look. The only exception is for circular status pips or specific iconography. Decorative "notches" (clipped corners) can be used on primary cards to suggest a high-tech "ID card" or "component" feel.

## Components

### Buttons
- **Primary:** Solid primary orange background, black text, bold uppercase JetBrains Mono. No border.
- **Secondary:** Transparent background, 2px white border, white text.
- **Ghost:** White text only, underline on hover.

### Cards (Film Items)
- Rectangular containers with high-contrast imagery.
- Data overlays use monospaced fonts in the corners.
- Progress bars are embedded at the very bottom edge of the card, appearing as a 4px tall solid orange line that grows from left to right.

### Input Fields (Advanced Search)
- Large, full-width boxes with a 1px white border. 
- Placeholder text in low-opacity monospaced font. 
- On focus, the border turns primary orange and a vertical "scanning" line animation pulses briefly.

### Process Monitoring
- Vertical lists of active downloads.
- Each row features a large technical ID (e.g., `PROC_001`) in Anybody font.
- Real-time bitrates displayed in JetBrains Mono.
- Status indicators use "active" vs "idle" visual logic (solid orange vs hollow border).

### Chips & Tags
- Rectangular boxes with 1px borders.
- Used for file formats (MKV, MP4) and resolutions (4K, 8K).