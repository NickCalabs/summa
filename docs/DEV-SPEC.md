# Summa — Development Spec (v0.1)

> Reference: `kubera-replacement-spec.md` for full product spec.

## PRIORITY ORDER FOR AGENTS

**NOTHING else matters until Tier 1 is complete.**

### Tier 1: Core CRUD (CRITICAL)
1. Add/edit/delete sections
2. Add/edit/delete assets (manual)
3. Inline cell editing (value, quantity, price)
4. Sheet CRUD (add/rename/delete tabs)
5. Asset reorder, move between sections

### Tier 2: Core UX
6. Empty states with CTAs
7. Loading skeletons
8. Error toasts (sonner)
9. Detail panel (slide-out on asset click)
10. Optimistic updates on all mutations

### Tier 3: Data
11. Net worth header recomputes live
12. Charts render with snapshot data
13. Ticker search in add-asset dialog
14. Price refresh cron works
15. Daily snapshot cron works

### Tier 4: Polish (ONLY after Tier 1-3 work)
16. Mobile responsive
17. Dark mode verification
18. Keyboard navigation (Tab between cells)
19. Confirm dialogs on destructive actions
20. Landing page

## Key Architecture Decisions
- TanStack Query for ALL data fetching + optimistic updates
- Zustand for UI-only state (active sheet, panel open, collapsed sections)
- All money as `numeric` — never floats
- Portfolio tree fetched in one query: GET /api/portfolios/[id]
- Debts are assets on debt-type sheets (positive values, subtracted for net worth)
