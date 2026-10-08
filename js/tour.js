/* First-time hand guide on the dashboard: a pointing hand walks a new Administrator through the menu.
   Shown once per account; "Show the guide again" in Help Center replays it. */
(function () {
  const session = KF.getSession();
  if (!session || session.role !== 'admin' || session.username === KF.SUPPORT_USERNAME) return;
  if (KF.tourDone(session.username)) return;
  if (window.matchMedia('(max-width: 900px)').matches) return;

  const STEPS = [
    {
      target: '#editProfileBtn',
      title: 'Start here',
      text: 'Tap your <strong>profile</strong> at the bottom of the menu to add a photo. You can also set the shop name for receipts and reports.',
    },
    {
      target: '.nav-link[href="categories.html"]',
      title: 'Categories',
      text: 'Group your goods, e.g. Drinks, Snacks, Toiletries. Create categories before adding products.',
    },
    {
      target: '.nav-link[href="products.html"]',
      title: 'Products',
      text: 'Add each item with its picture, cost price, selling price and stock. The shop starts empty — load your real goods here.',
    },
    {
      target: '.nav-link[href="staff.html"]',
      title: 'Staff',
      text: 'Add the people who work here. Tick <em>Create a login account</em> (or use User Accounts) so each cashier can sign in on any till and sell your products.',
    },
    {
      target: '.nav-link[href="pos.html"]',
      title: 'POS — make a sale',
      text: 'Tap products to add them to the order, then checkout and print the receipt. Stock goes down by itself.',
    },
    {
      target: '.panel .chart-box',
      title: 'Sales chart',
      text: 'Every sale shows here by hour. <strong>Blue is today, orange is yesterday</strong>, so you can compare the two days.',
    },
    {
      target: '.nav-link[href="report.html"]',
      title: 'Reports',
      text: 'See sales and profit for any period and export them to Excel or PDF.',
    },
    {
      target: '.nav-link[href="help.html"]',
      title: 'Need help?',
      text: 'Help Center answers common questions. You can replay this guide from there any time.',
    },
    {
      target: '#resetBtn',
      title: 'RESET',
      text: 'Use <strong>RESET</strong> only when you want a clean shop. It deletes products, sales and staff. Your login account stays.',
    },
  ];

  let index = 0;
  let current = null;

  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  const spot = document.createElement('div');
  spot.className = 'tour-spot';
  const hand = document.createElement('i');
  hand.className = 'fa-solid fa-hand-point-left tour-hand';
  hand.setAttribute('aria-hidden', 'true');
  const card = document.createElement('div');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  document.body.append(overlay, spot, hand, card);

  function finish() {
    KF.markTourDone(session.username);
    overlay.remove();
    spot.remove();
    hand.remove();
    card.remove();
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
  }

  function visibleSteps() {
    return STEPS.filter((s) => document.querySelector(s.target));
  }

  function place() {
    if (!current) return;
    // getBoundingClientRect is in zoomed screen pixels; fixed positions are multiplied by the zoom again.
    const zoom = parseFloat(document.documentElement.style.zoom) || 1;
    const b = current.getBoundingClientRect();
    const r = { left: b.left / zoom, top: b.top / zoom, right: b.right / zoom, width: b.width / zoom, height: b.height / zoom };
    const vw = window.innerWidth / zoom;
    const vh = window.innerHeight / zoom;
    const big = r.width > vw * 0.5;
    const pad = 6;
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${r.top - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;

    if (big) {
      // Wide target (the chart): point down at it from above.
      hand.className = 'fa-solid fa-hand-point-down tour-hand down';
      hand.style.left = `${r.left + r.width / 2 - 18}px`;
      hand.style.top = `${Math.max(8, r.top - 54)}px`;
      card.style.left = `${Math.min(vw - 340, Math.max(12, r.left + r.width / 2 - 160))}px`;
      card.style.top = `${Math.max(12, r.top + 24)}px`;
    } else if (r.right + 400 > vw) {
      // Near the right edge (e.g. RESET in the footer): point from the left side instead.
      hand.className = 'fa-solid fa-hand-point-right tour-hand from-left';
      hand.style.left = `${r.left - 50}px`;
      hand.style.top = `${r.top + r.height / 2 - 20}px`;
      card.style.left = `${Math.max(12, r.left - 64 - 320)}px`;
      card.style.top = `${Math.min(vh - card.offsetHeight - 12, Math.max(12, r.top - card.offsetHeight / 2))}px`;
    } else {
      hand.className = 'fa-solid fa-hand-point-left tour-hand';
      hand.style.left = `${r.right + 10}px`;
      hand.style.top = `${r.top + r.height / 2 - 20}px`;
      card.style.left = `${Math.min(vw - 340, r.right + 64)}px`;
      card.style.top = `${Math.min(vh - card.offsetHeight - 12, Math.max(12, r.top - 20))}px`;
    }
  }

  function show() {
    const steps = visibleSteps();
    if (!steps.length) { finish(); return; }
    index = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[index];
    current = document.querySelector(step.target);
    current.scrollIntoView({ block: 'nearest' });

    const last = index === steps.length - 1;
    card.innerHTML = `
      <p class="tour-count">Step ${index + 1} of ${steps.length}</p>
      <h4>${step.title}</h4>
      <p>${step.text}</p>
      <div class="tour-actions">
        <button type="button" class="tour-skip" data-tour="skip">Skip guide</button>
        <span>
          ${index > 0 ? '<button type="button" class="btn-grey" data-tour="back">Back</button>' : ''}
          <button type="button" class="btn-purple" data-tour="next">${last ? 'Finish' : 'Next'}</button>
        </span>
      </div>`;
    requestAnimationFrame(place);
    card.querySelector('[data-tour="next"]').focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') finish();
  }

  card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tour]');
    if (!act) return;
    if (act.dataset.tour === 'skip') return finish();
    if (act.dataset.tour === 'back') { index--; return show(); }
    if (index >= visibleSteps().length - 1) return finish();
    index++;
    show();
  });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey);

  // Let the page-open animation settle so the hand lands on the right spot.
  setTimeout(show, 650);
})();
