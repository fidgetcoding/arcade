// selftest.js — load the game with ?selftest=1 to run it.
//
// No build step and no dependencies: the checks drive the same code the game
// runs, through the window.pong handle, with the render loop stopped and the
// randomness pinned so every run is identical. Results land in the page, in
// the console, and on window.__selftest for a headless browser to read.
(() => {
    'use strict';

    const pong = window.pong;
    const CFG = pong.CFG;
    const results = [];
    let passed = 0;
    let failed = 0;

    function check(name, fn) {
        try {
            const detail = fn();
            passed += 1;
            results.push({ name, ok: true, detail: detail || '' });
        } catch (err) {
            failed += 1;
            results.push({ name, ok: false, detail: err && err.message ? err.message : String(err) });
        }
    }

    function assert(cond, msg) {
        if (!cond) throw new Error(msg);
    }
    function near(a, b, tol, msg) {
        assert(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', wanted ~' + b + ')');
    }

    // Deterministic but not uniform: a fixed-seed generator, so serves vary
    // the way they do in play and every run of this file is still identical.
    // A constant would send every serve dead straight down the middle and the
    // rally would never end.
    let seed = 0x9e3779b9;
    function seeded() {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    pong.setRandom(seeded);
    pong.silence();
    pong.stopLoop();

    const CENTRE_PADDLE = (CFG.H - CFG.PADDLE_H) / 2;
    const LEFT_FACE = pong.LEFT_FACE;
    const RIGHT_FACE = pong.RIGHT_FACE;

    function sim(seconds, watch) {
        const chunk = 0.05;
        let left = seconds;
        while (left > 1e-9) {
            const dt = Math.min(chunk, left);
            pong.advance(dt);
            left -= dt;
            if (watch) watch();
        }
    }

    function freshMatch(players) {
        pong.setPlayers(players);
        pong.newMatch();
        pong.setPaddles(CENTRE_PADDLE, CENTRE_PADDLE);
    }

    // A clean "ball is live" fixture: in play, paddles centred, chosen vector.
    // The finite check is here on purpose — a typo in a fixture value used to
    // put NaN in the ball and the checks downstream read as mysterious misses.
    function live(x, y, vx, vy) {
        assert([x, y, vx, vy].every(Number.isFinite), 'this check set up the ball with a non-finite value');
        pong.setState('playing');
        pong.setPaddles(CENTRE_PADDLE, CENTRE_PADDLE);
        pong.setBall(x, y, vx, vy);
    }

    function inCourt() {
        const b = pong.ball;
        assert(Number.isFinite(b.x) && Number.isFinite(b.y), 'ball position went non-finite');
        assert(b.y >= CFG.BALL_R - 1e-6 && b.y <= CFG.H - CFG.BALL_R + 1e-6,
            'ball left the court vertically at y=' + b.y);
        assert(b.speed <= CFG.SPEED_MAX + 1e-6, 'ball exceeded the speed ceiling: ' + b.speed);
    }

    // ------------------------------------------------------------------ boot
    check('boots into the menu with a 0-0 score', () => {
        assert(pong.state === 'menu', 'expected menu, got ' + pong.state);
        assert(pong.score.left === 0 && pong.score.right === 0, 'score did not start at 0-0');
    });

    check('Space starts a match: serve waits, then the ball launches', () => {
        pong.setPlayers(1);
        pong.start();
        assert(pong.state === 'serving', 'expected serving, got ' + pong.state);
        assert(pong.ball.vx === 0 && pong.ball.vy === 0, 'ball moved before the serve');
        sim(CFG.SERVE_DELAY + 0.05);
        assert(pong.state === 'playing', 'expected playing after the serve delay, got ' + pong.state);
        assert(pong.ball.vx !== 0, 'ball has no horizontal speed after launch');
        near(Math.hypot(pong.ball.vx, pong.ball.vy), CFG.SPEED_MIN, 1, 'serve speed');
        return 'serve delay ' + CFG.SERVE_DELAY + 's';
    });

    // --------------------------------------------------------------- paddles
    check('W and S drive the left paddle and stop at the walls', () => {
        freshMatch(1);
        const start = pong.paddles.left;
        pong.setKey('w', true);
        sim(0.2);
        pong.setKey('w', false);
        const up = pong.paddles.left;
        assert(up < start, 'W did not move the paddle up');
        near(start - up, CFG.PADDLE_SPEED * 0.2, 2, 'paddle travel over 0.2s');

        pong.setKey('s', true);
        sim(0.2);
        pong.setKey('s', false);
        assert(pong.paddles.left > up, 'S did not move the paddle down');

        pong.newMatch();
        pong.setKey('w', true);
        sim(0.9);
        pong.setKey('w', false);
        assert(pong.paddles.left === 0, 'paddle did not stop at the top wall');

        pong.newMatch();
        pong.setKey('s', true);
        sim(0.9);
        pong.setKey('s', false);
        near(pong.paddles.left, CFG.H - CFG.PADDLE_H, 1e-6, 'paddle did not stop at the bottom wall');
        return CFG.PADDLE_SPEED + ' units/s';
    });

    check('in one-player the arrows also drive the left paddle', () => {
        freshMatch(1);
        const start = pong.paddles.left;
        pong.setKey('up', true);
        sim(0.2);
        pong.setKey('up', false);
        assert(pong.paddles.left < start, 'ArrowUp did not move the left paddle');
    });

    check('the mouse can take the left paddle over', () => {
        freshMatch(1);
        pong.setPointer(40);
        sim(0.5);
        pong.setPointer(null);
        assert(pong.paddles.left < 40, 'paddle did not follow the pointer up');
    });

    // --------------------------------------------------------------- physics
    check('the ball bounces off the top and bottom walls and stays inside', () => {
        freshMatch(1);
        live(CFG.W / 2, CFG.BALL_R + 2, 60, -400);
        sim(4, inCourt);
        assert(pong.ball.vy !== 0, 'ball lost its vertical speed');
        return 'checked every 0.05s for 4s';
    });

    check('a centred paddle hit sends the ball straight back, faster', () => {
        freshMatch(1);
        live(LEFT_FACE + 20, CENTRE_PADDLE + CFG.PADDLE_H / 2, -CFG.SPEED_MIN, 0);
        const before = pong.ball.speed;
        sim(0.3);
        assert(pong.ball.vx > 0, 'ball did not come back off the left paddle');
        assert(pong.ball.speed > before, 'rally did not speed the ball up');
        const lean = Math.abs(Math.atan2(pong.ball.vy, pong.ball.vx));
        near(lean, CFG.MIN_ANGLE, 1e-6, 'a centre hit should come off at the minimum lean');
        assert(pong.score.left === 0 && pong.score.right === 0, 'a returned ball scored a point');
        return before.toFixed(0) + ' -> ' + pong.ball.speed.toFixed(0) + ' units/s';
    });

    check('an edge hit adds angle, and the angle is capped', () => {
        freshMatch(1);
        const edge = CENTRE_PADDLE + CFG.PADDLE_H - 2;
        live(LEFT_FACE + 20, edge, -CFG.SPEED_MIN, 0);
        sim(0.3);
        assert(pong.ball.vx > 0, 'edge hit did not return the ball');
        assert(pong.ball.vy > 0, 'a low hit should send the ball downward');
        const angle = Math.abs(Math.atan2(pong.ball.vy, pong.ball.vx));
        assert(angle <= CFG.MAX_ANGLE + 1e-6, 'bounce angle exceeded the cap: ' + angle);
        return (angle * 180 / Math.PI).toFixed(1) + 'deg, cap ' + (CFG.MAX_ANGLE * 180 / Math.PI).toFixed(0) + 'deg';
    });

    check('the right paddle returns the ball too', () => {
        freshMatch(1);
        live(RIGHT_FACE - 20, CENTRE_PADDLE + CFG.PADDLE_H / 2, CFG.SPEED_MIN, 0);
        sim(0.3);
        assert(pong.ball.vx < 0, 'ball did not come back off the right paddle');
        assert(pong.score.left === 0 && pong.score.right === 0, 'a returned ball scored a point');
    });

    check('a fast ball cannot tunnel through a paddle', () => {
        freshMatch(1);
        live(LEFT_FACE + 1, CENTRE_PADDLE + CFG.PADDLE_H / 2, -CFG.SPEED_MAX, 0);
        sim(0.4);
        assert(pong.ball.vx > 0, 'ball at the speed ceiling passed through the paddle');
        assert(pong.score.right === 0, 'ball at the speed ceiling scored through the paddle');

        // Absurd speed, one single step: the swept test must still catch it.
        freshMatch(1);
        live(LEFT_FACE + 1, CENTRE_PADDLE + CFG.PADDLE_H / 2, -20000, 0);
        pong.advance(CFG.STEP);
        assert(pong.ball.vx > 0, '20000 units/s passed straight through the paddle');
        assert(pong.ball.speed <= CFG.SPEED_MAX + 1e-6, 'speed ceiling not applied after the hit');
        return 'held at ' + CFG.SPEED_MAX + ' units/s and at 20000 units/s';
    });

    check('the speed ceiling holds across a long rally', () => {
        freshMatch(1);
        pong.setBallSpeed(CFG.SPEED_MAX);
        live(LEFT_FACE + 10, CENTRE_PADDLE + CFG.PADDLE_H / 2, -CFG.SPEED_MAX, 0);
        for (let i = 0; i < 12; i += 1) {
            sim(0.3, inCourt);
            const b = pong.ball;
            live(LEFT_FACE + 10, CENTRE_PADDLE + CFG.PADDLE_H / 2, -b.speed, 0);
        }
        assert(pong.ball.speed <= CFG.SPEED_MAX + 1e-6, 'speed ran past the ceiling');
        return 'capped at ' + CFG.SPEED_MAX;
    });

    check('a flat rally between two still paddles cannot last forever', () => {
        // This is the stalemate the minimum lean exists to prevent: in
        // two-player mode nothing moves the paddles, so a perfectly flat ball
        // would bounce between them until the heat death of the universe.
        freshMatch(2);
        pong.setState('playing');
        pong.setPaddles(CENTRE_PADDLE, CENTRE_PADDLE);
        pong.setBall(CFG.W / 2, CENTRE_PADDLE + CFG.PADDLE_H / 2, -CFG.SPEED_MIN, 0);
        let elapsed = 0;
        while (pong.score.left + pong.score.right === 0 && elapsed < 180) {
            sim(0.2, inCourt);
            elapsed += 0.2;
        }
        assert(pong.score.left + pong.score.right > 0,
            'a flat rally between two still paddles never broke');
        return 'broke after ' + elapsed.toFixed(1) + 's';
    });

    // --------------------------------------------------------------- scoring
    check('a missed ball scores for the other side and re-serves', () => {
        freshMatch(1);
        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(CFG.W - 20, CFG.H - 40, 500, 0);
        sim(0.6);
        assert(pong.score.left === 1, 'left side did not score, score is ' +
            pong.score.left + '-' + pong.score.right);
        assert(pong.state === 'serving', 'did not go back to a serve, state is ' + pong.state);

        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(20, CFG.H - 40, -500, 0);
        sim(0.6);
        assert(pong.score.right === 1, 'right side did not score');
        return 'score 1-1';
    });

    check('the serve goes back out toward whoever just scored', () => {
        freshMatch(1);
        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(CFG.W - 20, CFG.H - 40, 500, 0);   // left scores
        sim(0.6);
        sim(CFG.SERVE_DELAY + 0.05);
        assert(pong.ball.vx > 0, 'serve after a left point should travel right');
    });

    check('first to ' + CFG.WIN + ' wins and the match ends', () => {
        freshMatch(1);
        pong.setScore(CFG.WIN - 1, 0);
        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(CFG.W - 20, CFG.H - 40, 500, 0);
        sim(0.6);
        assert(pong.score.left === CFG.WIN, 'winning point did not land');
        assert(pong.state === 'gameover', 'match did not end, state is ' + pong.state);
        assert(pong.winner === 'You', 'wrong winner: ' + pong.winner);
        const held = pong.ball;
        sim(1);
        assert(pong.ball.x === held.x && pong.ball.y === held.y, 'ball kept moving after the match');
        return pong.winner + ' ' + pong.score.left + '-' + pong.score.right;
    });

    check('the CPU wins when it gets there first', () => {
        freshMatch(1);
        pong.setScore(0, CFG.WIN - 1);
        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(20, CFG.H - 40, -500, 0);
        sim(0.6);
        assert(pong.state === 'gameover', 'match did not end');
        assert(pong.winner === 'CPU', 'wrong winner: ' + pong.winner);
    });

    check('Space after a game over starts a clean 0-0 match', () => {
        freshMatch(1);
        pong.setScore(CFG.WIN - 1, 0);
        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(CFG.W - 20, CFG.H - 40, 500, 0);
        sim(0.6);
        assert(pong.state === 'gameover', 'match did not end');
        pong.start();
        assert(pong.score.left === 0 && pong.score.right === 0, 'score did not reset');
        assert(pong.state === 'serving', 'did not go into a serve, state is ' + pong.state);
    });

    check('R resets a match in progress', () => {
        freshMatch(1);
        pong.setScore(3, 2);
        pong.newMatch();
        assert(pong.score.left === 0 && pong.score.right === 0, 'reset did not clear the score');
        assert(pong.state === 'serving', 'reset did not go into a serve');
    });

    check('a win is written to the saved record, in its own slot', () => {
        assert(pong.STORE_KEY.indexOf('selftest') !== -1,
            'the self-test is writing over the real saved record: ' + pong.STORE_KEY);
        const read = () => {
            try { return JSON.parse(localStorage.getItem(pong.STORE_KEY) || '{}'); }
            catch (err) { return {}; }
        };
        const before = read().wins | 0;
        freshMatch(1);
        pong.setScore(CFG.WIN - 1, 0);
        pong.setState('playing');
        pong.setPaddles(0, 0);
        pong.setBall(CFG.W - 20, CFG.H - 40, 500, 0);
        sim(0.6);
        assert(pong.state === 'gameover', 'match did not end');
        const after = read().wins | 0;
        assert(after === before + 1, 'the win was not saved (' + before + ' -> ' + after + ')');
        return pong.STORE_KEY;
    });

    // ----------------------------------------------------------------- pause
    check('pause freezes the ball and resumes where it left off', () => {
        freshMatch(1);
        live(CFG.W / 2, CFG.H / 2, 300, 120);
        sim(0.1);
        pong.togglePause();
        assert(pong.state === 'paused', 'did not pause');
        const held = pong.ball;
        sim(1);
        assert(pong.ball.x === held.x && pong.ball.y === held.y, 'ball moved while paused');
        pong.togglePause();
        assert(pong.state === 'playing', 'did not resume');
        sim(0.1);
        assert(pong.ball.x !== held.x, 'ball did not move again after resuming');
    });

    // ------------------------------------------------------------ two player
    check('two-player mode gives the arrows to the right paddle only', () => {
        freshMatch(2);
        assert(pong.players === 2, 'did not switch to two players');
        const before = pong.paddles;
        pong.setKey('up', true);
        sim(0.2);
        pong.setKey('up', false);
        assert(pong.paddles.right < before.right, 'ArrowUp did not move the right paddle');
        assert(pong.paddles.left === before.left, 'ArrowUp also moved the left paddle');

        const mid = pong.paddles;
        pong.setKey('s', true);
        sim(0.2);
        pong.setKey('s', false);
        assert(pong.paddles.left > mid.left, 'S did not move the left paddle');
        assert(pong.paddles.right === mid.right, 'S also moved the right paddle');
    });

    check('the right paddle holds still in two-player mode with no keys down', () => {
        freshMatch(2);
        live(CFG.W / 2, CFG.H / 2, 300, 90);
        const before = pong.paddles.right;
        sim(1);
        assert(pong.paddles.right === before, 'the CPU is still driving in two-player mode');
    });

    // ------------------------------------------------------------------- cpu
    check('the CPU tracks the ball and returns serves', () => {
        pong.setPlayers(1);
        freshMatch(1);
        let bestRally = 0;
        sim(12, () => {
            inCourt();
            if (pong.rally > bestRally) bestRally = pong.rally;
        });
        assert(bestRally >= 1, 'the CPU never got a paddle on the ball in 12s');
        return 'longest rally ' + bestRally + ' hits in 12s';
    });

    check('each difficulty plays a clean match through to a winner', () => {
        const seen = [];
        for (let i = 0; i < pong.LEVELS.length; i += 1) {
            pong.setPlayers(1);
            pong.newMatch();
            const level = pong.LEVELS[i].name;
            let guard = 0;
            while (pong.state !== 'gameover' && guard < 1200) {
                sim(0.2, inCourt);
                guard += 1;
            }
            assert(pong.state === 'gameover', level + ' never finished a match');
            assert(pong.score.left === CFG.WIN || pong.score.right === CFG.WIN,
                level + ' ended without anyone reaching ' + CFG.WIN);
            seen.push(level + ' ' + pong.score.left + '-' + pong.score.right);
            pong.cycleLevel();
        }
        return seen.join(', ');
    });

    check('a minute of unattended play never breaks the court', () => {
        freshMatch(1);
        live(CFG.W / 2, CFG.H / 2, 420, 260);
        let matches = 0;
        sim(60, () => {
            inCourt();
            if (pong.state === 'gameover') { matches += 1; pong.start(); }
        });
        return '60s simulated across ' + (matches + 1) + ' matches, ball always inside the court';
    });

    // ---------------------------------------------------------------- report
    pong.setRandom(Math.random);
    pong.newMatch();
    pong.setState('menu');
    pong.syncHud();
    pong.startLoop();

    const lines = results.map((r) => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '\n        ' + r.detail : ''));
    const summary = failed === 0
        ? passed + ' checks passed'
        : failed + ' of ' + (passed + failed) + ' checks FAILED';
    const text = lines.join('\n') + '\n\n' + summary;

    const out = document.getElementById('selftest-out');
    if (out) {
        out.style.display = 'block';
        out.textContent = text;
    }
    (failed === 0 ? console.log : console.error)('[pong selftest]\n' + text);

    window.__selftest = { passed, failed, results, summary, text };
})();
