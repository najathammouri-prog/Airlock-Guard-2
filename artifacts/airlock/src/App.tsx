import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getNetworkDetails, requestAccess, signTransaction } from '@stellar/freighter-api';
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
  stellarDestination?: string;
  stellarAmount?: string;
  stellarHash?: string;
};
type DemoState = {
  limit: number;
  budget: number;
  transactions: Transaction[];
  lastAlert: string | null;
};

const STORAGE_KEY = 'airlock-demo-state-v3';
const INITIAL_DEMO: DemoState = {
  limit: 500,
  budget: 4800,
  lastAlert: null,
  transactions: [],
};
function loadDemo(): DemoState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DemoState;
      if (Array.isArray(parsed.transactions) && typeof parsed.limit === 'number') {
        const stellarTransactions = parsed.transactions.filter(
          (transaction) => transaction.stellarDestination && transaction.stellarAmount,
        );
        return {
          ...parsed,
          transactions: stellarTransactions,
          lastAlert: stellarTransactions.some((transaction) => transaction.status === 'Blocked')
            ? parsed.lastAlert
            : null,
        };
      }
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
  const [requestForm, setRequestForm] = useState({ agent: 'Atlas Procurement', amount: '', purpose: '', merchant: '', stellarDestination: '', stellarAmount: '' });
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);

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

  async function connectWallet() {
    setWalletBusy(true);
    try {
      const access = await requestAccess();
      if (access.error || !access.address) throw new Error(access.error || 'Freighter did not return an address.');
      setWalletAddress(access.address);
      showToast('Connected ' + access.address.slice(0, 6) + '�' + access.address.slice(-5) + ' on Stellar testnet.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not connect to Freighter.');
    } finally { setWalletBusy(false); }
  }

  async function requestTestnetXlm() {
    if (!walletAddress) { showToast('Connect Freighter before requesting testnet XLM.'); return; }
    setWalletBusy(true);
    try {
      const response = await fetch('https://friendbot.stellar.org/?addr=' + encodeURIComponent(walletAddress));
      if (!response.ok) throw new Error('Friendbot could not fund this account. Try again later.');
      showToast('Testnet XLM requested. Refresh Freighter to see the balance.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not reach Stellar Friendbot.');
    } finally { setWalletBusy(false); }
  }

  async function approveRequest(id: string) {
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
    if (!target.stellarDestination || !target.stellarAmount) {
      showToast('This legacy demo request has no Stellar recipient or XLM amount. Create a new Stellar request to send a testnet payment.');
      return;
    }
    if (!walletAddress) { showToast('Connect Freighter before approving a Stellar payment.'); return; }
    setWalletBusy(true);
    try {
      const { STELLAR_TESTNET_PASSPHRASE, submitTestnetPayment } = await import('./lib/stellar');
      const walletNetwork = await getNetworkDetails();
      if (walletNetwork.error || walletNetwork.networkPassphrase !== STELLAR_TESTNET_PASSPHRASE) throw new Error('Switch Freighter to Stellar Testnet before approving.');
      const result = await submitTestnetPayment({
        sourceAddress: walletAddress,
        destination: target.stellarDestination,
        amount: target.stellarAmount,
        memo: target.id,
        sign: async (transactionXdr) => {
          const signed = await signTransaction(transactionXdr, {
            networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
            address: walletAddress,
          });
          if (signed.error || !signed.signedTxXdr) {
            throw new Error(signed.error || 'Freighter did not return a signed transaction.');
          }
          return signed.signedTxXdr;
        },
      });
      setDemo((current) => ({ ...current, transactions: current.transactions.map((tx) => tx.id === id ? { ...tx, status: 'Approved', stellarHash: result.hash } : tx) }));
      showToast('Approved and submitted ' + target.stellarAmount + ' XLM on Stellar testnet.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Stellar testnet payment failed.');
    } finally { setWalletBusy(false); }

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
    const stellarAmount = Number(requestForm.stellarAmount);
    if (!requestForm.agent || !requestForm.purpose.trim() || !requestForm.merchant.trim() || !Number.isFinite(amount) || amount <= 0 || !/^G[A-Z2-7]{55}$/.test(requestForm.stellarDestination.trim()) || !Number.isFinite(stellarAmount) || stellarAmount <= 0) {
      showToast('Complete each field with a valid USD amount, Stellar testnet recipient, and XLM amount.');
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
      stellarDestination: requestForm.stellarDestination.trim(),
      stellarAmount: stellarAmount.toFixed(7),
    };
    const alert = isBlocked
      ? `${id} triggered an automatic block: ${money(amount)} is above the ${money(demo.limit)} per-request limit.`
      : demo.lastAlert;
    setDemo({ ...demo, transactions: [transaction, ...demo.transactions], lastAlert: alert });
    setRequestForm({ agent: 'Atlas Procurement', amount: '', purpose: '', merchant: '', stellarDestination: '', stellarAmount: '' });
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
          <strong>AIRLOCK workspace</strong>
          Stellar testnet · XLM payments
        </div>
        <div className="side-foot">CONTROL PLANE / 01</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><ChevronRight size={13} /><strong>Overview</strong></div>
          <div className="mobile-brand"><LockKeyhole /><span>AIRLOCK</span></div>
          <div className="top-meta">
            <span className="demo-pill"><span className="demo-dot" />STELLAR TESTNET</span>
            {walletAddress ? <span className="time-stamp">{walletAddress.slice(0, 6)}�{walletAddress.slice(-5)}</span> : <button className="button button-secondary" type="button" onClick={connectWallet} disabled={walletBusy}>{walletBusy ? 'Connecting�' : 'Connect Freighter'}</button>}
          </div>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <div className="eyebrow">Agent payment oversight</div>
              <h1>Good morning, operator.</h1>
              <p className="subtitle">Review each request before approving its Stellar testnet payment.</p>
            </div>
            <div className="heading-actions">
              {walletAddress && <button className="button button-secondary" type="button" onClick={requestTestnetXlm} disabled={walletBusy}>Get testnet XLM</button>}
              <button className="button button-secondary" type="button" onClick={resetDemo} data-testid="button-reset-demo"><RotateCcw />Reset demo</button>
              <button className="button button-primary" type="button" onClick={() => setModalOpen(true)} data-testid="button-simulate-request"><Plus />Simulate request</button>
            </div>
          </section>

          <section className="metric-grid" aria-label="Payment account summary">
            <div className="metric-card" data-testid="card-available-budget">
              <div className="metric-label"><Wallet />Available policy budget</div>
              <div className="metric-value" data-testid="text-available-budget">{money(available)}</div>
              <div className="metric-note">of {money(demo.budget)} local policy allocation</div>
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
                    {pending.stellarAmount && <div className="detail-row"><span>Stellar payment</span><span>{pending.stellarAmount} XLM � testnet</span></div>}
                    <div className="detail-row"><span>Submitted</span><span>{pending.createdAt}</span></div>
                  </div>
                  <div className="limit-banner">
                    <strong>Within policy.</strong> This request is {money(Math.max(0, demo.limit - pending.amount))} under the {money(demo.limit)} limit. Approval will reduce the available demo budget.
                  </div>
                  <div className="request-actions">
                    <button className="button button-primary" type="button" onClick={() => void approveRequest(pending.id)} disabled={walletBusy} data-testid={`button-approve-${pending.id}`}><Check />Approve request</button>
                    <button className="button button-danger" type="button" onClick={() => denyRequest(pending.id)} data-testid={`button-block-${pending.id}`}><X />Block request</button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <CheckCircle2 size={24} />
                  <div style={{ marginTop: 10, color: '#445668', fontWeight: 700 }}>No requests waiting</div>
                  <div style={{ marginTop: 5 }}>Create a new Stellar payment request to start.</div>
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
                        <td><StatusBadge status={tx.status} />{tx.stellarHash && <div><a href={"https://stellar.expert/explorer/testnet/tx/" + tx.stellarHash} target="_blank" rel="noreferrer">View Stellar transaction</a></div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="empty-state">No transactions match this filter.</div>}
          </section>

          <section className="how-card" aria-label="How to run a testnet payment">
            <div>
              <div className="how-title">How to run a testnet payment</div>
              <div className="how-sub">Connect Freighter and create an XLM payment request.</div>
            </div>
            <div className="how-steps">
              <div className="how-step"><span className="step-number">1</span><span>Edit the limit, then save to update the guardrail.</span></div>
              <div className="how-step"><span className="step-number">2</span><span>Create a request with the XLM recipient and amount, then approve in Freighter.</span></div>
              <div className="how-step"><span className="step-number">3</span><span>Try an amount over the policy limit to see an automatic block.</span></div>
            </div>
          </section>

          <footer className="safety-footer">
            <div><strong>Testnet only.</strong> Payments use test XLM and require explicit Freighter confirmation. Do not use this test build for mainnet funds.</div>
            <div className="footer-mark"><Shield size={14} />STELLAR TESTNET / FREIGHTER WALLET</div>
          </footer>
        </div>
      </main>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title">
            <div className="modal-head">
              <div>
                <div className="modal-title" id="request-modal-title">Create a Stellar payment request</div>
                <div className="modal-copy">The USD amount is only for Airlock policy limits. Enter the actual XLM payment separately. Approval prompts Freighter and submits to testnet.</div>
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
                  <span className="form-label">Stellar recipient address</span>
                  <input className="field" type="text" required pattern="G[A-Z2-7]{55}" title="Enter a Stellar testnet account address starting with G" placeholder="G�" value={requestForm.stellarDestination} onChange={(event) => setRequestForm({ ...requestForm, stellarDestination: event.target.value })} />
                </label>
                <label>
                  <span className="form-label">Payment amount in XLM</span>
                  <input className="field money" type="number" min="0.0000001" step="0.0000001" required placeholder="1.0000000" value={requestForm.stellarAmount} onChange={(event) => setRequestForm({ ...requestForm, stellarAmount: event.target.value })} />
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
              <div className="modal-hint">This sends native XLM on Stellar testnet after wallet approval. USD is a policy label only; no exchange rate is applied. Above the limit? The request is blocked automatically.</div>
              <div className="modal-actions">
                <button className="button button-secondary" type="button" onClick={() => setModalOpen(false)} data-testid="button-cancel-request">Cancel</button>
                <button className="button button-primary" type="submit" data-testid="button-submit-request"><Plus />Create payment request</button>
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


