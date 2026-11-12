# IDMS Frontend

The Next.js workspace includes projects, uploads, legacy analysis/merge/editor workflows and the read-only DOCX extraction inspector. Read [the inspection guide](docs/EXTRACTION_INSPECTION.md), [E9 checkpoint](../idms-backend/IDMS_EXTRACTION_E9_CHECKPOINT.md) and [support matrix](../idms-backend/docs/EXTRACTION_SUPPORT_MATRIX.md). The supported-profile gate passes; broad Word/enterprise fidelity limits remain explicit. Existing editor/merge contracts stay separate.

Copy `.env.example` to `.env.local`, run `npm install`, then `npm run dev`.

Open **Inspect extraction** on a DOCX source/master or in version history. The route pins immutable version and extraction IDs. The configured Neon migration and local deployment are now verified: **http://localhost:9000**. Existing versions are not mass-backfilled; request extraction explicitly. The combined web build includes backend/engine source, while Redis/Celery/dispatcher run separately.

`./run.sh extraction` builds matching images, starts Redis, migrates before starting consumers and runs web/worker/dispatcher without ONLYOFFICE. Back up the intended database before migrations. Startup does not reformat source files. No-argument startup also includes ONLYOFFICE for the existing editing workflow.

Validation: `npm run build`, `npx tsc --noEmit`, then `npm run test:extraction` after installing Chromium with `npx playwright install chromium`. The optional live case requires an explicitly authorized runtime fixture; see the guide. E9 completed on the recorded Sol · High task route; no next task is automatically authorized.
