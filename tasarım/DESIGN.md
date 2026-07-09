---
name: Cinematic Terminal
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#383939'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#292a2a'
  surface-container-highest: '#343535'
  on-surface: '#e3e2e2'
  on-surface-variant: '#d9c2b9'
  inverse-surface: '#e3e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#a18c85'
  outline-variant: '#53433d'
  surface-tint: '#ffb598'
  primary: '#ffc7b1'
  on-primary: '#552007'
  primary-container: '#f8a380'
  on-primary-container: '#74371c'
  inverse-primary: '#8f4c30'
  secondary: '#c8c6c5'
  on-secondary: '#303030'
  secondary-container: '#474746'
  on-secondary-container: '#b7b5b4'
  tertiary: '#8be2df'
  on-tertiary: '#003736'
  tertiary-container: '#6fc6c3'
  on-tertiary-container: '#005250'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb598'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#72361b'
  secondary-fixed: '#e4e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#9af2ee'
  tertiary-fixed-dim: '#7ed5d2'
  on-tertiary-fixed: '#00201f'
  on-tertiary-fixed-variant: '#00504e'
  background: '#121414'
  on-background: '#e3e2e2'
  surface-variant: '#343535'
typography:
  display-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 48px
  container-max: 1440px
---

## Brand & Style
The design system is built for a high-performance film acquisition utility. The brand personality is efficient, technical, and cinematic, merging the raw utility of a developer environment with the immersive quality of modern film. It targets power users who value speed, metadata precision, and a "low-light" interface that prioritizes content over chrome.

The visual style is **Minimalist-Technical**. It utilizes a dark-mode-first approach with high-contrast accents and terminal-inspired elements (monospaced fonts, prompt-like headers) to create a sense of direct control. The emotional response is one of focus and "underground" sophistication, avoiding the generic polish of mainstream streaming platforms in favor of a curated, tool-based aesthetic.

## Colors
The palette is optimized for OLED displays and low-light environments. 
- **Primary (#F8A380):** A vibrant, desaturated orange used strictly for high-priority actions, active states, and progress indicators. It serves as the "execution" color.
- **Background (#0C0C0C):** The base canvas, providing a near-black environment that makes movie posters and the primary accent pop.
- **Surface (#1A1A1A):** Used for cards, containers, and navigation bars to provide subtle depth without traditional shadows.
- **Neutrals:** Grays are utilized for secondary information, metadata, and inactive icons to maintain a strict visual hierarchy.

## Typography
The system employs a dual-font strategy:
1. **Hanken Grotesk:** A sharp, contemporary sans-serif used for all functional UI elements, movie titles, and body copy. It provides readability and a modern "SaaS" feel.
2. **JetBrains Mono:** A technical monospaced font used for the logo, technical metadata (file size, resolution, bitrates), and terminal-style prompts.

**Logo Treatment:** The logo should always be rendered as `>_ [name].` in JetBrains Mono, suggesting a command-line interface prefix.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a focus on high-density information. 
- **Desktop:** A 12-column grid with 24px gutters. Content is centered with a max-width of 1440px.
- **Mobile:** A 4-column grid with 16px margins. 
- **Spacing Rhythm:** Based on a 4px baseline. Use 16px (4 units) for standard grouping and 32px (8 units) for section separation.

Layouts should prioritize horizontal scrolling for categories and vertical stacking for search results and technical logs.

## Elevation & Depth
In this design system, depth is conveyed through **Tonal Layering** rather than shadows. 
- **Level 0 (Background):** #0C0C0C for the main application canvas.
- **Level 1 (Surface):** #1A1A1A for cards, navigation sidebars, and header bars.
- **Level 2 (Active/Overlay):** #262626 for hover states, modal windows, and tooltips.

Separation is reinforced with **Low-contrast outlines** (1px solid #333) rather than drop shadows to maintain a flat, technical aesthetic. Interactive elements use the Primary color to "glow" or pop from the dark surfaces.

## Shapes
The shape language is primarily **Soft (4px - 8px)** to maintain a disciplined, professional appearance. 
- **Standard UI elements:** 4px (rounded-sm) for inputs and small cards.
- **Interactive Buttons:** Pill-shaped (fully rounded) to contrast against the rigid grid of movie posters.
- **Media Containers:** Movie posters use a 4px corner radius to soften the edges of photography without appearing "bubbly."

## Components
- **Buttons:** Primary buttons are pill-shaped, filled with #F8A380 and black text. Ghost buttons use #F8A380 for the border and text.
- **Movie Cards:** Vertical 2:3 aspect ratio posters. The title and star rating are placed on a semi-transparent gradient overlay at the bottom or immediately below the poster in #A0A0A0.
- **Chips/Status:** Used for file formats (e.g., "4K", "HDR", "HEVC"). These should use JetBrains Mono in small caps with a subtle #262626 background.
- **Input Fields:** Flat #1A1A1A background with a 1px border. On focus, the border changes to #F8A380 and a blinking underscore cursor is used to mimic a terminal.
- **Progress Bars:** Thin 2px lines. The background is #262626 and the fill is the primary #F8A380.
- **Download Queue:** A list-based component using monospaced text for speeds (e.g., `12.4 MB/s`) and estimated time remaining.