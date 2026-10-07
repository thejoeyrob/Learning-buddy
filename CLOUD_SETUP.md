# Learning Buddy — connected parent/child setup

The PWA is wired for cross-device parent→child assignments. It needs a dedicated Supabase project before two separate phones can sync.

1. Create a Supabase project.
2. In its SQL editor, run `supabase-schema.sql` once.
3. Put the project URL and **publishable/anon browser key** into `cloud-config.js`. Never put a secret/service-role key in this public PWA.
4. Deploy every file in this ZIP to the same web root.
5. Parent phone: choose **Parent device**, create the learner, then use the Family Code + temporary Link Code.
6. Learner device: choose **Learner device** and enter those codes once.
7. From then on, the parent sets today’s lesson/task. The learner opens directly to the welcome, parent note and one Start button. Completion and progress sync back.

The SQL blocks direct table access with RLS. The browser uses only the limited capability-token RPC functions.
