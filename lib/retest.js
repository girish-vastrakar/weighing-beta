/* Retest agreement, shared by the weighing app (index.html) and the results page (results.html).
   A flagged result (out of limit, or a possible error) is confirmed when a retest of the same test
   gives the same result, within the allowed gap (data.json settings.retestGap, % points, default 0.5).
   Earlier results of a test come from:
     - the sample's own trail: "Reset a test for retest" keeps the old weights (ev a:'reset', o:[W1, W2, W3])
     - linked codes: "Retest of" in the Name Tags sheet (names.json retestOf), both ways
   Results are compared as weighed (loss % for moisture, VM and TM, residue % for ash), so a change in
   moisture between the two tests does not hide or fake a match. Fixed carbon is confirmed by the VM / Ash retests that were done.
   The newest result is compared with every earlier one: a 3rd test that agrees with either confirms it. */
(function (g) {
  const DEF_GAP = { MC: 0.5, VM: 0.5, ASH: 0.5, TM: 0.5 };
  const NAME = { MC: 'Moisture', VM: 'VM', ASH: 'Ash', TM: 'Total moisture', FC: 'Fixed carbon' };
  const num = v => typeof v === 'number' && isFinite(v);
  const norm = c => String(c || '').replace(/[\s-]/g, '').toUpperCase();
  const r2 = x => Math.round(x * 100) / 100;

  // % as weighed: residue for Ash, loss for the others (VM loss still includes moisture)
  function raw(k, w) {
    if (!Array.isArray(w) || ![0, 1, 2].every(i => num(w[i])) || w[1] === w[0]) return null;
    return r2((k === 'ASH' ? w[2] - w[0] : w[1] - w[2]) / (w[1] - w[0]) * 100);
  }
  function gapOf(settings, k) {
    const s = (settings && settings.retestGap) || {};
    return num(s[k]) && s[k] >= 0 ? s[k] : DEF_GAP[k];
  }
  const resets = (ev, k) => (ev || []).filter(e => e && e.a === 'reset' && e.k === k).map(e => raw(k, e.o)).filter(v => v != null);

  /* ctx: { find(normCode) -> real code or null, w(code) -> { MC: [W1, W2, W3], ... }, ev(code) -> trail,
            names: { NORMCODE: { retestOf } }, settings } */
  function earlier(code, k, ctx) {
    const out = resets(ctx.ev(code), k).map(v => ({ v, from: '' }));
    const me = norm(code), linked = new Set(), info = ctx.names[me] || {};
    if (info.retestOf) linked.add(norm(info.retestOf));
    Object.keys(ctx.names).forEach(c => { const x = ctx.names[c]; if (x && x.retestOf && norm(x.retestOf) === me) linked.add(norm(c)); });
    linked.delete(me);
    linked.forEach(c => {
      const real = ctx.find(c); if (!real) return;
      const v = raw(k, (ctx.w(real) || {})[k]);
      if (v != null) out.push({ v, from: real });
      resets(ctx.ev(real), k).forEach(v2 => out.push({ v: v2, from: real }));
    });
    return out;
  }
  // One test: null when it has no result or no earlier result to compare with
  function check(code, k, ctx) {
    const cur = raw(k, (ctx.w(code) || {})[k]); if (cur == null) return null;
    const list = earlier(code, k, ctx); if (!list.length) return null;
    const best = list.reduce((a, b) => Math.abs(b.v - cur) < Math.abs(a.v - cur) ? b : a);
    const diff = r2(Math.abs(best.v - cur)), gap = gapOf(ctx.settings, k);
    return { k, cur, other: best.v, from: best.from, diff, gap, agree: diff <= gap + 1e-9 };
  }
  // The flagged tests of a sample: agree only when every one has a retest that agrees.
  // Fixed carbon (by difference) is covered by the retests of VM and Ash that were done, at least one of them.
  function confirm(code, keys, ctx) {
    const tests = [...new Set(keys.filter(k => DEF_GAP[k] != null))];
    const res = tests.map(k => check(code, k, ctx)), missing = tests.filter((k, i) => !res[i]);
    if (keys.includes('FC')) {
      const extra = ['VM', 'ASH'].filter(k => !tests.includes(k)).map(k => check(code, k, ctx)).filter(Boolean);
      const fcOk = extra.length || ['VM', 'ASH'].some(k => tests.includes(k) && res[tests.indexOf(k)]);
      res.push(...extra); if (!fcOk) missing.push('FC');
    }
    const done = res.filter(Boolean);
    if (!done.length) return null;
    return { agree: !missing.length && done.every(r => r.agree), res: done, missing };
  }
  const line = r => `${NAME[r.k]} ${r.other.toFixed(2)} → ${r.cur.toFixed(2)} %${r.from ? ` (${r.from})` : ''}, ${r.agree ? 'within' : 'more than'} ±${r.gap}`;
  const text = c => c.res.map(line).join(' · ');

  g.RETEST = { DEF_GAP, NAME, raw, gapOf, check, confirm, line, text, norm };
})(typeof window !== 'undefined' ? window : globalThis);
