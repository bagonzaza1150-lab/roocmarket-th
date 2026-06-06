window.ROOC_SUPABASE = {
  url: "https://qgzkoraxaszvdxvasgqz.supabase.co",
  anonKey: "sb_publishable_KS5z7dIlRP7xQJ8tgnwyGg_K_eWDuoA",
  itemBucket: "item-images",
  listingBucket: "listing-images",
  adminEmails: ["bagonzaza1150@gmail.com"],
  adminUserIds: [],
  adminDiscordIds: []
};

(() => {
  const config = window.ROOC_SUPABASE;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchPublicListings() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_listings?select=*&active=eq.true&order=created_at.desc&limit=12`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function renderCounts(listings) {
    const counts = { mvp: 0, accessories: 0, fashion: 0, account: 0 };
    listings.forEach((listing) => {
      if (counts[listing.category] !== undefined) counts[listing.category] += 1;
    });

    const targets = {
      mvp: document.querySelector("#mvpListingCount"),
      accessories: document.querySelector("#accessoriesListingCount"),
      fashion: document.querySelector("#fashionListingCount"),
      account: document.querySelector("#accountListingCount")
    };
    Object.entries(targets).forEach(([category, target]) => {
      if (target) target.textContent = counts[category].toLocaleString("th-TH");
    });

    const totalTarget = document.querySelector("#totalListingCount");
    if (totalTarget) totalTarget.textContent = listings.length.toLocaleString("th-TH");
  }

  function renderListingCards(listings) {
    const grid = document.querySelector("#latestListingGrid");
    const emptyState = document.querySelector("#latestEmptyState");
    if (!grid || !emptyState) return;

    if (!listings.length) {
      grid.innerHTML = "";
      emptyState.hidden = false;
      return;
    }

    grid.innerHTML = listings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const mediaClass = listing.category === "mvp" ? "item-media card-media" : "item-media";
      const badges = [
        `<span>${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
        listing.verified_seller ? '<span class="verified">Verified</span>' : "",
        listing.ready_today ? '<span class="fast">Fast Deal</span>' : "",
        listing.category === "mvp" ? '<span class="mvp">MVP</span>' : ""
      ].filter(Boolean).join("");
      const description = listing.middleman
        ? `${listing.description || ""} · รองรับ Middleman`
        : listing.description || "";

      return `
        <article class="listing-card">
          <div class="${mediaClass}">
            <img src="${escapeHtml(listing.image_url || "assets/category-icons/mvp-c.png")}" alt="" />
          </div>
          <div class="listing-meta">${badges}</div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
          <div class="price-row">
            <strong>฿ ${escapeHtml(listing.price_text || "0")}</strong>
            <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(listing.contact || "")}">ติดต่อผู้ขาย</button>
          </div>
        </article>
      `;
    }).join("");

    emptyState.hidden = true;
  }

  async function hydratePublicListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    try {
      const listings = await fetchPublicListings();
      renderCounts(listings);
      renderListingCards(listings);
      console.info(`ROOC public listings loaded ${listings.length} rows`);
    } catch (error) {
      console.error("ROOC public listings failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hydratePublicListings);
  } else {
    hydratePublicListings();
  }
})();
