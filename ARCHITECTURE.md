# Architecture rules

## Size limits

- `app.js` is the UI coordinator. It must not grow beyond 500 physical lines.
- A module in `modules/` must be no larger than 400 lines.
- A pure utility module should normally stay below 250 lines.
- A feature gets its own module when it owns a domain, browser API, storage format, or has more than one rendering/event function.

`npm test` verifies the hard limits before executing unit tests.

## Test-first extraction

1. Add or extend a test that documents the existing behavior.
2. Extract the code without changing its public behavior.
3. Run all tests.
4. Publish only after the complete suite passes.

## Extraction order

1. Receipt parser and camera scanner: complete.
2. Dates, CSV, operations, balances, filters and categories: complete.
3. Cloud synchronization, Google Drive API and encryption: complete.
4. `app.js`: state, DOM event wiring and rendering only: complete.

## Application context

`modules/app-context.js` is the sole shared boundary for UI controllers. It contains:

- `state` and `elements` references;
- JSON storage access and storage-key names;
- named callbacks through `actions.register(name, handler)` and `actions.call(name, ...args)`.

Controllers own their screen area and must not call one another directly. Cross-feature work goes through a named context action. This keeps browser APIs, cloud access, forms and rendering independently testable.

## UI controllers

- `app-ui-controller.js`: primary toolbar and open/close state.
- `filter-controller.js`: search, category/type/date filters, period drag selection and chart visibility.
- `receipt-share-controller.js`: Web Share Target queue, QR recognition and camera scanner.
- `data-actions-controller.js`: local reset, CSV import/export, cloud action state and pending-upload markers.
- `cloud-controller.js`: Google OAuth, encrypted payloads and Google Drive upload/download.
- `reader-access-controller.js`: reader connection links and Google Drive permissions.

Existing list, category-picker, quick-add and settings-view modules remain focused on their respective components. Every controller is precached by `sw.js`, so the app shell still opens without a network connection.
