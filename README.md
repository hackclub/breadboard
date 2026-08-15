<a id="readme-top"></a>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Share+Tech+Mono&weight=400&size=34&duration=2600&pause=900&color=BD0F32&center=true&vCenter=true&width=780&height=80&lines=Design+something+real.;Simulate+it.;We+mail+you+the+kit.;You+Ship%2C+We+Ship." alt="Design something real. Simulate it. We mail you the kit.">
</p>

<p align="center">
  <a href="https://nextjs.org/docs">
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16">
  </a>
  <a href="https://react.dev/">
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19">
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5">
  </a>
  <a href="https://tailwindcss.com/">
    <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  </a>
  <a href="https://orm.drizzle.team/">
    <img src="https://img.shields.io/badge/Postgres-Drizzle-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black" alt="Postgres via Drizzle">
  </a>
  <a href="https://fastapi.tiangolo.com/">
    <img src="https://img.shields.io/badge/FastAPI-Compile%20backend-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI compile backend">
  </a>
  <a href="https://bun.sh/">
    <img src="https://img.shields.io/badge/Bun-1.3-FBF0DF?style=for-the-badge&logo=bun&logoColor=black" alt="Bun 1.3">
  </a>
</p>

<div align="center">
  <h3>Breadboard</h3>
  <p>
    <strong>Design a complete breadboard project. We send you the kit to build it.</strong><br />
    The website, the in-browser circuit editor, and the platform behind Breadboard, a Hack Club YSWS program.
  </p>
  <p>
    <strong>Live site:</strong> <a href="https://breadboard.hackclub.com">breadboard.hackclub.com</a><br />
    <a href="https://github.com/hackclub/breadboard">Source</a>
  </p>
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#why-i-made-it">Why I Made It</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li><a href="#quick-start">Quick Start</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

## About The Project

Breadboard is a Hack Club YSWS program (You Ship, We Ship). A teen designs a real breadboard circuit, and a component kit gets mailed to them for free so they can build it.

Design it in the editor, submit the design, a reviewer approves it, we ship the kit, you build it, film a demo, submit again, and get bread to build more cool stuff!

## Why I Made It

Designing a circuit on paper and hoping it works is a bad first experience for someone who has never touched a breadboard. When the design is a circuit that runs, you find your own wiring mistakes before a single part is mailed, and the kit arrives for something you've already seen work. That's why most of this repo is a simulator.

## Built With

Next.js 16 on the App Router with React 19, TypeScript, Tailwind CSS 4, and Bun as the runtime and package manager. Postgres through Drizzle ORM. Auth is Better Auth with Hack Club as the OAuth provider, plus GitHub OAuth for publishing. Feature flags are GrowthBook. Charts are Recharts, the code editor is Monaco, the serial console is xterm, editor state is Zustand, and the 3D board on the landing page is Google's `<model-viewer>`.

The simulator runs in the browser: [avr8js](https://github.com/wokwi/avr8js) for AVR, [rp2040js](https://github.com/wokwi/rp2040js) for the Pico, [ngspice](https://ngspice.sourceforge.io/) compiled to WASM for analog, and [`@wokwi/elements`](https://github.com/wokwi/elements) plus local custom elements for the parts.

`editor-backend/` is a separate FastAPI service that shells out to arduino-cli and ESP-IDF to compile, and to QEMU to emulate the boards that don't run in a browser. Both halves build to Docker images in GitHub Actions and deploy to Hack Club's Orchard. Screenshots and evidence frames go to S3-compatible storage.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.3.6
- Postgres 16, or Docker to run the one in `docker-compose.yml`
- Docker, to compile firmware locally (the editor backend image ships arduino-cli and ESP-IDF)

### Install

```bash
bun install
cp .env.example .env.local
bun run db:migrate
```

`.env.example` documents every variable and what happens when it's blank. Most integrations no-op without credentials, so a useful local install needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, and the Hack Club OAuth pair.

### Run

```bash
bun dev                       # Next.js on http://localhost:3000
bun run editor:backend:docker # compile + emulate backend on :8001
```

The site, the platform, and the schematic side of the editor work without the backend. Compiling and running firmware needs it. ESP32 and Raspberry Pi emulation also needs QEMU libraries, either prebuilt in `editor-backend/prebuilt/qemu` or fetched at image build time with `VELXIO_LICENSE_KEY`.

Everything at once, in containers:

```bash
make up      # postgres + editor backend + next
make logs
make help    # the rest
```

### Checks and Tests

```bash
bun run lint   # Biome
bun run format
bun test       # simulation regression tests
cd editor-backend && pytest   # backend tests (pytest isn't pinned in requirements.txt)
```

Lint with `bun run lint` or the pinned binary in `node_modules`. `npx biome` resolves an ancient version that passes everything.

### Database

```bash
bun run db:generate   # migration from schema changes
bun run db:migrate
bun run db:studio
```

## Contact

Tanishq Goyal - @Tanuki on the Hack Club Slack - [tanishq@hackclub.com](mailto:tanishq@hackclub.com)

Program questions go to [#breadboard](https://hackclub.enterprise.slack.com/archives/C09EB0AE68M).

<p align="right">(<a href="#readme-top">back to top</a>)</p>
