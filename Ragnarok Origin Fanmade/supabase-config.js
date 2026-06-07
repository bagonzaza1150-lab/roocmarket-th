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
    "ready_today",
    "active",
    "sale_status",
    "expires_at",
    "created_at",
    "updated_at"
  ].join(",");
  const legacyListingSelectColumns = listingSelectColumns
    .split(",")
    .filter((column) => column !== "listing_type")
    .join(",");
  let currentListingPage = 1;
  let activeListingType = "sell";
  let refreshCooldownTimer = null;
  let refreshCooldownEndsAt = 0;
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
      console.warn("ROOC listing_type column not ready, using legacy listing query:", error);
      return fetchCachedJson(
        "rooc-public-listings-legacy-v1",
        `${config.url}/rest/v1/marketplace_listings?select=${legacyListingSelectColumns}&active=eq.true&or=(expires_at.is.null,expires_at.gte.${now})&order=created_at.desc&limit=200`,
        listingCacheMs,
        force
      );
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
      console.warn("ROOC sold listing_type column not ready, using legacy sold query:", error);
      return fetchCachedJson(
        "rooc-sold-listings-legacy-v1",
        `${config.url}/rest/v1/marketplace_listings?select=${legacyListingSelectColumns}&active=eq.false&sale_status=eq.sold&order=updated_at.desc&limit=12`,
        soldListingCacheMs,
        force
      );
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
    const number = Number(String(value || "").replace(/[^\d]/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function formatListingPrice(value) {
    const price = parsePrice(value);
    return price > 0 ? price.toLocaleString("th-TH") : "0";
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
      category: activeListingType === "service" || (activeListingType === "buy" && rawCategory === "account") ? "all" : rawCategory,
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
    return [
      typeText,
      listing.title,
      listing.item_name,
      listing.character_name,
      listing.description,
      listing.server_name,
      listing.contact,
      listing.seller_name,
      listing.price_text,
      categoryNames[listing.category]
    ].some((value) => normalizeSearch(value).includes(search));
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function getListingImages(listing) {
    const gallery = Array.isArray(listing.image_urls) ? listing.image_urls.filter(Boolean) : [];
    return gallery.length ? gallery : [listing.image_url || (listing.category === "dungeon" ? "assets/site-icons/rooc-icon-192.png" : "assets/category-icons/mvp-c.png")];
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
      if ((listing.listing_type || "sell") !== filters.listingType) return false;
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
    if ((activeListingType === "service" || (activeListingType === "buy" && category === "account")) && controls.category) {
      controls.category.value = "all";
    }
    if (controls.category) {
      Array.from(controls.category.options).forEach((option) => {
        option.disabled = activeListingType === "service" || (activeListingType === "buy" && option.value === "account");
      });
    }
    controls.tabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.category === category);
      button.disabled = activeListingType === "service" || (activeListingType === "buy" && button.dataset.category === "account");
    });
  }

  function syncListingTypeUi(type) {
    activeListingType = type === "buy" ? "buy" : type === "service" ? "service" : "sell";
    const controls = getFilterControls();
    controls.typeTabs.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.listingType === activeListingType);
    });
    if (activeListingType === "service" || (activeListingType === "buy" && controls.category?.value === "account")) {
      syncCategoryUi("all");
    } else {
      syncCategoryUi(controls.category?.value || "all");
    }
  }

  function syncServerUi(value, source) {
    const controls = getFilterControls();
    if (source !== controls.heroServer && controls.heroServer) controls.heroServer.value = value;
    if (source !== controls.sidebarServer && controls.sidebarServer) controls.sidebarServer.value = value;
  }

  function populateServerSelects(servers) {
    const activeServers = servers?.length ? servers : fallbackServers;
    const controls = getFilterControls();
    [controls.heroServer, controls.sidebarServer].forEach((select) => {
      if (!select) return;
      const selected = select.value || "ทั้งหมด";
      select.innerHTML = [
        '<option>ทั้งหมด</option>',
        ...activeServers.map((server) => `<option>${escapeHtml(server)}</option>`)
      ].join("");
      select.value = activeServers.includes(selected) ? selected : "ทั้งหมด";
    });

  }

  function renderCounts(listings) {
    const counts = { mvp: 0, accessories: 0, fashion: 0, account: 0 };
    listings.filter((listing) => (listing.listing_type || "sell") === activeListingType).forEach((listing) => {
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

    const sellTotal = listings.filter((listing) => (listing.listing_type || "sell") === "sell").length;
    const buyTotal = listings.filter((listing) => (listing.listing_type || "sell") === "buy").length;
    const serviceTotal = listings.filter((listing) => (listing.listing_type || "sell") === "service").length;
    const sellTarget = document.querySelector("#totalSellListingCount");
    const buyTarget = document.querySelector("#totalBuyListingCount");
    const serviceTarget = document.querySelector("#totalServiceListingCount");
    if (sellTarget) sellTarget.textContent = sellTotal.toLocaleString("th-TH");
    if (buyTarget) buyTarget.textContent = buyTotal.toLocaleString("th-TH");
    if (serviceTarget) serviceTarget.textContent = serviceTotal.toLocaleString("th-TH");
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
      const typeLabel = activeListingType === "buy" ? "ประกาศรับซื้อ" : activeListingType === "service" ? "ประกาศรับจ้างลงดัน" : "ประกาศขาย";
      emptyState.querySelector("h3").textContent = isFiltered ? `ไม่พบ${typeLabel}ที่ตรงกับตัวกรอง` : `ยังไม่มี${typeLabel}`;
      emptyState.querySelector("p").textContent = isFiltered ? "ลองล้างตัวกรองหรือเปลี่ยนคำค้นหา" : `เมื่อมีผู้ใช้ลง${typeLabel} รายการล่าสุดจะแสดงในส่วนนี้`;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(listings.length / listingsPerPage));
    currentListingPage = Math.min(Math.max(currentListingPage, 1), totalPages);
    const pageStart = (currentListingPage - 1) * listingsPerPage;
    const pageListings = listings.slice(pageStart, pageStart + listingsPerPage);

    grid.innerHTML = pageListings.map((listing) => {
      const title = listing.title || listing.item_name || "ประกาศขาย";
      const listingType = listing.listing_type || "sell";
      const isServiceListing = listingType === "service";
      const mediaClass = listing.category === "mvp" ? "item-media card-media" : listing.category === "account" ? "item-media account-listing-media" : "item-media";
      const listingImages = getListingImages(listing);
      const contact = listing.contact || "";
      const profileUrl = getListingProfileUrl(listing);
      const discordId = getListingDiscordId(listing);
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      const sellerAvatar = listing.seller_avatar_url || "assets/category-icons/account-b.png";
      const galleryData = listing.category === "account"
        ? ` data-account-gallery="${escapeHtml(encodeURIComponent(JSON.stringify(listingImages)))}" data-account-title="${escapeHtml(title)}"`
        : "";
      const badges = [
        `<span class="${listingType === "buy" ? "buy" : listingType === "service" ? "verified" : "fast"}">${listingType === "buy" ? "รับซื้อ" : listingType === "service" ? "รับจ้าง" : "ขาย"}</span>`,
        `<span>${escapeHtml(listing.server_name || "ทั้งหมด")}</span>`,
        listing.ready_today ? '<span class="fast">Fast Deal</span>' : "",
        listing.category === "mvp" ? '<span class="mvp">MVP</span>' : "",
        listing.category === "dungeon" ? '<span class="mvp">Dungeon</span>' : ""
      ].filter(Boolean).join("");
      const description = listing.middleman
        ? `${listing.character_name ? `ตัวละคร: ${listing.character_name} · ` : ""}${listing.description || ""} · รองรับ Middleman`
        : `${listing.character_name ? `ตัวละคร: ${listing.character_name} · ` : ""}${listing.description || ""}`;
      const descriptionParts = getDescriptionParts(description);

      return `
        <article class="listing-card${isServiceListing ? " service-listing-card" : ""}">
          ${isServiceListing ? "" : `<div class="${mediaClass}"${galleryData}>
            <img src="${escapeHtml(listingImages[0])}" alt="" loading="lazy" decoding="async" />
            ${listing.category === "account" && listingImages.length > 1 ? `
              <div class="account-gallery-count">${listingImages.length} รูป</div>
              <div class="account-gallery-strip">
                ${listingImages.slice(0, 5).map((src) => `<span><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" /></span>`).join("")}
              </div>
            ` : ""}
          </div>`}
          <div class="listing-seller">
            <img src="${escapeHtml(sellerAvatar)}" alt="" loading="lazy" decoding="async" />
            <span>${escapeHtml(sellerName)}</span>
            ${listing.seller_is_premium ? '<strong title="Premium">♛</strong>' : ""}
          </div>
          <div class="listing-meta">${badges}</div>
          <h3>${escapeHtml(title)}</h3>
          <p class="listing-description" data-short="${escapeHtml(descriptionParts.shortText)}" data-full="${escapeHtml(descriptionParts.fullText)}">${escapeHtml(descriptionParts.shortText)}</p>
          ${descriptionParts.truncated ? '<button class="description-toggle" type="button" data-description-toggle>ดูเพิ่มเติม</button>' : ""}
          <div class="price-row">
            <strong>฿ ${formatListingPrice(listing.price_text)}</strong>
            <button class="btn btn-small contact-seller-button" type="button" data-title="${escapeHtml(title)}" data-contact="${escapeHtml(contact)}" data-profile-url="${escapeHtml(profileUrl)}" data-discord-id="${escapeHtml(discordId)}" data-seller-name="${escapeHtml(sellerName)}">${listingType === "buy" ? "ติดต่อผู้รับซื้อ" : listingType === "service" ? "ติดต่อผู้รับจ้าง" : "ติดต่อผู้ขาย"}</button>
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

    const maxVisiblePages = 10;
    const pageGroupStart = Math.floor((currentListingPage - 1) / maxVisiblePages) * maxVisiblePages + 1;
    const pageGroupEnd = Math.min(totalPages, pageGroupStart + maxVisiblePages - 1);
    const pageButtons = Array.from({ length: pageGroupEnd - pageGroupStart + 1 }, (_item, index) => {
      const page = pageGroupStart + index;
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
      const price = listing.price_text ? `฿ ${formatListingPrice(listing.price_text)}` : "";
      const sellerName = listing.seller_name || "ผู้ขาย ROOC";
      return `
        <article class="sold-card">
          <img src="${escapeHtml(listing.image_url || "assets/category-icons/mvp-c.png")}" alt="" loading="lazy" decoding="async" />
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
        ${card.qr ? `<img class="support-qr" src="${escapeHtml(card.qr)}" alt="QR Code ${escapeHtml(card.title)}" loading="lazy" decoding="async" />` : ""}
        ${card.url ? `<a class="btn btn-primary support-button" href="${escapeHtml(card.url)}" target="_blank" rel="noopener">${escapeHtml(card.button)}</a>` : ""}
      </article>
    `).join("");
    sidebar.hidden = false;
  }

  function renderHeroAnnouncement(settings) {
    const announcement = document.querySelector("#heroAnnouncement");
    if (!announcement) return;

    const text = String(settings.announcement_text || "").trim();
    if (!settings.announcement_enabled || !text) {
      announcement.hidden = true;
      announcement.innerHTML = "";
      return;
    }

    const escapedText = escapeHtml(text);
    announcement.innerHTML = `
      <div class="announcement-marquee" role="status" aria-live="polite">
        <span>${escapedText}</span>
        <span aria-hidden="true">${escapedText}</span>
      </div>
    `;
    announcement.hidden = false;
  }

  function renderFilteredListings() {
    if (!document.querySelector("#latestListingGrid")) return;
    renderCounts(publicListings);
    renderListingCards(getFilteredListings(), true);
  }

  function resetListingPage() {
    currentListingPage = 1;
  }

  async function refreshListings(force = false) {
    const controls = getFilterControls();
    if (controls.refresh) {
      controls.refresh.disabled = true;
      controls.refresh.classList.add("is-loading");
      controls.refresh.setAttribute("aria-label", "กำลังรีเฟรชสินค้า");
    }

    try {
      [publicListings, soldListings] = await Promise.all([
        fetchPublicListings(Boolean(force)),
        fetchSoldListings(Boolean(force)).catch((error) => {
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
        controls.refresh.classList.remove("is-loading");
        if (force) {
          setRefreshCooldown(10);
        } else {
          controls.refresh.disabled = false;
          controls.refresh.setAttribute("aria-label", "รีเฟรชสินค้า");
          controls.refresh.title = "รีเฟรชสินค้า";
        }
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
    controls.search?.addEventListener("search", rerender);
    controls.search?.addEventListener("change", rerender);
    controls.sort?.addEventListener("change", rerender);
    controls.refresh?.addEventListener("click", () => {
      if (refreshCooldownEndsAt > Date.now()) return;
      refreshListings(true);
    });
    controls.price?.addEventListener("change", rerender);
    controls.middleman?.addEventListener("change", rerender);
    controls.ready?.addEventListener("change", rerender);

    controls.typeTabs.forEach((button) => {
      button.addEventListener("click", () => {
        syncListingTypeUi(button.dataset.listingType || "sell");
        rerender();
      });
    });

    controls.heroServer?.addEventListener("change", (event) => {
      syncServerUi(event.target.value, event.target);
      rerender();
    });

    controls.sidebarServer?.addEventListener("change", (event) => {
      syncServerUi(event.target.value, event.target);
      rerender();
    });

    controls.category?.addEventListener("change", (event) => {
      if (activeListingType === "buy" && event.target.value === "account") {
        event.target.value = "all";
      }
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
      syncListingTypeUi("sell");
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
      fetchActiveServers()
        .then(populateServerSelects)
        .catch((error) => {
          console.warn("ROOC servers failed:", error);
          populateServerSelects(fallbackServers);
        });
      fetchSiteSettings()
        .then((settings) => {
          renderSupportSidebar(settings);
          renderHeroAnnouncement(settings);
        })
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
    const descriptionToggle = event.target.closest("[data-description-toggle]");
    const trigger = event.target.closest(".user-menu-trigger");
    const logout = event.target.closest("[data-user-logout]");

    if (descriptionToggle) {
      event.preventDefault();
      const card = descriptionToggle.closest(".listing-card");
      const description = card?.querySelector(".listing-description");
      if (description) {
        const expanded = descriptionToggle.dataset.expanded === "true";
        description.textContent = expanded ? description.dataset.short || "" : description.dataset.full || "";
        descriptionToggle.textContent = expanded ? "ดูเพิ่มเติม" : "ย่อข้อความ";
        descriptionToggle.dataset.expanded = String(!expanded);
      }
      return;
    }

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
