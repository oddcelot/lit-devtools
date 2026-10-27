# Writes index.html from template.html. Every shot is drawn here, natively, on the
# music window of the v4 film (drop A, 8 bars of 1.92 s). Edit this, then run
#   python3 scripts/build.py
import math
import pathlib

HERE = pathlib.Path(__file__).parent

SHOTS = [  # id, start, duration
    ('1', 0.0, 1.92),
    ('2', 1.92, 3.84),
    ('3', 5.76, 3.84),
    ('4', 9.6, 1.92),
]
HEAD = {  # (html, shine: 0 none / 1 line / 2 inner .sh, at)
    '1': [('Lit,', 0, 0.0), ('with the', 1, 0.24), ('lights on.', 1, 0.48)],
    '2': [('Edit.', 0, 1.92), ('Save.', 0, 2.88), ('Keep the <span class="sh">page.</span>', 2, 3.36)],
    '3': [('One sheet.', 0, 5.76), ('A thousand', 0, 6.24), ('shadow roots.', 1, 6.36)],
    '4': [('See why it', 0, 9.6), ('re-rendered.', 1, 9.84)],
}

CSS = """      .shot {
        position: absolute;
        inset: 0;
      }
      .sin {
        position: absolute;
        inset: 0;
      }
      .mono {
        font-family: 'Lilex Variable', ui-monospace, monospace;
      }
      /* 1 · flame */
      #f-glow {
        position: absolute;
        left: 40px;
        top: 560px;
        width: 1000px;
        height: 1000px;
        background: radial-gradient(
          closest-side,
          rgba(0, 232, 255, 0.45),
          rgba(50, 79, 255, 0.25) 45%,
          rgba(42, 44, 157, 0)
        );
        opacity: 0;
      }
      #f-floor {
        position: absolute;
        left: 240px;
        top: 1330px;
        width: 600px;
        height: 80px;
        border-radius: 50%;
        background: radial-gradient(closest-side, rgba(0, 232, 255, 0.35), rgba(0, 232, 255, 0));
        opacity: 0;
      }
      #f-flame {
        position: absolute;
        left: 240px;
        top: 760px;
        width: 600px;
        height: 600px;
        overflow: visible;
      }
      .fp {
        fill: #111326;
        stroke: #2b2e52;
        stroke-width: 1.5;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }
      /* 2 · HMR */
      #h-code {
        position: absolute;
        left: 80px;
        top: 800px;
        font-size: 44px;
        line-height: 56px;
        color: #eeffff;
        white-space: nowrap;
      }
      #h-code .p {
        color: #c7c7c7;
      }
      #h-code .t {
        color: #89ddff;
      }
      #h-code .s {
        color: #c3e88d;
      }
      #h-caret {
        display: inline-block;
        width: 4px;
        height: 46px;
        margin: 0 2px -8px;
        background: #00e8ff;
      }
      #h-title {
        position: absolute;
        left: 80px;
        top: 960px;
        font-size: 76px;
        line-height: 90px;
        font-weight: 600;
        letter-spacing: -0.03em;
        white-space: nowrap;
      }
      #h-title2 {
        opacity: 0;
      }
      #h-btn {
        position: absolute;
        left: 80px;
        top: 1110px;
        height: 170px;
        padding: 0 60px;
        display: flex;
        align-items: center;
        gap: 28px;
        border: 3px solid #4d63ff;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
        font-size: 96px;
        font-weight: 600;
        letter-spacing: -0.03em;
        white-space: nowrap;
      }
      #h-glowline {
        position: absolute;
        inset: -3px;
        border: 3px solid #00e8ff;
        box-shadow: 0 0 60px rgba(0, 232, 255, 0.7);
        opacity: 0;
      }
      #h-btn {
        background: #0f1430;
      }
      #h-flap {
        position: relative;
        width: 150px;
        height: 130px;
        perspective: 600px;
      }
      .fl {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a2150;
        border: 1px solid #2f3a8c;
        color: #00e8ff;
        backface-visibility: hidden;
        transform-origin: 50% 50%;
      }
      .fl::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        height: 2px;
        background: rgba(3, 3, 8, 0.7);
      }
      #h-chip {
        position: absolute;
        left: 80px;
        top: 1350px;
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 36px;
        color: #c7c7c7;
        white-space: nowrap;
        opacity: 0;
      }
      #h-chip i {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #00e8ff;
        box-shadow: 0 0 14px #00e8ff;
      }
      #h-renders {
        position: absolute;
        left: 80px;
        top: 1420px;
        font-size: 36px;
        color: #c7c7c7;
        white-space: nowrap;
        opacity: 0;
      }
      #h-renders b {
        color: #fff;
        font-weight: 500;
      }
      /* 3 · 1,000 shadow roots */
      #g-grid {
        position: absolute;
        left: 0;
        top: 0;
      }
      .dot {
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #324fff;
      }
      #g-code {
        position: absolute;
        left: 80px;
        top: 636px;
        font-size: 34px;
        line-height: 48px;
        color: #eeffff;
        white-space: nowrap;
        transform-origin: 0 50%;
        opacity: 0;
      }
      #g-code .k {
        color: #c792ea;
      }
      #g-code .s {
        color: #c3e88d;
      }
      #g-code .p {
        color: #c7c7c7;
      }
      #g-chips {
        position: absolute;
        left: 0;
        top: 1590px;
        width: 1080px;
        display: flex;
        justify-content: center;
        gap: 22px;
      }
      .chip {
        padding: 8px 26px;
        background: #0f1430;
        border: 2px solid #2f3a8c;
        font-size: 34px;
        font-weight: 500;
        color: #c7c7c7;
        white-space: nowrap;
        opacity: 0;
      }
      #g-count {
        position: absolute;
        left: 0;
        top: 1690px;
        width: 1080px;
        text-align: center;
        font-size: 38px;
        color: #c7c7c7;
        white-space: nowrap;
        opacity: 0;
      }
      #g-count b {
        color: #fff;
        font-weight: 500;
      }
      #g-count i {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #2ee09f;
        margin: 0 12px 2px 30px;
      }
      /* 4 · cause rails */
      .row {
        position: absolute;
        left: 190px;
        height: 70px;
        display: flex;
        align-items: center;
        gap: 22px;
        font-size: 44px;
        color: #e3e3e3;
        white-space: nowrap;
        opacity: 0;
      }
      .row i {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        flex: none;
      }
      .row span {
        color: #c7c7c7;
        font-size: 34px;
      }
      .row .warn {
        color: #f4bf4f;
      }
      #r-rails {
        position: absolute;
        left: 0;
        top: 0;
        width: 1080px;
        height: 1920px;
        overflow: visible;
      }
"""

FLAME = [  # id, colour, path (viewBox -32 0 320 320), entry offset
    ('fl1', '#00e8ff', 'M64 192l25.926-44.727l38.233-19.114l63.974 63.974l10.833 61.754L192 320l-64-64l-38.074-25.615z', (90, 120)),
    ('fl2', '#283198', 'M128 256V128l64-64v128z', (120, -90)),
    ('fl3', '#283198', 'M0 256l64 64l9.202-60.602L64 192l-37.542 23.71z', (-120, 90)),
    ('fl4', '#324fff', 'M64 192V64l64-64v128z', (-90, -150)),
    ('fl5', '#324fff', 'M192 320V192l64-64v128z', (150, 30)),
    ('fl6', '#324fff', 'M0 256V128l64 64z', (-150, -30)),
    ('fl7', '#00ffff', 'M64 320V192l64 64z', (-30, 150)),
]

ROWS = [  # layer colour, name, detail
    ('#a451af', 'click', '(385, 540)'),
    ('#325cff', 'performUpdate', 'hmr-task'),
    ('#4d63ff', 'task', '302.8ms'),
    ('#6b7bff', 'edit factor 2 → 4', ''),
    ('#325cff', 'performUpdate', 'hmr-properties'),
    ('#325cff', 'performUpdate', '<b class="warn">2×</b> echoed'),
]
ROW_Y = [660 + 124 * i for i in range(len(ROWS))]
RAILS = [  # colour, x, from row, to row, at
    ('#20c997', 110, 0, 2, 9.84),
    ('#e64980', 140, 3, 4, 10.08),
    ('#fd7e14', 80, 4, 5, 10.32),
]

out, js = [], []
T = lambda *a: js.append(''.join(a))

# ---------- 1 · flame lights on ----------
paths = ''.join(f'<path id="{i}" class="fp" d="{d}"/>' for i, c, d, o in FLAME)
out.append(f'''      <div class="shot clip" id="s1" data-start="0" data-duration="1.92" data-track-index="1">
        <div class="sin" id="s1in">
          <div id="f-glow"></div>
          <div id="f-floor"></div>
          <svg id="f-flame" viewBox="-32 0 320 320">{paths}</svg>
        </div>
      </div>
''')
for k, (i, c, d, (ox, oy)) in enumerate(FLAME):
    T(f"        tl.fromTo('#{i}', {{x: {ox}, y: {oy}, opacity: 0, rotation: {(-1) ** k * 12}}}, "
      f"{{x: 0, y: 0, opacity: 1, rotation: 0, duration: 0.34, ease: 'power3.out'}}, {0.03 * k:.2f});\n")
for t, on in ((0.48, 1), (0.54, 0), (0.6, 1)):
    for i, c, d, o in FLAME:
        fill = c if on else '#111326'
        stroke = c if on else '#2b2e52'
        T(f"        tl.set('#{i}', {{fill: '{fill}', stroke: '{stroke}'}}, {t});\n")
    T(f"        tl.set(['#f-glow', '#f-floor'], {{opacity: {0.7 if on else 0}}}, {t});\n")
T("        tl.fromTo(['#f-glow', '#f-floor'], {scale: 0.8}, {scale: 1.1, opacity: 1, duration: 1.1, ease: 'sine.out', immediateRender: false}, 0.6);\n")
T("        tl.fromTo('#f-flame', {y: 0, scale: 1}, {y: -24, scale: 1.04, duration: 1.3, ease: 'sine.inOut'}, 0.5);\n")
for i, c, d, (ox, oy) in FLAME:
    T(f"        tl.to('#{i}', {{x: {ox * 3}, y: {oy * 3}, opacity: 0, duration: 0.16, ease: 'power2.in'}}, 1.76);\n")
T("        tl.to(['#f-glow', '#f-floor'], {opacity: 0, duration: 0.16}, 1.76);\n")

# ---------- 2 · HMR keeps the page ----------
typed = ': edited live'
chars = ''.join(f'<span class="tc" id="tc{n}" style="display: none">{ch.replace(" ", "&nbsp;")}</span>' for n, ch in enumerate(typed))
out.append(f'''      <div class="shot clip" id="s2" data-start="1.92" data-duration="3.84" data-track-index="1">
        <div class="sin" id="s2in">
          <div id="h-code" class="mono"><span class="p">&lt;</span><span class="t">h2</span><span class="p">&gt;</span><span class="s">Counter{chars}</span><i id="h-caret"></i><span class="p">&lt;/</span><span class="t">h2</span><span class="p">&gt;</span></div>
          <div id="h-title"><span id="h-title1">Counter</span></div>
          <div id="h-title2b" style="position: absolute; left: 80px; top: 960px; font-size: 76px; line-height: 90px; font-weight: 600; letter-spacing: -0.03em; white-space: nowrap"><span id="h-title2">Counter: edited live</span></div>
          <div id="h-btn">Count:<div id="h-flap"><div class="fl" id="fl39">39</div><div class="fl" id="fl40">40</div><div class="fl" id="fl41">41</div><div class="fl" id="fl42">42</div><div class="fl" id="fl42b">42</div></div><div id="h-glowline"></div></div>
          <div id="h-chip" class="mono"><i></i>hmr update · 0.8ms</div>
          <div id="h-renders" class="mono">renders <b id="h-r1">1</b><b id="h-r2" style="display: none">2</b> · state kept</div>
        </div>
      </div>
''')
T("        tl.fromTo('#h-code', {opacity: 0, x: -40}, {opacity: 1, x: 0, duration: 0.35, ease: 'power3.out'}, 1.92);\n")
T("        tl.fromTo('#h-title', {opacity: 0, x: -40}, {opacity: 1, x: 0, duration: 0.35, ease: 'power3.out'}, 2.0);\n")
T("        tl.fromTo('#h-btn', {opacity: 0, y: 60, scale: 0.92}, {opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.6)'}, 2.1);\n")
for n in range(len(typed)):
    T(f"        tl.set('#tc{n}', {{display: 'inline'}}, {2.4 + 0.045 * n:.3f});\n")
T("        tl.fromTo('#h-caret', {opacity: 1}, {opacity: 0, duration: 0.1}, 3.2);\n")
# the save hit
T("        tl.fromTo('#h-code', {scale: 1.05}, {scale: 1, duration: 0.4, ease: 'power3.out', immediateRender: false}, 3.36);\n")
T("        tl.set('#h-title1', {opacity: 0}, 3.36);\n")
T("        tl.fromTo('#h-title2', {opacity: 0, y: 24}, {opacity: 1, y: 0, duration: 0.3, ease: 'power3.out'}, 3.36);\n")
T("        tl.fromTo('#h-glowline', {opacity: 1}, {opacity: 0, duration: 0.7, ease: 'power2.out', immediateRender: false}, 3.36);\n")
# split-flap: clicks count 39 -> 42 before the edit, then one flip after the save lands on 42 again
T("        tl.set(['#fl40', '#fl41', '#fl42', '#fl42b'], {rotationX: 90}, 0);\n")
for a, b, t in (('fl39', 'fl40', 2.4), ('fl40', 'fl41', 2.64), ('fl41', 'fl42', 2.88), ('fl42', 'fl42b', 3.6)):
    T(f"        tl.to('#{a}', {{rotationX: -90, duration: 0.09, ease: 'power2.in'}}, {t});\n")
    T(f"        tl.to('#{b}', {{rotationX: 0, duration: 0.14, ease: 'back.out(2.5)'}}, {t + 0.09:.2f});\n")
T("        tl.fromTo('#fl42b', {boxShadow: '0 0 0px rgba(0,232,255,0)'}, {boxShadow: '0 0 40px rgba(0,232,255,0.8)', duration: 0.2, yoyo: true, repeat: 1, immediateRender: false}, 3.7);\n")
T("        tl.fromTo('#h-chip', {opacity: 0, x: -30}, {opacity: 1, x: 0, duration: 0.3, ease: 'power3.out'}, 3.36);\n")
T("        tl.fromTo('#h-renders', {opacity: 0, x: -30}, {opacity: 1, x: 0, duration: 0.3, ease: 'power3.out'}, 3.6);\n")
T("        tl.set('#h-r1', {display: 'none'}, 3.6);\n        tl.set('#h-r2', {display: 'inline'}, 3.6);\n")
T("        tl.to('#h-btn', {y: -16, duration: 1.8, ease: 'sine.inOut'}, 3.8);\n")
T("        tl.to('#s2in', {opacity: 0, y: -60, duration: 0.15, ease: 'power2.in'}, 5.61);\n")

# ---------- 3 · one sheet, 1,000 shadow roots ----------
COLS, ROWS_N, PITCH = 25, 40, 21
gx, gy = (1080 - (COLS - 1) * PITCH - 16) // 2, 720
cx, cy = (COLS - 1) / 2, (ROWS_N - 1) / 2
dots, order = [], []
for r in range(ROWS_N):
    for c in range(COLS):
        dots.append(f'<i class="dot" style="left: {gx + c * PITCH}px; top: {gy + r * PITCH}px"></i>')
out.append(f'''      <div class="shot clip" id="s3" data-start="5.76" data-duration="3.84" data-track-index="1">
        <div class="sin" id="s3in">
          <div id="g-grid">{''.join(dots)}</div>
          <div id="g-code" class="mono"><span class="k">import</span> sheet <span class="k">from</span> <span class="s">'./<span id="gf0">theme</span><span id="gf1" style="display: none">tailwind</span><span id="gf2" style="display: none">uno</span><span id="gf3" style="display: none">theme</span>.css?css-sheet'</span><span class="p">;</span></div>
          <div id="g-chips"><div class="chip" id="ch0">Tailwind v4</div><div class="chip" id="ch1">UnoCSS</div><div class="chip" id="ch2">plain CSS</div></div>
          <div id="g-count" class="mono"><b>1,000</b> shadow roots<i></i>0 re-renders</div>
        </div>
      </div>
''')
T("        var dots = gsap.utils.toArray('#g-grid .dot');\n")
T(f"        tl.fromTo(dots, {{scale: 0, opacity: 0}}, {{scale: 1, opacity: 0.75, duration: 0.2, ease: 'back.out(2)', "
  f"stagger: {{each: 0.00028, grid: [{ROWS_N}, {COLS}], from: 'center'}}}}, 5.76);\n")
T("        tl.set(dots, {backgroundColor: '#ffffff', opacity: 1, scale: 1.25}, 6.24);\n")
T("        tl.to(dots, {backgroundColor: '#00e8ff', scale: 1, duration: 0.3, ease: 'power2.out'}, 6.3);\n")
T("        tl.fromTo('#g-grid', {scale: 1.04}, {scale: 1, duration: 0.6, ease: 'power3.out', transformOrigin: '540px 1200px', immediateRender: false}, 6.24);\n")
T("        tl.fromTo('#g-count', {opacity: 0, y: 30}, {opacity: 1, y: 0, duration: 0.35, ease: 'power3.out'}, 6.48);\n")
T("        tl.fromTo('#g-code', {opacity: 0, x: -40}, {opacity: 1, x: 0, duration: 0.35, ease: 'power3.out'}, 5.82);\n")
T("        tl.fromTo('#g-code', {scale: 1.06}, {scale: 1, duration: 0.4, ease: 'power3.out', immediateRender: false}, 6.24);\n")
for k, (t, col) in enumerate(((7.2, '#38bdf8'), (7.68, '#a78bfa'), (8.16, '#4d63ff'))):
    T(f"        tl.set(dots, {{backgroundColor: '#ffffff'}}, {t});\n")
    T(f"        tl.set('#gf{k}', {{display: 'none'}}, {t});\n        tl.set('#gf{k + 1}', {{display: 'inline'}}, {t});\n")
    T(f"        tl.fromTo('#g-code', {{scale: 1.05}}, {{scale: 1, duration: 0.3, ease: 'power3.out', immediateRender: false}}, {t});\n")
    T(f"        tl.fromTo('#ch{k}', {{opacity: 0, y: 30, scale: 0.8}}, {{opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(2)'}}, {t});\n")
    T(f"        tl.set('#ch{k}', {{borderColor: '{col}', color: '#ffffff', boxShadow: '0 0 24px {col}'}}, {t});\n")
    if k:
        T(f"        tl.set('#ch{k - 1}', {{borderColor: '#2f3a8c', color: '#c7c7c7', boxShadow: 'none'}}, {t});\n")
    T(f"        tl.to(dots, {{backgroundColor: '{col}', duration: 0.24, ease: 'power2.out'}}, {t + 0.04:.2f});\n")
T("        tl.to('#s3in', {opacity: 0, scale: 0.94, duration: 0.15, ease: 'power2.in', transformOrigin: '540px 1150px'}, 9.45);\n")

# ---------- 4 · see why it re-rendered ----------
rows = ''.join(
    f'<div class="row mono" id="row{n}" style="top: {ROW_Y[n]}px"><i style="background: {c}"></i>{name}<span>{det}</span></div>'
    for n, (c, name, det) in enumerate(ROWS))
rails = ''
for k, (c, x, a, b, at) in enumerate(RAILS):
    y0, y1 = ROW_Y[a] + 35, ROW_Y[b] + 35
    rails += (f'<path id="rail{k}" d="M{x + 40} {y0} H{x} V{y1} H{x + 40}" fill="none" stroke="{c}" stroke-width="5" '
              f'pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>')
    for m, y in enumerate(range(a, b + 1)):
        rails += f'<circle id="rn{k}_{m}" cx="{x + 40}" cy="{ROW_Y[y] + 35}" r="8" fill="{c}" opacity="0"/>'
out.append(f'''      <div class="shot clip" id="s4" data-start="9.6" data-duration="1.92" data-track-index="1">
        <div class="sin" id="s4in">
          <svg id="r-rails" viewBox="0 0 1080 1920">{rails}</svg>
          {rows}
        </div>
      </div>
''')
for n in range(len(ROWS)):
    T(f"        tl.fromTo('#row{n}', {{opacity: 0, x: 60}}, {{opacity: 1, x: 0, duration: 0.3, ease: 'power3.out'}}, {9.6 + 0.05 * n:.2f});\n")
for k, (c, x, a, b, at) in enumerate(RAILS):
    T(f"        tl.to('#rail{k}', {{attr: {{'stroke-dashoffset': 0}}, duration: 0.3, ease: 'power2.inOut'}}, {at});\n")
    for m in range(b - a + 1):
        T(f"        tl.to('#rn{k}_{m}', {{attr: {{opacity: 1}}, duration: 0.1}}, {at + 0.1 * m:.2f});\n")
T("        tl.to('#row5', {x: 14, duration: 0.06, yoyo: true, repeat: 3, ease: 'power1.inOut'}, 10.56);\n")
T("        tl.to('#s4in', {opacity: 0, y: -60, duration: 0.15, ease: 'power2.in'}, 11.37);\n")

# ---------- headlines ----------
heads = ''
for sid, start, dur in SHOTS:
    lines = ''
    for i, (t, sh, at) in enumerate(HEAD[sid]):
        cls = 'ln' + (' shine' if sh == 1 else '')
        lines += f'        <div class="{cls}" id="h{sid}l{i}" style="top: {i * 118}px">{t}</div>\n'
        T(f"        tl.fromTo('#h{sid}l{i}', {{y: 90, opacity: 0, rotation: 3}}, {{y: 0, opacity: 1, rotation: 0, duration: 0.42, ease: 'back.out(1.6)'}}, {at});\n")
        if sh:
            sel = f'#h{sid}l{i}' + (' .sh' if sh == 2 else '')
            T(f"        tl.fromTo('{sel}', {{backgroundPosition: '0% 50%'}}, {{backgroundPosition: '100% 50%', duration: {start + dur - at:.2f}, ease: 'none'}}, {at});\n")
    heads += f'      <div class="head clip" id="h{sid}" data-start="{start}" data-duration="{dur}" data-track-index="2">\n{lines}      </div>\n'
    T(f"        tl.to('#h{sid} .ln', {{opacity: 0, y: -40, duration: 0.15, ease: 'power2.in'}}, {start + dur - 0.15:.2f});\n")

tpl = HERE.joinpath('template.html').read_text()
html = (tpl.replace('__SHOTCSS__', CSS).replace('__SHOTS__', ''.join(out))
        .replace('__HEADS__', heads).replace('        __JS__', ''.join(js)))
HERE.parent.joinpath('index.html').write_text(html)
print('wrote index.html')
