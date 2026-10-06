# Universal ERP Report Import — Any Format, Every Report, Connected Across the App

Distributors export reports from whatever billing software they run, in whatever column layout it produces, and the app understands it — correcting a layout once teaches it permanently. Every recognised report then flows into the live screens it belongs to, instead of sitting in a separate data viewer.

## Who it's for

- **Distributor owners and managers** who keep their real books in Medica Ultimate, Marg, Busy, Tally, Unisolve, Vasu or similar, and need the app to mirror that data without manual re-entry.
- **Field sales staff**, who need the real customer list, each party's credit limit and what they owe before walking into a shop.
- **Delivery staff**, who need the correct outstanding amount to collect against.
- **Pharmacies**, who see accurate stock and their own running balance.

## The two problems being solved

**1. Column layouts differ between every billing software.** Today the importer matches column names against a fixed list of known names. A column it doesn't recognise is dropped silently, and if it can't identify the report type at all, the sheet is skipped with no explanation and no way to correct it. A distributor whose export says `ITM_DESC` instead of `Product Name` gets nothing, with no indication why.

**2. Only stock reaches the app.** Party and ledger reports are already parsed and stored, but they stop at the "My System Data" browser. They don't become customers, credit limits, outstanding balances or statements. The data is in the building but not wired to anything.

## Core features and experience

### Teach-it-once column mapping

- Imports stay **one tap**. When the report format is recognised — either a built-in layout or one this distributor has mapped before — the file imports immediately with no questions.
- A mapping screen appears **only when the app isn't confident**: an unknown export format, or a report type it can't identify. It shows the file's actual columns on one side and the app's fields on the other, with its best guesses pre-filled and unmatched columns marked *Ignored*.
- The report type is also correctable there, for cases where a layout is ambiguous.
- Required fields for each report type are called out, so an unusable mapping can't be saved.
- Saving the mapping stores a **format profile** recognised by that report's column signature. Every later upload of the same format — next month, next quarter — imports silently in one tap.
- Saved profiles are listed in Data Sync, where they can be renamed, edited or deleted when the billing software changes its export.
- A single file containing several reports across multiple sheets is handled sheet by sheet, each with its own type and mapping.

### Every report connected to the screens it belongs to

Reports are brought in priority order. In all cases the data lands where staff already look for it, rather than in a separate viewer:

| Report | Where it shows up in the app |
|---|---|
| **Stock / Item master** | Already live — Stock screen, pharmacy marketplace, order rates *(built)* |
| **Party / Customer master** | Customers screen with credit limit, GST, drug licence, phone, area/route; field sales' assigned-customer lists; auto-linked to a pharmacy's app account when GST or phone matches |
| **Outstanding / Ledger** | Each customer's balance and statement; overdue list; the amount delivery staff collect against; a pharmacy's own balance on their account screen |
| **Batch & Expiry** | Near-expiry alerts, batch-wise stock on each item |
| **Sales / Purchase register** | Past sales history per customer and per item; purchase rates behind margin figures |
| **Company / Manufacturer master** | Browsing and filtering stock by company |

### Imported customers behave like real customers

- A party matched to an existing pharmacy account links to it, so that pharmacy's orders, dues and statements are one continuous record rather than two.
- A party with no app account still works fully as a customer — field sales can take orders for them, and statements and collections work — so the distributor's offline customers aren't second-class.
- Credit limits from the ERP are enforced as a **warning** when an order exceeds the limit, not a hard block, so a sale is never lost to stale data.

### Honest handling of two sources of truth

The ERP knows the history; the app knows the orders placed in it. These are kept visibly separate — an **ERP balance** and **app dues**, with a combined total — so nothing is double-counted and any disagreement is visible rather than hidden inside one ambiguous number.

### A result summary that explains itself

After every import, in plain language: the report type found, how many rows were read, which columns matched, **which columns were ignored**, how many records were added versus updated, and what changed in the app — for example *"412 customers added, 38 linked to pharmacy accounts"* or *"₹12.4L outstanding across 380 parties"*. The same summary is kept in import history, so a month-old import can still be explained.

## User flow

**First time with an unfamiliar export**

1. Owner uploads a CSV/Excel export, or pastes a Drive/Sheets link, in Data Sync.
2. The app reads it and can't confidently place the columns, so it shows the mapping screen with its best guesses.
3. Owner corrects a few columns and confirms. The import runs.
4. The result summary states what was imported and where it now appears. The layout is remembered.

**Every time after that**

1. Owner uploads next month's export — or auto-sync picks it up from the saved Drive link, unattended.
2. It imports in one tap with no questions, because the format is recognised.
3. Stock quantities and rates refresh, new customers appear, balances update, nothing duplicates.

**The payoff downstream**

- Field sales opens a customer and sees their real credit limit, outstanding and buying history.
- Delivery sees the correct amount to collect.
- A pharmacy sees accurate stock and their own balance.

## UI/UX feel

- Matches the existing distributor panel: desktop sidebar on wide screens, bottom tabs on phones.
- The mapping screen is a plain two-column list — the file's column on the left, a dropdown of app fields on the right — readable on a phone, comfortable on desktop. No spreadsheet grid to fight with.
- Guesses are pre-filled and visibly marked as guesses, so the task is reviewing rather than filling in from scratch.
- Ignored columns are stated openly instead of quietly discarded, so nothing disappears without the distributor knowing.
- Import stays a single primary action. The mapping screen is an exception, never a routine step.

## Implementation phases

### Phase 1 — built now

- Confidence-based mapping screen with pre-filled guesses, correctable report type, and required-field checks.
- Saved per-distributor format profiles, recognised automatically on later uploads; manageable in Data Sync.
- **Party / Customer master** imported into the live Customers screen — credit limit, GST, drug licence, phone, area/route — with auto-linking to pharmacy accounts on GST or phone.
- **Outstanding / Ledger** imported into customer balances, statements, the overdue list and the delivery collection amount; visible to the pharmacy on their own account.
- ERP balance and app dues shown separately with a combined total.
- Self-explaining import result summary, including ignored columns, retained in history.
- Repeat imports update in place and never duplicate, including through auto-sync.

### Phase 2

- **Batch & Expiry** import: batch-wise stock on each item, near-expiry alerts and a dated expiry list.
- **Company / Manufacturer master** import: browse and filter stock by company.
- Invite flow to turn an imported offline customer into a logged-in pharmacy account.

### Phase 3

- **Sales / Purchase register** import: per-customer and per-item sales history, purchase rates feeding real margin figures.
- Reorder suggestions from sales history against current stock.
- Multi-report folder sync — one Drive folder holding several reports, picked up unattended on a schedule.

## Assumptions

Decisions made without asking:

- **The mapping screen is an exception, not a step.** Known and remembered formats import in one tap with no screen, honouring the preference for a single action. The screen appears only on low confidence — otherwise "remember the mapping" and "keep it one tap" would contradict each other.
- **No preview before writing.** Imports apply immediately and are explained afterwards, as requested. Repeat imports update in place rather than duplicating, which is what makes this safe without a preview.
- **ERP balances are never silently merged** into app-calculated dues. They are shown side by side with a combined total.
- **Party auto-link order is GSTIN, then phone, then name with city.** A tie or a weak match is left unlinked rather than guessed, since a wrong link merges two businesses' money.
- **Credit limits warn rather than block.** Imported limits can be months old, so a hard block risks refusing a legitimate order.
- **Pharmacies can see their own outstanding balance**, not just the distributor.
- **Format profiles stay private to each distributor.** No mapping or data crosses between distributors. The built-in synonym list continues to improve for everyone.
- **Unmatched columns are kept visible but unused** — reported as ignored, never invented into fields.
- **Common Indian date formats are accepted** (dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy and similar), along with currency symbols, thousands separators and bracketed negatives.
- **Blank or negative stock counts as zero** rather than being rejected.
- **Report titles, totals, page footers and separator rows are skipped**, as they already are for stock.
- **Only CSV and Excel (.xlsx)** are supported, as agreed. Old .xls files prompt a save-as; raw database backups remain out of scope.
- **Large files are processed in batches** so a multi-thousand-row monthly export doesn't strain the server — the same caution that followed the earlier outage.
- Phase 1 covers the first two priorities. The remaining three reports are already ranked and scheduled rather than dropped.
