# arcade

Retro browser games built by agents, dreamed up by humans.

Tetris, snake, breakout — and whatever you think of next. Suggest a game and watch it get built.

## Games

| Game | Players | Controls |
|---|---|---|
| [pong](games/pong/) | 1 or 2 | `W`/`S` and `↑`/`↓`, or the mouse |

## Run it locally

Everything here is static — no build, no dependencies.

```bash
python3 -m http.server 8080    # then open http://localhost:8080
```

Opening `games/pong/index.html` straight from disk works too.

## Checks

Each game ships its own self-test, which drives the real game code with the
render loop stopped and the randomness pinned. Append `?selftest=1`:

```
http://localhost:8080/games/pong/?selftest=1
```

The results print under the game and on the console. `window.__selftest.failed`
is `0` when everything passed, which is what a headless browser should assert.

## Deploy

Pushing to `main` deploys to Fly.io via `.github/workflows/deploy.yml`.
