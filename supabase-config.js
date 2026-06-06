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
  const canUseSupabase = Boolean(config.url && config.anonKey && window.supabase);
  const supabaseClient = canUseSupabase ? window.supabase.createClient(config.url, config.anonKey) : null;
  let publicListings = [];
  let soldListings = [];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchPublicListings() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_listings?select=*&active=eq.true&order=created_at.desc&limit=200`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async function fetchSoldListings() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_listings?select=*&active=eq.false&sale_status=eq.sold&order=updated_at.desc&limit=12`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function parsePrice(value) {
    const number = Number(String(value || "").replace(/[^\d]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function getContactProfileUrl(contact) {
    const value = String(contact || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (/^\d{16,22}$/.test(value)) return `https://discord.com/users/${value}`;
    const discordUserMatch = value.match(/(?:discord(?:app)?\.com\/users\/)(\d{16,22})/i);
    if (discordUserMatch) return `https://discord.com/users/${discordUserMatch[1]}`;
    return "";
  }

  function getFilterControls() {
    return {
      search: document.querySelector("#marketSearch"),
      heroServer: document.querySelector("#heroServerFilter"),
      sidebarServer: document.querySelector("#sidebarServerFilter"),
      category: document.querySelector("#categoryFilter"),
      price: document.querySelector("#priceFilter"),
      sort: document.querySelector("#sortFilter"),
      verified: document.querySelector("#verifiedFilter"),
      middleman: document.querySelector("#middlemanFilter"),
      ready: document.querySelector("#readyFilter"),
      reset: document.querySelector("#resetFilters"),
      tabs: Array.from(document.querySelectorAll(".market-tabs [data-category]"))
    };
  }

  function getActiveFilters() {
    const controls = getFilterControls();
    return {
      search: (controls.search?.value || "").trim().toLowerCase(),
      server: controls.sidebarServer?.value || controls.heroServer?.value || "ทั้งหมด",
      category: controls.category?.value || "all",
      price: controls.price?.value || "all",
      sort: controls.sort?.value || "newest",
      verified: Boolean(controls.verified?.checked),
      middleman: Boolean(controls.middleman?.checked),
      ready: Boolean(controls.ready?.checked)
    };
  }

  function listingMatchesSearch(listing, search) {
    if (!search) return true;
    return [
      listing.title,
      listing.item_name,
      listing.character_name,
      listing.description,
      listing.server_name,
      listing.contact
    ].some((value) => String(value || "").toLowerCase().includes(search));
  }

  function listingMatchesPrice(listing, priceFilter) {
    if (priceFilter === "all") return true;
    const price = parsePrice(listing.price_text);
    if (priceFilter === "under-1000") return price > 0 && price < 1000;
    if (priceFilter === "1000-3000") return price >= 1000 && price <= 3000;
    if (priceFilter === "over-3000") return price > 3000;
    return true;
  }

  function getFilteredListings() {
    const filters = getActiveFilters();
    const filtered = publicListings.filter((listing) => {
      if (!listingMatchesSearch(listing, filters.search)) return false;
      if (filters.server !== "ทั้งหมด" && listing.server_name !== filters.server) return false;
      if (filters.category !== "all" && listing.category !== filters.category) return false;
      if (!listingMatchesPrice(listing, filters.price)) return false;
      if (filters.verified && !listing.verified_seller) return false;
      if (filters.middleman && !listing.middleman) return false;
      if (filters.ready && !listing.ready_today) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (filters.sort === "price-low") return parsePrice(a.price_text) - parsePrice(b.price_text);
      if (filters.sort === "price-high") return parsePrice(b.price_text) - parsePrice(a.price_text);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  function syncCategoryUi(category) {
    const controls = getFilterControls();
    if (controls.category) controls.category.value = category;
    controls.tabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.category === category);
    });
  }

  function syncServerUi(value, source) {
    const controls = getFilterControls();
    if (source !== controls.heroServer && controls.heroServer) controls.heroServer.value = value;
    if (source !== controls.sidebarServer && controls.sidebarServer) controls.sidebarServer.value = value;
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

  function renderListingCards(listings, isFiltered = false) {
    const grid = document.querySelector("#latestListingGrid");
    const emptyState = document.querySelector("#latestEmptyState");
    if (!grid || !emptyState) return;

    if (!listings.length) {
      grid.innerHTML = "";
      emptyState.hidden = false;
      emptyState.querySelector("h3").textContent = isFiltered ? "ไม่พบประกาศที่ตรงกับตัวกรอง" : "ยังไม่มีประกาศขาย";
      emptyState.querySelector("p").textContent = isFiltered ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา" : "เมื่อมีผู้ขายลงประกาศ รายการล่าสุดจะแสดงในส่วนนี้";
      return;
    }

    grid.innerHTML = listings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const mediaClass = listing.category === "mvp" ? "item-media card-media" : "item-media";
      const contact = listing.contact || "";
      const profileUrl = getContactProfileUrl(contact);
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
      const badges = [
        `<span>${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
        listing.verified_seller ? '<span class="verified">Verified</span>' : "",
        listing.ready_today ? '<span class="fast">Fast Deal</span>' : "",
        listing.category === "mvp" ? '<span class="mvp">MVP</span>' : ""
      ].filter(Boolean).join("");
      const description = listing.middleman
        ? `${listing.character_name ? `ตัวละคร: ${listing.character_name} · ` : ""}${listing.description || ""} · รองรับ Middleman`
        : `${listing.character_name ? `ตัวละคร: ${listing.character_name} · ` : ""}${listing.description || ""}`;

      return `
        <article class="listing-card">
          <div class="${mediaClass}">
            <img src="${escapeHtml(listing.image_url || "assets/category-icons/mvp-c.png")}" alt="" />
          </div>
          <div class="listing-seller">
            <img src="${escapeHtml(sellerAvatar)}" alt="" />
            <span>${escapeHtml(sellerName)}</span>
            ${listing.seller_is_premium ? '<strong title="Premium">♛</strong>' : ""}
          </div>
          <div class="listing-meta">${badges}</div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
          <div class="price-row">
            <strong>฿ ${escapeHtml(listing.price_text || "0")}</strong>
            <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(contact)}" data-profile-url="${escapeHtml(profileUrl)}">ติดต่อผู้ขาย</button>
          </div>
        </article>
      `;
    }).join("");

    emptyState.hidden = true;
  }

  function renderSoldListings(listings) {
    const section = document.querySelector("#soldListings");
    const scroller = document.querySelector("#soldListingScroller");
    const count = document.querySelector("#soldListingCount");
    if (!section || !scroller || !count) return;

    if (!listings.length) {
      section.hidden = true;
      scroller.innerHTML = "";
      count.textContent = "0 รายการ";
      return;
    }

    const cards = listings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const price = listing.price_text ? `฿ ${listing.price_text}` : "";
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      return `
        <article class="sold-card">
          <img src="${escapeHtml(listing.image_url || "assets/category-icons/mvp-c.png")}" alt="" />
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(price)} · ${escapeHtml(sellerName)}</p>
            <strong>ขายแล้ว</strong>
          </div>
        </article>
      `;
    }).join("");
    count.textContent = `${listings.length.toLocaleString("th-TH")} รายการ`;
    scroller.classList.toggle("is-static", listings.length <= 2);
    scroller.innerHTML = `<div class="sold-track">${cards}${listings.length > 2 ? cards : ""}</div>`;
    section.hidden = false;
  }

  function renderFilteredListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    renderCounts(publicListings);
    renderListingCards(getFilteredListings(), true);
  }

  function bindFilters() {
    const controls = getFilterControls();
    const rerender = () => renderFilteredListings();

    controls.search?.addEventListener("input", rerender);
    controls.sort?.addEventListener("change", rerender);
    controls.price?.addEventListener("change", rerender);
    controls.verified?.addEventListener("change", rerender);
    controls.middleman?.addEventListener("change", rerender);
    controls.ready?.addEventListener("change", rerender);

    controls.heroServer?.addEventListener("change", (event) => {
      syncServerUi(event.target.value, event.target);
      rerender();
    });

    controls.sidebarServer?.addEventListener("change", (event) => {
      syncServerUi(event.target.value, event.target);
      rerender();
    });

    controls.category?.addEventListener("change", (event) => {
      syncCategoryUi(event.target.value);
      rerender();
    });

    controls.tabs.forEach((button) => {
      button.addEventListener("click", () => {
        syncCategoryUi(button.dataset.category || "all");
        rerender();
      });
    });

    controls.reset?.addEventListener("click", () => {
      if (controls.search) controls.search.value = "";
      syncServerUi("ทั้งหมด");
      syncCategoryUi("all");
      if (controls.price) controls.price.value = "all";
      if (controls.sort) controls.sort.value = "newest";
      if (controls.verified) controls.verified.checked = false;
      if (controls.middleman) controls.middleman.checked = false;
      if (controls.ready) controls.ready.checked = false;
      rerender();
    });

    const searchForm = controls.search?.closest("form");
    searchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      rerender();
      document.querySelector("#market")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function hydratePublicListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    try {
      [publicListings, soldListings] = await Promise.all([
        fetchPublicListings(),
        fetchSoldListings().catch((error) => {
          console.warn("ROOC sold listings failed:", error);
          return [];
        })
      ]);
      bindFilters();
      renderFilteredListings();
      renderSoldListings(soldListings);
      console.info(`ROOC public listings loaded ${publicListings.length} active rows, ${soldListings.length} sold rows`);
    } catch (error) {
      console.error("ROOC public listings failed:", error);
    }
  }

  function getDiscordDisplayName(session) {
    const user = session?.user || {};
    const identityData = user.identities?.find((identity) => identity.provider === "discord")?.identity_data || {};
    return user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.preferred_username ||
      identityData.full_name ||
      identityData.name ||
      identityData.preferred_username ||
      user.email ||
      "Discord";
  }

  function getDiscordAvatarUrl(session) {
    const user = session?.user || {};
    const identityData = user.identities?.find((identity) => identity.provider === "discord")?.identity_data || {};
    return user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      identityData.avatar_url ||
      identityData.picture ||
      "";
  }

  function getSessionEmail(session) {
    const user = session?.user || {};
    return (user.email || user.user_metadata?.email || user.identities?.[0]?.identity_data?.email || "").toLowerCase();
  }

  async function getPremiumStatus(session) {
    if (!session || !supabaseClient) return false;
    const { data, error } = await supabaseClient
      .from("marketplace_premium_users")
      .select("active")
      .eq("user_id", session.user.id)
      .eq("active", true)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.active);
  }

  function isAdminSession(session) {
    if (!session) return false;
    const user = session.user || {};
    const email = getSessionEmail(session);
    const identities = user.identities || [];
    const discordIds = identities
      .filter((identity) => identity.provider === "discord")
      .map((identity) => identity.identity_data?.sub || identity.id)
      .filter(Boolean);
    return (config.adminUserIds || []).includes(user.id) ||
      (config.adminEmails || []).map((entry) => entry.toLowerCase()).includes(email) ||
      discordIds.some((id) => (config.adminDiscordIds || []).includes(id));
  }

  function ensureAccountLink() {
    const navLinks = document.querySelector(".nav-links");
    if (!navLinks || navLinks.querySelector(".my-listings-link")) return null;
    const link = document.createElement("a");
    link.className = "my-listings-link";
    link.href = "my-listings.html";
    link.textContent = "ประกาศของฉัน";
    link.hidden = true;
    navLinks.append(link);
    return link;
  }

  async function syncAuthUi(session) {
    const authLinks = document.querySelectorAll(".auth-link");
    const myListingsLink = document.querySelector(".my-listings-link") || ensureAccountLink();
    const adminLinks = document.querySelectorAll(".admin-link");
    const displayName = session ? getDiscordDisplayName(session) : "";
    const avatarUrl = session ? getDiscordAvatarUrl(session) : "";
    const isPremium = await getPremiumStatus(session);

    authLinks.forEach((link) => {
      if (session) {
        const menu = document.createElement("div");
        menu.className = "user-menu";
        menu.innerHTML = `
          <button class="user-menu-trigger" type="button" aria-expanded="false">
            <img src="${escapeHtml(avatarUrl || "assets/category-icons/account-b.png")}" alt="" />
            <span>${escapeHtml(displayName)}</span>
            ${isPremium ? '<strong title="Premium">♛</strong>' : ""}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
          </button>
          <div class="user-menu-panel" hidden>
            <a class="premium-link" href="premium.html">Premium</a>
            <a href="my-listings.html">ประกาศของฉัน</a>
            <button type="button" data-user-logout>ออกจากระบบ</button>
          </div>
        `;
        link.replaceWith(menu);
      } else {
        link.textContent = "เข้าสู่ระบบ";
        link.href = "login.html";
      }
    });

    if (myListingsLink) myListingsLink.hidden = !session;
    adminLinks.forEach((link) => {
      link.hidden = !isAdminSession(session);
    });
  }

  async function hydrateAuthUi() {
    if (!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    await syncAuthUi(data.session);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      syncAuthUi(session);
    });
  }

  document.addEventListener("click", async (event) => {
    const trigger = event.target.closest(".user-menu-trigger");
    const logout = event.target.closest("[data-user-logout]");
    document.querySelectorAll(".user-menu-panel").forEach((panel) => {
      if (!trigger || !panel.closest(".user-menu")?.contains(trigger)) panel.hidden = true;
    });

    if (trigger) {
      const panel = trigger.closest(".user-menu")?.querySelector(".user-menu-panel");
      if (panel) {
        panel.hidden = !panel.hidden;
        trigger.setAttribute("aria-expanded", String(!panel.hidden));
      }
    }

    if (logout && supabaseClient) {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      hydratePublicListings();
      hydrateAuthUi();
    });
  } else {
    hydratePublicListings();
    hydrateAuthUi();
  }
})();
