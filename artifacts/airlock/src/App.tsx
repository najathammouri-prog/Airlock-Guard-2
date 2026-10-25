import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  History,
  LockKeyhole,
  Plus,
  RotateCcw,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Wallet,
  X,
} from 'lucide-react';

type TxStatus = 'Pending' | 'Approved' | 'Blocked';
type Transaction = {
  id: string;
  agent: string;
  agentId: string;
  amount: number;
  purpose: string;
  merchant: string;
  createdAt: string;
  status: TxStatus;
};
type DemoState = {
  limit: number;
  budget: number;
  transactions: Transaction[];
  lastAlert: string | null;
};

const STORAGE_KEY = 'airlock-demo-state-v1';
const INITIAL_DEMO: DemoState = {
  limit: 500,
  budget: 4800,
  lastAlert: 'A previous request exceeded the $500 per-request limit and was blocked automatically.',
  transactions: [
    {
      id: 'REQ-0842',
      agent: 'Atlas Procurement',
      agentId: 'agent_atlas_01',
      amount: 284.75,
      purpose: 'Monthly cloud compute credits',
      merchant: 'Northstar Cloud',
      createdAt: 'Today, 10:24',
      status: 'Pending',
    },
    {
      id: 'REQ-0841',
      agent: 'Atlas Procurement',
      agentId: 'agent_atlas_01',
      amount: 186.4,
      purpose: 'Research data access',
      merchant: 'Meridian Data Co.',
      createdAt: 'Today, 09:51',
      status: 'Approved',
    },
    {
      id: 'REQ-0840',
      agent: 'Cedar Travel Desk',
      agentId: 'agent_cedar_02',
      amount: 742.6,
      purpose: 'Quarterly travel inventory',
      merchant: 'Orbit Lodging',
      createdAt: 'Today, 09:32',
      status: 'Blocked',
    },
    {
      id: 'REQ-0839',
      agent: 'Atlas Procurement',
      agentId: 'agent_atlas_01',
      amount: 96.2,
      purpose: 'Developer tooling renewal',
      merchant: 'Patchwork Systems',
      createdAt: 'Today, 08:16',
      status: 'Approved',
    },
  ],
};

function loadDemo(): DemoState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DemoState;
      if (Array.isArray(parsed.transactions) && typeof parsed.limit === 'number') return parsed;
    }
  } catch {
    // A blocked or malformed localStorage should never prevent the walkthrough.
  }
  return INITIAL_DEMO;
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function makeTime() {
  return `Today, ${new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}`;
}

function StatusBadge({ status }: { status: TxStatus }) {
  return <span className={`status status-${status.toLowerCase()}`} data-testid={`status-payment-${status.toLowerCase()}`}>{status}</span>;
}

function App() {
  const [demo, setDemo] = useState<DemoState>(loadDemo);
  const [limitDraft, setLimitDraft] = useState(String(loadDemo().limit));
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState('All activity');
  const [toast, setToast] = useState('');
  const [requestForm, setRequestForm] = useState({ agent: 'Atlas Procurement', amount: '', purpose: '', merchant: '' });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    } catch {
      // The demo remains usable if browser storage is unavailable.
    }
  }, [demo]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const spent = useMemo(
    () => demo.transactions.filter((tx) => tx.status === 'Approved').reduce((sum, tx) => sum + tx.amount, 0),
    [demo.transactions],
  );
  const available = Math.max(0, demo.budget - spent);
  const pending = demo.transactions.find((tx) => tx.status === 'Pending');
  const blockedCount = demo.transactions.filter((tx) => tx.status === 'Blocked').length;
  const filteredTransactions = demo.transactions.filter((tx) => filter === 'All activity' || tx.status === filter);

  function showToast(message: string) {
    setToast(message);
  }

  function saveLimit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextLimit = Number(limitDraft);
    if (!Number.isFinite(nextLimit) || nextLimit < 1 || nextLimit > 100000) {
      showToast('Enter a limit between $1 and $100,000.');
      return;
    }
    let newlyBlocked: Transaction | undefined;
    const transactions = demo.transactions.map((tx) => {
      if (tx.status === 'Pending' && tx.amount > nextLimit) {
        newlyBlocked = tx;
        return { ...tx, status: 'Blocked' as const };
      }
      return tx;
    });
    const alert = newlyBlocked
      ? `${newlyBlocked.id} was blocked because ${money(newlyBlocked.amount)} exceeds the updated ${money(nextLimit)} limit.`
      : demo.lastAlert;
    setDemo({ ...demo, limit: nextLimit, transactions, lastAlert: alert });
    showToast(newlyBlocked ? 'Limit updated. An over-limit request was blocked.' : 'Per-request limit updated.');
  }

  function approveRequest(id: string) {
    const target = demo.transactions.find((tx) => tx.id === id);
    if (!target || target.status !== 'Pending') return;
    if (target.amount > demo.limit) {
      setDemo({
        ...demo,
        transactions: demo.transactions.map((tx) => tx.id === id ? { ...tx, status: 'Blocked' } : tx),
        lastAlert: `${target.id} was blocked because ${money(target.amount)} exceeds the ${money(demo.limit)} limit.`,
      });
      showToast('Over-limit request blocked automatically.');
      return;
    }
    if (target.amount > available) {
      showToast('Not enough demo budget remains to approve this request.');
      return;
    }
    setDemo({ ...demo, transactions: demo.transactions.map((tx) => tx.id === id ? { ...tx, status: 'Approved' } : tx) });
    showToast(`${money(target.amount)} approved in demo mode.`);
  }

  function denyRequest(id: string) {
    const target = demo.transactions.find((tx) => tx.id === id);
    if (!target || target.status !== 'Pending') return;
    const message = `${target.id} was blocked by operator review.`;
    setDemo({
      ...demo,
      transactions: demo.transactions.map((tx) => tx.id === id ? { ...tx, status: 'Blocked' } : tx),
      lastAlert: message,
    });
    showToast('Request blocked by operator.');
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(requestForm.amount);
    if (!requestForm.agent || !requestForm.purpose.trim() || !requestForm.merchant.trim() || !Number.isFinite(amount) || amount <= 0) {
      showToast('Complete each field with a valid amount to simulate a request.');
      return;
    }
    const idNumber = 843 + demo.transactions.length - INITIAL_DEMO.transactions.length;
    const id = `REQ-${String(idNumber).padStart(4, '0')}`;
    const agentId = requestForm.agent === 'Atlas Procurement' ? 'agent_atlas_01' : requestForm.agent === 'Cedar Travel Desk' ? 'agent_cedar_02' : 'agent_sable_03';
    const isBlocked = amount > demo.limit;
    const transaction: Transaction = {
      id,
      agent: requestForm.agent,
      agentId,
      amount,
      purpose: requestForm.purpose.trim(),
      merchant: requestForm.merchant.trim(),
      createdAt: makeTime(),
      status: isBlocked ? 'Blocked' : 'Pending',
    };
    const alert = isBlocked
      ? `${id} triggered an automatic block: ${money(amount)} is above the ${money(demo.limit)} per-request limit.`
      : demo.lastAlert;
    setDemo({ ...demo, transactions: [transaction, ...demo.transactions], lastAlert: alert });
    setRequestForm({ agent: 'Atlas Procurement', amount: '', purpose: '', merchant: '' });
    setModalOpen(false);
    showToast(isBlocked ? 'Alert raised. Request blocked automatically.' : 'Request added to the approval queue.');
  }

  function resetDemo() {
    if (!window.confirm('Reset AIRLOCK to its original demo state? Your local demo changes will be cleared.')) return;
    setDemo(INITIAL_DEMO);
    setLimitDraft(String(INITIAL_DEMO.limit));
    setFilter('All activity');
    setModalOpen(false);
    showToast('Demo reset to its starting state.');
  }

  const latestBlocked = demo.transactions.find((tx) => tx.status === 'Blocked');

  return (
    <div className="app-shell" id="overview">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><LockKeyhole size={18} strokeWidth={1.8} /></div>
          <span className="brand-name">AIRLOCK</span>
        </div>
        <div className="side-label">Control room</div>
        <a className="nav-item active" href="#overview"><Activity /><span>Overview</span></a>
        <a className="nav-item" href="#approval"><CheckCircle2 /><span>Approval queue</span></a>
        <a className="nav-item" href="#history"><History /><span>Transaction log</span></a>
        <div className="side-spacer" />
        <div className="workspace-chip">
          <strong>Demo workspace</strong>
          Fictional agents · USD sandbox
        </div>
        <div className="side-foot">CONTROL PLANE / 01</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><ChevronRight size={13} /><strong>Overview</strong></div>
          <div className="mobile-brand"><LockKeyhole /><span>AIRLOCK</span></div>
          <div className="top-meta">
            <span className="demo-pill"><span className="demo-dot" />DEMO MODE</span>
            <span className="time-stamp">LOCAL SIMULATION</span>
          </div>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">Agent payment oversight</div>
              <h1>Good morning, operator.</h1>
              <p className="subtitle">Review every request before it reaches a fictional checkout.</p>
            </div>
            <div className="heading-actions">
              <button className="button button-secondary" type="button" onClick={resetDemo} data-testid="button-reset-demo"><RotateCcw />Reset demo</button>
              <button className="button button-primary" type="button" onClick={() => setModalOpen(true)} data-testid="button-simulate-request"><Plus />Simulate request</button>
            </div>
          </section>

          <section className="metric-grid" aria-label="Demo account summary">
            <div className="metric-card" data-testid="card-available-budget">
              <div className="metric-label"><Wallet />Available demo budget</div>
              <div className="metric-value" data-testid="text-available-budget">{money(available)}</div>
              <div className="metric-note">of {money(demo.budget)} sandbox allocation</div>
            </div>
            <div className="metric-card" data-testid="card-spending-limit">
              <div className="metric-label"><SlidersHorizontal />Per-request limit</div>
              <div className="metric-value" data-testid="text-spending-limit">{money(demo.limit)}</div>
              <div className="metric-note">Requests above this amount are blocked automatically</div>
            </div>
            <div className="metric-card">
              <div className="metric-label"><ShieldAlert />Requests blocked</div>
              <div className="metric-value" data-testid="text-blocked-count">{String(blockedCount).padStart(2, '0')}</div>
              <div className="metric-note">Across this local demo session</div>
            </div>
          </section>

          <div className="main-grid">
            <section className="panel" id="approval">
              <div className="panel-head">
                <div className="panel-title"><CircleDollarSign size={16} />Payment request</div>
                <span className="section-kicker">{pending ? 'REQUIRES REVIEW' : 'QUEUE CLEAR'}</span>
              </div>
              {pending ? (
                <div className="pending-card">
                  <div className="request-top">
                    <div className="agent-identity">
                      <div className="agent-icon"><Bot /></div>
                      <div>
                        <div className="agent-name">{pending.agent}</div>
                        <div className="agent-id">{pending.agentId} · {pending.id}</div>
                      </div>
                    </div>
                    <StatusBadge status={pending.status} />
                  </div>
                  <div className="amount-area">
                    <div className="amount" data-testid="text-pending-amount">{money(pending.amount)}</div>
                    <div className="amount-caption">Requested amount</div>
                  </div>
                  <div className="detail-list">
                    <div className="detail-row"><span>Purpose</span><span>{pending.purpose}</span></div>
                    <div className="detail-row"><span>Merchant</span><span>{pending.merchant}</span></div>
                    <div className="detail-row"><span>Submitted</span><span>{pending.createdAt}</span></div>
                  </div>
                  <div className="limit-banner">
                    <strong>Within policy.</strong> This request is {money(Math.max(0, demo.limit - pending.amount))} under the {money(demo.limit)} limit. Approval will reduce the available demo budget.
                  </div>
                  <div className="request-actions">
                    <button className="button button-primary" type="button" onClick={() => approveRequest(pending.id)} data-testid={`button-approve-${pending.id}`}><Check />Approve request</button>
                    <button className="button button-danger" type="button" onClick={() => denyRequest(pending.id)} data-testid={`button-block-${pending.id}`}><X />Block request</button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <CheckCircle2 size={24} />
                  <div style={{ marginTop: 10, color: '#445668', fontWeight: 700 }}>No requests waiting</div>
                  <div style={{ marginTop: 5 }}>Simulate a new payment to continue the walkthrough.</div>
                  <button className="button button-secondary" style={{ marginTop: 14 }} type="button" onClick={() => setModalOpen(true)} data-testid="button-empty-simulate"><Plus />Add a request</button>
                </div>
              )}
            </section>

            <div className="right-stack">
              <section className="panel">
                <div className="panel-head">
                  <div className="panel-title"><SlidersHorizontal size={15} />Spending guardrail</div>
                  <span className="section-kicker">CONFIGURABLE</span>
                </div>
                <div className="limit-body">
                  <div className="limit-main">
                    <span className="limit-value">{money(demo.limit)}</span>
                    <span className="section-kicker">PER REQUEST</span>
                  </div>
                  <div className="metric-progress"><span style={{ width: `${Math.min(100, (spent / demo.budget) * 100)}%` }} /></div>
                  <div className="metric-note" style={{ marginTop: 8 }}>Budget used: {money(spent)} of {money(demo.budget)}</div>
                  <form className="limit-form" onSubmit={saveLimit}>
                    <div className="input-wrap">
                      <span className="input-prefix">$</span>
                      <input className="field money" type="number" min="1" max="100000" step="0.01" value={limitDraft} onChange={(event) => setLimitDraft(event.target.value)} aria-label="New spending limit" data-testid="input-spending-limit" />
                    </div>
                    <button className="button button-secondary" type="submit" data-testid="button-save-limit">Save limit</button>
                  </form>
                </div>
              </section>

              <section className={`alert-box ${latestBlocked ? '' : 'safe'}`} aria-live="polite" data-testid="alert-policy-status">
                {latestBlocked ? <AlertTriangle /> : <CheckCircle2 />}
                <div>
                  <div className="alert-title">{latestBlocked ? 'Automatic block recorded' : 'Guardrail active'}</div>
                  <div className="alert-copy">{latestBlocked ? demo.lastAlert : 'No over-limit requests detected. New requests are checked against the current limit.'}</div>
                </div>
              </section>
            </div>
          </div>

          <section className="panel history-panel" id="history">
            <div className="panel-head">
              <div className="panel-title"><History size={16} />Transaction history</div>
              <div className="history-tools">
                <span className="section-kicker">{filteredTransactions.length} RECORDS</span>
                <select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter transaction history" data-testid="select-history-filter">
                  <option>All activity</option>
                  <option>Approved</option>
                  <option>Blocked</option>
                  <option>Pending</option>
                </select>
              </div>
            </div>
            {filteredTransactions.length ? (
              <div className="table-scroll">
                <table className="history-table">
                  <thead><tr><th>Request / agent</th><th>Purpose</th><th>Amount</th><th>Time</th><th>Status</th></tr></thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id} data-testid={`row-transaction-${tx.id}`}>
                        <td><div>{tx.id}</div><div style={{ color: '#8b949b', fontSize: 10, fontWeight: 400, marginTop: 3 }}>{tx.agent}</div></td>
                        <td><div>{tx.purpose}</div><div style={{ color: '#8b949b', fontSize: 10, marginTop: 3 }}>{tx.merchant}</div></td>
                        <td className="table-amount">{money(tx.amount)}</td>
                        <td className="table-date">{tx.createdAt}</td>
                        <td><StatusBadge status={tx.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state">No transactions match this filter.</div>}
          </section>

          <section className="how-card" aria-label="How to run this demo">
            <div>
              <div className="how-title">How to run this demo</div>
              <div className="how-sub">A safe, local walkthrough. No setup or account required.</div>
            </div>
            <div className="how-steps">
              <div className="how-step"><span className="step-number">1</span><span>Edit the limit, then save to update the guardrail.</span></div>
              <div className="how-step"><span className="step-number">2</span><span>Simulate a request under the limit and approve it from the queue.</span></div>
              <div className="how-step"><span className="step-number">3</span><span>Try an amount over the limit to see an alert and automatic block.</span></div>
            </div>
          </section>

          <footer className="safety-footer">
            <div><strong>Demo only.</strong> AIRLOCK is a frontend simulation. It does not provide blockchain security and cannot move real funds. Changes stay in this browser.</div>
            <div className="footer-mark"><Shield size={14} />FICTIONAL PAYMENTS / NO WALLET CONNECTED</div>
          </footer>
        </div>
      </main>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
            <div className="modal-head">
              <div>
                <div className="modal-title" id="request-modal-title">Simulate a payment</div>
                <div className="modal-copy">Create a fictional agent request. AIRLOCK will check it against your current {money(demo.limit)} limit.</div>
              </div>
              <button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setModalOpen(false)} data-testid="button-close-request-modal"><X /></button>
            </div>
            <form onSubmit={submitRequest}>
              <div className="form-fields">
                <label>
                  <span className="form-label">Requesting agent</span>
                  <select className="field" value={requestForm.agent} onChange={(event) => setRequestForm({ ...requestForm, agent: event.target.value })} data-testid="select-request-agent">
                    <option>Atlas Procurement</option>
                    <option>Cedar Travel Desk</option>
                    <option>Sable Research</option>
                  </select>
                </label>
                <label>
                  <span className="form-label">Amount in USD</span>
                  <div className="input-wrap"><span className="input-prefix">$</span><input className="field money" type="number" min="0.01" step="0.01" required placeholder="125.00" value={requestForm.amount} onChange={(event) => setRequestForm({ ...requestForm, amount: event.target.value })} data-testid="input-request-amount" /></div>
                </label>
                <label>
                  <span className="form-label">What is it for?</span>
                  <input className="field" type="text" required maxLength={70} placeholder="e.g. Cloud compute credits" value={requestForm.purpose} onChange={(event) => setRequestForm({ ...requestForm, purpose: event.target.value })} data-testid="input-request-purpose" />
                </label>
                <label>
                  <span className="form-label">Merchant</span>
                  <input className="field" type="text" required maxLength={50} placeholder="e.g. Northstar Cloud" value={requestForm.merchant} onChange={(event) => setRequestForm({ ...requestForm, merchant: event.target.value })} data-testid="input-request-merchant" />
                </label>
              </div>
              <div className="modal-hint">Above the current limit? The request will be blocked automatically and added to the transaction log.</div>
              <div className="modal-actions">
                <button className="button button-secondary" type="button" onClick={() => setModalOpen(false)} data-testid="button-cancel-request">Cancel</button>
                <button className="button button-primary" type="submit" data-testid="button-submit-request"><Plus />Run simulation</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="toast-note" role="status"><CheckCircle2 />{toast}</div>}
    </div>
  );
}

export default App;
