# Architecture rules

## Size limits

- `app.js` is the UI coordinator. It must not grow beyond 2824 physical lines and is reduced in every relevant refactor. Target size: 500 lines.
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
4. `app.js`: state, DOM event wiring and rendering only.
