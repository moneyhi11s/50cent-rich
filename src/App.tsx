import { useMemo, useState } from "react";
import { OFFERS, REVENUE_API, type Offer } from "./storeData";

const sourceFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("utm_source") ||
    params.get("source") ||
    document.referrer ||
    "direct"
  );
};

const campaignFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("utm_campaign") || params.get("campaign") || "organic";
};

async function recordClick(offer: Offer) {
  const payload = {
    event: "affiliate_click",
    offerId: offer.id,
    offerName: offer.name,
    source: sourceFromUrl(),
    campaign: campaignFromUrl(),
    path: window.location.pathname,
    ts: new Date().toISOString(),
  };

  try {
    await fetch(`${REVENUE_API}/api/click`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Revenue tracking must never block the shopper from reaching the merchant.
  }
}

function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Offer | null>(null);

  const filteredOffers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return OFFERS;
    return OFFERS.filter((offer) =>
      [offer.name, offer.description, offer.bestFor, ...offer.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

  const goToOffer = async (offer: Offer) => {
    await recordClick(offer);
    window.open(offer.href, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="#top" aria-label="Moneyhi11s home">
          <span className="brand-mark">M</span>
          <span>Moneyhi11s</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#featured">Featured</a>
          <a href="#how">How it works</a>
          <a href="#trust">Trust</a>
        </nav>
        <a className="nav-cta" href="#featured">Explore offers</a>
      </header>

      <main id="top">
        <section className="hero section-pad">
          <div className="hero-copy">
            <div className="eyebrow">2026 BUYER-FIRST DISCOVERY</div>
            <h1>Find useful digital offers without the hype.</h1>
            <p className="hero-sub">
              Moneyhi11s helps you compare selected partner offers, understand who
              they may fit, and reach the official merchant page to verify current
              pricing, terms and refund details.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#featured">Browse featured offers</a>
              <a className="button secondary" href="#how">See how we evaluate</a>
            </div>
            <div className="proof-row" aria-label="Store principles">
              <span>✓ Clear affiliate disclosure</span>
              <span>✓ No guaranteed-income claims</span>
              <span>✓ Merchant terms verified at checkout</span>
            </div>
          </div>
          <div className="hero-panel" aria-label="Shopping guide">
            <div className="panel-kicker">SHOP SMARTER</div>
            <h2>Start with your goal.</h2>
            <div className="goal-list">
              <button onClick={() => setQuery("creator")}>Creator & media tools <span>→</span></button>
              <button onClick={() => setQuery("online business")}>Online business offers <span>→</span></button>
              <button onClick={() => setQuery("digital")}>Digital products <span>→</span></button>
            </div>
            <div className="panel-note">We may earn a commission when you purchase through eligible links, at no added cost from us.</div>
          </div>
        </section>

        <section className="ticker" aria-label="Shopping values">
          <span>COMPARE FIRST</span><span>•</span><span>VERIFY TERMS</span><span>•</span><span>BUY WITH INTENT</span><span>•</span><span>TRACK REAL RESULTS</span>
        </section>

        <section id="featured" className="section-pad offers-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">FEATURED NOW</div>
              <h2>Selected partner offers</h2>
            </div>
            <label className="search-box">
              <span>Search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="creator, digital, business…"
                aria-label="Search offers"
              />
            </label>
          </div>

          <div className="offer-grid">
            {filteredOffers.map((offer, index) => (
              <article className="offer-card" key={offer.id}>
                <div className="offer-number">0{index + 1}</div>
                <div className="offer-meta">{offer.eyebrow}</div>
                <h3>{offer.name}</h3>
                <p>{offer.description}</p>
                <div className="best-for"><strong>Best for:</strong> {offer.bestFor}</div>
                <div className="tag-row">
                  {offer.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="card-actions">
                  <button className="text-button" onClick={() => setSelected(offer)}>Quick review</button>
                  <button className="button primary small" onClick={() => void goToOffer(offer)}>View merchant →</button>
                </div>
              </article>
            ))}
          </div>

          {filteredOffers.length === 0 && (
            <div className="empty-state">No offers match that search yet. Try a broader term.</div>
          )}
        </section>

        <section id="how" className="section-pad how-section">
          <div className="section-heading compact">
            <div className="eyebrow">HOW MONEYHI11S WORKS</div>
            <h2>Useful content first. Attribution second.</h2>
          </div>
          <div className="steps-grid">
            <div><b>01</b><h3>Discover</h3><p>Find offers through short-form content, search, creator channels and direct recommendations.</p></div>
            <div><b>02</b><h3>Compare</h3><p>Review who the offer may suit, what problem it addresses and what to verify before buying.</p></div>
            <div><b>03</b><h3>Verify</h3><p>Confirm live price, terms, refund policy and claims on the official merchant page.</p></div>
            <div><b>04</b><h3>Decide</h3><p>Purchase only if the merchant details and product fit your needs. We track legitimate referral performance to improve future recommendations.</p></div>
          </div>
        </section>

        <section id="trust" className="section-pad trust-section">
          <div>
            <div className="eyebrow">TRUST > VIRALITY</div>
            <h2>A store built to convert without misleading shoppers.</h2>
          </div>
          <div className="trust-copy">
            <p>Moneyhi11s uses affiliate links. That means we may receive compensation from eligible purchases. Compensation does not change the price you pay to the merchant through us.</p>
            <p>We do not promise earnings or financial outcomes. Product availability, merchant claims, prices and policies can change, so always verify the latest information on the merchant page before purchasing.</p>
          </div>
        </section>
      </main>

      <footer>
        <div className="brand"><span className="brand-mark">M</span><span>Moneyhi11s</span></div>
        <p>Curated discovery for digital offers. © 2026 Moneyhi11s.</p>
        <div className="footer-links"><a href="#featured">Offers</a><a href="#trust">Affiliate disclosure</a></div>
      </footer>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="offer-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            <div className="eyebrow">QUICK REVIEW</div>
            <h2 id="offer-title">{selected.name}</h2>
            <p>{selected.description}</p>
            <div className="modal-callout"><strong>Best for</strong><span>{selected.bestFor}</span></div>
            <ul>
              <li>Check the merchant page for current pricing and included features.</li>
              <li>Read the merchant refund/cancellation terms before purchasing.</li>
              <li>Ignore any earnings expectation unless independently supported by evidence relevant to you.</li>
            </ul>
            <button className="button primary full" onClick={() => void goToOffer(selected)}>Verify on merchant site →</button>
            <small>Affiliate disclosure: Moneyhi11s may earn a commission from eligible purchases.</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
