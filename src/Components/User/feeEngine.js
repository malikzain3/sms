  // src/components/Finance/feeEngine.js
  //
  // Shared fee-status engine used by BOTH StudentFeeLedger.jsx and
  // Finance.jsx. This is the ONE place that decides whether a student is
  // Paid / Partial / Advance / Unpaid, and how many past months they owe.
  // Both files import this instead of keeping their own copy of the same
  // math — that duplication is exactly what let the two pages drift apart
  // and disagree with each other before.
  //
  // ---- The model, in plain terms ----
  // We no longer trust a single incrementally-nudged "balance" number that
  // only ever moves by +/- deltas. That approach drifts out of sync the
  // moment any one code path forgets to update it (which is exactly what
  // caused stale Paid/Partial counts after deleting payments, and the
  // "goes to 0 until I open the student" bug).
  //
  // Instead, every time we need a student's fee status, we REPLAY their
  // entire Monthly Tuition payment history from scratch:
  //   1. Start from `feeAnchorMonth` (the first month this student was ever
  //      billed — fixed once, never moves again).
  //   2. Walk forward one month at a time up to "today's" month.
  //   3. Each month costs exactly one `monthlyFee`. Payments are applied
  //      OLDEST MONTH FIRST — like paying down a stack of bills — so a lump
  //      payment that covers an old shortfall AND this month's fee clears
  //      BOTH instead of overshooting into "Advance".
  //
  // This is a pure function (no Firestore calls). Callers fetch a student's
  // payments + monthlyFee, call computeFeeState(), and persist the result.
  // Called with today's real month, it gives the TRUE current state. Called
  // with a past month instead, it gives an accurate "as of that month" view
  // (used to power the month-filter on the ledger).

  export const TUITION_TYPE = "Monthly Tuition";
  export const contributesToBalance = (type) =>
    (type || TUITION_TYPE) === TUITION_TYPE;

  export const currentMonthKey = (d = new Date()) =>
    d.toISOString().slice(0, 7); // "yyyy-mm"

  export const nextMonthKey = (mk) => {
    const [y, m] = mk.split("-").map(Number);
    // m is 1-based; Date's month index is 0-based, so passing `m` (not m-1)
    // as the index already lands one month ahead.
    const d = new Date(Date.UTC(y, m, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  // Builds the ordered list of billing months from startMk to endMk
  // inclusive. Capped at 600 months (50 years) as a safety guard against a
  // corrupted stored month value looping forever.
  const monthRange = (startMk, endMk) => {
    const months = [startMk];
    let mk = startMk;
    let guard = 0;
    while (mk !== endMk && guard < 600) {
      mk = nextMonthKey(mk);
      months.push(mk);
      guard += 1;
    }
    return months;
  };

  // The stable string sort works correctly here because "yyyy-mm" sorts
  // lexicographically the same as it sorts chronologically.
  const earlierMonth = (a, b) => (a < b ? a : b);

  /**
   * Works out which month a student's billing history should start from.
   * Fixed and re-usable: pass in whatever is already stored
   * (student.feeAnchorMonth) plus their real payment history, and this
   * returns the anchor to persist. Never invents arrears further back than
   * the earliest thing we actually have a record of.
   */
  export function resolveAnchorMonth(storedAnchor, payments, todayMk) {
    const tuitionDates = (payments || [])
      .filter((p) => contributesToBalance(p.type) && p.date)
      .map((p) => p.date.slice(0, 7));
    const firstPaymentMonth = tuitionDates.length ? tuitionDates.sort()[0] : null;

    if (storedAnchor && firstPaymentMonth) {
      return earlierMonth(storedAnchor, firstPaymentMonth);
    }
    return storedAnchor || firstPaymentMonth || todayMk;
  }

  /**
   * Recomputes a student's full fee state from their actual payment history.
   *
   * @param {Array} payments - every feePayments doc for this student ({amount, date, type})
   * @param {number} monthlyFee
   * @param {string} anchorMonth - "yyyy-mm", the fixed first billed month (see resolveAnchorMonth)
   * @param {string} todayMk - "yyyy-mm" to treat as "now" — pass the real
   *   current month to get the true live state, or a past month to see an
   *   accurate snapshot as of that month (used by the ledger's month filter).
   */
  export function computeFeeState(payments, monthlyFee, anchorMonth, todayMk = currentMonthKey()) {
    const fee = Number(monthlyFee || 0);

    if (fee <= 0) {
      const pool = (payments || [])
        .filter((p) => contributesToBalance(p.type))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      return {
        monthsBehind: 0,
        arrearsAmount: 0,
        currentStatus: pool > 0 ? "Advance" : "Unpaid",
        advanceForFuture: pool,
        dueThisMonth: 0,
        totalDue: 0,
        paidThisMonth: 0,
      };
    }

    const tuitionPayments = (payments || [])
      .filter((p) => contributesToBalance(p.type) && p.date)
      .map((p) => ({ amount: Number(p.amount || 0), date: p.date }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const start = anchorMonth || todayMk;
    const months = monthRange(start, todayMk);
    let remaining = tuitionPayments.reduce((sum, p) => sum + p.amount, 0);

    let monthsBehind = 0;
    let arrearsAmount = 0;
    let currentAmount = 0;
    let currentStatus = "Unpaid";

    months.forEach((mk) => {
      const isCurrent = mk === todayMk;
      if (remaining >= fee) {
        remaining -= fee;
        if (isCurrent) currentAmount = fee;
      } else if (remaining > 0) {
        if (isCurrent) {
          currentAmount = remaining;
        } else {
          monthsBehind += 1;
          arrearsAmount += fee - remaining;
        }
        remaining = 0;
      } else if (!isCurrent) {
        monthsBehind += 1;
        arrearsAmount += fee;
      }
    });

    if (currentAmount >= fee) currentStatus = remaining > 0 ? "Advance" : "Paid";
    else if (currentAmount > 0) currentStatus = "Partial";
    else currentStatus = "Unpaid";

    const advanceForFuture = currentStatus === "Advance" ? remaining : 0;
    const dueThisMonth = Math.max(0, fee - currentAmount);

    // If there's ANY unresolved arrears from past months, the current month
    // can never honestly show as Paid/Advance — the money in hand is still
    // owed further back first. Surface it as Unpaid + a separate arrears
    // figure, instead of a confusing "Partial" on a month nothing has
    // actually been applied to yet.
    const displayStatus = monthsBehind > 0 ? "Unpaid" : currentStatus;

    return {
      monthsBehind,
      arrearsAmount,
      currentStatus: displayStatus,
      advanceForFuture,
      dueThisMonth: monthsBehind > 0 ? fee : dueThisMonth,
      totalDue: (monthsBehind > 0 ? fee : dueThisMonth) + arrearsAmount,
      paidThisMonth: currentAmount,
    };
  }


  export function legacyBalanceFromState(state) {
    return state.advanceForFuture - state.arrearsAmount - (
      state.currentStatus === "Partial" ? state.dueThisMonth : 0
    );
  }