"""Writes the 0.20.0 release video's frames and index.html: the confirmed sketch layouts, with motion.

Run from the project root: python3 scripts/build-frames.py .  (edit this, not the generated HTML).

Writes compositions/frames/NN-*.html and index.html. compositions/space.html is hand-written.
Times are local seconds on the 128 BPM placeholder grid (beat 0.46875s, bar 1.875s).
"""
import sys, pathlib

ROOT = pathlib.Path(sys.argv[1])

FONTS = """
    @font-face { font-family: 'Space Grotesk'; src: url('assets/space-grotesk-400.woff2') format('woff2'); font-weight: 400; }
    @font-face { font-family: 'Space Grotesk'; src: url('assets/space-grotesk-500.woff2') format('woff2'); font-weight: 500; }
    @font-face { font-family: 'Space Grotesk'; src: url('assets/space-grotesk-700.woff2') format('woff2'); font-weight: 700; }
    @font-face { font-family: 'Space Mono'; src: url('assets/space-mono-400.woff2') format('woff2'); font-weight: 400; }
    @font-face { font-family: 'Space Mono'; src: url('assets/space-mono-700.woff2') format('woff2'); font-weight: 700; }
"""

SHARED = """
    .sx-col { position: absolute; left: 120px; top: 220px; width: 620px; display: flex; flex-direction: column; }
    .sx-eyebrow { font: 700 20px/1 'Space Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: #F041FF; opacity: 0; }
    .sx-headline { margin-top: 22px; font: 700 76px/1.03 'Space Grotesk', sans-serif; letter-spacing: -0.03em; color: #f7f4ff; }
    .sx-headline em { font-style: normal; color: #F041FF; }
    .sx-w { display: inline-block; opacity: 0; }
    .sx-sub { margin-top: 28px; width: 600px; font: 400 28px/1.4 'Space Grotesk', sans-serif; color: #a7a9b8; opacity: 0; }
    .sx-sub code, .sx-code-inline { font-family: 'Space Mono', monospace; font-size: 0.86em; color: #e9e6f2; white-space: nowrap; }
    .sx-card { position: absolute; background: #0b0c11; border-radius: 16px; box-shadow: 0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px #343841; overflow: hidden; }
    .sx-bar { height: 52px; background: #1c1f28; border-bottom: 1px solid #343841; display: flex; align-items: center; padding: 0 22px; gap: 10px; }
    .sx-dot { width: 12px; height: 12px; border-radius: 50%; background: #343841; }
    .sx-file { margin-left: 14px; font: 400 18px/1 'Space Mono', monospace; color: #a7a9b8; }
    .sx-codebody { padding: 34px 40px; font: 400 26px/1.6 'Space Mono', monospace; color: #e9e6f2; white-space: pre; }
    .k { color: #c792ea; } .s { color: #c3e88d; } .n { color: #f78c6c; } .t { color: #89ddff; } .c { color: #82aaff; } .p { color: #b2ccd6; } .cm { color: #8a8d9c; }
    .sx-pill { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; font: 400 18px/1 'Space Mono', monospace; white-space: nowrap; }
    .sx-pill svg { width: 16px; height: 16px; }
    .sx-pill.warn { color: #f5b54a; border: 1.5px solid rgba(245,181,74,0.7); background: rgba(245,181,74,0.08); }
    .sx-pill.hyd { color: #c9d0ff; border: 1.5px solid #4d63ff; background: rgba(77,99,255,0.2); }
    .sx-swap { position: relative; display: inline-grid; }
    .sx-swap > .sx-pill { grid-area: 1 / 1; transform-origin: 50% 50%; }
    .sx-swap > .sx-pill.hyd { opacity: 0; }
    .sx-tag { font: 400 24px/1 'Space Mono', monospace; color: #89ddff; white-space: nowrap; }
    .sx-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 34px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6)); z-index: 20; opacity: 0; }
    .sx-ripple { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border-radius: 50%; border: 2.5px solid #F041FF; opacity: 0; pointer-events: none; z-index: 19; }
    .sx-browser-url { margin-left: 18px; flex: 1; height: 32px; border-radius: 8px; background: #13151a; border: 1px solid #343841; display: flex; align-items: center; padding: 0 14px; font: 400 17px/1 'Space Mono', monospace; color: #a7a9b8; }
"""

# Shared timeline helpers, pasted into every frame's IIFE.
HELPERS = """
      var R = document.getElementById(ID + '-root');
      function q(s) { return R.querySelector(s); }
      function qa(s) { return Array.prototype.slice.call(R.querySelectorAll(s)); }
      // Headline column: eyebrow, then the words as a waterfall entry, then the sub.
      function colIn(t) {
        var eb = q('.sx-eyebrow');
        if (!eb) return t;
        tl.set(eb, { opacity: 1, y: 30 }, t);
        tl.to(eb, { y: 0, duration: 0.16, ease: 'power4.out' }, t);
        var tt = t + 0.12;
        qa('.sx-w').forEach(function (w, i, all) {
          var heavy = i === all.length - 1;
          tl.set(w, { opacity: 1, y: heavy ? 76 : 50 }, tt);
          tl.to(w, { y: 0, duration: heavy ? 0.2 : 0.15, ease: 'power4.out' }, tt);
          tt += 0.12;
        });
        var sb = q('.sx-sub');
        tl.set(sb, { opacity: 1, y: 28 }, tt + 0.08);
        tl.to(sb, { y: 0, duration: 0.45, ease: 'power3.out' }, tt + 0.08);
        return tt;
      }
      // Pill swap: not hydrated / deferred → hydrated (scale-swap-transition).
      function hydrate(swap, t) {
        var from = swap.querySelector('.warn'), to = swap.querySelector('.hyd');
        tl.to(from, { scale: 0.7, opacity: 0, duration: 0.3, ease: 'power2.in' }, t);
        tl.fromTo(to, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' }, t + 0.18);
      }
"""

DROP_EMPTY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2.5C12 2.5 5 10.2 5 14.8a7 7 0 0 0 14 0C19 10.2 12 2.5 12 2.5z"/></svg>'
DROP_FILL = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2"><path d="M12 2.5C12 2.5 5 10.2 5 14.8a7 7 0 0 0 14 0C19 10.2 12 2.5 12 2.5z"/></svg>'
CURSOR = '<svg class="sx-cursor" viewBox="0 0 26 34"><path d="M2 2 L2 28 L9 21.5 L13.5 32 L18 30 L13.6 19.8 L23 19.8 Z" fill="#f7f4ff" stroke="#0d0f14" stroke-width="2" stroke-linejoin="round"/></svg>'
LIT_MARK = '<svg viewBox="0 0 160 200"><path fill="#00e8ff" d="M40 120l20-60l90 90l-30 50l-40-40h-20"/><path fill="#283198" d="M80 160v-80l40-40v80M0 160l40 40l20-40l-20-40h-20"/><path fill="#324fff" d="M40 120v-80l40-40v80M120 200v-80l40-40v80M0 160v-80l40 40"/><path fill="#0ff" d="M40 200v-80l40 40"/></svg>'


def pill(kind, text):
    if kind == 'hyd':
        return f'<span class="sx-pill hyd">{DROP_FILL}{text}</span>'
    return f'<span class="sx-pill warn">{DROP_EMPTY}{text}</span>'


def swap(warn_text, cls=''):
    return f'<span class="sx-swap {cls}">{pill("warn", warn_text)}{pill("hyd", "hydrated")}</span>'


def col(eyebrow, words, sub):
    ws = ' '.join(f'<span class="sx-w">{w}</span>' for w in words)
    return f'''<div class="sx-col">
        <div class="sx-eyebrow">{eyebrow}</div>
        <div class="sx-headline">{ws}</div>
        <div class="sx-sub">{sub}</div>
      </div>'''


def frame(fid, dur, k, css, body, script):
    local = round(dur * k, 4)
    return f'''<template>
  <style>{FONTS}
    #{fid}-root {{ position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; font-family: 'Space Grotesk', sans-serif; color: #e9e6f2; }}
    #{fid}-root .clip {{ position: absolute; inset: 0; }}
{SHARED}
{css}
  </style>
  <div id="{fid}-root" data-composition-id="{fid}" data-width="1920" data-height="1080" data-duration="{dur}">
    <div id="{fid}-stage" class="clip" data-start="0" data-duration="{dur}" data-track-index="0">
      {body}
    </div>
  </div>
  <script>
    (function () {{
      var ID = '{fid}';
      var DUR = {local}; // local seconds; the timeline plays at K, so it spans the frame's {dur}s
      var BEAT = 0.46875;
      var BAR = 1.875;
      var tl = gsap.timeline({{ paused: true }});
{HELPERS}
{script}
      tl.set({{}}, {{}}, DUR);
      // Re-timed to "Groche Énergique" (space remix, 123 BPM): cues are written on the 128 BPM placeholder grid.
      var K = {k};
      tl.paused(false).timeScale(K);
      window.__timelines[ID] = gsap.timeline({{ paused: true }}).add(tl, 0);
    }})();
  </script>
</template>
'''


frames = []

# ── 01 Liftoff ─────────────────────────────────────────────
frames.append(('01-liftoff', 0.0, 5.851, 0.641, '''
    .f01-glow { position: absolute; left: 460px; top: 0; width: 1000px; height: 1000px; border-radius: 50%; opacity: 0;
      background: radial-gradient(circle, rgba(240,65,255,0.5) 0%, rgba(141,70,231,0.26) 38%, rgba(141,70,231,0) 68%); }
    .f01-orbit { position: absolute; left: 510px; top: 290px; width: 900px; height: 280px; border-radius: 50%; border: 2px solid rgba(240,65,255,0.4); opacity: 0; }
    .f01-orbit2 { position: absolute; left: 410px; top: 250px; width: 1100px; height: 360px; border-radius: 50%; border: 1.5px dashed rgba(167,169,184,0.25); opacity: 0; }
    .f01-marks { position: absolute; left: 0; right: 0; top: 330px; display: flex; justify-content: center; align-items: center; gap: 70px; }
    .f01-astro { width: 150px; height: 189px; opacity: 0; }
    .f01-x { font: 400 56px/1 'Space Mono', monospace; color: #a7a9b8; opacity: 0; }
    .f01-flame { width: 152px; height: 190px; filter: drop-shadow(0 0 30px rgba(77,99,255,0.55)); opacity: 0; }
    .f01-eyebrow { position: absolute; left: 0; right: 0; top: 640px; text-align: center; font: 700 22px/1 'Space Mono', monospace;
      letter-spacing: 0.2em; text-transform: uppercase; color: #F041FF; opacity: 0; }
    .f01-hero { position: absolute; left: 0; right: 0; top: 688px; text-align: center; font: 700 112px/1 'Space Grotesk', sans-serif; letter-spacing: -0.035em; color: #f7f4ff; }
    .f01-hero em { font-style: normal; color: #F041FF; }
''', '''<div class="f01-glow"></div>
      <div class="f01-orbit2"></div>
      <div class="f01-orbit"></div>
      <div class="f01-marks">
        <img class="f01-astro" src="assets/astro-icon.svg" alt="" />
        <div class="f01-x">×</div>
        <img class="f01-flame" src="assets/flame.svg" alt="" />
      </div>
      <div class="f01-eyebrow">vite-plugin-lit 0.20</div>
      <div class="f01-hero">''' + ' '.join(f'<span class="sx-w">{w}</span>' for w in ['Lit,', 'now', 'landing', 'in', '<em>Astro</em>.']) + '</div>', '''
      // Scene 1 — ignite: the nebula glow blooms and the orbit rings open (ambient-glow-bloom).
      tl.fromTo(q('.f01-glow'), { opacity: 0, scale: 0.7 }, { opacity: 0.5, scale: 1, duration: 1.6, ease: 'power2.out' }, 0);
      tl.fromTo(q('.f01-orbit2'), { opacity: 0, scale: 0.55, rotation: -14 }, { opacity: 1, scale: 1, rotation: -8, duration: 1.6, ease: 'power3.out' }, 0.1);
      tl.fromTo(q('.f01-orbit'), { opacity: 0, scale: 0.4, rotation: -2 }, { opacity: 1, scale: 1, rotation: -8, duration: 1.4, ease: 'power3.out' }, 0.25);
      tl.to([q('.f01-orbit'), q('.f01-orbit2')], { rotation: -5, duration: 2, ease: 'sine.inOut' }, 1.75);
      // Scene 2 — assemble: the Astro mark rises; the Lit flame swings in along the orbit and docks on beat 5.
      tl.fromTo(q('.f01-astro'), { opacity: 0, y: 220 }, { opacity: 1, y: 0, duration: 1.5, ease: 'power3.out' }, 0.375);
      var flame = q('.f01-flame');
      var orbit = { a: 0 };
      tl.set(flame, { opacity: 1 }, 0.47);
      tl.fromTo(orbit, { a: 0 }, { a: 1, duration: 1.4, ease: 'power3.inOut', onUpdate: function () {
        // Swings in from the orbit's far right edge on an arc that rises, then settles beside the Astro mark.
        var a = orbit.a;
        gsap.set(flame, { x: 380 * (1 - a), y: -150 * Math.sin(Math.PI * (1 - a)) * (1 - a), scale: 0.45 + 0.55 * a, rotation: 25 * (1 - a) });
      } }, 0.47);
      tl.fromTo(q('.f01-x'), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'power3.out' }, 1.875);
      // Scene 3 — resolve: the eyebrow and the hook land on beat 6.
      var eb = q('.f01-eyebrow');
      tl.set(eb, { opacity: 1, y: 24 }, 2.11);
      tl.to(eb, { y: 0, duration: 0.18, ease: 'power4.out' }, 2.11);
      var tt = 2.344;
      qa('.sx-w').forEach(function (w, i, all) {
        var heavy = i === all.length - 1;
        tl.set(w, { opacity: 1, y: heavy ? 90 : 60 }, tt);
        tl.to(w, { y: 0, duration: heavy ? 0.22 : 0.16, ease: 'power4.out' }, tt);
        tt += 0.11;
      });
'''))

# ── 02 Docking ─────────────────────────────────────────────
frames.append(('02-docking', 5.851, 5.805, 0.9609, '''
    .f02-card { left: 820px; top: 200px; width: 980px; height: 380px; opacity: 0; }
    .f02-mod { display: inline-block; position: relative; padding: 2px 18px; margin: -6px 0; border-radius: 14px; color: #f7f4ff; opacity: 0;
      background: linear-gradient(#15171e, #15171e) padding-box, linear-gradient(110deg, #D83333, #F041FF) border-box;
      border: 2.5px solid transparent; box-shadow: 0 0 48px rgba(240,65,255,0.45); transform-origin: 50% 50%; }
    .f02-burst { position: absolute; left: 50%; top: 50%; width: 160px; height: 160px; margin: -80px 0 0 -80px; border-radius: 50%; opacity: 0;
      background: radial-gradient(circle, rgba(240,65,255,0.55), rgba(216,51,51,0) 65%); pointer-events: none; }
    .f02-labels { position: absolute; left: 820px; top: 614px; width: 980px; display: flex; gap: 16px; }
    .f02-label { flex: 1 1 auto; white-space: nowrap; height: 64px; border-radius: 12px; background: #15171e; border: 1px solid #343841; display: flex; align-items: center;
      gap: 12px; padding: 0 20px; font: 500 22px/1.2 'Space Grotesk', sans-serif; color: #e9e6f2; opacity: 0; }
    .f02-label i { width: 10px; height: 10px; border-radius: 50%; background: #F041FF; box-shadow: 0 0 12px #F041FF; flex: none; }
    .f02-sat { position: absolute; left: 820px; top: 712px; width: 980px; height: 88px; border-radius: 14px; border: 1.5px dashed #343841; opacity: 0;
      display: flex; align-items: center; gap: 18px; padding: 0 28px; font: 400 23px/1.3 'Space Grotesk', sans-serif; color: #a7a9b8; }
    .f02-sat code { font: 700 23px/1 'Space Mono', monospace; color: #f7f4ff; padding: 8px 14px; border-radius: 10px; background: #1c1f28; border: 1px solid #343841; }
''', col('Setup', ['One', 'integration.', 'Nothing', 'else', 'to', '<em>wire</em>.'],
         'Add <code>lit()</code> to your Astro config. That is the whole setup.') + '''
      <svg width="0" height="0" aria-hidden="true" style="position: absolute">
        <filter id="s02-streak" x="-100%" y="-50%" width="300%" height="200%"><feGaussianBlur id="s02-streak-blur" in="SourceGraphic" stdDeviation="0 0" /></filter>
      </svg>
      <div class="sx-card f02-card">
        <div class="sx-bar"><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-file">astro.config.mjs</span></div>
        <div class="sx-codebody"><span class="k">import</span> {defineConfig} <span class="k">from</span> <span class="s">'astro/config'</span>;
<span class="k">import</span> lit <span class="k">from</span> <span class="s">'@oddsquad/vite-plugin-lit/astro'</span>;

<span class="k">export default</span> <span class="c">defineConfig</span>({
  <span class="p">integrations</span>: [<span class="f02-mod" style="filter: url(#s02-streak)"><span class="f02-burst"></span><span class="c">lit</span>()</span>],
});</div>
      </div>
      <div class="f02-labels">
        <div class="f02-label"><i></i>Server rendering + hydration</div>
        <div class="f02-label"><i></i>Hot patching</div>
        <div class="f02-label"><i></i>The Lit panel</div>
      </div>
      <div class="f02-sat">Keeping another Lit renderer? <code>litDevtools()</code> HMR and the panel only.</div>''', '''
      colIn(0.1);
      tl.fromTo(q('.f02-card'), { opacity: 0, x: 80 }, { opacity: 1, x: 0, duration: 0.7, ease: 'power3.out' }, 0.15);
      // lit() streaks in from the right edge and docks on bar 2's downbeat (motion-blur-streak, path A).
      var mod = q('.f02-mod');
      var blurNode = R.querySelector('#s02-streak-blur');
      var blur = { v: 0 };
      function writeBlur() { blurNode.setAttribute('stdDeviation', blur.v.toFixed(2) + ' 0'); }
      writeBlur();
      tl.set(mod, { opacity: 1 }, 0.975);
      tl.fromTo(mod, { x: 900 }, { x: 0, duration: 0.9, ease: 'power3.out', immediateRender: false }, 0.975);
      tl.fromTo(blur, { v: 28 }, { v: 0, duration: 0.9, ease: 'power3.out', onUpdate: writeBlur, immediateRender: false }, 0.975);
      // Dock: press and spring release, with a burst behind it (press-release-spring).
      tl.to(mod, { scale: 0.9, duration: 0.12, ease: 'power1.in' }, 1.875);
      tl.to(mod, { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 1.995);
      var burst = q('.f02-burst');
      tl.fromTo(burst, { scale: 1, opacity: 0 }, { scale: 4, opacity: 0.8, duration: 0.45, ease: 'power2.out' }, 1.995);
      tl.to(burst, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 2.45);
      // The three capabilities, one per beat (spring-pop-entrance).
      qa('.f02-label').forEach(function (el, i) {
        tl.fromTo(el, { opacity: 0, scale: 0.6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 2.344 + i * BEAT);
      });
      // The litDevtools() satellite on bar 3.
      tl.fromTo(q('.f02-sat'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, 3.75);
'''))

# ── 03 Re-entry ────────────────────────────────────────────
frames.append(('03-reentry', 11.656, 5.805, 0.9609, '''
    .f03-cards { position: absolute; left: 820px; top: 190px; width: 980px; display: flex; flex-direction: column; gap: 34px; }
    .f03-card { position: relative; height: 196px; border-radius: 16px; background: #15171e; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px #343841; padding: 30px 36px; opacity: 0; }
    .f03-ring { position: absolute; inset: 0; border-radius: 16px; box-shadow: 0 0 0 1.5px rgba(77,99,255,0.8), 0 0 40px rgba(77,99,255,0.3); opacity: 0; pointer-events: none; }
    .f03-head { display: flex; justify-content: space-between; align-items: center; }
    .f03-body { margin-top: 30px; display: flex; align-items: center; gap: 18px; font: 500 30px/1 'Space Grotesk', sans-serif; color: #e9e6f2; }
    .f03-btn { height: 52px; padding: 0 22px; border-radius: 10px; background: #262a35; border: 1px solid #343841; display: inline-flex; align-items: center; font: 700 26px/1 'Space Mono', monospace; }
    .f03-chip { height: 46px; padding: 0 18px; border-radius: 999px; background: rgba(141,70,231,0.22); border: 1px solid rgba(141,70,231,0.7); display: inline-flex; align-items: center; font: 400 22px/1 'Space Mono', monospace; color: #e7d7ff; }
    .f03-note { margin-left: auto; font: 400 20px/1 'Space Mono', monospace; color: #a7a9b8; opacity: 0; }
    .f03-trail { position: absolute; left: 50%; bottom: 100%; width: 6px; height: 260px; margin-left: -3px; transform-origin: 50% 100%; opacity: 0;
      background: linear-gradient(to top, rgba(240,65,255,0.85), rgba(216,51,51,0)); border-radius: 3px; }
    .f03-attr { position: relative; color: #f5b54a; }
    .f03-strike { position: absolute; left: 0; right: 0; top: 52%; height: 2px; background: #f5b54a; transform-origin: 0 50%; transform: scaleX(0); }
    .f03-timer { font-variant-numeric: tabular-nums; }
''', col('Server-rendered', ['Hydrated,', 'with', 'no', 'other', '<em>renderer</em>.'],
         'Arrays and objects arrive intact. A <code>defer-hydration</code> you wrote waits for you.') + f'''
      <div class="f03-cards" data-layout-allow-overlap>
        <div class="f03-card"><div class="f03-trail"></div><div class="f03-ring"></div>
          <div class="f03-head"><span class="sx-tag">&lt;ssr-counter start="3"&gt;</span>{swap('not hydrated')}</div>
          <div class="f03-body">Count: 3 <span class="f03-btn">+</span></div>
        </div>
        <div class="f03-card"><div class="f03-trail"></div><div class="f03-ring"></div>
          <div class="f03-head"><span class="sx-tag">&lt;TagList client:visible /&gt;</span>{swap('not hydrated')}</div>
          <div class="f03-body"><span class="f03-chip">island</span><span class="f03-chip">visible</span><span class="f03-note">tags = ['island', 'visible']</span></div>
        </div>
        <div class="f03-card"><div class="f03-trail"></div><div class="f03-ring"></div>
          <div class="f03-head"><span class="sx-tag">&lt;launch-timer <span class="f03-attr">defer-hydration<span class="f03-strike"></span></span>&gt;</span>{swap('deferred')}</div>
          <div class="f03-body">T-minus <span class="f03-timer">00:10</span></div>
        </div>
      </div>''', '''
      colIn(0.1);
      var cards = qa('.f03-card');
      // Re-entry: each card drops in on a magenta trail, the first one on the drop (motion-blur-streak, vertical).
      cards.forEach(function (c, i) {
        var t = i * 0.234;
        var trail = c.querySelector('.f03-trail');
        tl.fromTo(c, { opacity: 0, y: -620 }, { opacity: 1, y: 0, duration: 0.62, ease: 'power4.out' }, t);
        tl.fromTo(trail, { opacity: 1, scaleY: 1.6 }, { scaleY: 0.2, duration: 0.62, ease: 'power4.out' }, t);
        tl.to(trail, { opacity: 0, duration: 0.3, ease: 'power1.out' }, t + 0.5);
      });
      // Hydration: the counter on bar 2, the tag list a beat later, each with its ring.
      var swaps = qa('.sx-swap'), rings = qa('.f03-ring');
      hydrate(swaps[0], 1.875);
      tl.fromTo(rings[0], { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 2.05);
      hydrate(swaps[1], 2.344);
      tl.fromTo(rings[1], { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 2.52);
      qa('.f03-chip').forEach(function (c, i) {
        tl.fromTo(c, { scale: 0.6 }, { scale: 1, duration: 0.4, ease: 'back.out(1.6)' }, 2.52 + i * 0.08);
      });
      tl.fromTo(q('.f03-note'), { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, 2.81);
      // The deferred one holds, then its defer-hydration is struck and it wakes on the drop (bar 3); the timer starts counting.
      tl.to(q('.f03-strike'), { scaleX: 1, duration: 0.3, ease: 'power2.inOut' }, 3.515);
      tl.to(q('.f03-attr'), { opacity: 0.4, duration: 0.3 }, 3.675);
      hydrate(swaps[2], 3.75);
      tl.fromTo(rings[2], { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 3.925);
      var timer = q('.f03-timer'), tick = { v: 10 };
      tl.to(tick, { v: 8, duration: 1.5, ease: 'none', onUpdate: function () {
        timer.textContent = '00:' + String(Math.ceil(tick.v)).padStart(2, '0');
      } }, 3.975);
'''))

# ── 04 Hot patch ───────────────────────────────────────────
frames.append(('04-hotpatch', 17.461, 7.733, 0.9609, '''
    .f04-editor { left: 820px; top: 210px; width: 560px; height: 420px; opacity: 0; }
    .f04-editor .sx-codebody { font-size: 23px; padding: 30px 30px; }
    .f04-line { display: block; position: relative; margin: 0 -30px; padding: 0 30px; }
    .f04-hl { position: absolute; inset: 0; background: rgba(52,224,161,0.12); box-shadow: inset 4px 0 0 #34e0a1; opacity: 0; }
    .f04-caret { display: inline-block; width: 3px; height: 1.1em; margin-left: 2px; vertical-align: -0.15em; background: #f7f4ff; opacity: 0; }
    .f04-page { left: 1410px; top: 210px; width: 390px; height: 530px; background: #15171e; opacity: 0; }
    .f04-isl { position: relative; margin: 28px 26px 0; padding: 22px; border-radius: 14px; background: #0b0c11; border: 1px solid #343841; }
    .f04-isl .sx-tag { font-size: 18px; }
    .f04-isl .sx-pill { margin-top: 14px; }
    .f04-row { margin-top: 20px; display: flex; align-items: center; gap: 14px; font: 500 24px/1 'Space Grotesk', sans-serif; }
    .f04-count { font-variant-numeric: tabular-nums; min-width: 20px; }
    .f04-btn { position: relative; height: 54px; padding: 0 22px; border-radius: 10px; background: linear-gradient(110deg, #D83333, #F041FF); color: #fff;
      display: inline-flex; align-items: center; font: 700 24px/1 'Space Grotesk', sans-serif; transform-origin: 50% 50%; }
    .f04-ring { position: absolute; inset: -9px; border-radius: 15px; border: 2.5px solid #00e8ff; box-shadow: 0 0 24px rgba(0,232,255,0.7); opacity: 0; }
    .f04-patched { margin-left: auto; font: 400 16px/1 'Space Mono', monospace; color: #00e8ff; opacity: 0; }
''', col('Hot patch', ['Edit', 'it.', 'It', 'patches', 'in', '<em>place</em>.'],
         'Hydrated or not, each element keeps its state through the patch.') + f'''
      <div class="sx-card f04-editor">
        <div class="sx-bar"><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-file">launch-card.ts</span></div>
        <div class="sx-codebody"><span class="c">render</span>() {{
  <span class="k">return</span> <span class="c">html</span>`
    <span class="t">&lt;button</span> <span class="p">@click</span>=${{<span class="k">this</span>.inc}}<span class="t">&gt;</span>
<span class="f04-line"><span class="f04-hl"></span>      <span class="f04-text">Launch</span><span class="f04-caret"></span></span>    <span class="t">&lt;/button&gt;</span>
    <span class="t">&lt;span&gt;</span>${{<span class="k">this</span>.count}}<span class="t">&lt;/span&gt;</span>`;
}}</div>
      </div>
      <div class="sx-card f04-page">
        <div class="sx-bar"><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-dot"></span></div>
        <div class="f04-isl">
          <div class="sx-tag">&lt;launch-card&gt;</div>
          {pill('hyd', 'hydrated')}
          <div class="f04-row"><span class="f04-btn"><span class="f04-ring"></span><span class="f04-label">Launch</span></span> <span class="f04-count">3</span> <span class="f04-patched">patched</span></div>
        </div>
        <div class="f04-isl">
          <div class="sx-tag">&lt;launch-card&gt;</div>
          {pill('warn', 'not hydrated')}
          <div class="f04-row"><span class="f04-btn"><span class="f04-ring"></span><span class="f04-label">Launch</span></span> <span class="f04-count">0</span> <span class="f04-patched">patched</span></div>
        </div>
      </div>
      <div class="sx-ripple"></div>
      {CURSOR}''', '''
      colIn(0.1);
      tl.fromTo(q('.f04-editor'), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.15);
      tl.fromTo(q('.f04-page'), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.3);
      // The edit and the patch share one beat (control-target-sync, discrete couple): one state array drives both sides.
      var text = q('.f04-text'), caret = q('.f04-caret'), labels = qa('.f04-label');
      var STEPS = [
        { t: 0, src: 'Launch', page: 'Launch' },
        { t: 0.10, src: 'Launc', page: 'Launch' }, { t: 0.16, src: 'Laun', page: 'Launch' }, { t: 0.22, src: 'Lau', page: 'Launch' },
        { t: 0.28, src: 'La', page: 'Launch' }, { t: 0.34, src: 'L', page: 'Launch' },
        { t: 0.44, src: 'Li', page: 'Launch' }, { t: 0.50, src: 'Lif', page: 'Launch' }, { t: 0.56, src: 'Lift', page: 'Launch' },
        { t: 0.62, src: 'Lifto', page: 'Launch' }, { t: 0.68, src: 'Liftof', page: 'Launch' },
        { t: 0.75, src: 'Liftoff', page: 'Liftoff' }
      ];
      var drv = { t: 0 }, last = null;
      function stepAt(x) { for (var i = STEPS.length - 1; i >= 0; i--) if (x >= STEPS[i].t) return STEPS[i]; return STEPS[0]; }
      tl.set(caret, { opacity: 1 }, 1.0);
      tl.fromTo(drv, { t: 0 }, { t: 0.75, duration: 0.75, ease: 'none', onUpdate: function () {
        var s = stepAt(drv.t);
        if (s !== last) { text.textContent = s.src; labels.forEach(function (l) { l.textContent = s.page; }); last = s; }
      } }, 1.125);
      tl.set(caret, { opacity: 0 }, 1.95);
      tl.fromTo(q('.f04-hl'), { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 1.875);
      // The patch: a cyan ring flashes on both islands, hydrated or not, and "patched" pops.
      qa('.f04-ring').forEach(function (r, i) {
        tl.fromTo(r, { opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' }, 1.875 + i * 0.06);
        tl.to(r, { opacity: 0, duration: 0.6, ease: 'power2.in' }, 3.2);
      });
      qa('.f04-patched').forEach(function (p, i) {
        tl.fromTo(p, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out' }, 2.0 + i * 0.06);
      });
      // Proof the state survived: click the hydrated button on bar 3, the count goes 3 → 4 (cursor-click-ripple).
      var cursor = q('.sx-cursor'), btn = qa('.f04-btn')[0], count = qa('.f04-count')[0], ripple = q('.sx-ripple');
      var BX = 1519, BY = 426; // the hydrated button's centre on the canvas
      tl.set(cursor, { opacity: 1 }, 2.9);
      tl.fromTo(cursor, { x: 1700, y: 760 }, { x: BX - 4, y: BY - 6, duration: 0.8, ease: 'power3.inOut', immediateRender: false }, 2.9);
      tl.to([cursor, btn], { scale: 0.9, duration: 0.1, ease: 'power2.in', yoyo: true, repeat: 1 }, 3.75);
      tl.set(ripple, { left: BX, top: BY, opacity: 1, scale: 0 }, 3.75);
      tl.to(ripple, { scale: 2.2, opacity: 0, duration: 0.6, ease: 'power2.out' }, 3.75);
      var c = { v: 3 };
      tl.to(c, { v: 4, duration: 0.01, onUpdate: function () { count.textContent = String(Math.round(c.v)); } }, 3.8);
      tl.to(cursor, { x: 1760, y: 820, opacity: 0, duration: 0.8, ease: 'power3.in' }, 5.2);
'''))

# ── 05 Mission control ─────────────────────────────────────
# Window geometry (browser-relative): full size left 70 top 150, 840×530; anchored bottom centre (490, 680).
frames.append(('05-toolbar', 25.194, 5.712, 0.9609, '''
    .f05-browser { left: 820px; top: 130px; width: 980px; height: 820px; background: #0f1117; opacity: 0; }
    .f05-ph { position: absolute; border-radius: 8px; background: #1c1f28; }
    .f05-win { position: absolute; left: 70px; top: 150px; width: 840px; height: 530px; border-radius: 12px; background: #13151a;
      border: 1px solid #343841; box-shadow: 0 30px 70px rgba(0,0,0,0.6); overflow: hidden; transform-origin: 420px 530px; opacity: 0; }
    .f05-ghost { position: absolute; left: 200px; top: 330px; width: 580px; height: 350px; border-radius: 12px; border: 2px dashed rgba(240,65,255,0.55); opacity: 0; }
    .f05-whead { height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 22px 0 44px; border-bottom: 1px solid #343841; font: 700 19px/1 'Space Grotesk', sans-serif; color: #e9e6f2; }
    .f05-whead svg { width: 18px; height: 22px; }
    .f05-tabs { display: flex; gap: 28px; margin-left: 30px; font: 500 17px/1 'Space Grotesk', sans-serif; color: #a7a9b8; }
    .f05-tabs b { color: #8f9bff; font-weight: 700; }
    .f05-tree { padding: 18px 26px; font: 400 19px/44px 'Space Mono', monospace; color: #a7a9b8; }
    .f05-tree div { display: flex; align-items: center; gap: 14px; }
    .f05-tree .sel { color: #f7f4ff; background: rgba(77,99,255,0.16); box-shadow: inset 4px 0 0 #4d63ff; margin: 0 -26px; padding: 0 26px; }
    .f05-tree .sx-pill { height: 30px; font-size: 16px; }
    .f05-grip { position: absolute; left: 8px; top: 8px; width: 20px; height: 20px; background: repeating-linear-gradient(135deg, #a7a9b8 0 2px, transparent 2px 6px); border-radius: 3px; }
    .f05-tb { position: absolute; left: 325px; top: 718px; width: 330px; height: 58px; border-radius: 999px; background: #13151a;
      border: 1px solid #343841; display: flex; align-items: center; justify-content: space-around; padding: 0 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }
    .f05-ic { width: 26px; height: 26px; border-radius: 6px; border: 2px solid #6d7080; }
    .f05-ic.round { border-radius: 50%; }
    .f05-tb img { height: 30px; }
    .f05-lit { position: relative; display: flex; }
    .f05-lit svg { height: 30px; width: 24px; }
    .f05-lit i { position: absolute; left: 50%; bottom: -10px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: #F041FF; box-shadow: 0 0 8px #F041FF; opacity: 0; }
''', col('Dev toolbar', ['The', 'Lit', 'panel,', 'in', 'Astro’s', 'dev', '<em>toolbar</em>.'],
         'Resize it by the grip. It lines up with wherever you dock the toolbar.') + f'''
      <div class="sx-card f05-browser">
        <div class="sx-bar"><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-browser-url">localhost:4321/missions</span></div>
        <div class="f05-ph" style="left:70px;top:96px;width:420px;height:34px"></div>
        <div class="f05-ph" style="left:70px;top:150px;width:840px;height:220px;opacity:.55"></div>
        <div class="f05-ph" style="left:70px;top:396px;width:400px;height:200px;opacity:.4"></div>
        <div class="f05-ph" style="left:510px;top:396px;width:400px;height:200px;opacity:.4"></div>
        <div class="f05-win">
          <div class="f05-grip"></div>
          <div class="f05-whead">{LIT_MARK}Lit DevTools<div class="f05-tabs"><b>Components</b><span>Updates</span><span>Timeline</span></div></div>
          <div class="f05-tree">
            <div>astro-island</div>
            <div class="sel">&nbsp;&nbsp;tag-list {pill('hyd', 'hydrated')}</div>
            <div>ssr-counter {pill('hyd', 'hydrated')}</div>
            <div>launch-timer {pill('warn', 'deferred')}</div>
            <div>mission-map</div>
          </div>
        </div>
        <div class="f05-ghost"></div>
        <div class="f05-tb">
          <img src="assets/astro-icon.svg" alt="" />
          <span class="f05-ic round"></span>
          <span class="f05-ic"></span>
          <span class="f05-lit">{LIT_MARK}<i></i></span>
          <span class="f05-ic round"></span>
        </div>
      </div>
      <div class="sx-ripple"></div>
      {CURSOR}''', '''
      colIn(0.1);
      tl.fromTo(q('.f05-browser'), { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0.1);
      var win = q('.f05-win'), cursor = q('.sx-cursor'), ripple = q('.sx-ripple'), tb = q('.f05-tb'), ghost = q('.f05-ghost');
      // Browser origin on the canvas, and the window's bottom-centre anchor.
      var BXo = 820, BYo = 130, AX = 70 + 420, AY = 150 + 530;
      var SMALL = 580 / 840;
      // Click the Lit button in Astro's toolbar on beat 3 (cursor-click-ripple).
      var LX = BXo + 325 + 222, LY = BYo + 718 + 29;
      tl.set(cursor, { opacity: 1 }, 0.2);
      tl.fromTo(cursor, { x: 1700, y: 1010 }, { x: LX - 4, y: LY - 4, duration: 0.6, ease: 'power3.inOut', immediateRender: false }, 0.2);
      tl.to(cursor, { scale: 0.88, duration: 0.09, ease: 'power2.in', yoyo: true, repeat: 1 }, 0.9375);
      tl.set(ripple, { left: LX, top: LY, opacity: 1, scale: 0 }, 0.9375);
      tl.to(ripple, { scale: 1.8, opacity: 0, duration: 0.55, ease: 'power2.out' }, 0.9375);
      tl.fromTo(q('.f05-lit i'), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' }, 0.98);
      // The window opens at its saved size, bottom-anchored above the toolbar.
      tl.fromTo(win, { opacity: 0, scale: SMALL * 0.9, y: 20 }, { opacity: 1, scale: SMALL, y: 0, duration: 0.55, ease: 'power3.out' }, 1.0);
      // Grab the grip (top-left corner of the scaled window) and drag it out: matched tweens, cursor locked to the corner (cursor-drag, corner-handle resize).
      function gripAt(s) { return { x: BXo + AX + (70 + 18 - AX) * s, y: BYo + AY + (150 + 18 - AY) * s }; }
      var g0 = gripAt(SMALL);
      tl.to(cursor, { x: g0.x - 6, y: g0.y - 6, duration: 0.85, ease: 'power3.inOut' }, 1.6);
      tl.to(cursor, { scale: 0.88, duration: 0.1, ease: 'power1.in' }, 2.62);
      tl.set(ghost, { opacity: 1 }, 2.8125);
      var size = { s: SMALL };
      tl.fromTo(size, { s: SMALL }, { s: 1, duration: 1.2, ease: 'power2.inOut', immediateRender: false, onUpdate: function () {
        gsap.set(win, { scale: size.s });
        var g = gripAt(size.s);
        gsap.set(cursor, { x: g.x - 6, y: g.y - 6 });
      } }, 2.8125);
      tl.to(cursor, { scale: 1, duration: 0.2, ease: 'back.out(2)' }, 4.02);
      tl.to(cursor, { x: 1760, y: 1000, opacity: 0, duration: 0.6, ease: 'power3.in' }, 4.1);
      // Re-dock: the toolbar moves bottom-right on beat 10 and the window follows its dock.
      tl.to(ghost, { opacity: 0, duration: 0.3 }, 4.45);
      tl.to(tb, { x: 300, duration: 0.6, ease: 'power3.inOut' }, 4.6875);
      tl.to(win, { x: 46, duration: 0.6, ease: 'power3.inOut' }, 4.76);
'''))

# ── 06 Warp ────────────────────────────────────────────────
STAR = '<svg viewBox="0 0 24 24"><path class="f06-sp" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" stroke-width="1.4"/></svg>'
frames.append(('06-warp', 30.906, 7.774, 0.9609, '''
    .f06-browser { left: 820px; top: 150px; width: 980px; height: 760px; background: #0f1117; opacity: 0; }
    .f06-url { position: relative; }
    .f06-url span { position: absolute; left: 14px; }
    .f06-page { position: absolute; left: 0; top: 52px; right: 0; bottom: 0; transform-origin: 490px 354px; }
    .f06-old { opacity: 1; }
    .f06-new { opacity: 0; }
    .f06-row { position: absolute; left: 60px; width: 860px; height: 120px; border-radius: 14px; background: #15171e; border: 1px solid #343841; display: flex; align-items: center; gap: 24px; padding: 0 28px; font: 700 28px/1 'Space Grotesk', sans-serif; color: #e9e6f2; }
    .f06-row i { width: 64px; height: 64px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #e9e6f2, #6d7080 75%); flex: none; }
    .f06-prod { position: absolute; left: 60px; top: 58px; width: 470px; height: 590px; border-radius: 14px; background: #15171e; border: 1px solid #343841; overflow: hidden; }
    .f06-img { height: 300px; background: radial-gradient(circle at 70% 30%, #8D46E7 0%, #3a1f6e 45%, #15171e 100%); position: relative; }
    .f06-moon { position: absolute; left: 150px; top: 70px; width: 170px; height: 170px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #e9e6f2, #8a8d9c 70%); }
    .f06-title { margin: 26px 28px 0; font: 700 34px/1.1 'Space Grotesk', sans-serif; color: #f7f4ff; }
    .f06-stars { margin: 22px 28px 0; display: flex; gap: 10px; }
    .f06-stars svg { width: 44px; height: 44px; }
    .f06-sp { fill: none; stroke: #6d7080; }
    .f06-on { position: relative; display: inline-flex; }
    .f06-on svg + svg { position: absolute; left: 0; top: 0; opacity: 0; }
    .f06-on svg + svg .f06-sp { fill: #F041FF; stroke: #F041FF; }
    .f06-price { margin: 22px 28px 0; font: 700 28px/1 'Space Mono', monospace; color: #e9e6f2; }
    .f06-tree { position: absolute; left: 580px; top: 98px; width: 350px; padding: 24px; border-radius: 14px; background: #13151a; border: 1px solid #343841; opacity: 0;
      font: 400 19px/46px 'Space Mono', monospace; color: #a7a9b8; }
    .f06-tree .sr { color: #8a8d9c; font-style: italic; }
    .f06-tree .sx-swap { margin-left: 10px; }
    .f06-tree .sx-pill { height: 30px; font-size: 16px; }
    .f06-arrow { position: absolute; left: 580px; top: 468px; width: 350px; font: 500 24px/1.4 'Space Grotesk', sans-serif; color: #a7a9b8; opacity: 0; }
    .f06-arrow b { display: block; margin-bottom: 10px; font: 700 18px/1 'Space Mono', monospace; letter-spacing: 0.14em; text-transform: uppercase; color: #F041FF; }
''', col('View transitions', ['Warp', 'to', 'the', 'next', 'page.', 'Still', '<em>lit</em>.'],
         'Even components nested in another’s shadow root upgrade and hydrate.') + '''
      <div class="sx-card f06-browser">
        <div class="sx-bar"><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-dot"></span><span class="sx-browser-url f06-url"><span class="f06-u1">localhost:4321/missions</span><span class="f06-u2" style="opacity:0">localhost:4321/missions/lunar-rover</span></span></div>
        <div class="f06-page f06-old">
          <div class="f06-row" style="top:58px"><i></i>Lunar Rover Kit</div>
          <div class="f06-row" style="top:202px"><i></i>Orbital Tent</div>
          <div class="f06-row" style="top:346px"><i></i>Comet Thermos</div>
        </div>
        <div class="f06-page f06-new">
          <div class="f06-prod">
            <div class="f06-img"><div class="f06-moon"></div></div>
            <div class="f06-title">Lunar Rover Kit</div>
            <div class="f06-stars">''' + ''.join(
    f'<span class="f06-on">{STAR}{STAR}</span>' if i < 3 else STAR for i in range(5)) + '''</div>
            <div class="f06-price">€ 4,200</div>
          </div>
          <div class="f06-tree">
            <div>mission-card</div>
            <div class="sr">&nbsp;&nbsp;#shadow-root</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;wa-rating''' + swap('not hydrated') + '''</div>
          </div>
          <div class="f06-arrow"><b>After the transition</b>Upgraded and hydrated, like on a full page load.</div>
        </div>
      </div>''', '''
      colIn(0.1);
      tl.fromTo(q('.f06-browser'), { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, 0);
      // The jump (synced with the space layer's warp, peak at +1.875s): the old page is pulled into the centre…
      var oldP = q('.f06-old'), newP = q('.f06-new');
      tl.to(oldP, { scale: 0.35, opacity: 0, filter: 'blur(14px)', duration: 1.3, ease: 'power3.in' }, 0.575);
      tl.set(q('.f06-u1'), { opacity: 0 }, 1.875);
      tl.set(q('.f06-u2'), { opacity: 1 }, 1.875);
      // …and the new one comes out of it on the far side.
      tl.fromTo(newP, { opacity: 0, scale: 1.6, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.95, ease: 'power3.out' }, 1.875);
      tl.fromTo(q('.f06-tree'), { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, 2.8);
      // The nested rating hydrates on bar 3 and its stars light one per beat.
      hydrate(q('.f06-tree .sx-swap'), 3.75);
      qa('.f06-on').forEach(function (s, i) {
        var lit = s.querySelectorAll('svg')[1];
        tl.fromTo(lit, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.8)' }, 3.75 + i * BEAT);
      });
      tl.fromTo(q('.f06-arrow'), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 4.69);
'''))

# ── 07 Lockup ──────────────────────────────────────────────
frames.append(('07-lockup', 38.68, 4.92, 0.9609, '''
    .f07-glow { position: absolute; left: 460px; top: -60px; width: 1000px; height: 1000px; border-radius: 50%; opacity: 0;
      background: radial-gradient(circle, rgba(240,65,255,0.45) 0%, rgba(141,70,231,0.22) 40%, rgba(141,70,231,0) 68%); }
    .f07-marks { position: absolute; left: 0; right: 0; top: 230px; display: flex; justify-content: center; align-items: center; gap: 56px; }
    .f07-a { width: 112px; height: 141px; opacity: 0; }
    .f07-l { width: 112px; height: 140px; filter: drop-shadow(0 0 26px rgba(77,99,255,0.55)); opacity: 0; }
    .f07-x { font: 400 44px/1 'Space Mono', monospace; color: #a7a9b8; opacity: 0; }
    .f07-title { position: absolute; left: 0; right: 0; top: 450px; text-align: center; font: 700 104px/1 'Space Grotesk', sans-serif; letter-spacing: -0.035em; color: #f7f4ff; }
    .f07-title em { font-style: normal; color: #F041FF; }
    .f07-cmd { position: absolute; left: 0; right: 0; margin: 0 auto; width: fit-content; top: 620px; height: 76px; padding: 0 34px; border-radius: 999px; background: #15171e;
      border: 1px solid #343841; display: flex; align-items: center; font: 400 28px/1 'Space Mono', monospace; color: #e9e6f2; white-space: nowrap; opacity: 0; }
    .f07-note { position: absolute; left: 0; right: 0; top: 730px; text-align: center; font: 400 24px/1 'Space Grotesk', sans-serif; color: #a7a9b8; opacity: 0; }
    .f07-fade { position: absolute; inset: 0; background: #0d0f14; opacity: 0; }
''', '''<div class="f07-glow"></div>
      <div class="f07-marks">
        <img class="f07-a" src="assets/astro-icon.svg" alt="" />
        <div class="f07-x">×</div>
        <img class="f07-l" src="assets/flame.svg" alt="" />
      </div>
      <div class="f07-title">''' + ' '.join(f'<span class="sx-w">{w}</span>' for w in ['vite-plugin-lit', '<em>0.20</em>']) + '''</div>
      <div class="f07-cmd"><span class="k">import</span>&nbsp;lit&nbsp;<span class="k">from</span>&nbsp;<span class="s">'@oddsquad/vite-plugin-lit/astro'</span></div>
      <div class="f07-note">For Astro 7.3 and later</div>
      <div class="f07-fade"></div>''', '''
      // The final hit: both marks bloom from zero together with the glow (logo-assemble-lockup, spring bloom).
      tl.fromTo(q('.f07-glow'), { opacity: 0, scale: 0.6 }, { opacity: 0.6, scale: 1, duration: 0.9, ease: 'power2.out' }, 0);
      tl.fromTo(q('.f07-a'), { opacity: 0, scale: 0, x: 120 }, { opacity: 1, scale: 1, x: 0, duration: 0.6, ease: 'power3.out' }, 0);
      tl.fromTo(q('.f07-l'), { opacity: 0, scale: 0, x: -120 }, { opacity: 1, scale: 1, x: 0, duration: 0.6, ease: 'power3.out' }, 0);
      tl.fromTo(q('.f07-x'), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, 0.25);
      var tt = 0.47;
      qa('.sx-w').forEach(function (w, i) {
        tl.set(w, { opacity: 1, y: i ? 90 : 70 }, tt);
        tl.to(w, { y: 0, duration: i ? 0.22 : 0.18, ease: 'power4.out' }, tt);
        tt += 0.16;
      });
      tl.fromTo(q('.f07-cmd'), { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }, 0.94);
      tl.fromTo(q('.f07-note'), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 1.41);
      // The film fades with the music over the last half bar.
      tl.to(q('.f07-fade'), { opacity: 1, duration: 0.86, ease: 'power1.in' }, 3.6);
'''))

out = ROOT / 'compositions' / 'frames'
for fid, start, dur, k, css, body, script in frames:
    (out / f'{fid}.html').write_text(frame('s' + fid, dur, k, css, body, script))

hosts = '\n'.join(
    f'''      <div id="el-s{fid}" class="scene" data-composition-id="s{fid}" data-composition-src="compositions/frames/{fid}.html"
        data-start="{start}" data-duration="{dur}" data-track-index="{1 + i % 2}"></div>'''
    for i, (fid, start, dur, _, _, _, _) in enumerate(frames))

(ROOT / 'index.html').write_text(f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: #0d0f14; }}
      #root {{ position: relative; width: 100%; height: 100%; overflow: hidden; }}
      .scene {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="43.6" data-width="1920" data-height="1080">
      <div id="el-space" class="scene" data-composition-id="space" data-composition-src="compositions/space.html"
        data-start="0" data-duration="43.6" data-track-index="0"></div>
{hosts}
      <audio id="bgm" src="assets/bgm/groche-energique-space.m4a" data-start="0" data-duration="43.6" data-track-index="9" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines['main'] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
''')
print('ok', len(frames))
