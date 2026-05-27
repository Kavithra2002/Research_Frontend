# Frontend

A Next.js + TypeScript starter wired up with the default
[shadcn/ui](https://ui.shadcn.com) system, a collapsible sidebar and a
light / dark / system theme switcher powered by
[`next-themes`](https://github.com/pacocoursey/next-themes).

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Components:** shadcn/ui (Base UI variant) + Lucide icons
- **Theming:** `next-themes` (light / dark / system, class-based)

## Getting started

```bash
cd frontend
npm install        # already done if you just cloned this folder
npm run dev        # start the dev server at http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint
```

## Project layout

```
src/
  app/
    layout.tsx          # wraps the app with ThemeProvider
    page.tsx            # sample dashboard page (sidebar + header + cards)
    globals.css         # tailwind + shadcn tokens (light/dark)
  components/
    app-sidebar.tsx     # sample sidebar (menu groups + footer)
    theme-provider.tsx  # next-themes wrapper
    theme-toggle.tsx    # light/dark/system dropdown
    ui/                 # shadcn primitives (button, sidebar, sheet, ...)
  hooks/
    use-mobile.ts
  lib/
    utils.ts
components.json         # shadcn config (added by `shadcn init`)
```

## Adding more shadcn components

```bash
npx shadcn@latest add card table form input ...
```

See the full list at <https://ui.shadcn.com/docs/components>.

## Theming

The theme switcher lives in the top-right of the header and offers
**Light**, **Dark** and **System** modes. The selection is persisted by
`next-themes` and applied as a `class="dark"` on `<html>`, matching the
default shadcn token setup defined in `src/app/globals.css`.
