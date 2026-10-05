# systems-game

System Design Lab: a drag-and-drop game for practicing system design interviews (Google/Meta style).

Pick a system from the select screen (grouped by difficulty: URL shortener, rate limiter, more coming). Each walks through an interview: scope the requirements, do back-of-envelope estimates, build the
architecture from components (load balancers, caches, databases, queues...), then load-test it with a
discrete-event queueing simulation that injects traffic spikes and machine failures. A rule-based review
explains what an interviewer would flag.

Play it at https://peter-kts.github.io/systems-game/ (deployed from `main` by `.github/workflows/pages.yml`).

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # simulation calibration tests, one file per system
npm run build    # static site in dist/ (relative paths, host anywhere)
```

## Layout

| Path | What lives there |
| --- | --- |
| `src/game/` | Component catalog, review helpers, explainer visuals |
| `src/game/levels/` | One file per system (`urlShortener.ts`, `rateLimiter.ts`): scope, estimates, scenarios, review rules, reference design. `index.ts` lists them, plus the locked "coming soon" ones |
| `src/sim/` | Queueing simulation engine and metrics. Pure TypeScript, no UI, covered by tests |
| `src/store/` | Zustand stores: the saved game with progress per system (`game.ts`) and the live simulation loop (`sim.ts`) |
| `src/features/` | The system select screen, then one folder per step: scope, estimate, build (React Flow board, panels, charts), debrief |
| `src/components/ui/` | Small shadcn-style components built on Radix |
| `prototype/` | The original single-file prototype, kept for reference |

Built with Vite, React, TypeScript, React Flow, Recharts, Tailwind CSS, Radix, Lucide and Motion.
Progress is saved in the browser's local storage.
