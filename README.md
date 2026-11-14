# IDMS Frontend

The Next.js workspace includes projects, uploads, legacy analysis/merge/editor workflows and the read-only DOCX extraction inspector. Read [the inspection guide](docs/EXTRACTION_INSPECTION.md), [E9 checkpoint](../idms-backend/IDMS_EXTRACTION_E9_CHECKPOINT.md) and [support matrix](../idms-backend/docs/EXTRACTION_SUPPORT_MATRIX.md). The supported-profile gate passes; broad Word/enterprise fidelity limits remain explicit. Existing editor/merge contracts stay separate.

Copy `.env.example` to `.env.local`, run `npm install`, then `npm run dev`.

Checkboxes reflect each section's actual inclusion, including its heading and own
body. Checking a parent includes its children by default; unchecking a section
removes only that section and keeps checked children. The menu can include all
children, keep only the section's own content, or exclude the complete branch.
There is no indeterminate checkbox state. Sections without children have no menu.

Selecting children never restores unchecked ancestors. Disconnected checked
branches become separate insertion-plan entries in source order, with their own
placement/format controls. This preserves the checked child/grandchild hierarchy
without copying an unchecked parent's heading or body. Multiple pending choices
can be placed together. Use Place, or drag a row/title/button onto a master heading
to insert after it; labelled gaps choose explicit before/after placement. Dragging
an unchecked parent with checked children moves those children without including
the parent. The plan and saved merge summaries describe the actual insertion roots.
Both summaries display included parents, children and grandchildren in an expanded
hierarchy with indentation and branch lines. Exclusions remain separate. Saved
hierarchies use metadata from the pinned source version, including after reload.

Open **Inspect extraction** on a DOCX source/master or in version history. The route pins immutable version and extraction IDs. The configured Neon migration and local deployment are now verified: **http://localhost:9000**. Existing versions are not mass-backfilled; request extraction explicitly. The combined web build includes backend/engine source, while Redis/Celery/dispatcher run separately.

`./run.sh extraction` builds matching images, starts Redis, migrates before starting consumers and runs web/worker/dispatcher without ONLYOFFICE. Back up the intended database before migrations. Startup does not reformat source files. No-argument startup also includes ONLYOFFICE for the existing editing workflow.

Validation: `npm run build`, `npx tsc --noEmit`, then `npm run test:extraction` after installing Chromium with `npx playwright install chromium`. The optional live case requires an explicitly authorized runtime fixture; see the guide. E9 completed on the recorded Sol · High task route; no next task is automatically authorized.

### Local backend deployment

The `web` service reads the backend's private local settings and mounts
`../idms-backend/storage/objects` at `/data/objects`. Set
`IDMS_LOCAL_DATABASE_URL` in `.env.local` to the Docker-network PostgreSQL URL;
keep credentials private. Start the backend's `postgres` service and initialize
its schema before starting this stack. Uploads use the existing same-origin API
proxy; filesystem mode returns signed `/api/v1/storage/objects` URLs. Existing
external S3 upload URLs remain supported by the same client.
