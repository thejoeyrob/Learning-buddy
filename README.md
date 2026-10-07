# Nova Learning Studio — Grade 5

A separate, single-learner Grade 5 home-learning PWA. This is **not** a replacement or fork of Shrubbery Showdown; it is a new learning product with its own interface, teacher mascot and progress model.

## What is included

- Personal learner setup: first name, optional learner PIN, required parent PIN.
- Personal greeting from the learner name on every sign-in and home screen.
- Parent-only dashboard behind the parent PIN.
- Seven subject choices:
  - Mathematics
  - English Language Arts
  - Science
  - Social Studies
  - Computer Science & STEM
  - Health & Wellbeing
  - Creative Arts
- Three activity types for every subject:
  - **Learning module** — short concept teaching with knowledge checks and hints.
  - **Guided lesson** — longer teach/example/check cycle with repeated knowledge checks and hints.
  - **Quiz / test** — 10 questions, no hints, score and review at the end.
- 11,000+ on-device questions / variants, including 5,000+ mathematics questions and the supplied current-school focus standards 5.M.4, 5.M.5, 5.NS.1, 5.CA.1 and 5.CA.2.
- Current-school-focus quiz for the supplied ILEARN-style math practice.
- Mistake-aware and weak-strand-aware question selection.
- Child progress page kept deliberately simple.
- Parent dashboard with session totals, study time, 7-day activity chart, subject accuracy, weak learning strands, curriculum coverage and teaching-resource references.
- JSON backup / restore and CSV session export.
- Offline service worker and installable PWA manifest.
- Original rendered Ms. Nova teacher mascot plus original subject illustration assets.

## Curriculum basis

The core academic structure is based on Indiana Grade 5 expectations and current IDOE subject domains. Lesson text and questions are original. Public teaching resources were used to inform lesson structure and learning activities, including Indiana Department of Education standards / ILEARN resources, NASA STEM resources for Earth systems, and National Archives education materials for civics / primary-source thinking.

The supplied `Grade_5_ILEARN_Math_Practice_Gaughan.pdf` is retained as a targeted school-focus area inside Mathematics rather than being treated as the whole Grade 5 curriculum.

## Progress / login model

This build is intentionally **local-first** so it remains a flat static PWA. The learner profile, hashed PIN references and progress data are stored in the browser on the device. The parent dashboard contains a full JSON backup/export and restore function for moving or safeguarding progress.

This is not a cloud account system. If cross-device login/synchronisation is wanted later, add a backend such as Supabase and replace the local profile store with authenticated cloud persistence.

The PIN gate prevents casual access inside the app; it should not be treated as strong device security.

## Deployment

Upload the contents of this folder to the root of a static host such as GitHub Pages or Vercel. Do not upload the enclosing folder as another nested application directory.

Main files:
- `index.html`
- `styles.css`
- `app.js`
- `curriculum.js`
- `question-bank.js`
- `extras.js`
- `math-extras.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/`

For service-worker installation and offline caching, serve through HTTPS (localhost is also accepted by browsers for development).
