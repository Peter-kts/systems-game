# systems-game

System Design Lab: a drag-and-drop game for practicing system design interviews (Google/Meta style).

Each level walks through an interview: scope the requirements, do back-of-envelope estimates, build the
architecture from components (load balancers, caches, databases, queues...), then load-test it with a
discrete-event queueing simulation that injects traffic spikes and machine failures. A rule-based review
explains what an interviewer would flag.

## Current state

`prototype/index.html` is the first playable version (Level 1: URL shortener). It is a single
self-contained page with no build step: open it in a browser.

Next step: move to a Vite + React + TypeScript app (React Flow for the board, charts for live metrics)
and add more levels.
