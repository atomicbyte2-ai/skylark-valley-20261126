// SPDX-License-Identifier: MIT
// Screens drawn into #menu-layer: the title and mission select, the mission-complete / mission-failed
// result card with stars and a score breakdown, and the pause overlay.

import { CONTROL_HELP } from './controls.js';

const BEST_KEY = 'skylark-valley-best';

export function loadBestResults() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveBestResult(result) {
  const best = loadBestResults();
  const previous = best[result.missionId];
  if (!previous || result.score > previous.score) {
    best[result.missionId] = { score: result.score, stars: result.stars };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {
      /* storage may be unavailable; best scores then last for the session only */
    }
  }
  return best;
}

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function starRow(stars, total = 3) {
  return Array.from({ length: total }, (_, i) => (i < stars ? '★' : '<span class="off">★</span>')).join('');
}

export class MenuScreens {
  constructor(layer) {
    this.layer = layer;
    this.onPick = null;
    this.selected = 0;
  }

  clear() {
    this.layer.innerHTML = '';
    this.mode = null;
  }

  showTitle(missions, best = loadBestResults()) {
    this.mode = 'title';
    this.missions = missions;
    const cards = missions
      .map((m, i) => {
        const b = best[m.id];
        return `<div class="mission-card${i === this.selected ? ' selected' : ''}" data-index="${i}">
          <div class="num">${i + 1} · ${escapeHtml(m.place.toUpperCase())}</div>
          <div class="name">${escapeHtml(m.title)}</div>
          <div class="desc">${escapeHtml(m.card ?? m.blurb)}</div>
          <div class="stars">${b ? `${starRow(b.stars)} <small>best ${b.score}</small>` : `${starRow(0)} <small>not flown</small>`}</div>
        </div>`;
      })
      .join('');
    const controls = CONTROL_HELP.map(([keys, what]) => `<span><b>${escapeHtml(keys)}</b></span><span>${escapeHtml(what)}</span>`).join('');
    this.layer.innerHTML = `<div class="title-screen">
      <div>
        <div class="title-mark">Merrow M-2 Skylark · Lake Ondine</div>
        <div class="title-name">Skylark<br>Valley</div>
        <div class="title-tag">Take off, thread the gorge, haul supplies up the mountain and land it softly.</div>
        <div class="mission-list">${cards}</div>
        <div class="start-hint">PRESS 1–4 OR CLICK A MISSION · ENTER TO FLY</div>
      </div>
      <div class="controls-box panel">${controls}</div>
    </div>`;
    this.layer.querySelectorAll('.mission-card').forEach((card) => {
      card.addEventListener('click', () => this.onPick?.(Number(card.dataset.index)));
      card.addEventListener('mouseenter', () => this.select(Number(card.dataset.index)));
    });
  }

  select(index) {
    if (this.mode !== 'title') return;
    this.selected = (index + this.missions.length) % this.missions.length;
    this.layer.querySelectorAll('.mission-card').forEach((card, i) => card.classList.toggle('selected', i === this.selected));
  }

  showResult(result, missionIndex, missionCount) {
    this.mode = 'result';
    const rows = (result.lines ?? []).map((line) => `<span>${escapeHtml(line.label)}</span><span>${line.points >= 0 ? '+' : ''}${line.points}</span>`).join('');
    const kicker = result.success ? 'MISSION COMPLETE' : result.crashed ? 'CRASHED' : 'MISSION FAILED';
    const next = result.success && missionIndex < missionCount - 1 ? ' · <b>N</b> next mission' : '';
    this.layer.innerHTML = `<div class="result-screen">
      <div class="result-card panel${result.success ? '' : ' failed'}">
        <div class="result-kicker">${kicker}</div>
        <div class="result-title">${escapeHtml(result.title)}</div>
        <div class="result-reason">${escapeHtml(result.reason)}</div>
        <div class="result-stars">${starRow(result.stars)}</div>
        ${rows ? `<div class="result-rows">${rows}</div>` : ''}
        <div class="result-score"><span>Score</span><span>${result.score}</span></div>
        <div class="result-actions"><b>R</b> fly again · <b>M</b> mission menu${next}</div>
      </div>
    </div>`;
  }

  showPause() {
    this.mode = 'pause';
    this.layer.innerHTML = `<div class="pause-screen"><div>PAUSED<div style="font-size:16px;letter-spacing:2px;font-weight:600;margin-top:12px;text-align:center">Esc / P resume · R restart · M menu</div></div></div>`;
  }
}
