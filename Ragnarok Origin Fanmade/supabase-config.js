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
  const listingCacheMs = 45000;
  const soldListingCacheMs = 120000;
  const listingSelectColumns = [
    "id",
    "user_id",
    "listing_type",
    "category",
    "item_name",
    "title",
    "image_url",
    "image_urls",
    "character_name",
    "seller_name",
    "seller_avatar_url",
    "seller_discord_id",
    "seller_is_premium",
    "price_text",
    "server_name",
    "contact",
    "description",
    "middleman",
    "offers_enabled",
    "ready_today",
    "facebook_url",
    "active",
    "sale_status",
    "expires_at",
    "created_at",
    "updated_at"
  ].join(",");
  
  const legacyListingSelectColumns = listingSelectColumns
    .split(",")
    .filter((column) => column !== "listing_type" && column !== "offers_enabled" && column !== "facebook_url")
    .join(",");

  const noFacebookListingSelectColumns = listingSelectColumns
    .split(",")
    .filter((column) => column !== "facebook_url")
    .join(",");
  let currentListingPage = 1;
  let activeListingType = "sell";
  let refreshCooldownTimer = null;
  let refreshCooldownEndsAt = 0;
  let accountListingEnabled = true;
  const fallbackServers = [
    "Prontera 1", "Prontera 2", "Prontera 3", "Prontera 4", "Prontera 5",
    "Prontera 6", "Prontera 7", "Prontera 8", "Prontera 9", "Prontera 10",
    "Geffen 1", "Geffen 2", "Geffen 3", "Geffen 4", "Geffen 5",
    "Geffen 6", "Geffen 7", "Geffen 8", "Geffen 9", "Geffen 10"
  ];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initTheme() {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const activeTheme = savedTheme || (prefersDark ? "dark" : "light");
    const themeToggle = document.querySelector("#themeToggle");

    document.documentElement.dataset.theme = activeTheme;
    if (!themeToggle) return;

    themeToggle.checked = activeTheme === "dark";
    if (themeToggle.dataset.themeBound === "true") return;

    themeToggle.dataset.themeBound = "true";
    themeToggle.addEventListener("change", () => {
      const nextTheme = themeToggle.checked ? "dark" : "light";
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem("theme", nextTheme);
    });
  }

  function getSupabaseClient() {
    return supabaseClient;
  }

  function getDescriptionParts(value, maxLength = 120) {
    const text = String(value || "").trim();
    const hasLongToken = text.split(/\s+/).some((part) => part.length > 34);
    const shouldTruncate = text.length > maxLength || hasLongToken;
    if (!shouldTruncate) {
      return { shortText: text, fullText: text, truncated: false };
    }
    const limit = hasLongToken && text.length <= maxLength ? 72 : maxLength;
    return {
      shortText: `${text.slice(0, limit).trim()}...`,
      fullText: text,
      truncated: true
    };
  }

  function toggleListingDescription(button) {
    const card = button?.closest(".listing-card");
    const description = card?.querySelector(".listing-description");
    if (!description) return;

    const expanded = button.dataset.expanded === "true";
    description.textContent = expanded ? description.dataset.short || "" : description.dataset.full || "";
    button.textContent = expanded ? "ดูเพิ่มเติม" : "ย่อข้อความ";
    button.dataset.expanded = String(!expanded);
    button.setAttribute("aria-expanded", String(!expanded));
  }

  window.toggleListingDescription = toggleListingDescription;

  async function fetchCachedJson(cacheKey, url, ttlMs, force = false) {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
        if (cached && Date.now() - cached.savedAt < ttlMs) return cached.data;
      } catch (_error) {
        localStorage.removeItem(cacheKey);
      }
    }

    const response = await fetch(url, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_error) {
      localStorage.removeItem(cacheKey);
    }
    return data;
  }

  async function fetchPublicListings(force = false) {
    const now = encodeURIComponent(new Date().toISOString());
    try {
      return await fetchCachedJson(
        "rooc-public-listings-v3",
        `${config.url}/rest/v1/marketplace_listings?select=${listingSelectColumns}&active=eq.true&or=(expires_at.is.null,expires_at.gte.${now})&order=created_at.desc&limit=200`,
        listingCacheMs,
        force
      );
    } catch (error) {
      console.warn("Facebook column not ready, trying without facebook_url...");
      try {
        return await fetchCachedJson(
          "rooc-public-listings-v3-no-fb",
          `${config.url}/rest/v1/marketplace_listings?select=${noFacebookListingSelectColumns}&active=eq.true&or=(expires_at.is.null,expires_at.gte.${now})&order=created_at.desc&limit=200`,
          listingCacheMs,
          force
        );
      } catch (legacyError) {
        console.warn("ROOC listing_type/offers columns not ready, using legacy listing query:", legacyError);
        return fetchCachedJson(
          "rooc-public-listings-legacy-v1",
          `${config.url}/rest/v1/marketplace_listings?select=${legacyListingSelectColumns}&active=eq.true&or=(expires_at.is.null,expires_at.gte.${now})&order=created_at.desc&limit=200`,
          listingCacheMs,
          force
        );
      }
    }
  }

  async function fetchSoldListings(force = false) {
    try {
      return await fetchCachedJson(
        "rooc-sold-listings-v2",
        `${config.url}/rest/v1/marketplace_listings?select=${listingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc&limit=12`,
        soldListingCacheMs,
        force
      );
    } catch (error) {
      console.warn("Facebook column not ready in sold, trying without facebook_url...");
      try {
        return await fetchCachedJson(
          "rooc-sold-listings-v2-no-fb",
          `${config.url}/rest/v1/marketplace_listings?select=${noFacebookListingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc&limit=12`,
          soldListingCacheMs,
          force
        );
      } catch (legacyError) {
        console.warn("ROOC sold listing_type/offers columns not ready, using legacy sold query:", legacyError);
        return fetchCachedJson(
          "rooc-sold-listings-legacy-v1",
          `${config.url}/rest/v1/marketplace_listings?select=${legacyListingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc&limit=12`,
          soldListingCacheMs,
          force
        );
      }
    }
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

  async function fetchActiveServers() {
    const response = await fetch(`${config.url}/rest/v1/marketplace_servers?select=name&active=eq.true&order=sort_order.asc,name.asc`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`
      }
    });

    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    return rows.map((row) => row.name).filter(Boolean);
  }

  function parsePrice(value) {
    const number = Number(normalizePriceText(value));
    return Number.isFinite(number) ? number : 0;
  }

  function normalizePriceText(value) {
    const cleaned = String(value || "")
      .replace(/,/g, "")
      .replace(/[^\d.]/g, "");
    const [whole = "", ...fractionParts] = cleaned.split(".");
    const normalized = fractionParts.length ? `${whole || "0"}.${fractionParts.join("")}` : whole;
    return normalized.replace(/^0+(?=\d)/, "") || "";
  }

  function formatListingPrice(value) {
    const price = parsePrice(value);
    return price > 0 ? price.toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "0";
  }

  function compareListingNewest(a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  }

  function comparePremiumPriority(a, b) {
    return Number(Boolean(b.seller_is_premium)) - Number(Boolean(a.seller_is_premium));
  }

  function compareListingPrice(a, b, direction) {
    const priceA = parsePrice(a.price_text);
    const priceB = parsePrice(b.price_text);
    const hasPriceA = priceA > 0;
    const hasPriceB = priceB > 0;

    if (hasPriceA !== hasPriceB) return hasPriceA ? -1 : 1;
    if (!hasPriceA && !hasPriceB) {
      return compareListingNewest(a, b);
    }

    const priceDiff = direction === "asc" ? priceA - priceB : priceB - priceA;
    if (priceDiff !== 0) return priceDiff;
    return compareListingNewest(a, b);
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

  function getListingProfileUrl(listing) {
    const discordId = getListingDiscordId(listing);
    if (discordId) return `https://discord.com/users/${discordId}`;
    return getContactProfileUrl(listing.contact);
  }

  function getDiscordIdFromContact(contact) {
    const value = String(contact || "").trim();
    if (/^\d{16,22}$/.test(value)) return value;
    return value.match(/(?:discord(?:app)?\.com\/users\/)(\d{16,22})/i)?.[1] || "";
  }

  function getListingDiscordId(listing) {
    const discordId = String(listing.seller_discord_id || "").trim();
    if (/^\d{16,22}$/.test(discordId)) return discordId;
    return getDiscordIdFromContact(listing.contact);
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
      typeTabs: Array.from(document.querySelectorAll(".listing-type-tabs [data-listing-type]")),
      tabs: Array.from(document.querySelectorAll(".market-tabs [data-category]"))
    };
  }

  function getActiveFilters() {
    const controls = getFilterControls();
    const rawCategory = controls.category?.value || "all";
    return {
      search: normalizeSearch(controls.search?.value || ""),
      server: controls.sidebarServer?.value || controls.heroServer?.value || "ทั้งหมด",
      category: activeListingType === "service" || rawCategory === "account" && (!accountListingEnabled || activeListingType === "buy") ? "all" : rawCategory,
      listingType: activeListingType,
      price: controls.price?.value || "all",
      sort: controls.sort?.value || "newest",
      middleman: Boolean(controls.middleman?.checked),
      ready: Boolean(controls.ready?.checked)
    };
  }

  function setRefreshCooldown(seconds = 10) {
    const controls = getFilterControls();
    const button = controls.refresh;
    if (!button) return;

    refreshCooldownEndsAt = Date.now() + (seconds * 1000);
    window.clearInterval(refreshCooldownTimer);

    const updateCooldown = () => {
      const remaining = Math.ceil((refreshCooldownEndsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        window.clearInterval(refreshCooldownTimer);
        refreshCooldownTimer = null;
        button.disabled = false;
        button.classList.remove("is-cooling-down");
        button.setAttribute("aria-label", "รีเฟรชสินค้า");
        button.title = "รีเฟรชสินค้า";
        return;
      }

      button.disabled = true;
      button.classList.add("is-cooling-down");
      button.setAttribute("aria-label", `รีเฟรชได้อีกครั้งใน ${remaining} วินาที`);
      button.title = `รีเฟรชได้อีกครั้งใน ${remaining} วินาที`;
    };

    updateCooldown();
    refreshCooldownTimer = window.setInterval(updateCooldown, 1000);
  }

  function listingMatchesSearch(listing, search) {
    if (!search) return true;
    const categoryNames = {
      mvp: "mvp cards card การ์ด",
      accessories: "accessories accessory ประดับ",
      fashion: "fashion แฟชั่น",
      account: "account บัญชี",
      dungeon: "dungeon ดัน รับจ้างลงดัน"
    };
    const typeText = listing.listing_type === "buy" ? "รับซื้อ buy" : listing.listing_type === "service" ? "รับจ้างลงดัน service dungeon" : "ขาย sell";
    const text = [
      listing.title,
      listing.item_name,
      listing.character_name,
      listing.seller_name,
      listing.server_name,
      listing.description,
      categoryNames[listing.category] || listing.category,
      typeText
    ].join(" ").toLowerCase();
    return search.split(/\s+/).every((term) => text.includes(term));
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getListingImages(listing) {
    const urls = Array.isArray(listing.image_urls) ? listing.image_urls : [];
    if (listing.image_url) urls.unshift(listing.image_url);
    return urls.filter(Boolean).length ? urls : ["assets/category-icons/account-b.png"];
  }

  function renderListingGrid(listings, containerSelector) {
    const grid = document.querySelector(containerSelector);
    if (!grid) return;

    if (!listings.length) {
      grid.innerHTML = '<div class="empty-state">ไม่พบประกาศที่ตรงตามเงื่อนไข</div>';
      return;
    }

    grid.innerHTML = listings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const listingType = listing.listing_type || "sell";
      const isServiceListing = listingType === "service";
      const listingImages = getListingImages(listing);
      const contact = listing.contact || "";
      const profileUrl = getListingProfileUrl(listing);
      const discordId = getListingDiscordId(listing);
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
      const badges = [
        `<span class="${listingType === "buy" ? "buy" : listingType === "service" ? "verified" : "fast"}">${listingType === "buy" ? "รับซื้อ" : listingType === "service" ? "รับจ้าง" : "ขาย"}</span>`,
        `<span>${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
        listing.ready_today ? '<span class="fast">Fast Deal</span>' : "",
        listing.category === "mvp" ? '<span class="mvp">MVP</span>' : ""
      ].filter(Boolean).join("");
      const description = listing.description || "";
      const descriptionParts = getDescriptionParts(description);
      const sellerId = listing.user_id || "";

      return `
        <article class="listing-card${isServiceListing ? " service-listing-card" : ""}">
          ${isServiceListing ? "" : `<div class="item-media">
            <img src="${escapeHtml(listingImages[0])}" alt="" loading="lazy" />
          </div>`}
          <div class="listing-seller">
            <img src="${escapeHtml(sellerAvatar)}" alt="" />
            <a href="store.html?id=${encodeURIComponent(sellerId)}&name=${encodeURIComponent(sellerName)}" class="seller-link">${escapeHtml(sellerName)}</a>
            ${listing.seller_is_premium ? '<strong title="Premium">♛</strong>' : ""}
          </div>
          <div class="listing-meta">${badges}</div>
          <h3>${escapeHtml(title)}</h3>
          <p class="listing-description" data-short="${escapeHtml(descriptionParts.shortText)}" data-full="${escapeHtml(descriptionParts.fullText)}">
            ${escapeHtml(descriptionParts.shortText)}
          </p>
          ${descriptionParts.truncated ? `<button type="button" class="btn-text" data-description-toggle>ดูเพิ่มเติม</button>` : ""}
          <div class="price-row">
            <strong>฿ ${formatListingPrice(listing.price_text)}</strong>
            <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(contact)}" data-profile-url="${escapeHtml(profileUrl)}" data-discord-id="${escapeHtml(discordId)}" data-seller-name="${escapeHtml(sellerName)}">ติดต่อ</button>
          </div>
        </article>
      `;
    }).join("");

    grid.querySelectorAll(".contact-seller-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const data = btn.dataset;
        const modal = document.querySelector("#sellerContactModal");
        if (modal) {
          document.querySelector("#sellerContactTitle").textContent = "ติดต่อผู้ขาย";
          document.querySelector("#sellerContactItem").textContent = data.title;
          document.querySelector("#sellerContactValue").textContent = data.discordId || data.contact;
          modal.hidden = false;
        }
      });
    });
  }

  function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / listingsPerPage);
    const container = document.querySelector("#listingPagination"); // แก้ไข ID ให้ตรงกับ index.html
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    let html = `<button type="button" class="btn btn-icon" ${currentListingPage === 1 ? "disabled" : ""} data-page="${currentListingPage - 1}">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentListingPage - 1 && i <= currentListingPage + 1)) {
        html += `<button type="button" class="btn btn-icon ${i === currentListingPage ? "is-active" : ""}" data-page="${i}">${i}</button>`;
      } else if (i === currentListingPage - 2 || i === currentListingPage + 2) {
        html += '<span class="pagination-dots">...</span>';
      }
    }
    html += `<button type="button" class="btn btn-icon" ${currentListingPage === totalPages ? "disabled" : ""} data-page="${currentListingPage + 1}">›</button>`;
    container.innerHTML = html;

    container.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentListingPage = Number(btn.dataset.page);
        applyFilters();
        window.scrollTo({ top: document.querySelector(".market-main")?.offsetTop - 80, behavior: "smooth" });
      });
    });
  }

  function applyFilters(forceScroll = false) {
    const filters = getActiveFilters();
    let filtered = publicListings.filter((l) => {
      if (l.listing_type !== filters.listingType) return false;
      if (filters.server !== "ทั้งหมด" && l.server_name !== filters.server) return false;
      if (filters.category !== "all" && l.category !== filters.category) return false;
      if (filters.middleman && !l.middleman) return false;
      if (filters.ready && !l.ready_today) return false;
      if (filters.price !== "all") {
        const price = parsePrice(l.price_text);
        if (filters.price === "0-500" && (price <= 0 || price > 500)) return false;
        if (filters.price === "501-2000" && (price <= 500 || price > 2000)) return false;
        if (filters.price === "2001-5000" && (price <= 2000 || price > 5000)) return false;
        if (filters.price === "5001+" && price <= 5000) return false;
      }
      return listingMatchesSearch(l, filters.search);
    });

    if (filters.sort === "price-asc") filtered.sort((a, b) => compareListingPrice(a, b, "asc"));
    else if (filters.sort === "price-desc") filtered.sort((a, b) => compareListingPrice(a, b, "desc"));
    else filtered.sort(compareListingNewest);

    filtered.sort(comparePremiumPriority);

    const start = (currentListingPage - 1) * listingsPerPage;
    const paginated = filtered.slice(start, start + listingsPerPage);
    renderListingGrid(paginated, "#latestListingGrid"); // แก้ไข ID ให้ตรงกับ index.html
    updatePagination(filtered.length);

    if (forceScroll) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function refreshListings(force = false) {
    const controls = getFilterControls();
    if (controls.refresh) controls.refresh.disabled = true;

    try {
      publicListings = await fetchPublicListings(force);
      applyFilters();
      if (force) setRefreshCooldown(15);
    } catch (error) {
      console.error("ROOC listings failed:", error);
    } finally {
      if (controls.refresh && !refreshCooldownTimer) controls.refresh.disabled = false;
    }
  }

  async function refreshSoldListings(force = false) {
    try {
      soldListings = await fetchSoldListings(force);
      renderListingGrid(soldListings, "#soldListingScroller"); // แก้ไข ID ให้ตรงกับ index.html
    } catch (error) {
      console.error("ROOC sold listings failed:", error);
    }
  }

  function initFilters() {
    const controls = getFilterControls();
    const update = () => {
      currentListingPage = 1;
      applyFilters();
    };

    controls.search?.addEventListener("input", update);
    controls.heroServer?.addEventListener("change", (e) => {
      if (controls.sidebarServer) controls.sidebarServer.value = e.target.value;
      update();
    });
    controls.sidebarServer?.addEventListener("change", (e) => {
      if (controls.heroServer) controls.heroServer.value = e.target.value;
      update();
    });
    controls.category?.addEventListener("change", update);
    controls.price?.addEventListener("change", update);
    controls.sort?.addEventListener("change", update);
    controls.middleman?.addEventListener("change", update);
    controls.ready?.addEventListener("change", update);
    controls.refresh?.addEventListener("click", () => refreshListings(true));

    controls.reset?.addEventListener("click", () => {
      if (controls.search) controls.search.value = "";
      if (controls.heroServer) controls.heroServer.value = "ทั้งหมด";
      if (controls.sidebarServer) controls.sidebarServer.value = "ทั้งหมด";
      if (controls.category) controls.category.value = "all";
      if (controls.price) controls.price.value = "all";
      if (controls.sort) controls.sort.value = "newest";
      if (controls.middleman) controls.middleman.checked = false;
      if (controls.ready) controls.ready.checked = false;
      update();
    });

    controls.typeTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        activeListingType = tab.dataset.listingType;
        controls.typeTabs.forEach((t) => t.classList.toggle("is-active", t === tab));
        
        const isService = activeListingType === "service";
        const isBuy = activeListingType === "buy";
        
        if (controls.category) {
          controls.category.closest(".filter-group")?.style.setProperty("display", isService ? "none" : "block");
          if (isService || (isBuy && controls.category.value === "account" && !accountListingEnabled)) {
            controls.category.value = "all";
          }
        }
        
        if (controls.middleman) {
          controls.middleman.closest("label")?.style.setProperty("display", isService ? "none" : "flex");
        }
        
        update();
      });
    });

    controls.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        if (controls.category) {
          controls.category.value = tab.dataset.category;
          update();
        }
      });
    });
  }

  async function initServerFilters() {
    const controls = getFilterControls();
    if (!controls.heroServer && !controls.sidebarServer) return;

    try {
      const servers = await fetchActiveServers();
      const options = ['<option value="ทั้งหมด">เซิร์ฟเวอร์ทั้งหมด</option>', ...servers.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)].join("");
      if (controls.heroServer) controls.heroServer.innerHTML = options;
      if (controls.sidebarServer) controls.sidebarServer.innerHTML = options;
    } catch (error) {
      console.warn("ROOC servers failed, using fallback:", error);
      const options = ['<option value="ทั้งหมด">เซิร์ฟเวอร์ทั้งหมด</option>', ...fallbackServers.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)].join("");
      if (controls.heroServer) controls.heroServer.innerHTML = options;
      if (controls.sidebarServer) controls.sidebarServer.innerHTML = options;
    }
  }

  async function initSupportSidebar() {
    const container = document.querySelector("#supportSidebar");
    if (!container) return;

    try {
      const settings = await fetchSiteSettings();
      accountListingEnabled = settings.account_listing_enabled !== false;
      
      if (!accountListingEnabled && controls.category) {
        const accOption = controls.category.querySelector('option[value="account"]');
        if (accOption) accOption.remove();
      }

      if (settings.html) {
        container.innerHTML = settings.html;
      } else if (settings.image_url) {
        container.innerHTML = `
          <div class="support-card">
            <a href="${escapeHtml(settings.link_url || "#")}" target="_blank" rel="noopener">
              <img src="${escapeHtml(settings.image_url)}" alt="Support" style="width:100%;border-radius:var(--radius-md);" />
            </a>
          </div>
        `;
      }
    } catch (error) {
      console.warn("ROOC site settings failed:", error);
    }
  }

  async function getPremiumStatus(session) {
    if (!session || !supabaseClient) return false;
    try {
      const { data } = await supabaseClient
        .from("marketplace_profiles")
        .select("is_premium")
        .eq("id", session.user.id)
        .single();
      return Boolean(data?.is_premium);
    } catch (_error) {
      return false;
    }
  }

  function getDiscordDisplayName(session) {
    return session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.custom_claims?.global_name || session?.user?.email?.split("@")[0] || "User";
  }

  function getDiscordAvatarUrl(session) {
    return session?.user?.user_metadata?.avatar_url || "";
  }

  function isAdminSession(session) {
    if (!session) return false;
    const email = session.user.email;
    const userId = session.user.id;
    const discordId = session.user.user_metadata?.provider_id || session.user.user_metadata?.sub;
    return config.adminEmails.includes(email) || config.adminUserIds.includes(userId) || config.adminDiscordIds.includes(discordId);
  }

  async function upsertMarketplaceProfile(session) {
    if (!session || !supabaseClient) return;
    const metadata = session.user.user_metadata;
    const profile = {
      id: session.user.id,
      email: session.user.email,
      display_name: getDiscordDisplayName(session),
      avatar_url: getDiscordAvatarUrl(session),
      discord_id: metadata?.provider_id || metadata?.sub || "",
      updated_at: new Date().toISOString()
    };

    try {
      await supabaseClient.from("marketplace_profiles").upsert(profile, { onConflict: "id" });
    } catch (error) {
      if (!/marketplace_profiles|relation|schema cache/i.test(error.message || "")) {
        console.warn("ROOC profile sync failed:", error);
      }
    }
  }

  const initStorePage = async () => {
    const storeName = document.querySelector("#storeName");
    const storeAvatar = document.querySelector("#storeAvatar");
    const storeFacebook = document.querySelector("#storeFacebook");
    const storeDiscordText = document.querySelector("#storeDiscordText");
    const storeTotalListings = document.querySelector("#storeTotalListings");
    const storeSoldItems = document.querySelector("#storeSoldItems");
    const grid = document.querySelector("#storeListingGrid");
    const emptyState = document.querySelector("#storeEmptyState");

    if (storeName && grid) {
      const params = new URLSearchParams(window.location.search);
      const sellerId = params.get("id");
      const urlName = params.get("name");

      if (!sellerId && !urlName) {
        storeName.textContent = "ไม่พบข้อมูลผู้ขาย";
        return;
      }

      if (urlName) storeName.textContent = decodeURIComponent(urlName);

      let storeListings = [];
      let currentCategory = "all";
      let currentSort = "newest";

      const renderStoreGrid = () => {
        if (!grid) return;
        let filtered = storeListings.filter(l => l.active !== false && l.sale_status !== "deleted");
        if (currentCategory !== "all") filtered = filtered.filter(l => l.category === currentCategory);

        if (currentSort === "price-low") filtered.sort((a, b) => parsePrice(a.price_text) - parsePrice(b.price_text));
        else if (currentSort === "price-high") filtered.sort((a, b) => parsePrice(b.price_text) - parsePrice(a.price_text));
        else filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        if (filtered.length === 0) {
          grid.innerHTML = "";
          emptyState.hidden = false;
          return;
        }

        emptyState.hidden = true;
        grid.innerHTML = filtered.map(listing => {
          const title = listing.title || listing.item_name || "ประกาศขาย";
          const listingType = listing.listing_type || "sell";
          const isServiceListing = listingType === "service";
          const listingImages = getListingImages(listing);
          const contact = listing.contact || "";
          const profileUrl = getListingProfileUrl(listing);
          const discordId = getListingDiscordId(listing);
          const sellerName = listing.seller_name || "ผู้ขาย ROOC";
          const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
          const badges = [
            `<span class="${listingType === "buy" ? "buy" : listingType === "service" ? "verified" : "fast"}">${listingType === "buy" ? "รับซื้อ" : listingType === "service" ? "รับจ้าง" : "ขาย"}</span>`,
            `<span>${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
            listing.ready_today ? '<span class="fast">Fast Deal</span>' : "",
            listing.category === "mvp" ? '<span class="mvp">MVP</span>' : ""
          ].filter(Boolean).join("");
          const description = listing.description || "";
          const descriptionParts = getDescriptionParts(description);

          return `
            <article class="listing-card${isServiceListing ? " service-listing-card" : ""}">
              ${isServiceListing ? "" : `<div class="item-media">
                <img src="${escapeHtml(listingImages[0])}" alt="" loading="lazy" />
              </div>`}
              <div class="listing-seller">
                <img src="${escapeHtml(sellerAvatar)}" alt="" />
                <span>${escapeHtml(sellerName)}</span>
                ${listing.seller_is_premium ? '<strong title="Premium">♛</strong>' : ""}
              </div>
              <div class="listing-meta">${badges}</div>
              <h3>${escapeHtml(title)}</h3>
              <p class="listing-description" data-short="${escapeHtml(descriptionParts.shortText)}" data-full="${escapeHtml(descriptionParts.fullText)}">
                ${escapeHtml(descriptionParts.shortText)}
              </p>
              ${descriptionParts.truncated ? `<button type="button" class="btn-text" data-description-toggle>ดูเพิ่มเติม</button>` : ""}
              <div class="price-row">
                <strong>฿ ${formatListingPrice(listing.price_text)}</strong>
                <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(contact)}" data-profile-url="${escapeHtml(profileUrl)}" data-discord-id="${escapeHtml(discordId)}" data-seller-name="${escapeHtml(sellerName)}">ติดต่อ</button>
              </div>
            </article>
          `;
        }).join("");
        
        grid.querySelectorAll(".contact-seller-button").forEach(btn => {
          btn.addEventListener("click", () => {
            const data = btn.dataset;
            const modal = document.querySelector("#sellerContactModal");
            if (modal) {
              document.querySelector("#sellerContactTitle").textContent = "ติดต่อผู้ขาย";
              document.querySelector("#sellerContactItem").textContent = data.title;
              document.querySelector("#sellerContactValue").textContent = data.discordId || data.contact;
              modal.hidden = false;
            }
          });
        });
      };

      try {
        if (!supabaseClient) throw new Error("Supabase client not initialized");
        
        const safeFetch = async (columns, idValue, idColumn = "user_id") => {
          if (!idValue) return { data: [], error: null };
          try {
            const { data, error } = await supabaseClient
              .from("marketplace_listings")
              .select(columns)
              .eq(idColumn, idValue)
              .order("created_at", { ascending: false });
            return { data, error };
          } catch (e) {
            return { data: null, error: e };
          }
        };

        let result = { data: [], error: null };
        
        if (sellerId && sellerId !== "null" && sellerId !== "undefined") {
          result = await safeFetch(listingSelectColumns, sellerId, "user_id");
          if (result.error) result = await safeFetch(noFacebookListingSelectColumns, sellerId, "user_id");
          if (result.error) result = await safeFetch(legacyListingSelectColumns, sellerId, "user_id");
        }
        
        if (!result.data || result.data.length === 0) {
          const nameToSearch = urlName ? decodeURIComponent(urlName) : "";
          if (nameToSearch) {
            result = await safeFetch(listingSelectColumns, nameToSearch, "seller_name");
            if (result.error) result = await safeFetch(noFacebookListingSelectColumns, nameToSearch, "seller_name");
            if (result.error) result = await safeFetch(legacyListingSelectColumns, nameToSearch, "seller_name");
          }
        }

        if (result.error) throw result.error;
        
        storeListings = result.data || [];
        
        if (storeListings.length > 0) {
          const seller = storeListings[0];
          if (storeName) storeName.textContent = seller.seller_name || decodeURIComponent(urlName || "ผู้ขาย ROOC");
          if (storeAvatar && seller.seller_avatar_url) storeAvatar.src = seller.seller_avatar_url;
          if (storeFacebook) {
            if (seller.facebook_url) {
              storeFacebook.href = seller.facebook_url;
              storeFacebook.hidden = false;
            } else {
              storeFacebook.hidden = true;
            }
          }
          if (storeDiscordText) storeDiscordText.textContent = seller.seller_discord_id || seller.contact || "N/A";
          if (storeTotalListings) storeTotalListings.textContent = storeListings.filter(l => l.active).length;
          if (storeSoldItems) storeSoldItems.textContent = storeListings.filter(l => l.sale_status === "sold").length;
          
          renderStoreGrid();
        } else {
          if (storeName) storeName.textContent = decodeURIComponent(urlName || "ไม่พบผู้ขาย");
          emptyState.hidden = false;
        }
      } catch (err) {
        console.error("Store error:", err);
        if (storeName) storeName.textContent = "เกิดข้อผิดพลาดในการดึงข้อมูล";
      }

      document.querySelectorAll("#storeCategoryTabs button").forEach(btn => {
        btn.addEventListener("click", () => {
          document.querySelectorAll("#storeCategoryTabs button").forEach(b => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          currentCategory = btn.dataset.category;
          renderStoreGrid();
        });
      });

      document.querySelector("#storeSortFilter")?.addEventListener("change", (e) => {
        currentSort = e.target.value;
        renderStoreGrid();
      });

      document.querySelectorAll("[data-close-contact]").forEach(el => {
        el.addEventListener("click", () => {
          const modal = document.querySelector("#sellerContactModal");
          if (modal) modal.hidden = true;
        });
      });
    }
  };

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

  async function fetchReceivedOffers(session, limit = 20) {
    if (!session || !supabaseClient) return [];

    const { data: listings, error: listingsError } = await supabaseClient
      .from("marketplace_listings")
      .select("id,title,item_name,price_text")
      .eq("user_id", session.user.id)
      .neq("sale_status", "deleted")
      .limit(120);

    if (listingsError || !listings?.length) return [];

    const listingMap = new Map(listings.map((listing) => [listing.id, listing]));
    const { data: offers, error: offersError } = await supabaseClient
      .from("marketplace_listing_offers")
      .select("id,listing_id,buyer_display_name,offer_price_text,message,status,created_at")
      .in("listing_id", listings.map((listing) => listing.id))
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (offersError) {
      if (!/marketplace_listing_offers|relation|schema cache/i.test(offersError.message || "")) {
        console.warn("ROOC mailbox offers failed:", offersError);
      }
      return [];
    }

    return (offers || []).map((offer) => ({
      ...offer,
      listing: listingMap.get(offer.listing_id) || null
    }));
  }

  function renderMailboxItems(offers) {
    if (!offers.length) {
      return '<p class="mailbox-empty">ยังไม่มีราคาเสนอใหม่</p>';
    }

    return offers.map((offer) => {
      const listingTitle = offer.listing?.title || offer.listing?.item_name || "ประกาศของคุณ";
      return `
        <button class="mailbox-item${offer.status === "new" ? " is-new" : ""}" type="button" data-offer-read="${escapeHtml(offer.id)}">
          <span>
            <strong>฿ ${formatListingPrice(offer.offer_price_text)}</strong>
            <small>${escapeHtml(offer.buyer_display_name || "ผู้เสนอราคา")} เสนอใน ${escapeHtml(listingTitle)}</small>
          </span>
          ${offer.message ? `<em>${escapeHtml(offer.message)}</em>` : ""}
        </button>
      `;
    }).join("");
  }

  async function createMailboxMenu(session) {
    const offers = await fetchReceivedOffers(session);
    const unreadCount = offers.filter((offer) => offer.status === "new").length;
    const mailbox = document.createElement("div");
    mailbox.className = "mailbox-menu";
    mailbox.innerHTML = `
      <button class="mailbox-trigger" type="button" aria-label="Mailbox เสนอราคา" aria-expanded="false">
        <span aria-hidden="true">✉</span>
        ${unreadCount ? `<b>${unreadCount > 99 ? "99+" : unreadCount}</b>` : ""}
      </button>
      <div class="mailbox-panel" hidden>
        <div class="mailbox-head">
          <strong>Mailbox เสนอราคา</strong>
          <a href="my-listings.html">ดูทั้งหมด</a>
        </div>
        <div class="mailbox-list">${renderMailboxItems(offers)}</div>
      </div>
    `;
    return mailbox;
  }

  async function syncAuthUi(session) {
    const authLinks = document.querySelectorAll(".auth-link");
    const myListingsLink = document.querySelector(".my-listings-link") || ensureAccountLink();
    const adminLinks = document.querySelectorAll(".admin-link");
    const displayName = session ? getDiscordDisplayName(session) : "";
    const avatarUrl = session ? getDiscordAvatarUrl(session) : "";
    const isPremium = await getPremiumStatus(session);

    for (const link of authLinks) {
      if (!link.dataset.defaultAuthHref) {
        link.dataset.defaultAuthHref = link.getAttribute("href") || "login.html";
      }

      if (session) {
        const tools = document.createElement("div");
        tools.className = "user-tools";
        const mailbox = await createMailboxMenu(session);
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
        tools.append(mailbox, menu);
        link.replaceWith(tools);
      } else {
        link.textContent = "เข้าสู่ระบบ";
        link.href = link.dataset.defaultAuthHref || "login.html";
      }
    }

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
    const descriptionToggle = event.target.closest("[data-description-toggle]");
    const trigger = event.target.closest(".user-menu-trigger");
    const mailboxTrigger = event.target.closest(".mailbox-trigger");
    const offerRead = event.target.closest("[data-offer-read]");
    const logout = event.target.closest("[data-user-logout]");

    if (descriptionToggle) {
      event.preventDefault();
      toggleListingDescription(descriptionToggle);
      return;
    }

    document.querySelectorAll(".user-menu-panel").forEach((panel) => {
      if (!trigger || !panel.closest(".user-menu")?.contains(trigger)) panel.hidden = true;
    });
    document.querySelectorAll(".mailbox-panel").forEach((panel) => {
      if (!mailboxTrigger || !panel.closest(".mailbox-menu")?.contains(mailboxTrigger)) panel.hidden = true;
    });

    if (trigger) {
      const panel = trigger.closest(".user-menu")?.querySelector(".user-menu-panel");
      if (panel) {
        panel.hidden = !panel.hidden;
        trigger.setAttribute("aria-expanded", String(!panel.hidden));
      }
    }

    if (mailboxTrigger) {
      const panel = mailboxTrigger.closest(".mailbox-menu")?.querySelector(".mailbox-panel");
      if (panel) {
        panel.hidden = !panel.hidden;
        mailboxTrigger.setAttribute("aria-expanded", String(!panel.hidden));
      }
      return;
    }

    if (offerRead && supabaseClient) {
      const offerId = offerRead.dataset.offerRead;
      const { error } = await supabaseClient.from("marketplace_listing_offers").update({ status: "read" }).eq("id", offerId);
      if (!error) {
        offerRead.classList.remove("is-new");
        const triggerBtn = document.querySelector(".mailbox-trigger b");
        if (triggerBtn) {
          const count = parseInt(triggerBtn.textContent) - 1;
          if (count <= 0) triggerBtn.remove();
          else triggerBtn.textContent = count > 99 ? "99+" : count;
        }
      }
    }

    if (logout && supabaseClient) {
      await supabaseClient.auth.signOut();
      window.location.reload();
    }
  });

  const init = async () => {
    initTheme();
    await initServerFilters();
    initSupportSidebar();
    initFilters();
    await hydrateAuthUi();
    
    const isStorePage = window.location.pathname.includes("store.html");
    if (isStorePage) {
      await initStorePage();
    } else {
      await refreshListings();
      await refreshSoldListings();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
