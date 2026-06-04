# Purity menu order + open trips inside DESK shell

## 1. Sidebar order
In `src/routes/swap/dashboard.tsx`, reorder `NAV_ITEMS` so Purity comes **after** Clients:

```
dashboard → clients → swap-fees → purity → margin → premium → reports → audit → users → settings
```

(Only the array order changes — keys, labels, icons, permission gating untouched.)

## 2. Open trip detail inside the DESK shell

Today, clicking a trip in Purity navigates to `/purity/trips/$tripId`, which renders `src/routes/purity/trips.$tripId.tsx` with its own `PurityDetailHeader` + `PurityFooter` — i.e. outside the ATHER DESK shell. We move trip details into the shell.

### a. New shell route
Create `src/routes/desk.app.purity.trips.$tripId.tsx`:
- `createFileRoute("/desk/app/purity/trips/$tripId")`
- Renders `<SwapDashboard tab="purity" purityTripId={tripId} />`

### b. Extend `SwapDashboard`
- Add optional prop `purityTripId?: string`.
- Pass it down: `<PurityDashboard inShell tripId={purityTripId} />`.

### c. Extend `PurityDashboard` (in `src/routes/purity/dashboard.tsx`)
- Accept new optional `tripId?: string` prop.
- When `tripId` is provided AND `inShell`, render the trip-detail body (TripHeaderEditor + BarsManager + TripTotals + ClientBreakdown + settle/reopen/delete controls + "All trips" back link) directly in the shell content area, instead of the trips list / tabs. No separate header/footer — the DESK shell provides those.
- Extract the body of `TripDetailPage` (from `src/routes/purity/trips.$tripId.tsx`) into a reusable internal component `TripDetailInline` inside `dashboard.tsx` so both the legacy route and the in-shell route can render the same UI. The legacy standalone route is being removed (see step e), so practically only the inline version remains.
- Back navigation (the "All trips" link and post-delete redirect) goes to `/desk/app/purity`.

### d. Update all trip links/navigations
In `src/routes/purity/dashboard.tsx`, change every:
- `navigate({ to: "/purity/trips/$tripId", ... })`
- `<Link to="/purity/trips/$tripId" ... />`

to target `/desk/app/purity/trips/$tripId` instead. (3 sites: line ~600, ~871, ~2023.)

### e. Legacy redirect
Replace `src/routes/purity/trips.$tripId.tsx` body with a `LegacyDeskRedirect` so old deep links land in the shell:
```tsx
<LegacyDeskRedirect signedInTo={`/desk/app/purity/trips/${tripId}`} />
```
(Read `tripId` from route params and pass it; extend `LegacyDeskRedirect` only if it doesn't already support dynamic targets — otherwise inline a tiny wrapper that calls `navigate` with the param.)

## 3. Files touched
- `src/routes/swap/dashboard.tsx` — reorder NAV_ITEMS; add `purityTripId` prop; forward to PurityDashboard.
- `src/routes/purity/dashboard.tsx` — accept `tripId` prop; render inline trip detail when set; update 3 link/navigate sites to `/desk/app/purity/trips/$tripId`.
- `src/routes/desk.app.purity.trips.$tripId.tsx` — **new** route file.
- `src/routes/purity/trips.$tripId.tsx` — replace with legacy redirect to the new shell URL.

## 4. Verification
- Sidebar order shows: Dashboard, Clients, Swap Fees, Purity, Margin, … 
- In Purity, click any trip → URL becomes `/desk/app/purity/trips/<id>` and the trip opens with the ATHER DESK sidebar + header still visible.
- Old `/purity/trips/<id>` links redirect into the shell.
- Delete-trip and "All trips" back link return to `/desk/app/purity`.
