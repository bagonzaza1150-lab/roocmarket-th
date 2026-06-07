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
  const listingsPerPage = 6;
  let currentListingPage = 1;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function fetchPublicListings() {
    const now = encodeURIComponent(new Date().toISOString());
    const response = await fetch(`${config.url}/rest/v1/marketplace_listings?select=*&active=eq.true&or=(expires_at.is.null,expires_at.gte.${now})&order=created_at.desc&limit=200`, {
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

  async function fetchSiteSettings() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_site_settings?select=key,value&key=eq.support_sidebar`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return rows?.[0]?.value || {};
  }

  function parsePrice(value) {
    const number = Number(String(value || "").replace(/[^\d]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function compareListingPrice(a, b, direction) {
    const priceA = parsePrice(a.price_text);
    const priceB = parsePrice(b.price_text);
    const hasPriceA = priceA > 0;
    const hasPriceB = priceB > 0;

    if (hasPriceA !== hasPriceB) return hasPriceA ? -1 : 1;
    if (!hasPriceA && !hasPriceB) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }

    const priceDiff = direction === "asc" ? priceA - priceB : priceB - priceA;
    if (priceDiff !== 0) return priceDiff;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
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
      refresh: document.querySelector("#refreshListingsButton"),
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
      if (filters.middleman && !listing.middleman) return false;
      if (filters.ready && !listing.ready_today) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (filters.sort === "price-low") return compareListingPrice(a, b, "asc");
      if (filters.sort === "price-high") return compareListingPrice(a, b, "desc");
      if (Boolean(b.seller_is_premium) !== Boolean(a.seller_is_premium)) {
        return Number(Boolean(b.seller_is_premium)) - Number(Boolean(a.seller_is_premium));
      }
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
    const pagination = document.querySelector("#listingPagination");
    if (!grid || !emptyState) return;

    if (!listings.length) {
      grid.innerHTML = "";
      if (pagination) {
        pagination.hidden = true;
        pagination.innerHTML = "";
      }
      emptyState.hidden = false;
      emptyState.querySelector("h3").textContent = isFiltered ? "ไม่พบประกาศที่ตรงกับตัวกรอง" : "ยังไม่มีประกาศขาย";
      emptyState.querySelector("p").textContent = isFiltered ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา" : "เมื่อมีผู้ขายลงประกาศ รายการล่าสุดจะแสดงในส่วนนี้";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(listings.length / listingsPerPage));
    currentListingPage = Math.min(Math.max(currentListingPage, 1), totalPages);
    const pageStart = (currentListingPage - 1) * listingsPerPage;
    const pageListings = listings.slice(pageStart, pageStart + listingsPerPage);

    grid.innerHTML = pageListings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const mediaClass = listing.category === "mvp" ? "item-media card-media" : "item-media";
      const contact = listing.contact || "";
      const profileUrl = getContactProfileUrl(contact);
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
      const badges = [
        `<span>${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
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
    renderListingPagination(listings.length, totalPages);
  }

  function renderListingPagination(totalItems, totalPages) {
    const pagination = document.querySelector("#listingPagination");
    if (!pagination) return;

    if (totalPages <= 1) {
      pagination.hidden = true;
      pagination.innerHTML = "";
      return;
    }

    const pageButtons = Array.from({ length: totalPages }, (_item, index) => {
      const page = index + 1;
      return `<button class="${page === currentListingPage ? "is-active" : ""}" type="button" data-page="${page}" aria-current="${page === currentListingPage ? "page" : "false"}">${page}</button>`;
    }).join("");

    const firstItem = ((currentListingPage - 1) * listingsPerPage) + 1;
    const lastItem = Math.min(currentListingPage * listingsPerPage, totalItems);
    pagination.innerHTML = `
      <span>แสดง ${firstItem}-${lastItem} จาก ${totalItems.toLocaleString("th-TH")} ประกาศ</span>
      <div>
        <button type="button" data-page-prev ${currentListingPage === 1 ? "disabled" : ""}>ก่อนหน้า</button>
        ${pageButtons}
        <button type="button" data-page-next ${currentListingPage === totalPages ? "disabled" : ""}>ถัดไป</button>
      </div>
    `;
    pagination.hidden = false;
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

  function renderSupportSidebar(settings) {
    const sidebar = document.querySelector("#supportSidebar");
    if (!sidebar) return;

    const cards = [
      {
        enabled: settings.donate_enabled,
        eyebrow: "Donate",
        title: settings.donate_title || "สนับสนุน ROOC Market TH",
        text: settings.donate_text || "",
        qr: settings.donate_qr_url || "",
        button: settings.donate_button_label || "โดเนท",
        url: settings.donate_button_url || ""
      },
      {
        enabled: settings.middleman_enabled,
        eyebrow: "Middleman",
        title: settings.middleman_title || "ติดต่อ Middleman",
        text: settings.middleman_text || "",
        qr: settings.middleman_qr_url || "",
        button: settings.middleman_button_label || "ติดต่อ Middleman",
        url: settings.middleman_button_url || ""
      }
    ].filter((card) => card.enabled);

    if (!cards.length) {
      sidebar.hidden = true;
      sidebar.innerHTML = "";
      return;
    }

    sidebar.innerHTML = cards.map((card) => `
      <article class="support-card">
        <p class="eyebrow">${escapeHtml(card.eyebrow)}</p>
        <h3>${escapeHtml(card.title)}</h3>
        ${card.text ? `<p>${escapeHtml(card.text)}</p>` : ""}
        ${card.qr ? `<img class="support-qr" src="${escapeHtml(card.qr)}" alt="QR Code ${escapeHtml(card.title)}" />` : ""}
        ${card.url ? `<a class="btn btn-primary support-button" href="${escapeHtml(card.url)}" target="_blank" rel="noopener">${escapeHtml(card.button)}</a>` : ""}
      </article>
    `).join("");
    sidebar.hidden = false;
  }

  function renderFilteredListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    renderCounts(publicListings);
    renderListingCards(getFilteredListings(), true);
  }

  function resetListingPage() {
    currentListingPage = 1;
  }

  async function refreshListings() {
    const controls = getFilterControls();
    if (controls.refresh) {
      controls.refresh.disabled = true;
      controls.refresh.classList.add("is-loading");
      controls.refresh.setAttribute("aria-label", "กำลังรีเฟรชสินค้า");
    }

    try {
      [publicListings, soldListings] = await Promise.all([
        fetchPublicListings(),
        fetchSoldListings().catch((error) => {
          console.warn("ROOC sold listings failed:", error);
          return [];
        })
      ]);
      renderFilteredListings();
      renderSoldListings(soldListings);
      console.info(`ROOC listings refreshed ${publicListings.length} active rows, ${soldListings.length} sold rows`);
    } catch (error) {
      console.error("ROOC listings refresh failed:", error);
    } finally {
      if (controls.refresh) {
        controls.refresh.disabled = false;
        controls.refresh.classList.remove("is-loading");
        controls.refresh.setAttribute("aria-label", "รีเฟรชสินค้า");
        controls.refresh.title = "รีเฟรชสินค้า";
      }
    }
  }

  function bindFilters() {
    if (document.body.dataset.filtersBound === "true") return;
    document.body.dataset.filtersBound = "true";
    const controls = getFilterControls();
    const rerender = () => {
      resetListingPage();
      renderFilteredListings();
    };

    controls.search?.addEventListener("input", rerender);
    controls.sort?.addEventListener("change", rerender);
    controls.refresh?.addEventListener("click", refreshListings);
    controls.price?.addEventListener("change", rerender);
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
      if (controls.middleman) controls.middleman.checked = false;
      if (controls.ready) controls.ready.checked = false;
      rerender();
    });

    document.querySelector("#listingPagination")?.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-page]");
      const prevButton = event.target.closest("[data-page-prev]");
      const nextButton = event.target.closest("[data-page-next]");
      if (pageButton) currentListingPage = Number(pageButton.dataset.page) || 1;
      if (prevButton) currentListingPage = Math.max(1, currentListingPage - 1);
      if (nextButton) currentListingPage += 1;
      if (pageButton || prevButton || nextButton) {
        renderFilteredListings();
        document.querySelector("#market")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
      bindFilters();
      fetchSiteSettings()
        .then(renderSupportSidebar)
        .catch((error) => console.warn("ROOC support settings failed:", error));
      await refreshListings();
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

  function getDiscordId(session) {
    const identity = session?.user?.identities?.find((entry) => entry.provider === "discord");
    return identity?.identity_data?.sub || identity?.id || "";
  }

  function getSessionEmail(session) {
    const user = session?.user || {};
    return (user.email || user.user_metadata?.email || user.identities?.[0]?.identity_data?.email || "").toLowerCase();
  }

  async function upsertMarketplaceProfile(session) {
    if (!session || !supabaseClient) return;
    await supabaseClient
      .from("marketplace_profiles")
      .upsert({
        user_id: session.user.id,
        discord_id: getDiscordId(session),
        display_name: getDiscordDisplayName(session),
        avatar_url: getDiscordAvatarUrl(session),
        email: getSessionEmail(session)
      }, { onConflict: "user_id" });
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
    await upsertMarketplaceProfile(data.session);
    await syncAuthUi(data.session);
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      upsertMarketplaceProfile(session);
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
