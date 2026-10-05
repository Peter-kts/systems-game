# systems-game

System Design Lab: a drag-and-drop game for practicing system design interviews (Google/Meta style).

Each level walks through an interview: scope the requirements, do back-of-envelope estimates, build the
architecture from components (load balancers, caches, databases, queues...), then load-test it with a
discrete-event queueing simulation that injects traffic spikes and machine failures. A rule-based review
explains what an interviewer would flag.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # simulation calibration tests
npm run build    # static site in dist/ (relative paths, host anywhere)
```

## Layout

| Path | What lives there |
| --- | --- |
| `src/game/` | Component catalog, level content (`levels/urlShortener.ts`), design review rules, explainer visuals |
| `src/sim/` | Queueing simulation engine and metrics. Pure TypeScript, no UI, covered by tests |
| `src/store/` | Zustand stores: the saved game (`game.ts`) and the live simulation loop (`sim.ts`) |
| `src/features/` | One folder per step: scope, estimate, build (React Flow board, panels, charts), debrief |
| `src/components/ui/` | Small shadcn-style components built on Radix |
| `prototype/` | The original single-file prototype, kept for reference |

Built with Vite, React, TypeScript, React Flow, Recharts, Tailwind CSS, Radix, Lucide and Motion.
Progress is saved in the browser's local storage.
