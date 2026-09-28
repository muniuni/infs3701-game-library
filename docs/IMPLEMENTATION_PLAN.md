# IMPLEMENTATION_PLAN.md

## Phase 1: scaffold

1. Create the Next.js app with TypeScript.
2. Configure Tailwind CSS and shadcn/ui.
3. Add Jersey 10 and Manrope.
4. Add the dark-theme design tokens from `DESIGN.md`.
5. Create the `Game` types and validation rules.

## Phase 2: in-memory backend

1. Define a `GameRepository` interface.
2. Implement `InMemoryGameRepository`.
3. Add seed games for development.
4. Add CRUD route handlers.
5. Validate:
   - required title
   - rating integer 1-10
   - non-negative playtime
   - valid status
   - arrays for platforms and tags

Do not add SQLite, EBS, or S3 yet.

## Phase 3: core UI

1. Build the Home shell and toolbar.
2. Build Grid view.
3. Build List view.
4. Build Kanban view.
5. Add title search.
6. Add status/platform/tag/rating filters.
7. Add sorting.
8. Add empty states.

## Phase 4: game dialogs

1. Build `Add Game` dialog.
2. Build game detail dialog.
3. Add edit mode inside the detail dialog.
4. Add delete confirmation.
5. Add cover-source controls:
   - placeholder
   - external URL
   - upload UI placeholder for later S3 work
   - API image when metadata autofill exists

For the in-memory version, uploaded images do not need final persistent storage behavior yet.

## Phase 5: Kanban behavior

1. Add drag-and-drop.
2. Update status on drop.
3. Persist through the normal update endpoint.
4. Handle failed updates by restoring the previous state.

## Phase 6: responsive and polish

1. Verify desktop layout.
2. Make Grid responsive.
3. Make List compact on mobile.
4. Add horizontal Kanban scrolling.
5. Make dialogs viewport-safe.
6. Add loading, error, and confirmation states.
7. Check keyboard and focus behavior.

## Phase 7: EC2 deployment

1. Provision a small EC2 instance.
2. Install the runtime and app dependencies.
3. Deploy and build the Next.js app.
4. Run the production server.
5. Allow required HTTP traffic in the security group.
6. Verify CRUD through the public EC2 address.
7. Capture screenshots and implementation evidence for the assignment.

At this stage, restarting the app may reset the library. That is expected.

## Phase 8: persistent storage

After the deployed in-memory version is stable:

1. Add SQLite.
2. Implement `SqliteGameRepository`.
3. Store the SQLite database on EBS-backed storage.
4. Migrate CRUD to the SQLite repository.
5. Add S3 upload support for user-uploaded covers.
6. Store S3 cover references in SQLite.
7. Verify persistence across process and EC2 restarts.

## Phase 9: optional metadata autofill

1. Add server-side RAWG integration.
2. Add game search in the Add/Edit dialog.
3. Let users preview an API match.
4. Autofill selected metadata.
5. Keep every imported field editable.
6. Preserve manual entry when RAWG is unavailable.

## Phase 10: assignment-specific improvements

After Weeks 3-4 material is available:

1. Select three justified Going Beyond topics.
2. Implement each only if it solves a real architectural concern.
3. Record screenshots and configuration evidence.
4. Update the assignment design document with the reason for each choice.
