# Portfolio Design System

## Visual Theme
Vercel-inspired monochrome precision. Near-black background, pure white text, no decorative elements. Content is the design. Single-page with tab navigation — no scrolling between sections.

## Color Palette
- Background: `#0a0a0a`
- Surface: `#141414`
- Surface Hover: `#1a1a1a`
- Border: `#262626`
- Text Primary: `#fafafa`
- Text Secondary: `#a1a1a1`
- Text Tertiary: `#666666`
- Accent: `#fafafa` (white — links and active states)
- Accent Muted: `#888888`

## Typography
- Font: Geist Sans (headings + body), Geist Mono (code, dates, tech tags)
- Heading: 20px, font-medium, tracking -0.025em
- Body: 14px, font-normal, leading-relaxed
- Caption: 12px, text-secondary, font-mono
- NO bold headings larger than 24px. This is a portfolio, not a landing page.

## Layout
- Max width: 640px, centered. Like a document.
- Padding: 24px horizontal on mobile, 0 on desktop (centered content handles it)
- Tab bar: sticky top, minimal underline indicator
- Sections within tabs: separated by 32px vertical space

## Components
- Tabs: text-only, no background. Active = white text + 2px bottom border. Inactive = text-secondary.
- Cards: NO cards. Use flat lists with subtle bottom borders.
- Tags/chips: font-mono, text-xs, px-2 py-0.5, bg-surface, rounded-md, border
- Links: text-secondary, underline on hover only
- Transitions: 150ms ease on color/opacity only. No layout animations.

## Anti-Patterns
- No hero sections with giant text
- No gradient backgrounds
- No card grids with shadows
- No "wave to say hi" emoji energy
- No profile photo (unless explicitly requested)
- No hamburger menus
- No scroll-triggered animations
